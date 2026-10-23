import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createState,id} from '../web/core.js';
const ids=Object.fromEntries(['admin','existing','new','guest','attacker','expired','signed'].map((name,i)=>[name,'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0')]));
test('user access management enforces trial deadlines, permanence and reversible removal in SQL',async t=>{
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  for(const file of ['database.sql','billing.sql','asaas.sql','registration.sql','participants.sql'])await db.exec(await readFile(new URL('../standalone/'+file,import.meta.url),'utf8'));
  for(const [name,uid] of Object.entries(ids))await db.query('insert into auth.users values($1,$2,now())',[uid,name==='admin'?'edujcardozo@gmail.com':name+'@example.test']);
  const request=(actor,path,body={},method='GET')=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role authenticated');return (await tx.query('select public.vpo_api($1,$2,$3::jsonb) as result',[method,path,JSON.stringify(body)])).rows[0].result;});
  const register=(actor,purpose='personal',extra={})=>request(actor,'/api/access/register',{fullName:'Pessoa de Teste',purpose,...extra},'POST');
  const decide=(actor,accessMode)=>request(ids.admin,'/api/access/decision',{userId:actor,decision:'approved',...(accessMode?{accessMode}:{})},'POST');
  const manage=(actor,action)=>request(ids.admin,'/api/access/manage',{userId:actor,action,confirm:true},'POST');
  const billing=async actor=>(await request(actor,'/api/billing')).body;
  const state=createState(false,'2026-10');
  const save=(actor,scopeId=actor,revision=0)=>request(actor,'/api/plan',{scopeId,revision,mutationId:id(),state},'PUT');
  const event=(owner,eventId,data)=>db.transaction(async tx=>{await tx.exec('set local role service_role');return (await tx.query('select public.vpo_billing_verified_event($1,$2,$3::jsonb) as result',[eventId,owner,JSON.stringify(data)])).rows[0].result;});
  const gateway=(owner)=>db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query("select public.vpo_billing_gateway('prepare',$1,'{\"environment\":\"sandbox\"}')",[owner]);});
  let originalEnd;
  try{
    await register(ids.admin);
    for(const name of ['existing','expired']){await register(ids[name]);await decide(ids[name]);assert.equal((await save(ids[name])).status,200);}
    await db.exec("update vpo_private.registrations set decided_at=now()-interval '2 days' where user_id='"+ids.existing+"';update vpo_private.registrations set decided_at=now()-interval '20 days' where user_id='"+ids.expired+"';");
    await db.exec(await readFile(new URL('../standalone/access-management.sql',import.meta.url),'utf8'));
    await t.test('existing accounts retain the approval date and admin access stays permanent',async()=>{
      const access=await billing(ids.existing);originalEnd=access.trialEndsAt;
      assert.equal(access.phase,'trialing');assert.equal(access.trialDaysRemaining,13);
      assert.equal(new Date(access.trialEndsAt)-new Date(access.trialStartedAt),15*86400000);
      assert.equal((await billing(ids.admin)).phase,'permanent');
      assert.equal((await db.query('select enabled from vpo_private.billing_config')).rows[0].enabled,false);
    });
    await t.test('the server expires editing while preserving consultation and the original budget',async()=>{
      const access=await billing(ids.expired);assert.equal(access.phase,'payment_required');assert.equal(access.canUse,false);assert.equal(access.enabled,false);
      assert.equal((await save(ids.expired,ids.expired,1)).body.code,'BILLING_REQUIRED');
      assert.equal((await request(ids.expired,'/api/plan')).body.state.planId,state.planId);
      assert.equal((await request(ids.expired,'/api/access')).body.canUse,true);
    });
    await t.test('only the bound administrator manages access and no private entry point is exposed',async()=>{
      await register(ids.attacker);
      assert.equal((await request(ids.attacker,'/api/access/manage',{userId:ids.attacker,action:'permanent',confirm:true,isAdmin:true},'POST')).status,403);
      assert.equal((await request(ids.attacker,'/api/access/requests',{},'POST')).status,403);
      assert.equal((await request(ids.attacker,'/api/access')).body.isAdmin,false);
      assert.equal((await manage(ids.admin,'revoke')).status,400);
      for(const fn of ['registration_api','approved_plan_api','billing_api','plan_api'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query(`select vpo_private.${fn}('GET','/api/plan','{}')`);}),/permission denied/);
      for(const table of ['registrations','access_events'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from vpo_private.'+table);}),/permission denied/);
      await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query("select vpo_private.provider_billing_gateway('prepare',$1,'{}')",[ids.existing]);}),/permission denied/);
    });
    await t.test('approval starts exactly one fifteen-day trial and browser fields cannot extend it',async()=>{
      await register(ids.new);await decide(ids.new);
      const first=await billing(ids.new);assert.equal(first.trialDaysRemaining,15);assert.equal(first.canUse,true);
      await register(ids.new,'personal',{accessMode:'permanent',trialEndsAt:'2099-01-01'});await decide(ids.new,'permanent');
      const repeated=await billing(ids.new);assert.equal(repeated.trialEndsAt,first.trialEndsAt);assert.equal(repeated.phase,'trialing');
      const list=(await request(ids.admin,'/api/access/requests',{status:'approved'},'POST')).body;
      assert.ok(list.items.find(x=>x.id===ids.new).access.trialEndsAt);
      assert.equal((await request(ids.admin,'/api/access/manage',{userId:ids.new,action:'permanent'},'POST')).status,400);
    });
    await t.test('permanent access is independent of billing and never grants administration',async()=>{
      assert.equal((await manage(ids.new,'permanent')).status,200);
      const access=await billing(ids.new);assert.equal(access.phase,'permanent');assert.equal(access.canUse,true);assert.equal(access.checkoutReady,false);
      assert.equal((await request(ids.new,'/api/access')).body.isAdmin,false);
      assert.equal((await request(ids.new,'/api/access/requests',{},'POST')).status,403);
      assert.equal((await save(ids.new)).status,200);
      assert.equal((await request(ids.new,'/api/billing/quote',{},'POST')).body.code,'PERMANENT_ACCESS');
      assert.equal((await db.query('select count(*)::int n from vpo_private.billing_payments')).rows[0].n,0);
    });
    await t.test('a shared budget inherits the owner trial and owner removal blocks every online budget request',async()=>{
      await register(ids.guest,'guest');const invite=(await request(ids.existing,'/api/sharing/invites',{},'POST')).body;
      assert.equal((await request(ids.guest,'/api/sharing/accept',{token:invite.token},'POST')).status,200);
      const shared=await billing(ids.guest);assert.equal(shared.isOwner,false);assert.equal(shared.trialEndsAt,originalEnd);
      assert.equal((await db.query('select trial_started_at from vpo_private.registrations where user_id=$1',[ids.guest])).rows[0].trial_started_at,null);
      assert.equal((await manage(ids.existing,'revoke')).status,200);
      assert.equal((await request(ids.existing,'/api/access')).body.status,'revoked');
      for(const [path,method] of [['/api/plan','GET'],['/api/plan/head','GET'],['/api/plan','PUT'],['/api/access/register','POST'],['/api/sharing/accept','POST']])assert.equal((await request(ids.existing,path,{},method)).body.code,'ACCESS_REVOKED');
      assert.equal((await request(ids.guest,'/api/plan')).status,403);
      assert.equal((await manage(ids.existing,'restore')).status,200);assert.equal((await billing(ids.existing)).trialEndsAt,originalEnd);
      assert.equal((await request(ids.guest,'/api/plan')).body.state.planId,state.planId);
    });
    await t.test('removed guests cannot rejoin or appear as participants until restored, and retain no personal access',async()=>{
      assert.equal((await manage(ids.guest,'revoke')).status,200);
      assert.equal((await request(ids.guest,'/api/plan')).body.code,'ACCESS_REVOKED');
      assert.equal((await request(ids.guest,'/api/sharing/accept',{token:'a'.repeat(64)},'POST')).body.code,'ACCESS_REVOKED');
      assert.ok(!(await request(ids.existing,'/api/sharing')).body.participants.some(x=>x.id===ids.guest));
      const list=(await request(ids.admin,'/api/access/requests',{status:'revoked'},'POST')).body;assert.ok(list.items.some(x=>x.id===ids.guest));
      await manage(ids.guest,'restore');assert.equal((await request(ids.guest,'/api/access')).body.canUse,true);
      assert.equal((await request(ids.guest,'/api/sharing/switch',{scopeId:ids.guest},'POST')).body.code,'ACCESS_PENDING');
      assert.equal((await db.query('select status from vpo_private.registrations where user_id=$1',[ids.guest])).rows[0].status,'guest');
    });
    await t.test('switching back or restoring an expired account never restarts a trial and every change is audited',async()=>{
      await db.query("update vpo_private.registrations set trial_started_at=now()-interval '16 days',trial_ends_at=now()-interval '1 day' where user_id=$1",[ids.new]);
      assert.equal((await billing(ids.new)).canUse,true);await manage(ids.new,'subscription');assert.equal((await billing(ids.new)).canUse,false);
      const end=(await billing(ids.new)).trialEndsAt;await manage(ids.new,'revoke');await manage(ids.new,'restore');await manage(ids.new,'restore');
      assert.equal((await billing(ids.new)).trialEndsAt,end);assert.equal((await billing(ids.new)).canUse,false);
      const rows=(await db.query('select actor_id,action,previous_access,next_access from vpo_private.access_events where user_id=$1 order by id',[ids.new])).rows;
      assert.deepEqual(rows.map(x=>x.action),['approve_trial','permanent','subscription','revoke','restore']);assert.ok(rows.every(x=>x.actor_id===ids.admin));
      assert.equal((await request(ids.new,'/api/plan')).body.state.planId,state.planId);
    });
    await t.test('checkout uses the original deadline and authorization after expiry cannot create a second free trial',async()=>{
      await db.exec("update vpo_private.billing_config set enabled=true,checkout_ready=true");
      const before=await billing(ids.expired);
      const quote=(await request(ids.expired,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-asaas-monthly-v1',trialEndsAt:'2099-01-01'},'POST')).body;
      assert.equal(quote.trialEndsAt,before.trialEndsAt);assert.equal(quote.trialStartedAt,before.trialStartedAt);assert.equal(quote.canUse,false);assert.ok(new Date(quote.firstChargeAt)>new Date());
      await event(ids.expired,'authorization-expired',{kind:'authorization',customerId:'customer-expired',subscriptionId:'subscription-expired'});
      assert.equal((await billing(ids.expired)).phase,'awaiting_payment');assert.equal((await billing(ids.expired)).canUse,false);
      assert.equal((await save(ids.expired,ids.expired,1)).body.code,'BILLING_REQUIRED');
    });
    await t.test('active provider billing must be canceled before a free grant or removal, including a stale checkout',async()=>{
      await register(ids.signed);await decide(ids.signed);
      const before=await billing(ids.signed);
      const quote=(await request(ids.signed,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-asaas-monthly-v1'},'POST')).body;
      assert.equal(quote.trialEndsAt,before.trialEndsAt);
      await event(ids.signed,'authorization-signed',{kind:'authorization',customerId:'customer-signed',subscriptionId:'subscription-signed'});
      for(const action of ['permanent','revoke'])assert.equal((await manage(ids.signed,action)).body.code,'BILLING_CANCEL_FIRST');
      await event(ids.signed,'cancellation-signed',{kind:'cancellation',subscriptionId:'subscription-signed'});
      assert.equal((await manage(ids.signed,'permanent')).status,200);
      await assert.rejects(gateway(ids.signed),/not eligible/);
      await manage(ids.signed,'revoke');await assert.rejects(gateway(ids.signed),/not eligible/);
      assert.equal((await db.query('select count(*)::int n from vpo_private.billing_payments')).rows[0].n,0);
    });
  }finally{await db.close();}
});
