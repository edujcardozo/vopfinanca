import {createHash,timingSafeEqual} from 'node:crypto';

export class BillingError extends Error {
  constructor(code,message,status=503){super(message);this.code=code;this.status=status;}
}
const fail=(code,message,status)=>{throw new BillingError(code,message,status);};
export const objectId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value);
export function webhookTokenMatches(received,expected){
  if(typeof received!=='string'||typeof expected!=='string'||expected.length<32)return false;
  return timingSafeEqual(createHash('sha256').update(received).digest(),createHash('sha256').update(expected).digest());
}
export function asaasClient({environment,apiKey,fetcher=fetch}){
  const base=environment==='production'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3';
  return async function api(path,{method='GET',body,allowMissing=false}={}){
    const response=await fetcher(base+path,{method,headers:{access_token:apiKey,'Content-Type':'application/json','User-Agent':'VPO/1.0'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});
    if(allowMissing&&response.status===404)return null;
    if(!response.ok)fail('ASAAS_UNAVAILABLE','O Asaas não confirmou a operação. Confira a assinatura novamente.');
    return response.json();
  };
}
export function checkoutUrl(id,environment){
  if(!objectId(id))fail('INVALID_CHECKOUT','O provedor não confirmou o link de contratação.');
  return `${environment==='production'?'https://asaas.com':'https://sandbox.asaas.com'}/checkoutSession/show?id=${encodeURIComponent(id)}`;
}
const parts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export const localDate=value=>{const p=parts(value);return `${p.year}-${p.month}-${p.day}`;};
function midnight(date){
  const offset=new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',timeZoneName:'shortOffset'}).formatToParts(new Date(date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;
  const match=/GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offset);
  const minutes=match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3]||0)):0;
  return new Date(Date.parse(date+'T00:00:00Z')-minutes*60000).toISOString();
}
export function monthlyPeriod(payment,account){
  const date=payment.originalDueDate||payment.dueDate;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))fail('INVALID_PAYMENT_PERIOD','O período da cobrança precisa ser conferido.');
  const [year,month,day]=date.split('-').map(Number),anchor=Number(localDate(account.firstChargeAt).slice(8));
  const endDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  if(month<1||month>12||day!==Math.min(anchor,endDay)||date<localDate(account.firstChargeAt))fail('INVALID_PAYMENT_PERIOD','A data da cobrança não corresponde à assinatura.');
  const next=new Date(Date.UTC(year,month,1)),nextYear=next.getUTCFullYear(),nextMonth=next.getUTCMonth()+1;
  const nextDay=Math.min(anchor,new Date(Date.UTC(nextYear,nextMonth,0)).getUTCDate());
  return {periodStart:midnight(date),periodEnd:midnight(`${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(nextDay).padStart(2,'0')}`)};
}
const cents=value=>{const amount=Number(value)*100;return Number.isFinite(amount)&&Math.abs(amount-Math.round(amount))<0.00001?Math.round(amount):null;};
export function validateSubscription(subscription,account,payment){
  if(!subscription||!objectId(subscription.id)||subscription.customer!==payment.customer||subscription.id!==payment.subscription
    ||subscription.billingType!=='CREDIT_CARD'||subscription.cycle!=='MONTHLY'||cents(subscription.value)!==account.monthlyCents
    ||account.subscriptionId&&account.subscriptionId!==subscription.id||account.customerId&&account.customerId!==subscription.customer)
    fail('SUBSCRIPTION_MISMATCH','A assinatura retornada pelo provedor precisa ser conferida.');
  if(cents(payment.value)!==account.monthlyCents||payment.billingType!=='CREDIT_CARD')fail('PAYMENT_MISMATCH','O valor ou o meio de pagamento não corresponde à assinatura.');
  monthlyPeriod(payment,account);
}
export function paymentRecord(payment,account){
  let status;
  if(['CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL'].includes(payment.status))status='disputed';
  else if(['REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS'].includes(payment.status)||Array.isArray(payment.refunds)&&payment.refunds.some(r=>r.status==='DONE'))status='refunded';
  else if(payment.deleted||payment.status==='DELETED')status='void';
  else if(['CONFIRMED','RECEIVED'].includes(payment.status))status='paid';
  else return null;
  if(cents(payment.value)!==account.monthlyCents||payment.customer!==account.customerId||payment.subscription!==account.subscriptionId||payment.billingType!=='CREDIT_CARD')fail('PAYMENT_MISMATCH','O pagamento retornado pelo provedor precisa ser conferido.');
  // An early capture must be investigated; never turn a trial into a paid period.
  if(status==='paid'&&payment.paymentDate&&payment.paymentDate<localDate(account.firstChargeAt))fail('EARLY_PAYMENT','O provedor informou uma cobrança anterior ao término do teste.');
  return {kind:'payment',customerId:payment.customer,subscriptionId:payment.subscription,paymentId:payment.id,amountCents:account.monthlyCents,currency:'BRL',...monthlyPeriod(payment,account),status};
}

export function createGateway({db,asaas,environment,siteUrl,now=()=>Date.now()}){
  const gateway=(action,ownerId,data={})=>db.gateway(action,ownerId,{...data,environment});
  async function bindPayment(payment,account){
    if(!payment||!objectId(payment.id)||!objectId(payment.subscription))return {account,subscription:null};
    const subscription=await asaas('/subscriptions/'+encodeURIComponent(payment.subscription),{allowMissing:true});
    if(!subscription)return {account,subscription:null};
    validateSubscription(subscription,account,payment);
    if(!account.subscriptionId){
      // The known checkout, not an e-mail or caller-supplied owner, establishes
      // this relationship. A recurring card must actually be registered.
      if(payment.checkoutSession!==account.checkoutId||subscription.status!=='ACTIVE'||subscription.deleted||!subscription.creditCard?.creditCardToken)
        fail('AUTHORIZATION_PENDING','O Asaas ainda não confirmou o cartão da assinatura.',409);
      await db.event(`asaas:authorization:${subscription.id}`,account.ownerId,{kind:'authorization',customerId:subscription.customer,subscriptionId:subscription.id});
      account=await gateway('context',account.ownerId);
    }
    return {account,subscription};
  }
  async function reconcilePayment(payment,account){
    const bound=await bindPayment(payment,account);account=bound.account;
    if(!account.subscriptionId)return account;
    const record=paymentRecord(payment,account);
    if(record)await db.event(`asaas:payment:${payment.id}:${record.status}`,account.ownerId,record);
    return account;
  }
  async function checkoutPayments(account){
    if(!account.checkoutId)return [];
    const list=await asaas('/payments?checkoutSession='+encodeURIComponent(account.checkoutId)+'&limit=100');
    if(!Array.isArray(list.data)||list.hasMore)fail('CHECKOUT_REVIEW_REQUIRED','A contratação precisa ser conferida antes de continuar.');
    if(list.data.some(p=>p.checkoutSession!==account.checkoutId))fail('CHECKOUT_MISMATCH','A contratação retornada pelo provedor precisa ser conferida.');
    return list.data;
  }
  async function cancel(ownerId){
    let account=await gateway('cancel',ownerId);
    if(account.canceledAt)return {ok:true};
    if(account.checkoutStatus==='creating')fail('CHECKOUT_IN_PROGRESS','A contratação ainda está sendo preparada. Aguarde e confira o cancelamento novamente.',409);
    if(!account.subscriptionId&&account.checkoutId){
      const payments=await checkoutPayments(account);
      for(const payment of payments)account=await reconcilePayment(payment,account);
    }
    if(account.subscriptionId){
      const result=await asaas('/subscriptions/'+encodeURIComponent(account.subscriptionId),{method:'DELETE',allowMissing:true});
      if(result&&result.deleted!==true)fail('CANCELLATION_UNCONFIRMED','O Asaas ainda não confirmou o cancelamento. Tente novamente.');
    }else if(account.checkoutId){
      const result=await asaas('/checkouts/'+encodeURIComponent(account.checkoutId)+'/cancel',{method:'POST'});
      if(!result||result.status!=='CANCELED')fail('CANCELLATION_UNCONFIRMED','O Asaas ainda não confirmou o cancelamento da contratação.');
    }
    await gateway('cancel_finish',ownerId);
    return {ok:true};
  }
  async function start(ownerId){
    let account=await gateway('prepare',ownerId);
    if(!account.create){
      if(account.checkoutStatus==='creating')fail('CHECKOUT_IN_PROGRESS','Sua contratação está sendo preparada. Aguarde e confira a assinatura novamente.',409);
      const payments=await checkoutPayments(account);
      for(const payment of payments)account=await reconcilePayment(payment,account);
      if(payments.length)return {confirmed:account.authorized};
      if(new Date(account.expiresAt).getTime()>now())return {url:checkoutUrl(account.checkoutId,environment)};
      // Do not create a second recurrence until the provider has definitively
      // closed the old checkout. Ambiguous responses never trigger another POST.
      const result=await asaas('/checkouts/'+encodeURIComponent(account.checkoutId)+'/cancel',{method:'POST'});
      if(result?.status!=='CANCELED')fail('CHECKOUT_REVIEW_REQUIRED','O link anterior precisa ser encerrado antes de criar outro.');
      await gateway('retire',ownerId,{checkoutId:account.checkoutId});
      account=await gateway('prepare',ownerId);
      if(!account.create)fail('CHECKOUT_IN_PROGRESS','Aguarde a preparação da contratação.',409);
    }
    const returnTo=new URL('/#plano',siteUrl).href;
    const result=await asaas('/checkouts',{method:'POST',body:{
      billingTypes:['CREDIT_CARD'],chargeTypes:['RECURRENT'],minutesToExpire:60,externalReference:account.attemptId,
      callback:{successUrl:returnTo,cancelUrl:returnTo,expiredUrl:returnTo},
      items:[{name:'VPO · plano mensal',description:'15 dias grátis. Depois, '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(account.monthlyCents/100)+' por mês. Cancele pelo VPO.',quantity:1,value:account.monthlyCents/100}],
      subscription:{cycle:'MONTHLY',nextDueDate:localDate(account.firstChargeAt)+' 00:00:00'}
    }});
    if(!objectId(result?.id))fail('INVALID_CHECKOUT','O Asaas não confirmou o link da contratação.');
    account=await gateway('attach',ownerId,{attemptId:account.attemptId,checkoutId:result.id});
    if(account.cancellationPending){await cancel(ownerId);fail('BILLING_CANCELED','A contratação foi cancelada.',409);}
    return {url:checkoutUrl(result.id,environment)};
  }
  async function reconcile(ownerId){
    let account=await gateway('context',ownerId);
    if(account.cancellationPending){await cancel(ownerId);return {ok:true};}
    const since=localDate(now()-62*86400000);
    const payments=account.subscriptionId?(await asaas('/payments?subscription='+encodeURIComponent(account.subscriptionId)+'&dueDate[ge]='+since+'&limit=100')).data:await checkoutPayments(account);
    if(!Array.isArray(payments))fail('RECONCILIATION_FAILED','Não foi possível conferir os pagamentos.');
    for(const payment of payments)account=await reconcilePayment(payment,account);
    return {ok:true};
  }
  async function webhook(event){
    if(typeof event.id!=='string'||event.id.length<8||event.id.length>150||typeof event.event!=='string')fail('INVALID_EVENT','Evento inválido.',400);
    if(event.event.startsWith('CHECKOUT_')){
      if(!objectId(event.checkout?.id))fail('INVALID_EVENT','Evento inválido.',400);
      const account=await gateway('lookup',null,{checkoutId:event.checkout.id});
      if(!account)return {ok:true,ignored:true};
      await reconcile(account.ownerId);return {ok:true};
    }
    if(event.event.startsWith('PAYMENT_')){
      if(!objectId(event.payment?.id))fail('INVALID_EVENT','Evento inválido.',400);
      // Ignore all financial fields from the notification: fetch the current
      // payment using the merchant's private API key before touching access.
      const payment=await asaas('/payments/'+encodeURIComponent(event.payment.id),{allowMissing:true});
      if(!payment)return {ok:true,ignored:true};
      const account=await gateway('lookup',null,payment.checkoutSession?{checkoutId:payment.checkoutSession}:{subscriptionId:payment.subscription});
      if(!account)return {ok:true,ignored:true};
      if(account.cancellationPending)await cancel(account.ownerId);
      else await reconcilePayment(payment,account);
      return {ok:true};
    }
    if(event.event.startsWith('SUBSCRIPTION_')){
      if(!objectId(event.subscription?.id))fail('INVALID_EVENT','Evento inválido.',400);
      const subscription=await asaas('/subscriptions/'+encodeURIComponent(event.subscription.id),{allowMissing:true});
      let account=await gateway('lookup',null,{subscriptionId:event.subscription.id});
      if(!account&&subscription){
        const payments=await asaas('/payments?subscription='+encodeURIComponent(subscription.id)+'&limit=100');
        for(const payment of payments.data||[]){
          if(!payment.checkoutSession)continue;
          account=await gateway('lookup',null,{checkoutId:payment.checkoutSession});
          if(account){account=await reconcilePayment(payment,account);break;}
        }
      }
      if(!account)return {ok:true,ignored:true};
      if(account.cancellationPending){await cancel(account.ownerId);return {ok:true};}
      if(!subscription||subscription.deleted||subscription.status==='INACTIVE')await db.event(`asaas:cancellation:${event.subscription.id}`,account.ownerId,{kind:'cancellation',subscriptionId:event.subscription.id});
      return {ok:true};
    }
    return {ok:true,ignored:true};
  }
  return {start,cancel,reconcile,webhook};
}
