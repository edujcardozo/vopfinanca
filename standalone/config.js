export function publicConfig(env){
  const rawURL=env.VPO_SUPABASE_URL,key=env.VPO_SUPABASE_PUBLISHABLE_KEY;
  if(!rawURL||!key)throw new Error('Configure VPO_SUPABASE_URL e VPO_SUPABASE_PUBLISHABLE_KEY para gerar a versão independente.');
  const url=new URL(rawURL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Use a URL HTTPS do projeto Supabase, sem caminho, senha ou parâmetros.');
  let clientSafe=key.startsWith('sb_publishable_')&&key.length>25;
  if(key.startsWith('eyJ')){
    try{clientSafe=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{clientSafe=false;}
  }
  if(!clientSafe)throw new Error('Use somente a chave pública publishable (ou anon). Chaves secret e service_role são proibidas no navegador.');
  return {url:url.origin,key};
}
