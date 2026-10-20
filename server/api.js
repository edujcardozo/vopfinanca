import {validateState,rememberPayee} from '../web/core.js';
import {resolveScope,sharingAPI} from './sharing.js';
export const MAX_BYTES=10*1024*1024;
const uuid=/^[a-z0-9_-]{8,80}$/i;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function readLimited(request){
  if(!request.body)return '';
  const reader=request.body.getReader(),decoder=new TextDecoder(),parts=[];let bytes=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Object.assign(new Error('large'),{tooLarge:true});}parts.push(decoder.decode(chunk.value,{stream:true}));}
  parts.push(decoder.decode());return parts.join('');
}
export function splitDocument(s,size=300000){
  const chunks=[];for(let i=0;i<s.length;){let end=Math.min(s.length,i+size);const c=s.charCodeAt(end-1);if(end<s.length&&c>=0xd800&&c<=0xdbff)end--;chunks.push(s.slice(i,end));i=end;}return chunks;
}
async function readPlan(db,userId){
  for(let attempt=0;attempt<2;attempt++){
    const meta=await db.prepare('SELECT revision, version_id, mutation_id, document_hash, chunk_count, updated_at FROM sync_plans WHERE user_id = ?').bind(userId).first();
    if(!meta?.version_id)return {exists:false,revision:0,state:null,updatedAt:null,mutationId:null};
    const {results}=await db.prepare('SELECT part, content FROM sync_chunks WHERE user_id = ? AND version_id = ? ORDER BY part').bind(userId,meta.version_id).all();
    if(results.length!==meta.chunk_count||results.some((r,i)=>r.part!==i))continue;
    const document=results.map(r=>r.content).join('');if(await digest(document)!==meta.document_hash)throw new Error('integrity');
    const state=validateState(JSON.parse(document));
    return {exists:true,revision:meta.revision,state,updatedAt:meta.updated_at,mutationId:meta.mutation_id};
  }
  throw new Error('integrity');
}
export async function handleAPI(request,env,ctx={waitUntil(){}}){
  const url=new URL(request.url);
  if(url.pathname==='/api/health'){
    if(request.method!=='GET')return json({error:'Método não permitido.'},405);
    try{if(!env.DB)return json({ok:false,reason:'storage-unavailable'},503);const {results}=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sync_plans','sync_versions','sync_chunks','plan_members','plan_invites','plan_preferences')").all();return json({ok:results.length===6,syncReady:results.length===6,version:7},results.length===6?200:503);}catch{return json({ok:false},503);}
  }
  if(!['/api/plan','/api/plan/head'].includes(url.pathname)&&!url.pathname.startsWith('/api/sharing'))return json({error:'Não encontrado.'},404);
  const authenticatedId=request.headers.get('oai-authenticated-user-id');
  if(!authenticatedId||authenticatedId.length>256)return json({error:'Entre na sua conta para sincronizar.',code:'AUTH_REQUIRED'},401);
  if(!env.DB)return json({error:'A sincronização está temporariamente indisponível.',code:'STORAGE_UNAVAILABLE'},503);
  const user={id:authenticatedId,email:request.headers.get('oai-authenticated-user-email')||null};
  try{
    if(request.method!=='GET'){
      const origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
      if(origin&&origin!==url.origin||site==='cross-site')return json({error:'Origem não permitida.'},403);
      if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'Formato inválido.'},415);
    }
    if(url.pathname.startsWith('/api/sharing')){
      let body={};if(request.method!=='GET'){const text=await readLimited(request);if(text.length>4096)return json({error:'Pedido muito grande.'},413);try{body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{return json({error:'Pedido inválido.'},400);}}
      return await sharingAPI(request,env.DB,user,body);
    }
    const scope=await resolveScope(env.DB,user),userId=scope.id;
    if(scope.revoked)return json({error:'O acesso a este plano foi removido. Abra seu plano pessoal em Ajustes.',code:'PLAN_ACCESS_REVOKED'},403);
    if(url.pathname==='/api/plan/head'){
      if(request.method!=='GET')return json({error:'Método não permitido.'},405);
      const meta=await env.DB.prepare('SELECT revision, updated_at FROM sync_plans WHERE user_id = ?').bind(userId).first();
      return json({user,scope,revision:meta?.revision||0,updatedAt:meta?.updated_at||null});
    }
    if(request.method==='GET'){
      const plan=await readPlan(env.DB,userId),ack=url.searchParams.get('ack');let acknowledged=null;
      if(ack&&uuid.test(ack))acknowledged=await env.DB.prepare('SELECT revision, document_hash FROM sync_versions WHERE user_id = ? AND mutation_id = ?').bind(userId,ack).first();
      return json({...plan,user,scope,acknowledged:acknowledged?{revision:acknowledged.revision,hash:acknowledged.document_hash}:null});
    }
    if(request.method!=='PUT')return json({error:'Método não permitido.'},405);
    const origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
    if(origin&&origin!==url.origin||site==='cross-site')return json({error:'Origem não permitida.'},403);
    if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'Formato inválido.'},415);
    if(Number(request.headers.get('Content-Length'))>MAX_BYTES)return json({error:'O plano excede o tamanho permitido.',code:'PLAN_TOO_LARGE'},413);
    const text=await readLimited(request);
    let body,state;try{body=JSON.parse(text);state=validateState(body.state);}catch{return json({error:'Plano inválido. Seus dados locais foram mantidos.'},400);}
    if(body.scopeId&&body.scopeId!==scope.id)return json({error:'O plano ativo mudou. Reabra o app antes de continuar.',code:'PLAN_SCOPE_CHANGED'},409);
    if(!body.scopeId&&(scope.role!=='owner'||await env.DB.prepare('SELECT 1 FROM plan_preferences WHERE user_id = ?').bind(user.id).first()))return json({error:'Atualize a página para usar o compartilhamento com segurança.',code:'CLIENT_UPDATE_REQUIRED'},426);
    if(!Number.isSafeInteger(body.revision)||body.revision<0||!uuid.test(body.mutationId||''))return json({error:'Revisão inválida.'},400);
    if(body.state.payees===undefined){const previous=await readPlan(env.DB,userId);if(previous.state?.planId===state.planId)for(const name of previous.state.payees)rememberPayee(state,name);}
    // Older open tabs strip unknown fields. Refuse their writes once the plan uses sharing.
    if(body.state.household===undefined){
      const previous=await readPlan(env.DB,userId);
      if(previous.state?.planId===state.planId&&(previous.state.household.settlements.length||Object.values(previous.state.months).some(m=>m.transactions.some(t=>t.sharing))))return json({error:'Atualize a página para preservar o Nosso acerto.',code:'CLIENT_UPDATE_REQUIRED'},426);
    }
    state.hideBalances=false;
    const document=JSON.stringify(state),hash=await digest(document),db=env.DB;
    const prior=await db.prepare('SELECT revision, document_hash, updated_at FROM sync_versions WHERE user_id = ? AND mutation_id = ?').bind(userId,body.mutationId).first();
    if(prior){if(prior.document_hash!==hash)return json({error:'Esta operação já foi usada com outro conteúdo.'},409);return json({accepted:true,revision:prior.revision,updatedAt:prior.updated_at,replayed:true,user,scope});}
    const now=new Date().toISOString();
    await db.prepare('INSERT INTO sync_plans (user_id, revision, chunk_count, updated_at) VALUES (?, 0, 0, ?) ON CONFLICT(user_id) DO NOTHING').bind(userId,now).run();
    const versionId=crypto.randomUUID(),chunks=splitDocument(document);
    const statements=chunks.map((content,part)=>db.prepare('INSERT INTO sync_chunks (user_id, version_id, part, content) VALUES (?, ?, ?, ?)').bind(userId,versionId,part,content));
    statements.push(db.prepare(`UPDATE sync_plans SET revision = revision + 1, version_id = ?, mutation_id = ?, document_hash = ?, chunk_count = ?, updated_at = ? WHERE user_id = ? AND revision = ? AND (? = ? OR EXISTS (SELECT 1 FROM plan_members WHERE owner_id = ? AND member_id = ?)) AND COALESCE((SELECT active_owner_id FROM plan_preferences WHERE user_id = ?), ?) = ?`).bind(versionId,body.mutationId,hash,chunks.length,now,userId,body.revision,userId,user.id,userId,user.id,user.id,user.id,userId));
    statements.push(db.prepare('INSERT INTO sync_versions (user_id, revision, version_id, mutation_id, document_hash, updated_at) SELECT user_id, revision, version_id, mutation_id, document_hash, updated_at FROM sync_plans WHERE user_id = ? AND version_id = ?').bind(userId,versionId));
    statements.push(db.prepare('SELECT revision, version_id FROM sync_plans WHERE user_id = ?').bind(userId));
    const result=await db.batch(statements),meta=result.at(-1).results[0];
    if(meta?.version_id!==versionId){
      await db.prepare('DELETE FROM sync_chunks WHERE user_id = ? AND version_id = ?').bind(userId,versionId).run();
      const latestScope=await resolveScope(db,user);
      if(latestScope.revoked)return json({error:'O acesso ao plano foi removido.',code:'PLAN_ACCESS_REVOKED'},403);
      if(latestScope.id!==scope.id)return json({error:'O plano ativo mudou. Reabra o app.',code:'PLAN_SCOPE_CHANGED'},409);
      return json({code:'REVISION_CONFLICT',...await readPlan(db,userId),user,scope},409);
    }
    ctx.waitUntil((async()=>{
      const keep=await db.prepare('SELECT version_id FROM sync_versions WHERE user_id = ? ORDER BY revision DESC LIMIT 5').bind(userId).all();
      const versions=keep.results.map(r=>r.version_id);if(!versions.length)return;
      const placeholders=versions.map(()=>'?').join(',');
      await db.prepare(`DELETE FROM sync_chunks WHERE user_id = ? AND version_id NOT IN (${placeholders}) AND version_id != (SELECT version_id FROM sync_plans WHERE user_id = ?)`).bind(userId,...versions,userId).run();
    })().catch(()=>{}));
    return json({accepted:true,revision:meta.revision,updatedAt:now,user,scope});
  }catch(error){if(error.tooLarge)return json({error:'O plano excede o tamanho permitido.',code:'PLAN_TOO_LARGE'},413);return json({error:'Não foi possível sincronizar agora. O plano local foi preservado.',code:'SYNC_UNAVAILABLE'},503);}
}
