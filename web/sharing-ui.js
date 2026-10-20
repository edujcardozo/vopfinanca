const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function invitationToken(value){
  const text=String(value||'').trim();
  if(/^[a-f0-9]{64}$/.test(text))return text;
  try{const hash=new URL(text,globalThis.location?.href||'https://plan.test').hash;return /^#plano\/convite\/[a-f0-9]{64}$/.test(hash)?hash.split('/')[2]:null;}catch{return null;}
}
export function createSharingUI({root,sync,openDialog,closeDialog,notify,reload=()=>location.reload(),fetcher=(...args)=>fetch(...args),independent=false,allowEmptySwitch=()=>false}){
  let current=null,busy=false,loading=null,handledHash=null;
  async function api(path,body){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetcher('/api/sharing'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'manual',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      if(response.status===401||response.type==='opaqueredirect'||!response.headers.get('content-type')?.includes('application/json'))throw Object.assign(new Error(independent?'Entre na sua conta VPO para compartilhar o plano.':'Entre na sua conta do ChatGPT para compartilhar o plano.'),{auth:true});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível concluir. Tente novamente.');return data;
    }finally{clearTimeout(timeout);}
  }
  function errorHTML(error){return `<p class="sharing-error" role="alert">${esc(error.message||'Não foi possível conectar agora.')}</p>${error.auth?`<a class="subtle-button" href="${independent?'?entrar=1'+esc(location.hash):'/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.hash)}">${independent?'Entrar no VPO':'Entrar com ChatGPT'}</a>`:''}`;}
  function render(){
    if(!current)return;
    const {scope,members,plans,invites}=current,owner=scope.role==='owner',shared=!scope.revoked&&(members.length>0||!owner),needsReload=sync.status.blocked||sync.status.scopeId&&sync.status.scopeId!==scope.id;
    root.innerHTML=`<div class="sharing-heading"><div class="sharing-avatars" aria-hidden="true"><span>👨</span><span>👩</span></div><span class="sharing-badge ${shared?'is-shared':''}">${scope.revoked?'Acesso removido':shared?'Plano compartilhado':'Só você, por enquanto'}</span></div><h2>Um plano, vocês dois.</h2><p>As mesmas categorias, gastos e valores planejados nos dois celulares. ${independent?"Cada um entra com seu e-mail no VPO, sem precisar de uma conta no ChatGPT.":"Cada um entra com sua própria conta do ChatGPT."}</p><div class="sharing-current"><span class="small-label">PLANO ABERTO AGORA</span><strong>${scope.revoked?'Plano com acesso removido':owner?(shared?'Nosso plano':'Meu plano pessoal'):'Nosso plano'}</strong><small>${scope.revoked?'Você pode voltar ao seu plano pessoal abaixo.':owner?'Você gerencia o acesso.':`Compartilhado por ${esc(scope.ownerEmail||'seu parceiro')}. Você pode adicionar e editar gastos.`}</small></div>
      ${needsReload&&!scope.revoked?'<p class="sharing-error" role="status">O plano ativo mudou. Carregue a versão atual antes de continuar.</p><button class="btn btn-blue" type="button" data-reload-plan>Carregar plano ativo →</button>':scope.revoked?'':shared?`<div class="sharing-people"><div><span class="sharing-person-icon" aria-hidden="true">${owner?'👨':'👩'}</span><span><strong>Você</strong><small>${owner?'Dono do plano':'Pode editar'}</small></span></div>${owner?members.map(m=>`<div><span class="sharing-person-icon" aria-hidden="true">👩</span><span class="sharing-person-label"><strong>${esc(m.email||'Pessoa convidada')}</strong><small>Pode editar o mesmo plano</small></span><button class="sharing-remove" type="button" data-remove-member="${esc(m.id)}">Remover</button></div>`).join(''):''}</div>`:`<button class="btn btn-blue" type="button" data-create-invite>Convidar para o meu plano <span aria-hidden="true">↗</span></button><small class="sharing-help">O convite vale por 24 horas e pode ser usado uma vez.</small>`}
      ${owner&&invites.length?`<div class="sharing-pending"><span>Convite aguardando aceite</span><button class="text-link" type="button" data-cancel-invite="${esc(invites[0].id)}">Cancelar</button></div>`:''}
      ${shared?'<p class="sharing-live"><span aria-hidden="true"></span>Alterações atualizadas a cada poucos segundos, com o app aberto e conectado.</p>':''}
      ${plans.length>1||scope.revoked?`<div class="sharing-plan-picker"><label for="sharing-plan">Abrir outro plano</label><select id="sharing-plan">${plans.map(p=>`<option value="${esc(p.id)}" ${p.id===scope.id?'selected':''}>${esc(p.id===current.user.id?'Meu plano pessoal':p.ownerEmail?'Compartilhado · '+p.ownerEmail:'Plano compartilhado')}</option>`).join('')}</select><button class="subtle-button" type="button" data-switch-plan>Abrir plano selecionado →</button><small>Cada plano mantém seus próprios dados. A troca também muda o plano ativo nos seus outros aparelhos.</small></div>`:''}
      <button class="text-link sharing-join" type="button" data-enter-invite>Já recebeu um convite?</button><p class="sharing-help">A Larissa também precisa ter acesso a este site. Se aparecer “sem acesso”, adicione a conta dela em Compartilhar no site.</p><div id="sharing-error" aria-live="polite"></div>`;
  }
  async function refresh(){
    if(busy||loading)return loading;
    loading=(async()=>{try{current=await api('');render();}catch(error){if(!current)root.innerHTML='<h2>Um plano, vocês dois.</h2>'+errorHTML(error)+'<button class="subtle-button" data-refresh-sharing>Tentar novamente</button>';}finally{loading=null;}})();return loading;
  }
  async function beforeSwitch(){
    await sync.flush();const status=sync.status;
    if(status.blocked){sync.backupCurrent();return;}
    if((!status.initialized||status.dirty||status.conflict)&&!allowEmptySwitch())throw new Error('Sincronize ou revise as alterações deste aparelho antes de trocar de plano.');
    sync.backupCurrent();
  }
  function changeCompleted(){sync.stop();closeDialog();reload();}
  async function perform(action){
    if(busy)return;busy=true;root.setAttribute('aria-busy','true');
    try{await action();}catch(error){const errorRoot=root.querySelector('#sharing-error');if(errorRoot)errorRoot.innerHTML=errorHTML(error);notify(error.message||'Não foi possível concluir.');}finally{busy=false;root.removeAttribute('aria-busy');}
  }
  function confirmRemoval(memberId){
    openDialog('Remover acesso?',`<p class="confirm-text">A outra pessoa deixará de abrir e editar este plano. Os lançamentos de vocês continuam aqui. Uma cópia que já esteja no aparelho dela não pode ser apagada à distância.</p><div class="confirm-actions"><button class="subtle-button" id="sharing-cancel">Manter acesso</button><button class="btn btn-blue" id="sharing-confirm">Remover acesso</button></div>`,'VOCÊ GERENCIA SEU PLANO');
    document.querySelector('#sharing-cancel').onclick=closeDialog;
    document.querySelector('#sharing-confirm').onclick=()=>perform(async()=>{await api('/remove-member',{memberId});closeDialog();current=await api('');render();notify('Acesso removido. Os dados do plano foram mantidos.');});
  }
  function showCreatedInvite(invite){
    const link=new URL(location.href);link.hash='#plano/convite/'+invite.token;
    openDialog('Um convite para planejar juntos.',`<p class="confirm-text">Envie este link para a Larissa. Ela abre no celular, entra na conta dela e aceita o convite para ver e editar o mesmo plano.</p><label class="form-group"><span>Link pessoal de convite</span><input id="sharing-invite-link" class="sharing-link-input" readonly value="${esc(link.href)}" aria-label="Link do convite"></label><div class="sharing-link-actions"><button class="btn btn-blue" id="copy-sharing-link">Copiar convite</button><button class="subtle-button" id="share-sharing-link">Compartilhar…</button></div><p class="dialog-note">Válido até ${esc(new Date(invite.expiresAt).toLocaleString('pt-BR'))}. Quem aceitar poderá editar todo o plano. Envie somente para a pessoa convidada.</p><p id="sharing-link-result" class="sharing-live" aria-live="polite"></p>`,'UM PLANO PARA DOIS');
    const result=document.querySelector('#sharing-link-result'),input=document.querySelector('#sharing-invite-link');
    document.querySelector('#copy-sharing-link').onclick=async()=>{
      try{await navigator.clipboard.writeText(link.href);result.textContent='Convite copiado. Agora envie para a Larissa.';}catch{input.focus();input.select();result.textContent='Selecione e copie o link acima.';}
    };
    const shareButton=document.querySelector('#share-sharing-link');shareButton.hidden=!navigator.share;
    shareButton.onclick=async()=>{try{await navigator.share({title:'Nosso plano · VPO',text:'Vamos cuidar do nosso plano juntos? Abra e aceite meu convite.',url:link.href});}catch(error){if(error.name!=='AbortError')result.textContent='Copie o link para enviar o convite.';}};
  }
  async function preview(token){
    try{
      const invite=await api('/preview',{token});
      openDialog('Vamos planejar juntos?',`<div class="sharing-invite-visual" aria-hidden="true">👨 <span>+</span> 👩</div><p class="confirm-text"><strong>${esc(invite.ownerEmail||'Seu parceiro')}</strong> convidou você para compartilhar o mesmo plano. Vocês poderão adicionar gastos, editar categorias e acompanhar os valores nos dois aparelhos.</p><p class="dialog-note">Seu plano pessoal continua guardado separadamente. Ao aceitar, você abre o plano compartilhado.</p><p id="sharing-accept-error" class="form-error" role="alert" hidden></p><button class="btn btn-blue form-submit" id="accept-plan-invite">Aceitar e abrir nosso plano →</button>`,'UM PLANO PARA DOIS');
      document.querySelector('#accept-plan-invite').onclick=async e=>{
        const button=e.currentTarget;button.disabled=true;
        try{await beforeSwitch();await api('/accept',{token});history.replaceState(null,'','#plano/ajustes');changeCompleted();}catch(error){const el=document.querySelector('#sharing-accept-error');if(el){el.textContent=error.message;el.hidden=false;}button.disabled=false;}
      };
    }catch(error){openDialog('Não foi possível abrir o convite.',errorHTML(error)+'<p class="dialog-note">Peça um novo link para quem compartilhou o plano.</p>','CONVITE PARA O PLANO');}
  }
  function enterInvite(){
    openDialog('Abra o convite que recebeu.',`<form id="enter-plan-invite"><label class="form-group"><span>Link do convite</span><input name="invite" type="text" inputmode="url" autocomplete="off" placeholder="Cole o link aqui" required></label><p id="invite-input-error" class="form-error" role="alert" hidden></p><button class="btn btn-blue form-submit" type="submit">Ver convite →</button></form>`,'UM PLANO PARA DOIS');
    document.querySelector('#enter-plan-invite').onsubmit=e=>{e.preventDefault();const token=invitationToken(new FormData(e.currentTarget).get('invite'));if(!token){const error=document.querySelector('#invite-input-error');error.textContent='Cole um link de convite válido.';error.hidden=false;return;}preview(token);};
  }
  root.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-enter-invite'))return enterInvite();
    if(button.hasAttribute('data-refresh-sharing'))return refresh();
    if(button.hasAttribute('data-reload-plan'))return perform(async()=>{sync.backupCurrent();changeCompleted();});
    if(button.hasAttribute('data-remove-member'))return confirmRemoval(button.dataset.removeMember);
    if(button.hasAttribute('data-create-invite'))return perform(async()=>{await beforeSwitch();const invite=await api('/invites',{});current=await api('');render();showCreatedInvite(invite);});
    if(button.hasAttribute('data-cancel-invite'))return perform(async()=>{await api('/revoke-invite',{id:button.dataset.cancelInvite});current=await api('');render();notify('Convite cancelado.');});
    if(button.hasAttribute('data-switch-plan'))return perform(async()=>{const scopeId=root.querySelector('#sharing-plan').value;if(scopeId===current.scope.id&&!sync.status.blocked)return;await beforeSwitch();await api('/switch',{scopeId});changeCompleted();});
  });
  function handleInvitation(){const hash=location.hash;if(!hash.startsWith('#plano/convite/')||handledHash===hash)return;handledHash=hash;const token=invitationToken(location.href);if(token)preview(token);else openDialog('Convite inválido.','<p class="confirm-text">Peça um novo link para quem compartilhou o plano.</p>');}
  return {refresh,handleInvitation,preview};
}
