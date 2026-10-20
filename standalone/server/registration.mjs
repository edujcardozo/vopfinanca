import {sendGmailRegistration} from './gmail.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export class RegistrationError extends Error{constructor(code,message,status=503){super(message);Object.assign(this,{code,status});}}
export function registrationConfig(env){
  // Report constant variable names only. Never echo environment values or
  // parser/provider errors: this check also runs before authentication.
  const fields=[],check=(valid,name)=>{if(!valid)fields.push(name);};
  const fail=()=>{const error=new RegistrationError('EMAIL_NOT_CONFIGURED','O envio automático de e-mails ainda precisa ser configurado. O cadastro está salvo para aprovação em Ajustes.');error.fields=fields;throw error;};
  let url,site;try{url=new URL(env.SUPABASE_URL);}catch{/* Report below. */}try{site=new URL(env.VPO_SITE_URL);}catch{/* Report below. */}
  check(url?.protocol==='https:'&&url.hostname.endsWith('.supabase.co')&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash,'SUPABASE_URL');
  check(site?.protocol==='https:'&&site.pathname==='/'&&!site.username&&!site.password&&!site.search&&!site.hash,'VPO_SITE_URL');
  const secret=String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  let role;try{role=JSON.parse(Buffer.from(secret.split('.')[1],'base64url')).role;}catch{/* Modern secret key. */}
  check(secret&&(secret.startsWith('sb_secret_')||role==='service_role'),env.SUPABASE_SERVICE_ROLE_KEY&&!env.SUPABASE_SECRET_KEY?'SUPABASE_SERVICE_ROLE_KEY':'SUPABASE_SECRET_KEY');
  const provider=String(env.VPO_EMAIL_PROVIDER||'resend').trim().toLowerCase();
  check(provider==='gmail'||provider==='resend','VPO_EMAIL_PROVIDER');
  if(provider==='gmail'){
    const gmailUser=String(env.GMAIL_USER||'').trim().toLowerCase(),gmailPassword=String(env.GMAIL_APP_PASSWORD||'').replace(/\s/g,'');
    check(/^[a-z0-9._%+-]+@gmail\.com$/.test(gmailUser),'GMAIL_USER');check(/^\w{16}$/.test(gmailPassword),'GMAIL_APP_PASSWORD');
    if(fields.length)return fail();
    return {url:url.origin,siteUrl:site.origin,secret,provider,gmailUser,gmailPassword,from:`VPO <${gmailUser}>`};
  }
  if(provider==='resend'){
    check(/^re_[A-Za-z0-9_-]{12,}$/.test(env.RESEND_API_KEY||''),'RESEND_API_KEY');
    check(env.VPO_EMAIL_FROM&&env.VPO_EMAIL_FROM.length<=200&&!/[\r\n]/.test(env.VPO_EMAIL_FROM)&&/(?:^|<)[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(env.VPO_EMAIL_FROM),'VPO_EMAIL_FROM');
  }
  if(fields.length)return fail();
  return {url:url.origin,siteUrl:site.origin,secret,provider,resendKey:env.RESEND_API_KEY,from:env.VPO_EMAIL_FROM};
}
export function registrationDatabase(config,fetcher=fetch){return async(action,actor=null,data={})=>{
  const response=await fetcher(config.url+'/rest/v1/rpc/vpo_registration_delivery',{method:'POST',headers:{apikey:config.secret,...(config.secret.startsWith('eyJ')?{Authorization:'Bearer '+config.secret}:{}),'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_actor:actor,p_data:data}),signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok)throw new RegistrationError('EMAIL_QUEUE_UNAVAILABLE','O aviso será tentado novamente. Seu cadastro continua salvo.');return response.json();
};}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function registrationEmail(job,config){
  const p=job.payload,link=config.siteUrl+'/#plano/ajustes';
  return {from:config.from,to:[job.recipient],subject:'Novo cadastro no VPO — aguardando aprovação',
    text:`Novo cadastro no VPO\n\nNome: ${p.name}\nE-mail confirmado: ${p.email}\nCelular: ${p.phone||'Não informado'}\nSolicitado em: ${p.requestedAt}\n\nEntre com sua conta de administrador para analisar e aprovar em Ajustes: ${link}\n\nAbrir este link não aprova automaticamente o cadastro.`,
    html:`<div style="background:#f7f6f2;padding:28px;font-family:Arial,sans-serif;color:#202052"><div style="max-width:480px;margin:auto;background:white;border-radius:20px;padding:30px"><strong style="font-size:26px;color:#555af5">$ VPO.</strong><h1 style="font-size:26px">Um novo plano quer começar.</h1><p>Uma pessoa confirmou o e-mail e está aguardando sua aprovação.</p><div style="background:#f3f2f9;padding:18px;border-radius:12px;line-height:1.7;overflow-wrap:anywhere"><strong>${esc(p.name)}</strong><br>${esc(p.email)}<br>Celular: ${esc(p.phone||'Não informado')}</div><p><a href="${esc(link)}" style="display:inline-block;background:#555af5;color:white;text-decoration:none;padding:14px 20px;border-radius:10px">Analisar cadastro no VPO →</a></p><p style="font-size:12px;color:#77778c">Entre com sua conta de administrador. A aprovação acontece somente depois que você clicar em Aprovar acesso nos Ajustes.</p></div></div>`};
}
export async function deliverRegistration({config,db,fetcher=fetch,actor=null,smtpSend=sendGmailRegistration}){
  const {job}=await db('claim',actor);if(!job)return {queued:true,sent:false};
  let providerId;
  try{
    if(config.provider==='gmail')providerId=await smtpSend(config,job,registrationEmail(job,config));
    else{
      const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.resendKey,'Content-Type':'application/json','Idempotency-Key':'vpo-registration/'+job.id},body:JSON.stringify(registrationEmail(job,config)),signal:AbortSignal.timeout(8000),redirect:'error'});
      if(!response.ok)throw new RegistrationError('EMAIL_PROVIDER_UNAVAILABLE','O aviso será tentado novamente. Seu cadastro continua salvo.');
      const result=await response.json();if(typeof result.id!=='string'||!result.id)throw new Error('Missing provider acknowledgement');providerId=result.id;
    }
  }catch(error){await db('finish',null,{id:job.id,lease:job.lease,sent:false}).catch(()=>{});throw new RegistrationError('EMAIL_PROVIDER_UNAVAILABLE','O aviso será tentado novamente. Seu cadastro continua salvo.');}
  // Only a positive provider acknowledgement is recorded as sent. Resend
  // deduplicates retries; SMTP uses a stable Message-ID but may repeat an
  // alert after an ambiguous connection failure. Approval stays idempotent.
  await db('finish',null,{id:job.id,lease:job.lease,sent:true,providerId});return {sent:true};
}
export function createRegistrationHandler({env,fetcher=fetch,logger=()=>{},smtpSend=sendGmailRegistration}){return async request=>{
  try{
    if(request.method!=='POST')return json({error:'Método não permitido.'},405);
    const config=registrationConfig(env);
    if(request.headers.get('origin')!==config.siteUrl)return json({error:'Origem não autorizada.'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Pedido inválido.'},415);
    const text=await request.text();let body;try{body=JSON.parse(text);}catch{return json({error:'Pedido inválido.'},400);}
    if(Buffer.byteLength(text)>1024||!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)return json({error:'Pedido inválido.'},400);
    const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return json({error:'Entre novamente no VPO.'},401);
    const response=await fetcher(config.url+'/auth/v1/user',{headers:{apikey:config.secret,Authorization:authorization},signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok)return json({error:'Entre novamente no VPO.'},401);
    const user=await response.json();if(!user.email_confirmed_at||!/^[a-f0-9-]{36}$/i.test(user.id||''))return json({error:'Confirme seu e-mail.'},401);
    const action=new URL(request.url).searchParams.get('action')||'notify';
    if(action==='status')return json({configured:true});
    if(action!=='notify')return json({error:'Pedido inválido.'},400);
    return json(await deliverRegistration({config,db:registrationDatabase(config,fetcher),fetcher,actor:user.id,smtpSend}));
  }catch(error){const known=error instanceof RegistrationError;logger({code:known?error.code:'EMAIL_UNAVAILABLE'});return json({error:known?error.message:'O aviso será tentado novamente. Seu cadastro continua salvo.',code:known?error.code:'EMAIL_UNAVAILABLE',...(known&&error.code==='EMAIL_NOT_CONFIGURED'?{fields:error.fields}:{})},known?error.status:503);}
};}
