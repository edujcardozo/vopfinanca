import {pixPaymentHTML,bindPixPayment} from './pix-ui.js';
import {accessShell} from './auth.js';
import {invitationToken} from '../web/sharing-ui.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accessAPI(fetcher){return async function(path='',body){
  const response=await fetcher(path.startsWith('/api/')?path:'/api/access'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível confirmar seu acesso.'),{code:data.code});return data;
};}
export function createRegistrationNotifier({auth,fetcher=fetch}){return async function(action='notify'){
  const {data}=await auth.getSession();if(!data?.session?.access_token)throw new Error('Entre novamente no VPO.');
  const response=await fetcher('/.netlify/functions/vpo-registration?action='+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:'{}',signal:AbortSignal.timeout(15000)});
  let result;try{result=await response.json();}catch{throw new Error('O envio de e-mails ainda precisa ser configurado.');}
  if(!response.ok)throw Object.assign(new Error(result.error||'O envio de e-mails ainda precisa ser configurado.'),{code:result.code});return result;
};}
export function mountAccessGate({root,api,intent={},email='',notifyRegistration=async()=>{},onSignOut=()=>{},windowObject=window,offlineAccess=null,onVerified=()=>{}}){
  let renewal=null,renewalLoading=false,renewalError='';
  let info=null,busy=false,done=false,token=intent?.token||invitationToken(windowObject.location.hash),preview=null,inviteError='',enterInvite=false,lastView='',draft=intent?.profile;
  let resolveReady;const ready=new Promise(resolve=>resolveReady=resolve);
  const $=s=>root.querySelector(s);
  function message(text,error=false){const el=$('#gate-status');if(el){el.textContent=text;el.setAttribute('role',error?'alert':'status');}}
  function finish(value){if(done)return;done=true;onVerified(value);resolveReady(value);}
  function shell(title,intro,content,symbol='✓'){
    root.innerHTML=accessShell(`<div class="vpo-gate-symbol" aria-hidden="true">${symbol}</div><p class="vpo-access-eyebrow">SUA CONTA VPO</p><h2>${title}</h2><p id="access-intro">${intro}</p>${content}<p id="gate-status" class="vpo-gate-status" role="status" aria-live="polite"></p><div class="vpo-gate-actions"><button type="button" id="gate-signout">Usar outro e-mail</button></div>`);
    $('#gate-signout').onclick=async()=>{try{await onSignOut();}catch(error){message(error.message,true);}};
  }
  function render(){
    const key=JSON.stringify([info,token,preview,inviteError,enterInvite,renewal,renewalError]);if(key===lastView)return;lastView=key;
    if(!info.hasProfile){
      shell('Só mais um passo.','Seu e-mail está confirmado. Complete seus dados para continuar.',`<form id="gate-profile"><label for="gate-name">Nome completo</label><input id="gate-name" autocomplete="name" maxlength="100" required placeholder="Como você se chama?"><label for="gate-phone" style="margin-top:18px">Celular <span class="vpo-field-optional">opcional</span></label><input id="gate-phone" type="tel" autocomplete="tel" maxlength="30" placeholder="(00) 00000-0000"><p class="vpo-field-help">${esc(info.email||email)}</p><button class="vpo-access-submit" type="submit">Concluir cadastro →</button></form>`);
      $('#gate-name').value=draft?.fullName||'';$('#gate-phone').value=draft?.phone||'';
      $('#gate-profile').onsubmit=async e=>{e.preventDefault();await register({fullName:$('#gate-name').value,phone:$('#gate-phone').value},token||intent?.mode==='invite'?'guest':'personal');};return;
    }
    if(['revoked','frozen'].includes(info.status)||info.planPaused){
      root.classList.add('vpo-renewal-screen');
      const personal=['revoked','frozen'].includes(info.status);
      shell(personal?'Seu plano espera por você.':'O plano compartilhado está pausado.',personal?'Seus lançamentos continuam guardados com carinho. Renove seu acesso para continuar de onde parou.':'Quem compartilhou o orçamento com você precisa renovar ou reativar o plano. Os dados continuam salvos.',`<div class="vpo-renewal-content">${renewal?.manualPix?.ready?pixPaymentHTML(renewal):`<p class="vpo-gate-message">${personal?'Conferindo as opções para renovar seu plano…':'Entre em contato com o titular do plano.'}</p>`}</div>${renewalError?`<p class="vpo-access-error">${esc(renewalError)}</p>`:''}<button type="button" id="gate-renewal-refresh" class="vpo-access-submit">Já renovei · conferir acesso ↻</button>`, '↻');
      if(renewal?.manualPix?.ready)bindPixPayment({dialog:root.querySelector('.vpo-pix-payment'),info:renewal,back:()=>onSignOut(),refresh,notify:text=>message(text)});
      $('#gate-renewal-refresh').onclick=refresh;
      if(personal&&!renewal&&!renewalLoading){renewalLoading=true;api('/renewal').then(value=>{renewal=value;if(!value.manualPix?.ready)renewalError='Fale com o administrador para combinar a renovação do seu acesso.';}).catch(error=>{renewalError=error.message;}).finally(()=>{renewalLoading=false;if(!done)render();});}
      return;
    }
    if(info.status==='rejected'){
      shell(info.status==='revoked'?'Seu acesso foi removido.':'Cadastro não autorizado.',info.status==='revoked'?'O administrador removeu seu acesso ao VPO. Entre em contato para saber como continuar.':'Seu pedido foi analisado e não foi liberado neste momento.','<p class="vpo-gate-message">Se precisar de ajuda, entre em contato com <a href="mailto:edujcardozo@gmail.com">edujcardozo@gmail.com</a>.</p>','–');return;
    }
    if(token||enterInvite){
      if(!token){
        shell('Vamos abrir seu convite.','Cole o link de quem compartilhou um orçamento com você.',`<form id="gate-invitation"><label for="gate-invite">Link do convite</label><input id="gate-invite" inputmode="url" autocomplete="off" placeholder="Cole o link aqui" required><button class="vpo-access-submit" type="submit">Conferir convite →</button></form><div class="vpo-gate-actions"><button type="button" id="gate-back">Voltar</button></div>`,'↗');
        $('#gate-invitation').onsubmit=e=>{e.preventDefault();const parsed=invitationToken($('#gate-invite').value);if(!parsed)return message('Cole um link de convite válido.',true);token=parsed;preview=null;inviteError='';windowObject.history?.replaceState(null,'','#plano/convite/'+token);refresh();};
        $('#gate-back').onclick=()=>{enterInvite=false;render();};return;
      }
      shell('Um plano para vocês.',preview?'Confira quem enviou o convite antes de aceitar.':'Conferindo o convite que você recebeu…',`${preview?`<div class="vpo-gate-summary"><span>Compartilhado por</span><strong>${esc(preview.ownerEmail)}</strong><span>Vocês poderão ver e editar o mesmo orçamento, cada um com seu e-mail.</span></div><button class="vpo-access-submit" id="gate-accept" type="button">Aceitar e abrir o plano →</button>`:''}${inviteError?`<p class="vpo-access-error" role="alert">${esc(inviteError)}</p>`:''}<div class="vpo-gate-actions"><button id="gate-other-invite" type="button">Colar outro convite</button><button id="gate-skip-invite" type="button">${info.canUse?'Continuar no meu plano':'Voltar ao meu cadastro'}</button></div>`,'↗');
      if($('#gate-accept'))$('#gate-accept').onclick=()=>act(async()=>{await apiSharing('/accept',{token});token=null;enterInvite=false;windowObject.history?.replaceState(null,'','#plano');info=await api();if(info.canUse)finish(info);else render();});
      $('#gate-other-invite').onclick=()=>{token=null;enterInvite=true;preview=null;inviteError='';windowObject.history?.replaceState(null,'','#plano');render();};
      $('#gate-skip-invite').onclick=()=>{token=null;enterInvite=false;windowObject.history?.replaceState(null,'','#plano');if(info.canUse)finish(info);else render();};return;
    }
    shell(info.status==='guest'?'Seu convite abre o caminho.':'Seu cadastro está a caminho.',info.status==='guest'?'Abra o convite para acessar o orçamento compartilhado.':'Recebemos seu cadastro. Agora é só aguardar a liberação do VPO.',`<div class="vpo-gate-summary"><strong>${esc(info.fullName)}</strong><span>${esc(info.email||email)}</span><span>${info.status==='guest'?'Conta de pessoa convidada':'Aguardando aprovação'}</span></div><p class="vpo-gate-message">${info.status==='guest'?'Você pode entrar no plano que foi compartilhado com você. Para ter um plano pessoal, solicite a liberação abaixo.':'Esta tela verifica sua liberação automaticamente. Você também pode voltar depois e entrar com este e-mail.'}</p><button class="vpo-access-submit" id="gate-refresh" type="button">Verificar liberação <span aria-hidden="true">↻</span></button><div class="vpo-gate-actions"><button id="gate-have-invite" type="button">Tenho um convite</button>${info.ownApproved?'<button id="gate-own-plan" type="button">Voltar ao meu plano pessoal</button>':info.status==='guest'?'<button id="gate-request-own" type="button">Solicitar meu plano pessoal</button>':''}</div>`,'◷');
    $('#gate-refresh').onclick=async()=>{await refresh();if(!done)message('Seu cadastro ainda aguarda liberação.');};
    $('#gate-have-invite').onclick=()=>{enterInvite=true;render();};
    if($('#gate-own-plan'))$('#gate-own-plan').onclick=()=>act(async()=>{await apiSharing('/switch',{scopeId:info.userId});info=await api();if(info.canUse)finish(info);});
    if($('#gate-request-own'))$('#gate-request-own').onclick=()=>register({fullName:info.fullName,phone:info.phone||''},'personal');
  }
  async function apiSharing(path,body){return api('/api/sharing'+path,body);}
  async function act(action){if(busy||done)return;busy=true;root.setAttribute('aria-busy','true');for(const b of root.querySelectorAll('button'))b.disabled=true;
    try{await action();}catch(error){message(error.message,true);}finally{busy=false;root.removeAttribute('aria-busy');for(const b of root.querySelectorAll('button'))b.disabled=false;}
  }
  async function register(profile,purpose){await act(async()=>{info=await api('/register',{...profile,purpose});draft=null;intent={...intent,profile:null};render();if(info.status==='pending')notifyRegistration().catch(()=>{});if(info.canUse&&!token&&!enterInvite)finish(info);else await loadPreview();});}
  async function loadPreview(){if(!token||!info?.hasProfile||['rejected','revoked'].includes(info.status)||preview||inviteError)return;
    try{preview=await apiSharing('/preview',{token});}catch(error){inviteError=error.message;}render();
  }
  async function refresh(){if(busy||done)return;await act(async()=>{
    info=await api();
    if(draft&&(!info.hasProfile||intent?.mode==='signup'&&info.status==='guest')){
      info=await api('/register',{...draft,purpose:intent?.mode==='invite'?'guest':'personal'});draft=null;if(info.status==='pending')notifyRegistration().catch(()=>{});
    }
    if(info.canUse&&!token&&!enterInvite){finish(info);return;}render();await loadPreview();
  });}
  const timer=windowObject.setInterval(()=>{if(windowObject.document?.visibilityState!=='hidden')refresh();},15000);
  refresh().then(()=>{if(!info&&!done){shell('Vamos reconectar.','Precisamos confirmar seu acesso para abrir o plano.','<button class="vpo-access-submit" id="gate-retry" type="button">Tentar novamente →</button>','↻');$('#gate-retry').onclick=refresh;}});
  return {ready,refresh,destroy(){windowObject.clearInterval(timer);done=true;}};
}

export {mountRegistrationAdmin} from './user-admin.js';
