import {invitationToken} from '../web/sharing-ui.js';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function authMessage(error){
  const code=error?.code||'',status=error?.status;
  if(code==='otp_expired'||code==='token_expired'||code==='otp_disabled')return 'O código é inválido ou expirou. Confira o e-mail ou solicite outro código.';
  if(code==='over_email_send_rate_limit')return 'O serviço de e-mail atingiu o limite de envios. Tente mais tarde ou entre em contato com o VPO.';
  if(status===429||/rate_limit/.test(code))return 'Aguarde um pouco antes de solicitar outro código.';
  if(code==='email_address_invalid')return 'Confira o endereço de e-mail e tente novamente.';
  if(/email_address_not_authorized|unexpected_failure/.test(code))return 'Não foi possível enviar o código agora. Tente novamente mais tarde.';
  if(status===0||error?.name==='AuthRetryableFetchError'||error instanceof TypeError)return 'Confira sua conexão e tente novamente.';
  return 'Não foi possível concluir. Tente novamente.';
}
export function createEmailAuth({auth,now=()=>Date.now(),onChange=()=>{},onSession=()=>{}}){
  let email='',stage='email',busy=false,error='',sentAt=0,context={mode:'login'};
  const snapshot=()=>({email,stage,busy,error,context:{...context},resendIn:Math.max(0,Math.ceil((sentAt+60000-now())/1000))});
  const update=()=>onChange(snapshot());
  async function send(address,intent=context){
    if(busy)return false;
    const candidate=String(address).trim().toLowerCase();
    if(!emailPattern.test(candidate)||candidate.length>254){error='Informe um e-mail válido.';update();return false;}
    if(stage==='code'&&snapshot().resendIn>0)return false;
    busy=true;error='';update();
    try{
      context={...intent,mode:['login','signup','invite'].includes(intent.mode)?intent.mode:'login'};
      const result=await auth.signInWithOtp({email:candidate,options:{shouldCreateUser:context.mode!=='login'}});
      if(result.error&&!(context.mode==='login'&&['signup_disabled','user_not_found'].includes(result.error.code)))throw result.error;
      email=candidate;stage='code';sentAt=now();return true;
    }catch(e){error=authMessage(e);return false;}finally{busy=false;update();}
  }
  async function verify(value){
    if(busy||stage!=='code')return false;
    const token=String(value).replace(/\s/g,'');
    if(!/^\d{6,10}$/.test(token)){error='Digite o código completo recebido por e-mail.';update();return false;}
    busy=true;error='';update();
    try{
      const result=await auth.verifyOtp({email,token,type:'email'});
      if(result.error)throw result.error;
      if(!result.data?.session?.user?.id)throw new Error('missing session');
      stage='complete';onSession(result.data.session,{...context});return true;
    }catch(e){error=authMessage(e);return false;}finally{busy=false;update();}
  }
  return {send,verify,get state(){return snapshot();},changeEmail(){if(!busy){stage='email';error='';update();}}};
}
export function accessShell(content){return `<div class="vpo-access-shell"><aside class="vpo-access-story"><a class="vpo-access-brand" href="/" aria-label="VPO — Você Precisa de um Orçamento"><img src="assets/vpo-dollar.svg" width="44" height="44" alt=""><span>VPO<span>.</span></span></a><div><p class="vpo-access-eyebrow">UM PLANO PARA CADA REAL.</p><h1>Mais clareza.<br>Mais vida.</h1><p>Seu dinheiro com direção.<br>Seu plano sempre com você.</p><div class="vpo-access-preview" aria-hidden="true"><span>Seu próximo passo</span><strong>Dar um destino ao seu dinheiro.</strong><div><i></i><i></i><i></i></div><small>Um pouco de organização. Muito mais tranquilidade.</small></div></div><small>Você Precisa de um Orçamento</small></aside><main class="vpo-access-main"><div class="vpo-access-card"><img class="vpo-access-mobile-logo" src="assets/vpo-dollar.svg" width="48" height="48" alt="VPO">${content}</div></main></div>`;}
export function mountLogin({root,auth,onSession,windowObject=window}){
  let mode=invitationToken(windowObject.location.hash)?'invite':'login';
  root.innerHTML=accessShell(`<p class="vpo-access-eyebrow">BEM-VINDO AO VPO</p><h2 id="access-title">Seu plano começa aqui.</h2><p id="access-intro"></p>
    <nav class="vpo-access-modes" aria-label="Formas de acesso"><button type="button" data-access-mode="login">Entrar</button><button type="button" data-access-mode="signup">Criar conta</button><button type="button" data-access-mode="invite">Tenho um convite</button></nav>
    <form id="vpo-email-form">
      <div id="vpo-signup-fields" hidden><label for="vpo-name">Nome completo</label><input id="vpo-name" name="name" autocomplete="name" maxlength="100" placeholder="Como você se chama?"><label for="vpo-phone">Celular <span class="vpo-field-optional">opcional</span></label><input id="vpo-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="(00) 00000-0000"></div>
      <div id="vpo-invite-field" hidden><label for="vpo-invite">Link do convite</label><input id="vpo-invite" name="invite" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Cole o link que recebeu"><p class="vpo-field-help">Entre com seu e-mail para aceitar e editar o mesmo orçamento.</p></div>
      <label for="vpo-email">Seu e-mail</label><input id="vpo-email" type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="voce@exemplo.com" required aria-describedby="access-error">
      <button class="vpo-access-submit" type="submit"></button><p class="vpo-access-note" id="vpo-mode-note"></p>
    </form>
    <form id="vpo-code-form" hidden><div class="vpo-access-address"><span id="vpo-sent-email"></span><button type="button" id="vpo-change-email">Alterar</button></div><label for="vpo-code">Código recebido por e-mail</label><input id="vpo-code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6,10}" autocomplete="one-time-code" maxlength="10" placeholder="00000000" required aria-describedby="access-error"><button class="vpo-access-submit" type="submit">Confirmar e-mail →</button><div class="vpo-access-resend"><span>Não recebeu? Confira o spam.</span><button type="button" id="vpo-resend">Reenviar código</button></div></form>
    <p id="access-error" class="vpo-access-error" role="alert" hidden></p><p id="access-status" class="sr-only" aria-live="polite"></p>
    <div class="vpo-access-footer"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>Seu orçamento é privado. Cada pessoa entra com seu próprio e-mail.</span></div><p id="vpo-invite-preserved" class="vpo-access-invite" hidden>Seu convite está guardado. Confirme seu e-mail para conferir e aceitar.</p>`);
  const $=selector=>root.querySelector(selector),emailForm=$('#vpo-email-form'),codeForm=$('#vpo-code-form'),codeInput=$('#vpo-code');
  if(mode==='invite')$('#vpo-invite').value=windowObject.location.hash;
  let previousStage='email';
  const copy={login:{title:'Seu plano começa aqui.',intro:'Acesse seu orçamento usando seu e-mail.',button:'Entrar com e-mail →',note:'Enviamos um código de acesso. Sem senha para lembrar.'},signup:{title:'Um plano só seu.',intro:'Preencha seus dados e confirme seu e-mail. Seu acesso será liberado após aprovação.',button:'Criar minha conta →',note:'Nesta fase, os cadastros são liberados manualmente. Nenhuma cobrança é feita aqui.'},invite:{title:'Um plano para compartilhar.',intro:'Recebeu um convite? Use seu próprio e-mail, mesmo que ainda não tenha uma conta VPO.',button:'Continuar como convidado →',note:'Depois de confirmar seu e-mail, você confere e aceita o convite. Sem uma segunda assinatura.'}};
  function render(state){
    const entry=state.stage==='email',content=copy[mode];
    emailForm.hidden=!entry;codeForm.hidden=entry;$('.vpo-access-modes').hidden=!entry;
    $('#access-title').textContent=entry?content.title:'Confira seu e-mail.';
    $('#access-intro').textContent=entry?content.intro:mode==='login'?'Se este e-mail tiver cadastro, você receberá um código. Digite-o abaixo.':'Digite o código que enviamos para você.';
    $('#vpo-mode-note').textContent=content.note;
    $('#vpo-signup-fields').hidden=mode!=='signup';$('#vpo-name').required=mode==='signup';
    $('#vpo-invite-field').hidden=mode!=='invite';$('#vpo-invite').required=mode==='invite';
    $('#vpo-sent-email').textContent=state.email;
    $('#access-error').textContent=state.error;$('#access-error').hidden=!state.error;
    for(const button of root.querySelectorAll('button'))button.disabled=state.busy;
    for(const input of root.querySelectorAll('input'))input.disabled=state.busy;
    for(const button of root.querySelectorAll('[data-access-mode]'))button.setAttribute('aria-pressed',String(button.dataset.accessMode===mode));
    emailForm.querySelector('[type=submit]').textContent=state.busy?'Enviando…':content.button;
    codeForm.querySelector('[type=submit]').textContent=state.busy?'Conferindo…':'Confirmar e-mail →';
    $('#vpo-resend').disabled=state.busy||state.resendIn>0;
    $('#vpo-resend').textContent=state.resendIn?`Reenviar em ${state.resendIn}s`:'Reenviar código';
    root.setAttribute('aria-busy',String(state.busy));
    if(previousStage!==state.stage&&state.stage==='code'){codeInput.value='';codeInput.focus();$('#access-status').textContent='Confira seu e-mail para continuar.';}
    previousStage=state.stage;
  }
  const flow=createEmailAuth({auth,onSession,onChange:render});
  function formError(message,input){$('#access-error').textContent=message;$('#access-error').hidden=false;input?.focus();}
  emailForm.addEventListener('submit',e=>{
    e.preventDefault();const profile={fullName:$('#vpo-name').value.trim().replace(/\s+/g,' '),phone:$('#vpo-phone').value.trim()};
    if(mode==='signup'&&(profile.fullName.length<2||profile.fullName.length>100))return formError('Informe seu nome completo.',$('#vpo-name'));
    if(mode==='signup'&&profile.phone&&(!/^[+0-9 ()-]+$/.test(profile.phone)||!/^\d{8,15}$/.test(profile.phone.replace(/\D/g,''))))return formError('Confira o número de celular.',$('#vpo-phone'));
    const token=mode==='invite'?invitationToken($('#vpo-invite').value):null;
    if(mode==='invite'&&!token)return formError('Cole um link de convite válido.',$('#vpo-invite'));
    if(token)windowObject.history?.replaceState(null,'','#plano/convite/'+token);
    flow.send($('#vpo-email').value,{mode,profile:mode==='signup'?profile:null,token});
  });
  for(const button of root.querySelectorAll('[data-access-mode]'))button.onclick=()=>{if(!flow.state.busy){mode=button.dataset.accessMode;flow.changeEmail();render(flow.state);}};
  codeForm.addEventListener('submit',e=>{e.preventDefault();flow.verify(codeInput.value);});
  codeInput.addEventListener('input',()=>{codeInput.value=codeInput.value.replace(/\D/g,'').slice(0,10);});
  $('#vpo-change-email').onclick=()=>{flow.changeEmail();$('#vpo-email').focus();};
  $('#vpo-resend').onclick=()=>flow.send(flow.state.email);
  $('#vpo-invite-preserved').hidden=!invitationToken(windowObject.location.hash);
  const timer=windowObject.setInterval(()=>{if(flow.state.stage==='code'&&!flow.state.busy)render(flow.state);},1000);
  render(flow.state);
  return {flow,destroy(){windowObject.clearInterval(timer);}};
}
