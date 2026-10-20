import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createState,id} from '../web/core.js';
import {createCloudSync} from '../web/cloud-sync.js';
import {createSupabaseTransport} from '../standalone/api.js';
import {accountStorage} from '../standalone/storage.js';
const owner='10000000-0000-4000-8000-000000000001',wife='10000000-0000-4000-8000-000000000002',stranger='10000000-0000-4000-8000-000000000003',unverified='10000000-0000-4000-8000-000000000004';
const memory=()=>{const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
test('independent PostgreSQL API enforces account identity, shared membership and compare-and-swap',async t=>{
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  await db.exec(await readFile(new URL('../standalone/database.sql',import.meta.url),'utf8'));
  for(const [uid,email,verified] of [[owner,'edu@example.test',true],[wife,'larissa@example.test',true],[stranger,'other@example.test',true],[unverified,'pending@example.test',false]])await db.query('insert into auth.users values($1,$2,$3)',[uid,email,verified?'2026-10-20T12:00:00Z':null]);
  async function request(uid,path,body={},method='GET',role='authenticated'){
    return db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid||'']);
      await tx.exec('set local role '+role);
      const result=await tx.query('select public.vpo_api($1,$2,$3::jsonb) as response',[method,path,JSON.stringify(body)]);
      return result.rows[0].response;
    });
  }
  let state=createState(false,'2026-10'),invitation;
  try{
    await t.test('no anonymous RPC or direct access to budget, token or membership tables',async()=>{
      await assert.rejects(request(null,'/api/plan',{},'GET','anon'),/permission denied/);
      assert.equal((await request(null,'/api/plan')).status,401);
      assert.equal((await request(unverified,'/api/plan')).status,401);
      for(const table of ['plans','mutations','members','invites','preferences'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from vpo_private.'+table);}),/permission denied/);
      assert.equal((await db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='vpo_private' and c.relkind='r' and c.relrowsecurity")).rows[0].n,5);
    });
    await t.test('new accounts have no sample budget and cannot choose another owner in request JSON',async()=>{
      assert.equal((await request(owner,'/api/plan')).body.exists,false);
      const saved=await request(owner,'/api/plan',{scopeId:owner,revision:0,mutationId:id(),state},'PUT');assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
      const other=await request(stranger,'/api/plan',{owner_id:owner,user:{id:owner},scopeId:owner});assert.equal(other.body.exists,false);assert.equal(other.body.user.id,stranger);
      assert.equal((await request(stranger,'/api/plan',{scopeId:owner,revision:1,mutationId:id(),state},'PUT')).body.code,'PLAN_SCOPE_CHANGED');
    });
    await t.test('duplicate acknowledgments are idempotent and stale revisions never overwrite',async()=>{
      const mutation=id(),body={scopeId:owner,revision:1,mutationId:mutation,state};
      assert.equal((await request(owner,'/api/plan',body,'PUT')).body.revision,2);
      const again=await request(owner,'/api/plan',body,'PUT');assert.equal(again.body.replayed,true);assert.equal(again.body.revision,2);
      const latest=await request(owner,'/api/plan',{ack:mutation});assert.equal(latest.body.acknowledged.revision,2);
      const modified=structuredClone(state);modified.categories[0].name='Outra casa';
      assert.equal((await request(owner,'/api/plan',{...body,state:modified},'PUT')).status,409);
      assert.equal((await request(owner,'/api/plan',{...body,mutationId:id(),state:modified},'PUT')).body.code,'REVISION_CONFLICT');
      assert.equal((await request(owner,'/api/plan')).body.state.categories[0].name,'Moradia');
    });
    await t.test('malformed financial documents cannot poison a shared budget',async()=>{
      const invalid=[];
      for(const key of ['version','planId','groups','categories','months','payees','household']){const p=structuredClone(state);delete p[key];invalid.push(p);}
      const missingName=structuredClone(state);delete missingName.categories[0].name;invalid.push(missingName);
      const wrongGroup=structuredClone(state);delete wrongGroup.categories[0].group;invalid.push(wrongGroup);
      const badTx=structuredClone(state);badTx.months['2026-10'].transactions.push({id:id(),type:'expense',amount:100,date:'2026-10-32',description:'inválida',categoryId:'mercado'});invalid.push(badTx);
      const badMoney=structuredClone(state);badMoney.months['2026-10'].assigned.mercado=0.5;invalid.push(badMoney);
      for(const p of invalid)assert.equal((await request(owner,'/api/plan',{scopeId:owner,revision:2,mutationId:id(),state:p},'PUT')).status,400);
      assert.equal((await request(owner,'/api/plan/head')).body.revision,2);
    });
    await t.test('a high-entropy one-use invite reveals no budget until explicit acceptance',async()=>{
      invitation=(await request(owner,'/api/sharing/invites',{},'POST')).body;
      assert.match(invitation.token,/^[a-f0-9]{64}$/);
      const stored=(await db.query('select * from vpo_private.invites')).rows[0];assert.notEqual(stored.token_hash,invitation.token);assert.equal('token' in stored,false);
      assert.equal((await request(wife,'/api/plan')).body.exists,false);
      const preview=await request(wife,'/api/sharing/preview',{token:invitation.token},'POST');assert.equal(preview.body.ownerEmail,'edu@example.test');assert.equal('state' in preview.body,false);
      assert.equal((await request(owner,'/api/sharing/accept',{token:invitation.token},'POST')).status,400);
      assert.equal((await request(wife,'/api/sharing/accept',{token:invitation.token},'POST')).status,200);
      const shared=await request(wife,'/api/plan');assert.equal(shared.body.state.planId,state.planId);assert.equal(shared.body.scope.role,'editor');
      assert.equal((await request(stranger,'/api/sharing/accept',{token:invitation.token},'POST')).status,410);
      assert.equal((await request(wife,'/api/sharing/invites',{},'POST')).status,403);
    });
    await t.test('two clients merge offline expenses and observe automatic updates through the real SQL transport',async()=>{
      function transport(uid){return createSupabaseTransport({rpc(_name,args){const pending=request(uid,args.p_path,args.p_body,args.p_method).then(data=>({data,error:null}));pending.abortSignal=()=>pending;return pending;}});}
      function device(uid){let plan=createState(false,'2026-10');const sync=createCloudSync({getState:()=>plan,onApply:p=>plan=p,onStatus(){},onConflict(){assert.fail('Independent transactions must merge');},storage:accountStorage(memory(),'backend.supabase.co',uid),fetcher:transport(uid),autoSchedule:false,autoPoll:false});return {sync,get plan(){return plan;}};}
      const a=device(owner),b=device(wife);await a.sync.start();await b.sync.start();
      const tx=(who,amount)=>({id:id(),type:'expense',description:who,amount,date:'2026-10-20',categoryId:'mercado',payee:who,sharing:{paidBy:who==='Edu'?'edu':'larissa',eduPercent:50}});
      a.plan.months['2026-10'].transactions.push(tx('Edu',1000));a.sync.markLocal();
      b.plan.months['2026-10'].transactions.push(tx('Larissa',2000));b.sync.markLocal();
      await a.sync.flush();await b.sync.flush();await a.sync.checkUpdates();
      assert.equal(a.plan.months['2026-10'].transactions.length,2);assert.deepEqual(a.plan,b.plan);assert.equal(a.sync.status.dirty,false);assert.equal(b.sync.status.dirty,false);
      a.sync.stop();b.sync.stop();
    });
    await t.test('plan switching and revoked access block pending writes without touching personal budgets',async()=>{
      const shared=(await request(wife,'/api/plan')).body;
      await request(wife,'/api/sharing/switch',{scopeId:wife},'POST');
      const stale=await request(wife,'/api/plan',{scopeId:owner,revision:shared.revision,mutationId:id(),state:shared.state},'PUT');assert.equal(stale.body.code,'PLAN_SCOPE_CHANGED');
      assert.equal((await request(wife,'/api/plan')).body.exists,false);
      await request(wife,'/api/sharing/switch',{scopeId:owner},'POST');
      await request(owner,'/api/sharing/remove-member',{memberId:wife},'POST');
      assert.equal((await request(wife,'/api/plan')).body.code,'PLAN_ACCESS_REVOKED');
      assert.equal((await request(wife,'/api/plan',{scopeId:owner,revision:shared.revision,mutationId:id(),state:shared.state},'PUT')).status,403);
      assert.equal((await request(wife,'/api/sharing/accept',{token:invitation.token},'POST')).status,410);
      assert.equal((await request(wife,'/api/sharing')).body.scope.revoked,true);
      await request(wife,'/api/sharing/switch',{scopeId:wife},'POST');assert.equal((await request(wife,'/api/plan')).body.exists,false);
      assert.equal((await request(stranger,'/api/sharing/switch',{scopeId:owner},'POST')).status,403);
    });
    await t.test('expired and replaced links cannot restore access',async()=>{
      const old=(await request(owner,'/api/sharing/invites',{},'POST')).body;
      const next=(await request(owner,'/api/sharing/invites',{},'POST')).body;
      assert.equal((await request(wife,'/api/sharing/accept',{token:old.token},'POST')).status,410);
      await db.query("update vpo_private.invites set expires_at=now()-interval '1 second' where id=$1",[next.id]);
      assert.equal((await request(wife,'/api/sharing/preview',{token:next.token},'POST')).status,410);
    });
  }finally{await db.close();}
});
