import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createState,id} from '../web/core.js';
const owner='20000000-0000-4000-8000-000000000001',partner='20000000-0000-4000-8000-000000000002';
test('billing uses immutable server dates, verified authorization and confirmed payments',async t=>{
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  await db.exec(await readFile(new URL('../standalone/database.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../standalone/billing.sql',import.meta.url),'utf8'));
  for(const uid of [owner,partner])await db.query('insert into auth.users values($1,$2,now())',[uid,uid+'@example.test']);
  const state=createState(false,'2026-10');
  const request=(actor,path,body={},method='GET')=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role authenticated');return (await tx.query('select public.vpo_api($1,$2,$3::jsonb) as result',[method,path,JSON.stringify(body)])).rows[0].result;});
  const event=(eventId,actor,data,role='service_role')=>db.transaction(async tx=>{await tx.exec('set local role '+role);return (await tx.query('select public.vpo_billing_verified_event($1,$2,$3::jsonb) as result',[eventId,actor,JSON.stringify(data)])).rows[0].result;});
  const save=(actor,revision=0)=>request(actor,'/api/plan',{scopeId:owner,revision,mutationId:id(),state},'PUT');
  let quote;
  try{
    await t.test('commercial mode stays off until explicitly configured; existing budgets keep working',async()=>{
      const status=await request(owner,'/api/billing');assert.equal(status.body.enabled,false);assert.equal(status.body.canUse,true);
      assert.equal((await save(owner)).status,200);
      assert.equal((await request(owner,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-monthly-v1'},'POST')).body.code,'BILLING_NOT_CONFIGURED');
      assert.equal((await db.query('select count(*)::int as n from vpo_private.billing_accounts')).rows[0].n,0);
    });
    await t.test('only trusted configuration can enable a price; clients cannot read or mutate billing internals',async()=>{
      for(const table of ['billing_config','billing_accounts','billing_payments','billing_events'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from vpo_private.'+table);}),/permission denied/);
      await assert.rejects(event('fake-payment-0001',owner,{kind:'authorization'},'authenticated'),/permission denied/);
      await assert.rejects(event('fake-payment-0002',owner,{kind:'authorization'},'anon'),/permission denied/);
      await db.exec("update vpo_private.billing_config set enabled=true,monthly_cents=1990,provider='fixture',checkout_ready=true");
      assert.equal((await request(owner,'/api/billing')).body.canUse,false);
      assert.equal((await save(owner,1)).body.code,'BILLING_REQUIRED');
      assert.equal((await request(owner,'/api/plan')).body.state.planId,state.planId);
    });
    await t.test('explicit consent creates one 15-day quote and ignores client prices, dates and repeated requests',async()=>{
      const requestBody={paymentMethod:'credit_card',consent:false,termsVersion:'vpo-monthly-v1',monthlyCents:1,trialEndsAt:'2099-01-01'};
      assert.equal((await request(owner,'/api/billing/quote',requestBody,'POST')).body.code,'BILLING_CONSENT_REQUIRED');
      quote=(await request(owner,'/api/billing/quote',{...requestBody,consent:true},'POST')).body;
      assert.equal(quote.monthlyCents,1990);assert.equal(quote.phase,'awaiting_authorization');assert.equal(quote.canUse,false);
      assert.equal(new Date(quote.trialEndsAt)-new Date(quote.trialStartedAt),15*86400000);
      assert.ok(new Date(quote.firstChargeAt)>=new Date(quote.trialEndsAt));
      const retry=(await request(owner,'/api/billing/quote',{...requestBody,consent:true,paymentMethod:'pix_automatic'},'POST')).body;
      assert.equal(retry.trialEndsAt,quote.trialEndsAt);assert.equal(retry.firstChargeAt,quote.firstChargeAt);
      assert.equal((await save(owner,1)).body.code,'BILLING_REQUIRED');
    });
    await t.test('authorization unlocks the trial without recording a payment and cancellation cannot be replayed away',async()=>{
      const approved={kind:'authorization',customerId:'customer-1',subscriptionId:'subscription-1',authorizationId:'mandate-1'};
      await event('authorization-0001',owner,approved);
      const access=(await request(owner,'/api/billing')).body;assert.equal(access.canUse,true);assert.equal(access.phase,'trialing');assert.equal(access.paidUntil,null);
      assert.equal((await db.query('select count(*)::int as n from vpo_private.billing_payments')).rows[0].n,0);
      assert.equal((await save(owner,1)).status,200);
      assert.equal((await event('authorization-0001',owner,approved)).replayed,true);
      await assert.rejects(event('wrong-customer-1',owner,{...approved,customerId:'different'}),/mismatch/);
    });
    await t.test('an authorized trial expires at the server even when the browser sends future dates',async()=>{
      await db.exec("update vpo_private.billing_accounts set trial_started_at=now()-interval '16 days',trial_ends_at=now()-interval '1 day',first_charge_at=now() where owner_id='"+owner+"'");
      const access=(await request(owner,'/api/billing')).body;assert.equal(access.phase,'payment_required');assert.equal(access.canUse,false);
      assert.equal((await save(owner,2)).status,403);assert.equal((await request(owner,'/api/plan')).status,200);
      assert.equal((await request(owner,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-monthly-v1',trialStartedAt:new Date().toISOString()},'POST')).body.code,'BILLING_ALREADY_STARTED');
    });
    const payment=()=>({kind:'payment',customerId:'customer-1',subscriptionId:'subscription-1',paymentId:'invoice-1',amountCents:1990,currency:'BRL',periodStart:new Date().toISOString(),periodEnd:new Date(Date.now()+30*86400000).toISOString(),status:'paid'});
    await t.test('paid access requires a matching amount, currency, customer and subscription; future periods do not grant early access',async()=>{
      for(const change of [{amountCents:100},{currency:'USD'},{customerId:'bad'},{subscriptionId:'bad'},{periodStart:new Date(Date.now()-30*86400000).toISOString()}])await assert.rejects(event('invalid-'+id(),owner,{...payment(),...change}),/mismatch/);
      await event('future-payment-1',owner,{...payment(),paymentId:'future-invoice',periodStart:new Date(Date.now()+50*86400000).toISOString(),periodEnd:new Date(Date.now()+80*86400000).toISOString()});
      assert.equal((await request(owner,'/api/billing')).body.canUse,false);
      await event('paid-invoice-0001',owner,payment());assert.equal((await request(owner,'/api/billing')).body.phase,'active');
      assert.equal((await save(owner,2)).status,200);
    });
    await t.test('the owner subscription covers a different invited account without a second charge or trial',async()=>{
      const invite=(await request(owner,'/api/sharing/invites',{},'POST')).body;
      assert.equal((await request(partner,'/api/billing')).body.phase,'choose_payment');
      assert.equal((await request(partner,'/api/sharing/accept',{token:invite.token},'POST')).status,200);
      const status=(await request(partner,'/api/billing')).body;assert.equal(status.isOwner,false);assert.equal(status.canUse,true);assert.equal(status.scopeId,owner);
      assert.equal((await db.query('select count(*)::int as n from vpo_private.billing_accounts')).rows[0].n,1);
      assert.equal((await request(partner,'/api/billing/quote',{paymentMethod:'credit_card',consent:true},'POST')).status,403);
    });
    await t.test('cancellation preserves the paid period, refunds remove paid access, and financial data remains exportable',async()=>{
      await event('cancellation-0001',owner,{kind:'cancellation',subscriptionId:'subscription-1'});
      assert.equal((await request(owner,'/api/billing')).body.canUse,true);
      await assert.rejects(event('late-auth-0001',owner,{kind:'authorization',customerId:'customer-1',subscriptionId:'subscription-1'}),/cannot be revived/);
      await event('invoice-refund-0001',owner,{...payment(),status:'refunded'});
      assert.equal((await request(owner,'/api/billing')).body.canUse,false);assert.equal((await save(partner,3)).status,403);
      const data=await request(owner,'/api/plan');assert.equal(data.status,200);assert.equal(data.body.state.planId,state.planId);
      assert.equal((await event('paid-invoice-0001',owner,payment())).replayed,true);assert.equal((await request(owner,'/api/billing')).body.canUse,false);
      await event('out-of-order-paid-0001',owner,payment());assert.equal((await request(owner,'/api/billing')).body.canUse,false);
    });
  }finally{await db.close();}
});
