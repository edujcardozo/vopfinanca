export function createBillingClient({auth,fetcher=fetch,navigate=url=>location.assign(url),refresh=()=>{}}){
  async function call(action){
    const {data,error}=await auth.getSession();
    if(error||!data.session?.access_token)throw new Error('Entre novamente no VPO para gerenciar a assinatura.');
    const response=await fetcher('/.netlify/functions/vpo-billing?action='+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:'{}',signal:AbortSignal.timeout(45000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Não foi possível confirmar a assinatura. Confira novamente.');
    return result;
  }
  return {
    async checkout(){
      const result=await call('start');
      if(result.url){
        const url=new URL(result.url);
        if(!['https://asaas.com','https://sandbox.asaas.com'].includes(url.origin)||url.pathname!=='/checkoutSession/show'||!url.searchParams.has('id'))throw new Error('O link de contratação não foi confirmado.');
        navigate(url.href);
      }else if(result.confirmed)await refresh();
      else throw new Error('O Asaas ainda está confirmando a assinatura. Confira novamente em instantes.');
    },
    cancel:()=>call('cancel'),
    reconcile:()=>call('reconcile')
  };
}
