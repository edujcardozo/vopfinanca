import {accessLabel,accessTone} from './access-presentation.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'—';
const moreIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
function confirmationId(){
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function mountRegistrationAdmin({root,api,notifier=async()=>{},notify=()=>{}}){
  let current=null,busy=false,status='pending',page=0,message='',emailConfigured=null,expanded=null,confirmation=null;
  root.classList.add('vpo-admin-card');
  function prompt(item,action){
    if(action==='confirm_pix')return {title:'Confirmar Pix recebido?',text:'Confira no seu banco o recebimento de '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((item.access?.manualMonthlyCents??item.access?.monthlyCents??1290)/100)+' deste cliente. A confirmação libera 1 mês de VPO'+(item.access?.nextManualPeriodEnd?', até '+date(item.access.nextManualPeriodEnd):'')+'. O teste grátis e os períodos já pagos são preservados.',button:'Recebi o Pix · liberar 1 mês'};
    if(action==='freeze')return {title:'Congelar este plano?',text:'O acesso ao app será pausado. A conta, os lançamentos e as categorias ficam salvos. Após conferir o pagamento, use Confirmar Pix para renovar e retomar o mesmo orçamento. Congelar não pausa a contagem do teste ou do período pago.',button:'Congelar plano'};
    if(action==='unfreeze')return {title:'Retomar este plano?',text:'O orçamento será preservado. O teste original e os períodos pagos não serão estendidos; a edição depende do acesso vigente.',button:'Retomar plano'};
    if(action==='revoke')return {title:'Remover o acesso de '+item.name+'?',text:'A pessoa perde o acesso online ao VPO. Se ela for dona de um orçamento compartilhado, o acesso das pessoas convidadas também é interrompido. O orçamento fica salvo e você pode restaurar o acesso depois.',button:'Sim, remover acesso'};
    if(action==='permanent')return {title:'Liberar acesso permanente?',text:'Esta pessoa poderá usar seu plano pessoal sem prazo de validade e sem mensalidade. Isso não dá acesso à administração do VPO.',button:'Liberar permanente'};
    if(action==='subscription')return {title:'Voltar ao acesso por assinatura?',text:'O teste original de 15 dias não reinicia.'+(item.access?.trialEndsAt?' Ele termina em '+date(item.access.trialEndsAt)+'.':'')+' Após o teste, a edição depende de uma assinatura ativa.',button:'Usar teste e assinatura'};
    return {title:'Restaurar este acesso?',text:'O tipo de acesso anterior será mantido. O teste de 15 dias não reinicia; se já terminou, o orçamento volta em modo de consulta.',button:'Restaurar acesso'};
  }
  function row(item){
    const frozen=!!item.frozenAt||status==='frozen',removed=!!item.revokedAt||status==='revoked',pending=status==='pending',approved=item.status==='approved';
    const label=removed?'Acesso removido':frozen?'Plano congelado':pending?'Aguardando aprovação':item.status==='guest'?'Convidado':item.status==='rejected'?'Cadastro recusado':accessLabel(item.access)||(item.accessMode==='permanent'?'Acesso permanente':'Acesso liberado');
    const tone=removed||frozen?'attention':pending?'trial':item.status==='guest'?'shared':accessTone(item.access);
    const active=confirmation?.id===item.id?prompt(item,confirmation.action):null;
    return `<article class="vpo-admin-request" data-user-row="${esc(item.id)}"><div class="vpo-admin-user"><span class="vpo-admin-avatar" aria-hidden="true">${esc(Array.from(item.name||item.email||'?')[0].toLocaleUpperCase('pt-BR'))}</span><div class="vpo-admin-identity"><strong>${esc(item.name)}</strong><p>${esc(item.email)}</p></div><span class="vpo-user-badge" data-tone="${tone}">${esc(label)}</span>${!pending&&status!=='rejected'?`<button type="button" class="vpo-admin-more" data-user-options="${esc(item.id)}" aria-label="Opções de acesso de ${esc(item.name)}" aria-expanded="${expanded===item.id}">${moreIcon}</button>`:''}</div>
      <div class="vpo-admin-meta"><span>Cadastro <b>${esc(date(item.requestedAt))}</b></span>${item.phone?`<span>Celular <b>${esc(item.phone)}</b></span>`:''}${frozen?`<span>Congelado em <b>${esc(date(item.frozenAt))}</b></span>`:''}${removed?`<span>Removido em <b>${esc(date(item.revokedAt))}</b></span>`:approved&&item.accessMode!=='permanent'&&item.access?.trialEndsAt?`<span>Fim do teste <b>${esc(date(item.access.trialEndsAt))}</b></span>`:''}${approved&&item.accessMode!=='permanent'&&item.access?.paidUntil?`<span>Pago até <b>${esc(date(item.access.paidUntil))}</b></span>`:''}</div>
      ${pending?`<small>${item.notification==='sent'?'Aviso enviado por e-mail':item.notification==='failed'?'Aviso não enviado':'Aviso de e-mail pendente'}</small><div class="vpo-admin-actions" ${active?'hidden':''}><button class="btn btn-blue" type="button" data-approve="${esc(item.id)}">Aprovar · 15 dias grátis</button><button class="subtle-button" type="button" data-approve-permanent="${esc(item.id)}">Liberar permanente</button><button class="subtle-button" type="button" data-reject="${esc(item.id)}">Recusar</button></div><div class="vpo-admin-confirm" data-confirm-reject="${esc(item.id)}" hidden><p>Recusar este cadastro?</p><div class="vpo-admin-actions"><button class="subtle-button" type="button" data-cancel-reject>Voltar</button><button class="subtle-button vpo-admin-danger" type="button" data-decision="${esc(item.id)}">Sim, recusar</button></div></div>`:''}
      ${expanded===item.id&&!active?`<div class="vpo-admin-options" aria-label="Gerenciar acesso de ${esc(item.name)}">${(removed||frozen)&&approved&&item.accessMode!=='permanent'&&item.access?.manualPixAvailable&&item.access?.manualPaymentVersion?`<button class="subtle-button" type="button" data-user-action="confirm_pix" data-user-id="${esc(item.id)}">Confirmar Pix · renovar e retomar</button>`:''}${frozen&&!removed?`<button class="subtle-button" type="button" data-user-action="unfreeze" data-user-id="${esc(item.id)}">Retomar plano</button>`:''}${removed?`<button class="subtle-button" type="button" data-user-action="restore" data-user-id="${esc(item.id)}">Restaurar acesso</button>`:`${approved?`${!frozen&&item.accessMode!=='permanent'&&item.access?.manualPixAvailable&&item.access?.manualPaymentVersion?`<button class="subtle-button" type="button" data-user-action="confirm_pix" data-user-id="${esc(item.id)}">Confirmar Pix · 1 mês</button>`:''}<button class="subtle-button" type="button" data-user-action="${item.accessMode==='permanent'?'subscription':'permanent'}" data-user-id="${esc(item.id)}">${item.accessMode==='permanent'?'Usar teste e assinatura':'Tornar permanente'}</button>`:''}<button class="subtle-button vpo-admin-danger" type="button" data-user-action="revoke" data-user-id="${esc(item.id)}">Remover acesso</button>${!frozen?`<button class="subtle-button" type="button" data-user-action="freeze" data-user-id="${esc(item.id)}">Congelar plano</button>`:''}`}</div>`:''}
      ${active?`<div class="vpo-admin-confirm" role="group" aria-label="Confirmar alteração de acesso"><strong>${esc(active.title)}</strong><p>${esc(active.text)}</p><div class="vpo-admin-actions"><button class="subtle-button" type="button" data-user-cancel>Voltar</button><button class="${confirmation.action==='revoke'?'subtle-button vpo-admin-danger':'btn btn-blue'}" type="button" data-user-confirm="${esc(item.id)}">${esc(active.button)}</button></div></div>`:''}</article>`;
  }
  function render(){
    root.innerHTML=`<div class="vpo-admin-heading"><div><span class="small-label">ADMINISTRAÇÃO</span><h2>Usuários e acessos.</h2></div><button class="subtle-button" data-admin-refresh type="button">Atualizar ↻</button></div><p>Aprove cadastros e gerencie quem pode usar o VPO.</p><div class="vpo-admin-filters" role="group" aria-label="Filtrar usuários">${[['pending','Pendentes'],['approved','Usuários'],['frozen','Congelados'],['revoked','Removidos'],['rejected','Recusados']].map(([key,label])=>`<button class="subtle-button" type="button" data-admin-filter="${key}" aria-pressed="${status===key}">${label}</button>`).join('')}</div><div class="vpo-admin-list">${current?.items?.length?current.items.map(row).join(''):`<p class="vpo-admin-note">${current?'Nenhum usuário neste filtro.':'Carregando usuários…'}</p>`}</div>${current?.total>10?`<div class="vpo-admin-pages"><button class="subtle-button" type="button" data-admin-prev ${page===0?'disabled':''}>← Anterior</button><span>${page+1} de ${Math.ceil(current.total/10)}</span><button class="subtle-button" type="button" data-admin-next ${(page+1)*10>=current.total?'disabled':''}>Próxima →</button></div>`:''}<p class="vpo-admin-note" id="admin-email-status"></p><p class="vpo-admin-status" role="status" aria-live="polite">${esc(message)}</p>`;
    renderEmailStatus();
  }
  function renderEmailStatus(){const el=root.querySelector('#admin-email-status');if(el)el.textContent=emailConfigured===false?'Os pedidos ficam salvos aqui. O envio automático de e-mails ainda precisa ser configurado.':emailConfigured===true?'Avisos de novos cadastros: edujcardozo@gmail.com. O estado do envio aparece em cada pedido.':'Os pedidos ficam salvos aqui, mesmo quando o aviso por e-mail não é enviado.';}
  async function refresh(){
    if(busy)return;busy=true;root.setAttribute('aria-busy','true');
    try{current=await api('/requests',{status,page});if(page>0&&page*10>=current.total){page=Math.max(0,Math.ceil(current.total/10)-1);current=await api('/requests',{status,page});}message='';expanded=null;confirmation=null;}
    catch(error){message=error.message;}
    finally{busy=false;root.removeAttribute('aria-busy');render();}
  }
  async function mutate(path,body,successMessage){
    if(busy)return;busy=true;let success=false;root.setAttribute('aria-busy','true');for(const b of root.querySelectorAll('button'))b.disabled=true;
    try{await api(path,body);success=true;notify(successMessage);}
    catch(error){message=error.message;notify(error.message);}
    finally{busy=false;root.removeAttribute('aria-busy');if(success)await refresh();else render();}
  }
  root.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-admin-refresh'))return refresh();
    if(button.dataset.adminFilter){status=button.dataset.adminFilter;page=0;current=null;render();return refresh();}
    if(button.hasAttribute('data-admin-prev')){page--;return refresh();}if(button.hasAttribute('data-admin-next')){page++;return refresh();}
    if(button.dataset.approve)return mutate('/decision',{userId:button.dataset.approve,decision:'approved'},'Teste de 15 dias liberado.');
    if(button.dataset.approvePermanent){confirmation={id:button.dataset.approvePermanent,action:'permanent',approve:true};expanded=confirmation.id;render();root.querySelector('[data-user-cancel]')?.focus();return;}
    if(button.dataset.reject){const r=button.closest('article');r.querySelector('[data-confirm-reject]').hidden=false;r.querySelector('.vpo-admin-actions').hidden=true;return;}
    if(button.hasAttribute('data-cancel-reject')){const r=button.closest('article');r.querySelector('[data-confirm-reject]').hidden=true;r.querySelector('.vpo-admin-actions').hidden=false;return;}
    if(button.dataset.decision)return mutate('/decision',{userId:button.dataset.decision,decision:'rejected'},'Cadastro recusado.');
    if(button.dataset.userOptions){expanded=expanded===button.dataset.userOptions?null:button.dataset.userOptions;confirmation=null;render();return;}
    if(button.dataset.userAction){confirmation={id:button.dataset.userId,action:button.dataset.userAction,...(button.dataset.userAction==='confirm_pix'?{requestId:confirmationId()}:{} )};render();root.querySelector('[data-user-cancel]')?.focus();return;}
    if(button.hasAttribute('data-user-cancel')){confirmation=null;expanded=null;render();return;}
    if(button.dataset.userConfirm&&confirmation?.id===button.dataset.userConfirm){
      const c=confirmation;
      if(c.approve)return mutate('/decision',{userId:c.id,decision:'approved',accessMode:'permanent'},'Acesso permanente liberado.');
      if(c.action==='confirm_pix')return mutate('/pix',{userId:c.id,requestId:c.requestId,paymentVersion:current.items.find(x=>x.id===c.id)?.access?.manualPaymentVersion,confirm:true},'Pix confirmado. Mais um mês de VPO liberado.');
      return mutate('/manage',{userId:c.id,action:c.action,confirm:true},{permanent:'Acesso permanente liberado.',subscription:'Acesso por teste e assinatura atualizado.',revoke:'Acesso removido. O orçamento continua salvo.',restore:'Acesso restaurado sem reiniciar o teste.',freeze:'Plano congelado. Os lançamentos continuam salvos.',unfreeze:'Plano retomado sem alterar o histórico.'}[c.action]);
    }
  });
  render();refresh();notifier('status').then(result=>{emailConfigured=!!result.configured;renderEmailStatus();}).catch(()=>{emailConfigured=false;renderEmailStatus();});
  return {refresh};
}
