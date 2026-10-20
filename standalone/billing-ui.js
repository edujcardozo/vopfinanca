const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'após os 15 dias grátis';
const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):null;
export function billingSummary(info){
  if(!info)return {title:'Conectando sua assinatura…',description:'Um instante para conferir seu acesso.',label:'VPO'};
  const price=money(info.monthlyCents),shared=info.isOwner===false;
  if(!info.enabled)return {title:'15 dias para conhecer seu novo plano.',description:'As assinaturas estão sendo preparadas. Você verá o valor e autorizará o pagamento antes de começar o teste.',label:'EM BREVE'};
  if(shared)return {title:info.canUse?'Um plano para vocês dois.':'A assinatura do plano precisa de atenção.',description:info.canUse?'Seu acesso faz parte do plano compartilhado. A assinatura é gerenciada por quem convidou você.':'Peça a quem compartilhou o plano para conferir a assinatura. Seus dados continuam guardados.',label:'PLANO COMPARTILHADO'};
  if(info.phase==='trialing')return {title:`Seu teste vai até ${date(info.firstChargeAt||info.trialEndsAt)}.`,description:`Primeira cobrança em ${date(info.firstChargeAt)}${price?' · '+price+'/mês':''}. Você pode cancelar antes dessa data.`,label:'TESTE GRÁTIS'};
  if(info.phase==='active')return {title:'Seu plano está em dia.',description:`Acesso confirmado até ${date(info.paidUntil)}.${info.canceledAt?' A renovação foi cancelada.':''}`,label:info.canceledAt?'RENOVAÇÃO CANCELADA':'ASSINATURA ATIVA'};
  if(info.phase==='awaiting_authorization')return {title:'Falta confirmar a autorização.',description:'Confira o meio de pagamento escolhido. Autorizar a assinatura não cobra a mensalidade agora.',label:'ÚLTIMO PASSO'};
  if(info.phase==='canceled')return {title:'Sua assinatura foi cancelada.',description:'Nenhuma renovação será feita. Seus dados continuam disponíveis para consulta e backup.',label:'CANCELADA'};
  if(info.phase==='payment_required')return {title:'Seu teste terminou.',description:'Ative a assinatura para continuar planejando. Seus dados continuam disponíveis para consulta e backup.',label:'SEU PLANO CONTINUA AQUI'};
  return {title:'Dê o primeiro passo com 15 dias grátis.',description:'Confira o valor mensal e a primeira cobrança antes de autorizar a assinatura.',label:'SEU PLANO VPO'};
}
export function subscriptionHTML(info,method='credit_card'){
  const summary=billingSummary(info),price=money(info?.monthlyCents),owner=info?.isOwner!==false;
  const canChoose=owner&&!info?.cancellationPending&&['choose_payment','awaiting_authorization','not_enabled'].includes(info?.phase),ready=!!info?.checkoutReady;
  const methods=info?.allowedMethods||['credit_card'];
  return `<div class="vpo-subscription"><p class="vpo-billing-eyebrow">${esc(summary.label)}</p><h2>${esc(summary.title)}</h2><p class="vpo-billing-description">${esc(summary.description)}</p>${owner?`<div class="vpo-price-card"><span>VPO · plano mensal</span><div>${price?`<strong>${esc(price)}</strong><small>/mês</small>`:'<strong class="vpo-price-soon">Valor disponível em breve</strong>'}</div><p>Um orçamento para você e uma pessoa convidada.</p></div>`:''}${canChoose?`<div class="vpo-payment-options" role="group" aria-label="Meio de pagamento"><button type="button" data-billing-method="credit_card" aria-pressed="${method==='credit_card'}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></svg><span><strong>Cartão de crédito</strong><small>Renovação mensal automática</small></span><i aria-hidden="true"></i></button>${methods.includes('pix_automatic')?`<button type="button" data-billing-method="pix_automatic" aria-pressed="${method==='pix_automatic'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 9-9 9-9-9 9-9Zm-6 6h3l3 3 3-3h3M6 15h3l3-3 3 3h3"/></svg><span><strong>Pix Automático</strong><small>Uma autorização no app do banco</small></span><i aria-hidden="true"></i></button>`:''}</div><dl class="vpo-billing-timeline"><div><dt>Hoje</dt><dd>R$ 0,00</dd></div><div><dt>Teste grátis</dt><dd>15 dias</dd></div><div><dt>Primeira cobrança</dt><dd>${esc(date(info?.firstChargeAt))}</dd></div></dl><p class="vpo-payment-explanation">${method==='pix_automatic'?'Você autoriza a recorrência no seu banco. Este passo não deve fazer um pagamento imediato.':'Você cadastra o cartão pelo ambiente seguro do provedor de pagamento. A mensalidade começa após o teste.'}</p><label class="vpo-billing-consent"><input type="checkbox" id="vpo-billing-consent" ${!ready?'disabled':''}><span>${price?`Autorizo a assinatura de <strong>${esc(price)} por mês</strong>, com primeira cobrança ${info?.firstChargeAt?'em '+esc(date(info.firstChargeAt)):'somente após os 15 dias grátis'}. Posso cancelar antes da primeira cobrança.`:'O valor mensal e os termos serão exibidos antes da contratação.'}</span></label><button type="button" class="btn btn-blue vpo-billing-continue" data-billing-continue ${!ready?'disabled':''}>${ready?'Continuar com '+(method==='pix_automatic'?'Pix Automático':'cartão')+' →':'Assinaturas disponíveis em breve'}</button><p class="vpo-billing-safe">O pagamento será autorizado no provedor. Você volta ao VPO para conferir o acesso.</p>`:''}${owner&&info?.canCancel?`<div class="vpo-billing-cancel">${info.cancellationPending?'<p>O cancelamento está em andamento. Confira novamente para concluir.</p>':''}<button type="button" class="subtle-button" data-billing-cancel>${info.cancellationPending?'Concluir cancelamento':'Cancelar renovação'}</button></div>`:''}<p id="vpo-billing-error" class="form-error" role="alert" hidden></p><button type="button" class="text-link" data-billing-refresh>Conferir assinatura novamente</button></div>`;
}
export function createBillingUI({root,fetcher,openDialog,notify,onAccess=()=>{},checkout=null,cancel=null,reconcile=null}){
  let info=null,loading=null,method='credit_card',dialogOpen=false;
  async function api(path,body){
    const response=await fetcher('/api/billing'+path,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,headers:body?{'Content-Type':'application/json'}:{},signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível conferir sua assinatura.');return data;
  }
  function render(){
    const s=billingSummary(info);
    root.innerHTML=`<span class="vpo-billing-badge">${esc(s.label)}</span><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p><button type="button" class="subtle-button" data-manage-subscription>${info?.isOwner===false?'Ver acesso compartilhado':'Minha assinatura'} →</button><p class="vpo-billing-inline-error" role="status" hidden></p>`;
  }
  function bindDialog(){
    const dialog=document.querySelector('.vpo-subscription');if(!dialog)return;
    for(const button of dialog.querySelectorAll('[data-billing-method]'))button.onclick=()=>{
      const checked=dialog.querySelector('#vpo-billing-consent')?.checked;
      method=button.dataset.billingMethod;show();
      const next=document.querySelector('#vpo-billing-consent');if(next)next.checked=!!checked;
    };
    dialog.querySelector('[data-billing-refresh]').onclick=()=>refresh(true,true);
    const cancellation=dialog.querySelector('[data-billing-cancel]');if(cancellation)cancellation.onclick=showCancel;
    const next=dialog.querySelector('[data-billing-continue]');if(next)next.onclick=async()=>{
      const error=dialog.querySelector('#vpo-billing-error');
      if(!dialog.querySelector('#vpo-billing-consent').checked){error.textContent='Confira o valor, a data e autorize a assinatura para continuar.';error.hidden=false;return;}
      next.disabled=true;error.hidden=true;
      try{
        if(!checkout)throw new Error('A contratação ainda não está disponível. Tente novamente mais tarde.');
        const quote=await api('/quote',{paymentMethod:method,consent:true,termsVersion:info.termsVersion});
        info=quote;await checkout({paymentMethod:method,quote});
      }catch(e){error.textContent=e.message;error.hidden=false;}finally{next.disabled=false;}
    };
  }
  function showCancel(){
    openDialog('Cancelar a renovação?',`<div class="vpo-subscription"><p class="vpo-billing-description">${info?.paidUntil?'Você continua usando o período já pago até '+esc(date(info.paidUntil))+'.':'O teste grátis termina quando o cancelamento for confirmado.'} Seu orçamento continua disponível para consulta e backup.</p><p class="vpo-billing-description">Depois da confirmação, o Asaas encerra a assinatura e as cobranças pendentes.</p><div class="vpo-cancel-actions"><button type="button" class="btn btn-blue" data-keep-subscription>Continuar com meu plano</button><button type="button" class="subtle-button" data-confirm-cancel>Cancelar renovação</button></div><p class="form-error" role="alert" hidden></p></div>`,'VPO · SUA ASSINATURA');
    const dialog=document.querySelector('.vpo-subscription');dialog.querySelector('[data-keep-subscription]').onclick=show;
    dialog.querySelector('[data-confirm-cancel]').onclick=async e=>{
      const button=e.currentTarget,error=dialog.querySelector('[role=alert]');button.disabled=true;error.hidden=true;
      try{if(!cancel)throw new Error('O cancelamento ainda não está disponível. Tente novamente mais tarde.');await cancel();await refresh(true);notify('Renovação cancelada.');}
      catch(e){error.textContent=e.message;error.hidden=false;}finally{button.disabled=false;}
    };
  }
  function show(){dialogOpen=true;openDialog('Seu plano, do seu jeito.',subscriptionHTML(info,method),'VPO · ASSINATURA');bindDialog();}
  async function refresh(reopen=false,checkProvider=false){
    if(loading)return loading;
    loading=(async()=>{try{if(checkProvider&&reconcile&&info?.enabled&&info?.isOwner&&info?.trialStartedAt)await reconcile();info=await api('');render();onAccess(info);if(reopen)show();return info;}catch(e){const error=root.querySelector('.vpo-billing-inline-error');if(error){error.textContent='Não foi possível conferir a assinatura agora.';error.hidden=false;}if(reopen)notify(e.message);return null;}finally{loading=null;}})();return loading;
  }
  root.addEventListener('click',e=>{if(e.target.closest('[data-manage-subscription]'))show();});
  render();
  return {refresh,show,get info(){return info;}};
}
