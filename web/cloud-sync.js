import {id,createState,validateState} from './core.js?v=vpo-78';
import {cloudPlan,plansEqual,mergePlans,pristineExample} from './sync-core.js?v=vpo-78';
export const SYNC_KEY='ynab-edu-cloud-v1',RECOVERY_KEY='ynab-edu-recovery-v1';
const OUTBOX_PREFIX='ynab-edu-outbox-v1-';
export function createCloudSync({getState,onApply,onStatus,onConflict,canApplyRemote=()=>true,hadStored=false,storage=globalThis.localStorage,fetcher=globalThis.fetch.bind(globalThis),autoSchedule=true,autoPoll=true}){
  let ownerId=null,scopeId=null,user=null,base=null,revision=0,dirty=false,lastSent=null,lastSuccessAt=null,initialized=false,started=false,conflict=null,running=null,headRunning=false,timer=null,poll=null,stopped=false,blocked=false,backupAcknowledged=false;
  const initial=cloudPlan(getState());let loaded=null;
  const outboxKey=OUTBOX_PREFIX+id();
  try{const m=JSON.parse(storage.getItem(SYNC_KEY)||'null');if(m?.ownerId&&Number.isSafeInteger(m.revision)&&(m.base===null||m.base)){loaded={...m,base:m.base?cloudPlan(m.base):null,lastSent:m.lastSent?{...m.lastSent,state:cloudPlan(m.lastSent.state)}:null};}}catch{}
  function status(kind,message){onStatus({kind,message,user,scopeId,updatedAt:lastSuccessAt,conflict:!!conflict});}
  function remember(){try{
    if(ownerId)storage.setItem(SYNC_KEY,JSON.stringify({ownerId,scopeId,revision,base,pending:dirty,lastSent,lastSuccessAt}));
    if(dirty)storage.setItem(outboxKey,JSON.stringify({id:outboxKey,ownerId:ownerId||loaded?.ownerId||null,scopeId:scopeId||loaded?.scopeId||loaded?.ownerId||null,date:new Date().toISOString(),source:'Alterações pendentes',state:cloudPlan(getState())}));else storage.removeItem(outboxKey);
  }catch{status('warning','Não foi possível guardar a fila local. Mantenha o app aberto até sincronizar.');}}
  function schedule(delay=600){if(!autoSchedule||stopped||blocked)return;clearTimeout(timer);timer=setTimeout(()=>{flush();},delay);}
  function recoveries(){try{let list=JSON.parse(storage.getItem(RECOVERY_KEY)||'[]');if(!Array.isArray(list))list=[];
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(OUTBOX_PREFIX)&&key!==outboxKey){try{list.push(JSON.parse(storage.getItem(key)));}catch{}}}
    return list.filter(r=>r?.ownerId===ownerId&&(r.scopeId||r.ownerId)===scopeId).sort((a,b)=>b.date.localeCompare(a.date));
  }catch{return [];}}
  function stash(local,remote,forOwner=ownerId,forScope=scopeId){
    try{let old=JSON.parse(storage.getItem(RECOVERY_KEY)||'[]');if(!Array.isArray(old))old=[];
      const records=[{id:id(),ownerId:forOwner,scopeId:forScope,date:new Date().toISOString(),source:'Este aparelho',state:cloudPlan(local)}];
      if(remote)records.push({id:id(),ownerId:forOwner,scopeId:forScope,date:new Date().toISOString(),source:'Conta sincronizada',state:cloudPlan(remote)});
      storage.setItem(RECOVERY_KEY,JSON.stringify([...records,...old].slice(0,4)));return true;
    }catch{return false;}
  }
  function apply(plan){onApply(validateState({...plan,hideBalances:getState().hideBalances}));}
  function showConflict(remote,reason='edit'){
    conflict={remote,reason};backupAcknowledged=false;dirty=true;remember();status('conflict','Há alterações diferentes. Escolha qual plano manter.');
    onConflict({local:cloudPlan(getState()),remote:remote.state,revision:remote.revision,updatedAt:remote.updatedAt,reason});
  }
  async function request(method,path,body){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetcher(path,{method,credentials:'same-origin',cache:'no-store',redirect:'manual',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      if(response.status===401||response.type==='opaqueredirect'||response.status>=300&&response.status<400||!response.headers.get('Content-Type')?.includes('application/json'))throw Object.assign(new Error('Entre na sua conta para sincronizar.'),{auth:true});
      const data=await response.json();
      if(!response.ok&&!(response.status===409&&data.code==='REVISION_CONFLICT'))throw Object.assign(new Error(data.error||'A sincronização está indisponível.'),{blocked:['PLAN_SCOPE_CHANGED','PLAN_ACCESS_REVOKED','CLIENT_UPDATE_REQUIRED','BILLING_REQUIRED','ACCESS_PENDING','ACCESS_REJECTED','ACCESS_REVOKED','ACCESS_PROFILE_REQUIRED'].includes(data.code),billing:data.billing});
      return {response,data};
    }finally{clearTimeout(timeout);}
  }
  async function remotePlan(){const pending=lastSent||(!initialized?loaded?.lastSent:null);return (await request('GET','/api/plan'+(pending?'?ack='+encodeURIComponent(pending.mutationId):''))).data;}
  function adopt(remote){base=cloudPlan(remote.state);revision=remote.revision;lastSuccessAt=remote.updatedAt;dirty=false;lastSent=null;apply(base);remember();status('synced','Sincronizado com sua conta');}
  function bootstrap(remote){
    user=remote.user;if(!user?.id)throw new Error('Não foi possível identificar sua conta.');ownerId=user.id;scopeId=remote.scope?.id||ownerId;
    if(loaded&&(loaded.ownerId!==ownerId||(loaded.scopeId||loaded.ownerId)!==scopeId)){
      stash(getState(),loaded.base,loaded.ownerId,loaded.scopeId||loaded.ownerId);loaded=null;apply(remote.exists?remote.state:createState(false));
      base=remote.exists?cloudPlan(remote.state):null;revision=remote.revision;dirty=!remote.exists;initialized=true;remember();return;
    }
    if(loaded&&loaded.ownerId===ownerId){base=loaded.base;revision=loaded.revision;lastSent=loaded.lastSent;lastSuccessAt=loaded.lastSuccessAt;dirty=loaded.pending||!plansEqual(getState(),base);initialized=true;return;}
    initialized=true;
    if(remote.exists){
      const local=getState(),edited=!plansEqual(local,initial);
      if(scopeId!==ownerId){if(hadStored)stash(local,null,ownerId,ownerId);adopt(remote);return;}
      if((!hadStored&&!edited)||pristineExample(local)||plansEqual(local,remote.state,{ignorePlanId:true})){adopt(remote);return;}
      showConflict(remote,'first-connection');return;
    }
    base=null;revision=0;dirty=true;remember();
  }
  async function run(){
    if(stopped||blocked)return;
    if(conflict){status('conflict','Há um conflito para revisar antes de sincronizar.');return;}
    for(let attempt=0;attempt<5;attempt++){
      const remote=await remotePlan();if(!initialized)bootstrap(remote);
      if(conflict)return;
      if(remote.user?.id!==ownerId)throw Object.assign(new Error('Sua conta mudou. Reabra o app para sincronizar com segurança.'),{auth:true});
      if((remote.scope?.id||remote.user.id)!==scopeId)throw Object.assign(new Error('O plano ativo mudou em outro aparelho. Reabra o app para carregar o plano correto. Suas alterações locais foram guardadas.'),{blocked:true});
      if(lastSent&&remote.acknowledged&&remote.acknowledged.revision>=revision){
        base=cloudPlan(lastSent.state);revision=remote.acknowledged.revision;lastSent=null;dirty=!plansEqual(getState(),base);remember();
      }
      if(remote.exists&&remote.revision!==revision){
        if(!dirty&&!canApplyRemote()){status('pending','Há uma atualização do plano. Ela será carregada quando você terminar esta edição.');return;}
        if(!base){if(pristineExample(getState())){adopt(remote);return;}showConflict(remote,'first-connection');return;}
        if(!dirty){adopt(remote);return;}
        const merged=mergePlans(base,getState(),remote.state);
        if(!merged.ok){showConflict(remote,merged.conflicts.includes('plan-replaced')?'replacement':merged.conflicts.includes('structure')?'structure':'edit');return;}
        apply(merged.state);base=cloudPlan(remote.state);revision=remote.revision;lastSent=null;dirty=!plansEqual(getState(),base);remember();
      }else if(!remote.exists&&revision!==0){base=null;revision=0;dirty=true;lastSent=null;remember();}
      if(!dirty){lastSuccessAt=remote.updatedAt||lastSuccessAt;remember();status('synced','Sincronizado com sua conta');return;}
      status('saving','Salvando na sua conta…');
      const operation=lastSent&&lastSent.revision===revision?{...lastSent,scopeId}:{mutationId:id(),scopeId,revision,state:cloudPlan(getState())};
      lastSent=operation;remember();
      const {response,data}=await request('PUT','/api/plan',operation);
      if(response.status===409){
        if(data.mutationId===operation.mutationId){base=operation.state;revision=data.revision;lastSent=null;dirty=!plansEqual(getState(),base);remember();continue;}
        lastSent=null;remember();continue;
      }
      if(!data.accepted||!Number.isSafeInteger(data.revision))throw new Error('O servidor não confirmou o salvamento.');
      base=operation.state;revision=data.revision;lastSent=null;lastSuccessAt=data.updatedAt;dirty=!plansEqual(getState(),base);remember();
      if(!dirty&&!data.replayed){status('synced','Sincronizado com sua conta');return;}
    }
    status('pending','Há alterações em outro aparelho. Tentando novamente…');schedule(2000);
  }
  async function flush(){
    if(running)return running;
    running=(async()=>{try{await run();}catch(error){failed(error);}finally{running=null;if(dirty&&!conflict) schedule(10000);}})();
    return running;
  }
  function markLocal(){
    dirty=!base||!plansEqual(getState(),base);if(dirty){remember();if(blocked)return;status(conflict?'conflict':'pending',conflict?'Revise o conflito para sincronizar.':'Salvo neste aparelho. Enviando para a conta…');schedule();}
  }
  function failed(error){
    if(error.blocked){blocked=true;remember();status('blocked',error.message);return;}
    status(error.auth?'auth':'offline',error.auth?error.message:dirty?'Sem confirmação da conta. Suas alterações ficam na fila deste aparelho.':'Sem conexão com a conta. Usando a cópia deste aparelho.');
  }
  async function checkUpdates(){
    if(running||headRunning||stopped||blocked||conflict)return;
    if(dirty||!initialized)return flush();
    headRunning=true;
    try{
      const {data}=await request('GET','/api/plan/head');
      if(stopped)return;
      if(data.user?.id!==ownerId||data.scope?.id!==scopeId)throw Object.assign(new Error('O plano ativo mudou. Reabra o app para continuar com segurança.'),{blocked:true});
      if(data.revision!==revision||dirty)return await flush();
      lastSuccessAt=data.updatedAt||lastSuccessAt;status('synced','Plano sincronizado');
    }catch(error){failed(error);}finally{headRunning=false;}
  }
  function start(){
    if(started)return flush();started=true;status('connecting','Conectando seu plano à conta…');
    if(autoPoll)poll=setInterval(()=>{if(globalThis.document?.visibilityState!=='hidden')checkUpdates();},2000);
    return flush();
  }
  async function resolve(choice){
    if(!conflict)return false;
    try{
      const latest=await remotePlan();
      if((latest.scope?.id||latest.user?.id)!==scopeId)throw Object.assign(new Error('O plano ativo mudou. Reabra o app.'),{blocked:true});
      if(latest.revision!==conflict.remote.revision){showConflict(latest,conflict.reason);return false;}
      if(!stash(getState(),latest.state)&&!backupAcknowledged){status('conflict','Baixe uma cópia antes de escolher: não houve espaço para guardar a recuperação local.');return false;}
      if(!['local','remote'].includes(choice))return false;
      let selected=choice==='remote'?latest.state:cloudPlan(getState());
      if(conflict.reason==='edit'){
        const merged=mergePlans(base,getState(),latest.state,{prefer:choice});
        if(!merged.ok){showConflict(latest,'structure');return false;}
        selected=merged.state;
      }
      conflict=null;base=cloudPlan(latest.state);revision=latest.revision;lastSent=null;apply(selected);dirty=!plansEqual(selected,base);remember();
      if(!dirty){lastSuccessAt=latest.updatedAt;status('synced','Sincronizado com sua conta');return true;}
      await flush();return !conflict;
    }catch(error){failed(error);return false;}
  }
  return {start,flush,checkUpdates,markLocal,resolve,recoveries,backupCurrent:()=>stash(getState(),null),acknowledgeBackup:()=>{backupAcknowledged=true;},review:()=>{if(conflict)onConflict({local:cloudPlan(getState()),remote:conflict.remote.state,revision:conflict.remote.revision,updatedAt:conflict.remote.updatedAt,reason:conflict.reason});},stop(){stopped=true;clearTimeout(timer);clearInterval(poll);},get status(){return {ownerId,scopeId,revision,dirty,initialized,blocked,conflict:!!conflict,running:!!running};}};
}
