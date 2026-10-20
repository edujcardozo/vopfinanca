import {asaasClient,BillingError,createGateway,webhookTokenMatches} from './asaas.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const configError=()=>{throw new BillingError('BILLING_NOT_CONFIGURED','As assinaturas ainda estão sendo preparadas.');};
export function serverConfig(env){
  let url,site;
  try{url=new URL(env.SUPABASE_URL);site=new URL(env.VPO_SITE_URL);}catch{return configError();}
  const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const legacyRole=()=>{try{return JSON.parse(Buffer.from(secret.split('.')[1],'base64url')).role;}catch{return null;}};
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/'||url.search||url.hash||url.username||url.password
    ||site.protocol!=='https:'||site.pathname!=='/'||site.search||site.hash||site.username||site.password
    ||!secret||!secret.startsWith('sb_secret_')&&legacyRole()!=='service_role'
    ||!['sandbox','production'].includes(env.ASAAS_ENVIRONMENT)||!env.ASAAS_API_KEY||!env.ASAAS_WEBHOOK_TOKEN||env.ASAAS_WEBHOOK_TOKEN.length<32
    ||env.VPO_BILLING_ENABLED!=='true')return configError();
  return {url:url.origin,siteUrl:site.origin,secret,apiKey:env.ASAAS_API_KEY,environment:env.ASAAS_ENVIRONMENT,webhookToken:env.ASAAS_WEBHOOK_TOKEN};
}
export function billingDatabase(config,fetcher=fetch){
  async function rpc(name,body){
    const response=await fetcher(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.secret,...(config.secret.startsWith('eyJ')?{Authorization:'Bearer '+config.secret}:{}),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw new BillingError('BILLING_DATABASE_UNAVAILABLE','Não foi possível confirmar sua assinatura. Confira novamente.');
    return response.json();
  }
  return {gateway:(action,owner,data)=>rpc('vpo_billing_gateway',{p_action:action,p_owner:owner,p_data:data}),event:(id,owner,data)=>rpc('vpo_billing_verified_event',{p_event_id:id,p_owner:owner,p_data:data})};
}
async function bodyJSON(request,maxBytes){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new BillingError('INVALID_REQUEST','Pedido inválido.',415);
  const text=await request.text();
  if(Buffer.byteLength(text)>maxBytes)throw new BillingError('INVALID_REQUEST','Pedido muito grande.',413);
  let body;try{body=JSON.parse(text);}catch{throw new BillingError('INVALID_REQUEST','Pedido inválido.',400);}
  if(!body||Array.isArray(body)||typeof body!=='object')throw new BillingError('INVALID_REQUEST','Pedido inválido.',400);
  return body;
}
export function createBillingHandler({env,fetcher=fetch,logger=()=>{}}){
  return async function handler(request){
    try{
      if(request.method!=='POST')return json({error:'Método não permitido.'},405);
      const config=serverConfig(env),db=billingDatabase(config,fetcher),asaas=asaasClient({...config,fetcher});
      const gateway=createGateway({db,asaas,environment:config.environment,siteUrl:config.siteUrl});
      const action=new URL(request.url).searchParams.get('action');
      if(action==='webhook'){
        if(!webhookTokenMatches(request.headers.get('asaas-access-token'),config.webhookToken))return json({error:'Não autorizado.'},401);
        return json(await gateway.webhook(await bodyJSON(request,131072)));
      }
      if(request.headers.get('origin')!==config.siteUrl)return json({error:'Origem não autorizada.'},403);
      if(!['start','cancel','reconcile'].includes(action))return json({error:'Pedido inválido.'},400);
      const body=await bodyJSON(request,1024);
      if(Object.keys(body).length)return json({error:'Pedido inválido.'},400);
      const authorization=request.headers.get('authorization');
      if(!authorization?.startsWith('Bearer '))return json({error:'Entre novamente no VPO.',code:'AUTH_REQUIRED'},401);
      // Always verify the live Auth user; never trust a decoded browser JWT or
      // ownerId in the request to decide whose subscription is being managed.
      const authResponse=await fetcher(config.url+'/auth/v1/user',{headers:{apikey:config.secret,Authorization:authorization},signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!authResponse.ok)return json({error:'Entre novamente no VPO.',code:'AUTH_REQUIRED'},401);
      const user=await authResponse.json();
      if(!user.email_confirmed_at||!/^[0-9a-f-]{36}$/i.test(user.id||''))return json({error:'Confirme seu e-mail para continuar.',code:'AUTH_REQUIRED'},401);
      return json(await gateway[action](user.id));
    }catch(error){
      const known=error instanceof BillingError;
      logger({code:known?error.code:'BILLING_UNAVAILABLE'});
      return json({error:known?error.message:'Não foi possível confirmar a operação. Confira a assinatura novamente.',code:known?error.code:'BILLING_UNAVAILABLE'},known?error.status:503);
    }
  };
}
