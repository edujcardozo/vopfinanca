const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function createSupabaseTransport(client){
  return async function fetcher(path,options={}){
    const url=new URL(path,'https://vpo.invalid');
    if(!['/api/plan','/api/plan/head','/api/billing','/api/billing/quote'].includes(url.pathname)&&!url.pathname.startsWith('/api/sharing'))return reply({error:'Não encontrado.'},404);
    let body={};
    try{if(options.body)body=JSON.parse(options.body);}catch{return reply({error:'Pedido inválido.'},400);}
    if(url.searchParams.has('ack'))body.ack=url.searchParams.get('ack');
    let query=client.rpc('vpo_api',{p_method:options.method||'GET',p_path:url.pathname,p_body:body});
    if(options.signal)query=query.abortSignal(options.signal);
    const {data,error}=await query;
    if(error){
      if(error.code?.startsWith('PGRST30')||error.code==='bad_jwt'||error.code==='42501')return reply({error:'Entre novamente no VPO para sincronizar.',code:'AUTH_REQUIRED'},401);
      return reply({error:'Não foi possível conectar ao plano. Suas alterações continuam neste aparelho.',code:'SYNC_UNAVAILABLE'},503);
    }
    if(!data||!Number.isInteger(data.status)||!data.body)return reply({error:'O servidor não confirmou o pedido.'},503);
    return reply(data.body,data.status);
  };
}
