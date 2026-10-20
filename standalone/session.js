// A cached session is useful offline; online the Auth server verifies it before
// displaying a cached budget. Database authorization always runs separately.
export async function restoreSession(auth,{online=true}={}){
  try{
    const {data,error}=await auth.getSession();
    if(error||!data.session)return null;
    if(!online)return data.session;
    const verified=await auth.getUser();
    if(!verified.error&&verified.data.user?.id===data.session.user.id)return data.session;
    if(verified.error?.name==='AuthRetryableFetchError')return data.session;
  }catch{/* Leave the login form available. */}
  return null;
}
export async function signOutDevice({auth,sync,storage,beforeSignOut=()=>{}}){
  await sync.flush();
  if(!sync.status.initialized||sync.status.dirty||sync.status.conflict)return {ok:false,message:'Sincronize suas alterações e revise os conflitos antes de sair. Você também pode exportar um backup em Ajustes.'};
  beforeSignOut();
  const {error}=await auth.signOut({scope:'local'});
  if(error)return {ok:false,message:'Não foi possível sair agora. Tente novamente.'};
  sync.stop();
  try{storage.clear();}catch{/* An unavailable cache must not prevent leaving the signed-out screen. */}
  return {ok:true};
}
