const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function authMessage(error){
  const code=error?.code||'',status=error?.status;
  if(code==='otp_expired'||code==='token_expired'||code==='otp_disabled')return 'O código é inválido ou expirou. Confira o e-mail ou solicite outro código.';
  if(status===429||/rate_limit|over_email_send_rate_limit/.test(code))return 'Aguarde um pouco antes de solicitar outro código.';
  if(code==='email_address_invalid')return 'Confira o endereço de e-mail e tente novamente.';
  if(/email_address_not_authorized|unexpected_failure/.test(code))return 'Não foi possível enviar o código agora. Tente novamente mais tarde.';
  if(status===0||error?.name==='AuthRetryableFetchError'||error instanceof TypeError)return 'Confira sua conexão e tente novamente.';
  return 'Não foi possível concluir. Tente novamente.';
}
export function createEmailAuth({auth,now=()=>Date.now(),onChange=()=>{},onSession=()=>{}}){
  let email='',stage='email',busy=false,error='',sentAt=0;
  const snapshot=()=>({email,stage,busy,error,resendIn:Math.max(0,Math.ceil((sentAt+60000-now())/1000))});
  const update=()=>onChange(snapshot());
  async function send(address){
    if(busy)return false;
    const candidate=String(address).trim().toLowerCase();
    if(!emailPattern.test(candidate)||candidate.length>254){error='Informe um e-mail válido.';update();return false;}
    if(stage==='code'&&snapshot().resendIn>0)return false;
    busy=true;error='';update();
    try{
      const result=await auth.signInWithOtp({email:candidate,options:{shouldCreateUser:true}});
      if(result.error)throw result.error;
      email=candidate;stage='code';sentAt=now();return true;
    }catch(e){error=authMessage(e);return false;}finally{busy=false;update();}
  }
  async function verify(value){
    if(busy||stage!=='code')return false;
    const token=String(value).replace(/\s/g,'');
    if(!/^\d{6}$/.test(token)){error='Digite os 6 números do código recebido.';update();return false;}
    busy=true;error='';update();
    try{
      const result=await auth.verifyOtp({email,token,type:'email'});
      if(result.error)throw result.error;
      if(!result.data?.session?.user?.id)throw new Error('missing session');
      stage='complete';onSession(result.data.session);return true;
    }catch(e){error=authMessage(e);return false;}finally{busy=false;update();}
  }
  return {send,verify,get state(){return snapshot();},changeEmail(){if(!busy){stage='email';error='';update();}}};
}
export function mountLogin({root,auth,onSession,windowObject=window}){
  root.innerHTML=`<div class="vpo-access-shell"><aside class="vpo-access-story"><a class="vpo-access-brand" href="/" aria-label="VPO — Você Precisa de um Orçamento"><img src="assets/vpo-dollar.svg" width="44" height="44" alt=""><span>VPO<span>.</span></span></a><div><p class="vpo-access-eyebrow">UM PLANO PARA CADA REAL.</p><h1>Mais clareza.<br>Mais vida.</h1><p>Seu dinheiro com direção.<br>Seu plano sempre com você.</p><div class="vpo-access-preview" aria-hidden="true"><span>Seu próximo passo</span><strong>Dar um destino ao seu dinheiro.</strong><div><i></i><i></i><i></i></div><small>Um pouco de organização. Muito mais tranquilidade.</small></div></div><small>Você Precisa de um Orçamento</small></aside><main class="vpo-access-main"><div class="vpo-access-card"><img class="vpo-access-mobile-logo" src="assets/vpo-dollar.svg" width="48" height="48" alt="VPO"><p class="vpo-access-eyebrow">BEM-VINDO AO VPO</p><h2 id="access-title">Seu plano começa aqui.</h2><p id="access-intro">Entre ou crie sua conta usando seu e-mail.</p><form id="vpo-email-form"><label for="vpo-email">Seu e-mail</label><input id="vpo-email" type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="voce@exemplo.com" required aria-describedby="access-error"><button class="vpo-access-submit" type="submit">Continuar com e-mail <span aria-hidden="true">→</span></button><p class="vpo-access-note">Enviamos um código de acesso. Sem senha para lembrar.</p></form><form id="vpo-code-form" hidden><div class="vpo-access-address"><span id="vpo-sent-email"></span><button type="button" id="vpo-change-email">Alterar</button></div><label for="vpo-code">Código de 6 números</label><input id="vpo-code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" maxlength="6" placeholder="000000" required aria-describedby="access-error"><button class="vpo-access-submit" type="submit">Entrar no meu plano <span aria-hidden="true">→</span></button><div class="vpo-access-resend"><span>Não recebeu? Confira o spam.</span><button type="button" id="vpo-resend">Reenviar código</button></div></form><p id="access-error" class="vpo-access-error" role="alert" hidden></p><p id="access-status" class="sr-only" aria-live="polite"></p><div class="vpo-access-footer"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>Seu orçamento é privado. Você escolhe com quem compartilhar.</span></div><p id="vpo-invite-preserved" class="vpo-access-invite" hidden>Seu convite está guardado. Entre para conferir e aceitar.</p></div></main></div>`;
  const $=selector=>root.querySelector(selector),emailForm=$('#vpo-email-form'),codeForm=$('#vpo-code-form'),codeInput=$('#vpo-code');
  let previousStage='email';
  function render(state){
    emailForm.hidden=state.stage!=='email';codeForm.hidden=state.stage==='email';
    $('#access-title').textContent=state.stage==='email'?'Seu plano começa aqui.':'Confira seu e-mail.';
    $('#access-intro').textContent=state.stage==='email'?'Entre ou crie sua conta usando seu e-mail.':'Digite o código que enviamos para você.';
    $('#vpo-sent-email').textContent=state.email;
    $('#access-error').textContent=state.error;$('#access-error').hidden=!state.error;
    for(const button of root.querySelectorAll('button'))button.disabled=state.busy;
    $('#vpo-email').disabled=state.busy;codeInput.disabled=state.busy;
    emailForm.querySelector('[type=submit]').textContent=state.busy?'Enviando…':'Continuar com e-mail →';
    codeForm.querySelector('[type=submit]').textContent=state.busy?'Conferindo…':'Entrar no meu plano →';
    $('#vpo-resend').disabled=state.busy||state.resendIn>0;
    $('#vpo-resend').textContent=state.resendIn?`Reenviar em ${state.resendIn}s`:'Reenviar código';
    root.setAttribute('aria-busy',String(state.busy));
    if(previousStage!==state.stage&&state.stage==='code'){codeInput.value='';codeInput.focus();$('#access-status').textContent='Código enviado. Confira seu e-mail.';}
    previousStage=state.stage;
  }
  const flow=createEmailAuth({auth,onSession,onChange:render});
  emailForm.addEventListener('submit',e=>{e.preventDefault();flow.send($('#vpo-email').value);});
  codeForm.addEventListener('submit',e=>{e.preventDefault();flow.verify(codeInput.value);});
  codeInput.addEventListener('input',()=>{codeInput.value=codeInput.value.replace(/\D/g,'').slice(0,6);});
  $('#vpo-change-email').onclick=()=>{flow.changeEmail();$('#vpo-email').focus();};
  $('#vpo-resend').onclick=()=>flow.send(flow.state.email);
  $('#vpo-invite-preserved').hidden=!/^#plano\/convite\/[a-f0-9]{64}$/.test(windowObject.location.hash);
  const timer=windowObject.setInterval(()=>{if(flow.state.stage==='code'&&!flow.state.busy)render(flow.state);},1000);
  render(flow.state);
  return {flow,destroy(){windowObject.clearInterval(timer);}};
}
