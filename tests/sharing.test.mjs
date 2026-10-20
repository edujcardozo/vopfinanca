import test from 'node:test';
import assert from 'node:assert/strict';
import {server,MemoryStorage} from './helpers/sync-env.mjs';
import {createState,id,saveTransaction} from '../web/core.js';
import {createCloudSync} from '../web/cloud-sync.js';

const post=(api,path,body,user='owner')=>api.request('/api/sharing'+path,{method:'POST',body:JSON.stringify(body)},user);
async function seed(api,user='owner',state=createState(false,'2026-10')){const response=await api.request('/api/plan',{method:'PUT',body:JSON.stringify({state,mutationId:id(),revision:0})},user);assert.equal(response.status,200);return state;}
async function invite(api){const response=await post(api,'/invites',{});assert.equal(response.status,201);return response.json();}
async function join(api,user='wife'){const link=await invite(api);const response=await post(api,'/accept',{token:link.token},user);assert.equal(response.status,200);return link;}
const add=(state,label)=>saveTransaction(state,{id:id(),type:'expense',amount:1000,date:'2026-10-19',categoryId:'mercado',description:label,payee:label,memo:'',sharing:{paidBy:label==='Larissa'?'larissa':'edu',eduPercent:50}});
function device(api,user,state=createState(false,'2026-10'),options={}){
  let current=structuredClone(state);const statuses=[],storage=options.storage||new MemoryStorage();
  const sync=createCloudSync({getState:()=>current,onApply:s=>current=s,onStatus:s=>statuses.push(s),onConflict:()=>{},storage,fetcher:api.fetcher(user),autoSchedule:false,autoPoll:false,...options});
  return {sync,storage,statuses,get state(){return current;},edit(label){add(current,label);sync.markLocal();}};
}
test('an invite grants explicit access to the same plan without replacing either personal plan',async()=>{
  const api=server(),original=await seed(api),personal=await seed(api,'wife');add(personal,'Pessoal');
  const saved=await api.request('/api/plan',{method:'PUT',body:JSON.stringify({state:personal,revision:1,mutationId:id()})},'wife');assert.equal(saved.status,200);
  const link=await invite(api),preview=await post(api,'/preview',{token:link.token},'wife');assert.equal(preview.status,200);assert.equal((await preview.json()).state,undefined);
  assert.equal((await(await api.request('/api/plan',{},'wife')).json()).state.planId,personal.planId);
  const accept=await post(api,'/accept',{token:link.token},'wife');assert.equal(accept.status,200);
  let remote=await(await api.request('/api/plan',{},'wife')).json();assert.equal(remote.state.planId,original.planId);assert.equal(remote.scope.id,'owner');assert.equal(remote.user.id,'wife');assert.equal(remote.scope.role,'editor');
  const own=await post(api,'/switch',{scopeId:'wife'},'wife');assert.equal(own.status,200);remote=await(await api.request('/api/plan',{},'wife')).json();assert.equal(remote.state.planId,personal.planId);assert.equal(remote.state.months['2026-10'].transactions.length,1);
  assert.equal((await(await api.request('/api/plan')).json()).state.planId,original.planId);
});
test('invites are random, stored only as hashes, single use and require authentication',async()=>{
  const api=server();await seed(api);const link=await invite(api);assert.match(link.token,/^[a-f0-9]{64}$/);
  const stored=api.sqlite.prepare('SELECT token_hash FROM plan_invites').get();assert.notEqual(stored.token_hash,link.token);assert.equal(api.sqlite.prepare('SELECT * FROM plan_invites').get().token,undefined);
  assert.equal((await post(api,'/accept',{token:link.token},null)).status,401);
  assert.equal((await post(api,'/accept',{token:link.token},'owner')).status,400);
  assert.equal((await post(api,'/accept',{token:'0'.repeat(64)},'wife')).status,410);
  const results=await Promise.all(['wife','stranger'].map(u=>post(api,'/accept',{token:link.token},u)));assert.deepEqual(results.map(r=>r.status).sort(),[200,410]);
  assert.equal(api.sqlite.prepare('SELECT count(*) AS n FROM plan_members').get().n,1);
});
test('expired, cancelled and superseded invites cannot grant access',async()=>{
  const api=server();await seed(api);let link=await invite(api);api.sqlite.prepare('UPDATE plan_invites SET expires_at = ?').run('2000-01-01T00:00:00.000Z');assert.equal((await post(api,'/accept',{token:link.token},'wife')).status,410);
  link=await invite(api);await post(api,'/revoke-invite',{id:link.id});assert.equal((await post(api,'/accept',{token:link.token},'wife')).status,410);
  link=await invite(api);const replacement=await invite(api);assert.notEqual(link.token,replacement.token);assert.equal((await post(api,'/accept',{token:link.token},'wife')).status,410);
});
test('uninvited accounts cannot read or mutate a plan by supplying its owner ID',async()=>{
  const api=server();const original=await seed(api);await join(api);
  assert.equal((await post(api,'/switch',{scopeId:'owner'},'stranger')).status,403);
  const read=await(await api.request('/api/plan?ownerId=owner',{},'stranger')).json();assert.equal(read.exists,false);
  assert.equal((await api.request('/api/plan',{method:'PUT',body:JSON.stringify({scopeId:'owner',state:original,revision:1,mutationId:id()})},'stranger')).status,409);
  assert.equal((await post(api,'/invites',{},'wife')).status,403);assert.equal((await post(api,'/remove-member',{memberId:'owner'},'wife')).status,403);
  const status=await(await api.request('/api/sharing',{},'wife')).json();assert.equal(status.invites.length,0);assert.equal(status.plans.length,2);
});
test('all sharing mutations reject cross-site requests',async()=>{
  const api=server();await seed(api);
  for(const path of ['/invites','/accept','/switch','/remove-member','/revoke-invite'])assert.equal((await api.request('/api/sharing'+path,{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'})).status,403);
});
test('two different accounts merge simultaneous expenses and see each other through lightweight polling',async()=>{
  const api=server();await seed(api);await join(api);const edu=device(api,'owner'),larissa=device(api,'wife');await Promise.all([edu.sync.start(),larissa.sync.start()]);
  edu.edit('Eduardo');larissa.edit('Larissa');await Promise.all([edu.sync.flush(),larissa.sync.flush()]);await edu.sync.checkUpdates();await larissa.sync.checkUpdates();
  for(const d of [edu,larissa]){assert.equal(d.state.months['2026-10'].transactions.length,2);assert.equal(d.sync.status.dirty,false);assert.equal(d.sync.status.scopeId,'owner');}
  api.calls.length=0;await larissa.sync.checkUpdates();assert.deepEqual(api.calls.map(c=>c.path),['/api/plan/head']);
  edu.edit('Padaria');await edu.sync.flush();await larissa.sync.checkUpdates();assert.equal(larissa.state.months['2026-10'].transactions.length,3);assert.ok(api.calls.some(c=>c.path==='/api/plan'));
});
test('joining on a device with cached personal data adopts shared data and preserves personal data',async()=>{
  const api=server();const shared=await seed(api),personal=await seed(api,'wife'),old=device(api,'wife',personal,{hadStored:true});await old.sync.start();await join(api);
  const next=device(api,'wife',old.state,{hadStored:true,storage:old.storage});await next.sync.start();assert.equal(next.state.planId,shared.planId);assert.equal(next.sync.status.dirty,false);
  await post(api,'/switch',{scopeId:'wife'},'wife');assert.equal((await(await api.request('/api/plan',{},'wife')).json()).state.planId,personal.planId);
});
test('scope changes block stale uploads and keep pending edits instead of mixing plans',async()=>{
  const api=server();await seed(api);const personal=await seed(api,'wife'),tab=device(api,'wife',personal,{hadStored:true});await tab.sync.start();await join(api);tab.edit('Pessoal pendente');await tab.sync.flush();
  assert.equal(tab.sync.status.blocked,true);assert.equal(tab.sync.status.dirty,true);assert.equal((await(await api.request('/api/plan')).json()).state.months['2026-10'].transactions.length,0);
  assert.ok(tab.statuses.some(s=>s.kind==='blocked'));assert.ok([...tab.storage.map.values()].some(value=>value.includes('Pessoal pendente')));
});
test('revocation stops read/write access and cannot be undone with an old invite',async()=>{
  const api=server();await seed(api);const link=await join(api),wife=device(api,'wife');await wife.sync.start();wife.edit('Pendente');
  assert.equal((await post(api,'/remove-member',{memberId:'wife'})).status,200);
  assert.equal((await api.request('/api/plan',{},'wife')).status,403);assert.equal((await api.request('/api/plan/head',{},'wife')).status,403);
  await wife.sync.flush();assert.equal(wife.sync.status.blocked,true);assert.equal(wife.sync.status.dirty,true);assert.equal((await post(api,'/accept',{token:link.token},'wife')).status,410);
  assert.equal((await post(api,'/switch',{scopeId:'wife'},'wife')).status,200);assert.equal((await api.request('/api/plan',{},'wife')).status,200);
});
test('membership revocation between authorization and the write transaction prevents that write',async()=>{
  const api=server();await seed(api);await join(api);const remote=await(await api.request('/api/plan',{},'wife')).json();add(remote.state,'Não gravar');
  const batch=api.db.batch;let removed=false;api.db.batch=async statements=>{if(!removed&&statements.some(s=>s.sql.startsWith('UPDATE sync_plans'))){removed=true;api.sqlite.prepare('DELETE FROM plan_members WHERE member_id = ?').run('wife');}return batch(statements);};
  const response=await api.request('/api/plan',{method:'PUT',body:JSON.stringify({scopeId:'owner',revision:remote.revision,state:remote.state,mutationId:id()})},'wife');assert.equal(response.status,403);
  assert.equal((await(await api.request('/api/plan')).json()).state.months['2026-10'].transactions.length,0);
});
test('legacy clients cannot write shared data or write after a sharing scope switch',async()=>{
  const api=server(),state=await seed(api);await join(api);
  const body=JSON.stringify({state,revision:1,mutationId:id()});assert.equal((await api.request('/api/plan',{method:'PUT',body},'wife')).status,426);
  await post(api,'/switch',{scopeId:'wife'},'wife');assert.equal((await api.request('/api/plan',{method:'PUT',body},'wife')).status,426);
});
test('a remote expense waits for a form to finish before updating the visible plan',async()=>{
  const api=server();await seed(api);await join(api);let editing=false;const edu=device(api,'owner'),wife=device(api,'wife',undefined,{canApplyRemote:()=>!editing});await edu.sync.start();await wife.sync.start();editing=true;edu.edit('Eduardo');await edu.sync.flush();await wife.sync.checkUpdates();assert.equal(wife.state.months['2026-10'].transactions.length,0);editing=false;await wife.sync.checkUpdates();assert.equal(wife.state.months['2026-10'].transactions.length,1);
});
