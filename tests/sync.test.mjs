import test from 'node:test';
import assert from 'node:assert/strict';
import {id,createState,saveTransaction,ensureMonth,createGroup,moveCategory,totals,validateState} from '../web/core.js';
import {mergePlans,plansEqual,pristineExample} from '../web/sync-core.js';
import {createCloudSync,SYNC_KEY} from '../web/cloud-sync.js';
import {splitDocument,MAX_BYTES} from '../server/api.js';
import {server,MemoryStorage} from './helpers/sync-env.mjs';

const add=(s,name='Mercado',amount=1000,date='2026-10-18')=>{const tx={id:id(),type:'expense',amount,date,categoryId:'mercado',description:name,payee:name,memo:''};saveTransaction(s,tx);return tx;};
async function seed(api,state,user='owner'){const response=await api.request('/api/plan',{method:'PUT',body:JSON.stringify({revision:0,mutationId:id(),state})},user);assert.equal(response.status,200);return response.json();}
function device(api,state,options={}){
  let current=structuredClone(state),conflict=null;const statuses=[],storage=options.storage||new MemoryStorage();
  const sync=createCloudSync({getState:()=>current,onApply:s=>current=s,onStatus:s=>statuses.push(s),onConflict:c=>conflict=c,hadStored:options.hadStored??false,storage,fetcher:options.fetcher||api.fetcher(options.user||'owner'),autoSchedule:false,autoPoll:false});
  return {sync,storage,statuses,get state(){return current;},set state(s){current=s;},get conflict(){return conflict;},edit(fn){fn(current);sync.markLocal();}};
}
test('three-way merge combines independent transactions, group edits and monthly allocations',()=>{
  const base=createState(false,'2026-10'),left=structuredClone(base),right=structuredClone(base);
  const a=add(left,'A'),b=add(right,'B');ensureMonth(left,'2026-10').assigned.mercado=5000;ensureMonth(right,'2026-10').assigned.lazer=6000;
  const group=createGroup(left,'Casa');moveCategory(left,'mercado',group.id);right.categories.find(c=>c.id==='mercado').name='Compras';
  const merged=mergePlans(base,left,right);assert.equal(merged.ok,true);
  assert.equal(Object.values(merged.state.months).flatMap(m=>m.transactions).length,2);assert.equal(merged.state.categories.find(c=>c.id==='mercado').name,'Compras');
  assert.equal(merged.state.categories.find(c=>c.id==='mercado').group,group.id);assert.equal(merged.state.months['2026-10'].assigned.mercado,5000);assert.equal(merged.state.months['2026-10'].assigned.lazer,6000);
  assert.ok(merged.state.months['2026-10'].transactions.some(t=>t.id===a.id));assert.ok(merged.state.months['2026-10'].transactions.some(t=>t.id===b.id));
});
test('same-field conflicts require a choice while preserving unrelated changes after resolution',()=>{
  const base=createState(false,'2026-10'),tx=add(base),left=structuredClone(base),right=structuredClone(base);
  left.months['2026-10'].transactions[0].amount=2000;right.months['2026-10'].transactions[0].amount=3000;
  add(left,'Only left');add(right,'Only right');assert.equal(mergePlans(base,left,right).ok,false);
  const chosen=mergePlans(base,left,right,{prefer:'local'});assert.equal(chosen.ok,true);assert.equal(chosen.state.months['2026-10'].transactions.length,3);
  assert.equal(chosen.state.months['2026-10'].transactions.find(t=>t.id===tx.id).amount,2000);
});
test('moving a transaction across months merges with another device memo without duplicating it',()=>{
  const base=createState(false,'2026-10'),tx=add(base),left=structuredClone(base),right=structuredClone(base);
  saveTransaction(left,{...tx,date:'2026-11-01'},tx.id);right.months['2026-10'].transactions[0].memo='Edited elsewhere';
  const merged=mergePlans(base,left,right);assert.equal(merged.ok,true);const list=Object.values(merged.state.months).flatMap(m=>m.transactions);assert.equal(list.length,1);assert.equal(list[0].memo,'Edited elsewhere');assert.equal(list[0].date,'2026-11-01');
});
test('a reset cannot silently erase edits made on another device',()=>{
  const base=createState(false,'2026-10'),local=createState(false,'2026-10'),remote=structuredClone(base);add(remote);
  assert.deepEqual(mergePlans(base,local,remote).conflicts,['plan-replaced']);
});
test('only an untouched example may be replaced automatically by a cloud plan on first connection',()=>{
  const sample=createState(true,'2026-10');assert.equal(pristineExample(sample),true);sample.hideBalances=true;assert.equal(pristineExample(sample),true);
  add(sample);assert.equal(pristineExample(sample),false);
});
test('server requires identity and isolates data by the platform user, never a client supplied owner',async()=>{
  const api=server(),state=createState(false,'2026-10');add(state);
  assert.equal((await api.request('/api/plan',{},null)).status,401);
  assert.equal((await api.request('/api/plan',{method:'PUT',body:JSON.stringify({state,revision:0,mutationId:id(),userId:'victim'})},null)).status,401);
  await seed(api,state,'owner');assert.equal((await (await api.request('/api/plan',{},'other')).json()).exists,false);
  const own=await (await api.request('/api/plan',{},'owner')).json();assert.equal(own.state.months['2026-10'].transactions.length,1);assert.equal(own.user.id,'owner');
});
test('server rejects cross-origin, invalid and oversized writes before modifying a plan',async()=>{
  const api=server(),state=createState(false,'2026-10'),body=JSON.stringify({state,revision:0,mutationId:id()});
  assert.equal((await api.request('/api/plan',{method:'PUT',body,headers:{Origin:'https://evil.test'}})).status,403);
  assert.equal((await api.request('/api/plan',{method:'PUT',body,headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await api.request('/api/plan',{method:'PUT',body:'{}'})).status,400);
  assert.equal((await api.request('/api/plan',{method:'PUT',body,headers:{'Content-Length':String(MAX_BYTES+1)}})).status,413);
  assert.equal((await (await api.request('/api/plan')).json()).exists,false);
});
test('optimistic concurrency rejects stale writes instead of replacing newer data',async()=>{
  const api=server(),state=createState(false,'2026-10');await seed(api,state);
  const left=structuredClone(state),right=structuredClone(state);add(left,'A');add(right,'B');
  const responses=await Promise.all([left,right].map(state=>api.request('/api/plan',{method:'PUT',body:JSON.stringify({state,revision:1,mutationId:id()})})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const remote=await (await api.request('/api/plan')).json();assert.equal(remote.revision,2);assert.equal(remote.state.months['2026-10'].transactions.length,1);
});
test('successful writes are idempotent and a lost response can be acknowledged on the next read',async()=>{
  const api=server(),state=createState(false,'2026-10'),mutationId=id(),payload={state,revision:0,mutationId};
  assert.equal((await api.request('/api/plan',{method:'PUT',body:JSON.stringify(payload)})).status,200);
  const replay=await (await api.request('/api/plan',{method:'PUT',body:JSON.stringify(payload)})).json();assert.equal(replay.replayed,true);assert.equal(replay.revision,1);
  const ack=await (await api.request('/api/plan?ack='+mutationId)).json();assert.equal(ack.acknowledged.revision,1);
  const changed=structuredClone(payload);add(changed.state);assert.equal((await api.request('/api/plan',{method:'PUT',body:JSON.stringify(changed)})).status,409);
});
test('chunking preserves Unicode and incomplete stored documents produce an error, never an empty replacement',async()=>{
  const content='a'.repeat(299999)+'🌱'+'ç'.repeat(300100);assert.equal(splitDocument(content).join(''),content);assert.ok(!/[\uD800-\uDBFF]$/.test(splitDocument(content)[0]));
  const api=server(),state=createState(false,'2026-10');await seed(api,state);api.sqlite.prepare('DELETE FROM sync_chunks WHERE user_id = ?').run('owner');
  assert.equal((await api.request('/api/plan')).status,503);assert.equal(api.sqlite.prepare('SELECT revision FROM sync_plans').get().revision,1);
});
test('first device automatically uploads existing entries and a fresh second device loads the same account',async()=>{
  const api=server(),local=createState(false,'2026-10');add(local,'Existing phone purchase');
  const phone=device(api,local,{hadStored:true});await phone.sync.start();assert.equal(phone.statuses.at(-1).kind,'synced');
  const desktop=device(api,createState(true,'2026-10'));await desktop.sync.start();assert.ok(plansEqual(phone.state,desktop.state));assert.equal(desktop.state.months['2026-10'].transactions.length,1);
});
test('two devices editing different records converge without losing either entry',async()=>{
  const api=server(),base=createState(false,'2026-10');await seed(api,base);
  const a=device(api,base),b=device(api,base);await a.sync.start();await b.sync.start();a.edit(s=>add(s,'Phone'));b.edit(s=>add(s,'Desktop'));
  await a.sync.flush();await b.sync.flush();await a.sync.flush();assert.ok(plansEqual(a.state,b.state));assert.equal(a.state.months['2026-10'].transactions.length,2);
});
test('offline entries survive a restart and synchronize when the connection returns',async()=>{
  const api=server(),base=createState(false,'2026-10');await seed(api,base);const storage=new MemoryStorage();let offline=false;
  const fetcher=(...args)=>offline?Promise.reject(new TypeError('Offline')):api.fetcher()(...args);
  const phone=device(api,base,{storage,fetcher});await phone.sync.start();offline=true;phone.edit(s=>add(s,'Offline purchase'));await phone.sync.flush();assert.equal(phone.statuses.at(-1).kind,'offline');assert.equal(JSON.parse(storage.getItem(SYNC_KEY)).pending,true);
  const restarted=device(api,phone.state,{storage,fetcher,hadStored:true});offline=false;await restarted.sync.start();assert.equal(restarted.statuses.at(-1).kind,'synced');assert.equal((await (await api.request('/api/plan')).json()).state.months['2026-10'].transactions.length,1);
});
test('an initial successful upload with a lost response is recovered without duplicate entries or false conflicts',async()=>{
  const api=server(),state=createState(false,'2026-10');add(state,'First');const storage=new MemoryStorage();let lose=true;
  const fetcher=async(path,options)=>{const response=await api.fetcher()(path,options);if(lose&&options.method==='PUT'){lose=false;throw new TypeError('Connection lost after commit');}return response;};
  const d=device(api,state,{storage,fetcher,hadStored:true});await d.sync.start();assert.equal(d.statuses.at(-1).kind,'offline');
  d.edit(s=>s.months['2026-10'].transactions[0].amount=2500);
  const restarted=device(api,d.state,{storage,fetcher,hadStored:true});await restarted.sync.start();assert.equal(restarted.conflict,null);assert.equal(restarted.state.months['2026-10'].transactions[0].amount,2500);
  const remote=await (await api.request('/api/plan')).json();assert.equal(remote.state.months['2026-10'].transactions.length,1);assert.equal(remote.state.months['2026-10'].transactions[0].amount,2500);
});
test('same-record conflicts pause synchronization and user preference keeps nonconflicting changes',async()=>{
  const api=server(),base=createState(false,'2026-10'),tx=add(base);await seed(api,base);
  const a=device(api,base),b=device(api,base);await a.sync.start();await b.sync.start();
  a.edit(s=>{s.months['2026-10'].transactions[0].amount=2000;add(s,'A only');});b.edit(s=>{s.months['2026-10'].transactions[0].amount=3000;add(s,'B only');});
  await a.sync.flush();await b.sync.flush();assert.equal(b.sync.status.conflict,true);assert.equal(b.statuses.at(-1).kind,'conflict');
  await b.sync.resolve('local');assert.equal(b.sync.status.conflict,false);await a.sync.flush();assert.equal(a.state.months['2026-10'].transactions.length,3);assert.equal(a.state.months['2026-10'].transactions.find(t=>t.id===tx.id).amount,3000);assert.ok(b.sync.recoveries().length>=2);
});
test('an unrelated pre-existing local plan is not silently uploaded over an existing cloud plan',async()=>{
  const api=server(),remote=createState(false,'2026-10');add(remote,'Cloud');await seed(api,remote);
  const local=createState(false,'2026-10');add(local,'Legacy other device');const d=device(api,local,{hadStored:true});await d.sync.start();assert.equal(d.sync.status.conflict,true);assert.equal(d.conflict.reason,'first-connection');
  const current=await (await api.request('/api/plan')).json();assert.equal(current.state.months['2026-10'].transactions[0].payee,'Cloud');
});
test('device privacy preference remains local while the shared plan is updated',async()=>{
  const api=server(),base=createState(false,'2026-10');await seed(api,base);base.hideBalances=true;
  const d=device(api,base);await d.sync.start();assert.equal(d.state.hideBalances,true);d.edit(s=>add(s));await d.sync.flush();assert.equal(d.state.hideBalances,true);
  const cloud=await (await api.request('/api/plan')).json();assert.equal(cloud.state.hideBalances,false);assert.deepEqual(validateState(d.state),d.state);
});
test('an older open tab cannot erase saved payees that no longer have transactions',async()=>{
  const api=server(),initial=createState(false,'2026-10');add(initial,'Panvel');initial.months['2026-10'].transactions=[];const first=await seed(api,initial),legacy=structuredClone(initial);delete legacy.payees;legacy.categories[0].name='Casa';const update=await api.request('/api/plan',{method:'PUT',body:JSON.stringify({revision:first.revision,mutationId:id(),state:legacy})});assert.equal(update.status,200);const saved=await (await api.request('/api/plan')).json();assert.deepEqual(saved.state.payees,['Panvel']);assert.equal(saved.state.categories[0].name,'Casa');api.sqlite.close();
});
