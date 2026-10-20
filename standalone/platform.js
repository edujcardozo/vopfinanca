import {createClient} from '@supabase/supabase-js';
import {mountLogin} from './auth.js';
import {accountStorage} from './storage.js';
import {createSupabaseTransport} from './api.js';
import {restoreSession,signOutDevice} from './session.js';
import {createBillingUI} from './billing-ui.js';
import {mountBillingAccess} from './billing-access.js';
import {createBillingClient} from './billing-client.js';

const config=__VPO_CONFIG__;
const access=document.getElementById('vpo-access');
document.documentElement.setAttribute('data-auth-required','');
access.hidden=false;
access.innerHTML='<p class="vpo-access-loading" role="status">Abrindo seu VPO…</p>';
const client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:`vpo-auth-${new URL(config.url).hostname}`}});
const initial=await restoreSession(client.auth,{online:navigator.onLine});

let login;
const session=initial||await new Promise(resolve=>{login=mountLogin({root:access,auth:client.auth,onSession:resolve});});
login?.destroy();
const userId=session.user.id;
const storage=accountStorage(localStorage,new URL(config.url).hostname,userId);
let sync=null,leaving=false;
let billingUI=null;
function conceal(){
  document.documentElement.setAttribute('data-auth-required','');
  for(const node of document.querySelectorAll('dialog[open]'))node.close?.();
  document.body.style.overflow='';
  access.hidden=false;access.innerHTML='<p class="vpo-access-loading" role="status">Atualizando seu acesso…</p>';
  sync?.stop();
}
client.auth.onAuthStateChange((event,next)=>{
  if(!leaving&&(event==='SIGNED_OUT'||next?.user?.id&&next.user.id!==userId)){
    leaving=true;conceal();setTimeout(()=>location.reload(),0);
  }
});
const signIn=document.getElementById('sync-signin');
signIn.href=location.pathname+location.search+location.hash;signIn.removeAttribute('target');
signIn.textContent='Entrar no VPO';

export const platform={
  independent:true,example:false,storage,fetcher:createSupabaseTransport(client),
  onSyncStatus(info){if(info.kind==='blocked')billingUI?.refresh();},
  onReady(cloud,notify,context){
    sync=cloud;
    const subscription=document.createElement('article');subscription.className='settings-card vpo-subscription-settings';
    document.querySelector('.settings-grid').append(subscription);
    let wasAllowed=null;
    const accessGuard=mountBillingAccess({root:document.querySelector('#budget-app'),showBilling:()=>billingUI.show()});
    const billingClient=createBillingClient({auth:client.auth,refresh:()=>billingUI.refresh(true)});
    billingUI=createBillingUI({root:subscription,fetcher:platform.fetcher,openDialog:context.openDialog,notify,checkout:()=>billingClient.checkout(),cancel:()=>billingClient.cancel(),reconcile:()=>billingClient.reconcile(),onAccess(info){accessGuard.update(info);if(wasAllowed===false&&info.canUse&&sync.status.blocked)location.reload();wasAllowed=info.canUse;}});
    billingUI.refresh().then(info=>{if(info?.enabled&&info.isOwner&&info.trialStartedAt)billingUI.refresh(false,true);});
    setInterval(()=>{if(document.visibilityState!=='hidden')billingUI.refresh();},60000);
    const card=document.createElement('article');card.className='settings-card';
    card.innerHTML='<h2>Sua conta VPO.</h2><p class="vpo-account-email"></p><p>Entre com este e-mail para abrir seu plano em outro aparelho.</p><button type="button" class="subtle-button" id="vpo-signout">Sair deste aparelho →</button>';
    card.querySelector('.vpo-account-email').textContent=session.user.email||'';
    document.querySelector('.settings-grid').append(card);
    card.querySelector('#vpo-signout').onclick=async e=>{
      const button=e.currentTarget;button.disabled=true;
      try{
        const result=await signOutDevice({auth:client.auth,sync,storage,beforeSignOut:()=>leaving=true});
        if(!result.ok){leaving=false;notify(result.message);return;}
        conceal();location.reload();
      }catch{leaving=false;notify('Não foi possível sair agora. Tente novamente.');}finally{button.disabled=false;}
    };
    if(!location.hash.startsWith('#plano'))history.replaceState(null,'',location.pathname+'#plano');
    access.hidden=true;access.innerHTML='';document.documentElement.removeAttribute('data-auth-required');
  }
};
