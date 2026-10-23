import {signOutDevice} from './session.js';
import {accountUsername} from '../web/account-identity.js';
import {accessLabel,accessTone} from './access-presentation.js';

const exitIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10"/></svg>';
function fillIdentity(root,name,email){
  const username=accountUsername(email,name),address=String(email||'');
  root.querySelector('.vpo-account-avatar').textContent=Array.from(username)[0].toLocaleUpperCase('pt-BR');
  const label=root.querySelector('.vpo-account-identity strong');
  label.textContent=username;label.title=address||username;
}
export function mountAccountSettings({root,name,email}){
  root.classList.add('vpo-account-settings');
  root.innerHTML='<h2>Sua conta</h2><div class="vpo-account-overview"><span class="vpo-account-avatar" aria-hidden="true"></span><span class="vpo-account-identity"><small>Conectado como</small><strong></strong><span class="vpo-account-access" data-account-access hidden></span></span><button type="button" class="vpo-account-settings-signout" id="vpo-signout">'+exitIcon+'<span>Sair</span></button></div>';
  fillIdentity(root,name,email);
  const button=root.querySelector('button');button.setAttribute('aria-label','Sair da conta neste aparelho');
  return button;
}
export function mountAccountUI({root,name,email,auth,sync,storage,otherButtons=[],onLeaving=()=>{},onSignedOut=()=>{},notify=()=>{}}){
  const address=String(email||'');
  root.classList.add('vpo-sidebar-account');
  root.setAttribute('aria-label','Sua conta VPO');
  root.innerHTML='<a class="vpo-account-summary" href="#plano/ajustes"><span class="vpo-account-avatar" aria-hidden="true"></span><span class="vpo-account-identity"><small>CONTA CONECTADA</small><strong></strong><span class="vpo-account-access" data-account-access hidden></span></span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a><button type="button" class="vpo-account-signout">'+exitIcon+'<span>Sair da conta</span></button><span class="sr-only" data-account-status role="status" aria-live="polite"></span>';
  fillIdentity(root,name,email);
  root.querySelector('a').setAttribute('aria-label','Sua conta: '+(address||accountUsername(email,name))+'. Abrir Ajustes.');
  const sidebarButton=root.querySelector('button'),buttons=[sidebarButton,...otherButtons];let busy=false,completed=false;
  function setBusy(value){
    for(const button of buttons)button.disabled=value;
    root.setAttribute('aria-busy',String(value));
    sidebarButton.querySelector('span').textContent=value?'Saindo…':'Sair da conta';
    root.querySelector('[data-account-status]').textContent=value?'Preparando a saída da sua conta.':'';
  }
  async function signOut(){
    if(busy||completed)return;busy=true;setBusy(true);
    try{
      const result=await signOutDevice({auth,sync,storage,beforeSignOut:()=>onLeaving(true)});
      if(!result.ok){onLeaving(false);notify(result.message);return;}
      completed=true;onSignedOut();
    }catch{onLeaving(false);notify('Não foi possível sair agora. Tente novamente.');}
    finally{busy=false;if(!completed)setBusy(false);}
  }
  for(const button of buttons)button.onclick=signOut;
  return {signOut,get busy(){return busy;}};
}

export function updateAccountAccess(root,info){
  const label=accessLabel(info);
  for(const badge of root.querySelectorAll('[data-account-access]')){
    badge.textContent=label;badge.hidden=!label;badge.dataset.tone=accessTone(info);
  }
}
