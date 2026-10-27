import {createClient} from '@supabase/supabase-js';
import {mountLogin} from './auth.js';
import {accountStorage} from './storage.js';
import {createSupabaseTransport} from './api.js';
import {restoreSession} from './session.js';
import {mountAccountUI,mountAccountSettings,updateAccountAccess} from './account-ui.js';
import {createBillingUI} from './billing-ui.js';
import {mountBillingAccess} from './billing-access.js';
import {createBillingClient} from './billing-client.js';
import {accessAPI,createRegistrationNotifier,mountAccessGate,mountRegistrationAdmin} from './registration.js';

const config=__VPO_CONFIG__;
const access=document.getElementById('vpo-access');
document.documentElement.setAttribute('data-auth-required','');
access.hidden=false;
access.innerHTML='<p class="vpo-access-loading" role="status">Abrindo seu VPO…</p>';
const client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:`vpo-auth-${new URL(config.url).hostname}`}});
const initial=await restoreSession(client.auth,{online:navigator.onLine});

let login;
const signedIn=initial?{session:initial}:await new Promise(resolve=>{login=mountLogin({root:access,auth:client.auth,onSession:(session,intent)=>resolve({session,intent})});});
const {session,intent}=signedIn;
login?.destroy();
const userId=session.user.id;
const storage=accountStorage(localStorage,new URL(config.url).hostname,userId);
let sync=null,leaving=false;
let billingUI=null;
const fetcher=createSupabaseTransport(client),registrationAPI=accessAPI(fetcher),registrationNotifier=createRegistrationNotifier({auth:client.auth});
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
function rememberAccess(info){if(navigator.onLine)try{storage.setItem('vpo-verified-access-v1',JSON.stringify({info,checkedAt:Date.now()}));}catch{/* Cloud authorization does not depend on a browser cache. */}}
const gate=mountAccessGate({root:access,api:registrationAPI,intent,email:session.user.email,notifyRegistration:registrationNotifier,onVerified:rememberAccess,onSignOut:async()=>{
  const {error}=await client.auth.signOut({scope:'local'});if(error)throw new Error('Não foi possível sair. Tente novamente.');leaving=true;conceal();location.reload();
}});
const accountAccess=await gate.ready;gate.destroy();
async function checkApproval(){
  if(!navigator.onLine||leaving)return;
  try{const next=await registrationAPI();if(!next.canUse){try{storage.removeItem('vpo-verified-access-v1');}catch{}leaving=true;conceal();location.reload();}else{rememberAccess(next);if(next.billing){updateAccountAccess(document,next.billing);const old=billingUI?.info;if(old&&(old.phase!==next.billing.phase||old.canUse!==next.billing.canUse||old.scopeId!==next.billing.scopeId))billingUI.refresh();}}}catch{/* Server checks still run for every budget request. */}
}
const signIn=document.getElementById('sync-signin');
signIn.href=location.pathname+location.search+location.hash;signIn.removeAttribute('target');
signIn.textContent='Entrar no VPO';

export const platform={
  independent:true,example:false,accountId:userId,storage,fetcher,
  onSyncStatus(info){if(info.kind==='blocked'){billingUI?.refresh();checkApproval();}},
  onReady(cloud,notify,context){
    sync=cloud;
    const subscription=document.createElement('article');subscription.className='settings-card vpo-subscription-settings';
    document.querySelector('.settings-grid').append(subscription);
    let wasAllowed=null;
    const accessGuard=mountBillingAccess({root:document.querySelector('#budget-app'),showBilling:()=>billingUI.show()});
    const billingClient=createBillingClient({auth:client.auth,refresh:()=>billingUI.refresh(true)});
    billingUI=createBillingUI({root:subscription,fetcher:platform.fetcher,openDialog:context.openDialog,notify,checkout:()=>billingClient.checkout(),cancel:()=>billingClient.cancel(),reconcile:()=>billingClient.reconcile(),onAccess(info){accessGuard.update(info);updateAccountAccess(document,info);if(wasAllowed===false&&info.canUse&&sync.status.blocked)location.reload();wasAllowed=info.canUse;}});
    billingUI.refresh().then(info=>{if(info?.enabled&&info.isOwner&&info.trialStartedAt&&info.hasBillingAccount!==false)billingUI.refresh(false,true);});
    setInterval(()=>{if(document.visibilityState!=='hidden')billingUI.refresh();},60000);
    setInterval(()=>{if(document.visibilityState!=='hidden')checkApproval();},15000);
    window.addEventListener('offline',()=>{conceal();access.innerHTML='<p class="vpo-access-loading" role="status">Conecte-se à internet para confirmar seu acesso e continuar. Seus dados permanecem salvos.</p>';});
    window.addEventListener('online',()=>location.reload());
    window.addEventListener('focus',checkApproval);
    window.addEventListener('online',checkApproval);
    if(accountAccess.isAdmin){const admin=document.createElement('article');admin.className='settings-card';document.querySelector('.settings-grid').append(admin);mountRegistrationAdmin({root:admin,api:registrationAPI,notifier:registrationNotifier,notify});}
    const card=document.createElement('article');card.className='settings-card';
    const accountSignout=mountAccountSettings({root:card,name:accountAccess.fullName,email:session.user.email});
    document.querySelector('.settings-grid').append(card);
    mountAccountUI({root:document.querySelector('.app-sidebar .sidebar-bottom'),name:accountAccess.fullName,email:session.user.email,auth:client.auth,sync,storage,otherButtons:[accountSignout],notify,onLeaving:value=>leaving=value,onSignedOut:()=>{conceal();location.reload();}});
    if(!location.hash.startsWith('#plano'))history.replaceState(null,'',location.pathname+'#plano');
    access.hidden=true;access.innerHTML='';document.documentElement.removeAttribute('data-auth-required');
  }
};
