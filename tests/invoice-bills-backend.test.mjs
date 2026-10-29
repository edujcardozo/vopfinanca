import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createState,id} from '../web/core.js';
import {saveSavingsGoal} from '../web/savings-goals.js';
test('invoice metadata is validated by SQL, shared only with members and protected against legacy clients',async()=>{
 const db=new PGlite(),admin='50000000-0000-4000-8000-000000000001',owner='50000000-0000-4000-8000-000000000002',guest='50000000-0000-4000-8000-000000000003',other='50000000-0000-4000-8000-000000000004';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
 for(const file of ['database.sql','billing.sql','asaas.sql','registration.sql','participants.sql','access-management.sql','manual-pix.sql','savings-goals.sql','plan-freeze.sql','invoice-bills.sql'])await db.exec(await readFile(new URL('../standalone/'+file,import.meta.url),'utf8'));
 const request=(actor,path,body={},method='GET')=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await tx.exec('set local role authenticated');return (await tx.query('select public.vpo_api($1,$2,$3::jsonb) r',[method,path,JSON.stringify(body)])).rows[0].r;});
 for(const actor of [admin,owner,guest,other]){
  await db.query('insert into auth.users values($1,$2,now())',[actor,actor===admin?'edujcardozo@gmail.com':actor+'@example.test']);
  await request(actor,'/api/access/register',{fullName:'Pessoa de teste',purpose:actor===guest?'guest':'personal'},'POST');
  if(actor===owner||actor===other)await request(admin,'/api/access/decision',{userId:actor,decision:'approved'},'POST');
 }
 const state=createState(false,'2026-10');state.invoiceBills=[{id:'bill-test',month:'2026-11',dueDate:'2026-12-10',card:'Nubank',paidDate:null,transactionIds:['purchase-test']}];saveSavingsGoal(state,{name:'Viagem',targetAmount:100000,savedAmount:30000});
 const put=(actor,value,revision)=>request(actor,'/api/plan',{scopeId:owner,revision,mutationId:id(),state:value},'PUT');
 assert.equal((await put(owner,state,0)).status,200);
 const invite=(await request(owner,'/api/sharing/invites',{},'POST')).body;assert.equal((await request(guest,'/api/sharing/accept',{token:invite.token},'POST')).status,200);
 assert.deepEqual((await request(guest,'/api/plan')).body.state.savingsGoals,state.savingsGoals);
 state.savingsGoals[0].savedAmount=50000;assert.equal((await put(guest,state,1)).status,200);assert.equal((await request(owner,'/api/plan')).body.state.savingsGoals[0].savedAmount,50000);
 for(const change of [{targetAmount:0},{targetAmount:1.5},{savedAmount:-1},{id:'__proto__'},{name:''}]){const bad=structuredClone(state);Object.assign(bad.savingsGoals[0],change);assert.equal((await put(owner,bad,2)).status,400);}
 for(const change of [{dueDate:'2026-02-30'},{month:'2026-13'},{card:5},{paidDate:'bad'},{transactionIds:['__proto__']}]){const bad=structuredClone(state);Object.assign(bad.invoiceBills[0],change);assert.equal((await put(owner,bad,2)).status,400);}
 const stale=structuredClone(state);delete stale.invoiceBills;assert.equal((await put(owner,stale,2)).body.code,'CLIENT_UPDATE_REQUIRED');
 assert.deepEqual((await request(guest,'/api/plan')).body.state.invoiceBills,state.invoiceBills);
 const legacy=structuredClone(state);delete legacy.savingsGoals;assert.equal((await put(owner,legacy,2)).body.code,'CLIENT_UPDATE_REQUIRED');
 assert.equal((await request(owner,'/api/plan')).body.revision,2);assert.equal((await put(other,state,2)).status,409);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select vpo_private.invoice_bills_plan_api('GET','/api/plan','{}')");}),/permission denied/);
 await db.query("update vpo_private.registrations set trial_started_at=now()-interval '20 days',trial_ends_at=now()-interval '5 days' where user_id=$1",[owner]);
 assert.equal((await put(owner,state,2)).body.code,'BILLING_REQUIRED');assert.equal((await put(guest,state,2)).body.code,'BILLING_REQUIRED');
 }finally{await db.close();}
});
