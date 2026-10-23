import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createState,id} from '../web/core.js';
const ids=Object.fromEntries(['admin','customer','future','guest','permanent','provider','attacker'].map((name,i)=>[name,'40000000-0000-4000-8000-'+String(i+1).padStart(12,'0')]));
test('manual Pix only grants a calendar month after a verified administrator confirmation',async t=>{
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  for(const file of ['database.sql','billing.sql','asaas.sql','registration.sql','participants.sql','access-management.sql','manual-pix.sql'])await db.exec(await readFile(new URL('../standalone/'+file,import.meta.url),'utf8'));
  for(const [name,uid] of Object.entries(ids))await db.query('insert into auth.users values($1,$2,now())',[uid,name==='admin'?'edujcardozo@gmail.com':name+'@example.test']);
  const request=(actor,path,body={},method='GET')=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role authenticated');return (await tx.query('select public.vpo_api($1,$2,$3::jsonb) as result',[method,path,JSON.stringify(body)])).rows[0].result;});
  const billing=async actor=>(await request(actor,'/api/billing')).body;
  const admin=(path,body)=>request(ids.admin,'/api/access'+path,body,'POST');
  const manage=(actor,action)=>admin('/manage',{userId:actor,action,confirm:true});
  const confirm=async(actor,extra={})=>admin('/pix',{userId:actor,requestId:id(),paymentVersion:(await billing(actor)).manualPaymentVersion,confirm:true,...extra});
  const count=async()=>(await db.query('select count(*)::int n from vpo_private.manual_pix_payments')).rows[0].n;
  const state=createState(false,'2026-10');
  try{
    for(const [name,uid] of Object.entries(ids)){
      await request(uid,'/api/access/register',{fullName:'Pessoa de Teste',purpose:name==='guest'?'guest':'personal'},'POST');
      if(!['admin','guest','attacker'].includes(name))await admin('/decision',{userId:uid,decision:'approved',accessMode:name==='permanent'?'permanent':'subscription'});
    }
    await db.exec("update vpo_private.registrations set trial_started_at=now()-interval '20 days',trial_ends_at=now()-interval '5 days' where user_id in ('"+ids.customer+"','"+ids.provider+"');");
    await t.test('merchant config remains private, defaults off, and no read can grant paid access',async()=>{
      assert.equal((await billing(ids.customer)).manualPix,undefined);
      assert.equal((await confirm(ids.customer)).status,503);
      for(const table of ['manual_pix_config','manual_pix_payments'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from vpo_private.'+table);}),/permission denied/);
      await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select vpo_private.access_api('GET','/api/billing','{}')");}),/permission denied/);
      await db.exec("update vpo_private.manual_pix_config set enabled=true,pix_key='11144477735',merchant_name='VPO FINANCAS',merchant_city='NAO INFORMADO',whatsapp='5511999990000'");
      const info=await billing(ids.customer);assert.equal(info.manualPix.key,'11144477735');assert.equal(info.manualPix.amountCents,1290);assert.equal(info.canUse,false);
      assert.equal((await request(ids.customer,'/api/access')).body.billing.manualPix,undefined);
      assert.equal(await count(),0);
    });
    await t.test('customers cannot approve themselves or change merchant configuration through body fields',async()=>{
      assert.equal((await request(ids.customer,'/api/access/pix',{userId:ids.customer,confirm:true,amountCents:1,paidUntil:'2099-01-01'},'POST')).status,403);
      assert.equal((await confirm(ids.customer,{confirm:false})).status,400);
      assert.equal((await confirm(ids.admin)).status,400);
      assert.equal((await confirm(ids.permanent)).status,409);
      assert.equal((await confirm(ids.attacker)).status,409);
      assert.equal(await count(),0);
    });
    await t.test('permanent access has no payment request; only the administrator gets a preview',async()=>{
      assert.equal((await billing(ids.permanent)).manualPix,undefined);
      assert.equal((await billing(ids.admin)).manualPix.preview,true);
      assert.equal((await billing(ids.admin)).phase,'permanent');
    });
    await t.test('one explicit confirmation unlocks an expired customer and server values override browser fields',async()=>{
      const before=await billing(ids.customer),result=await confirm(ids.customer,{amountCents:1,paidUntil:'2099-01-01'});assert.equal(result.status,200);
      const row=(await db.query('select * from vpo_private.manual_pix_payments where owner_id=$1',[ids.customer])).rows[0];
      assert.equal(row.amount_cents,1290);assert.equal(row.confirmed_by,ids.admin);
      assert.equal((await db.query("select period_end=((period_start at time zone 'America/Sao_Paulo')+interval '1 month') at time zone 'America/Sao_Paulo' as ok from vpo_private.manual_pix_payments where owner_id=$1",[ids.customer])).rows[0].ok,true);
      const after=await billing(ids.customer);assert.equal(after.phase,'active');assert.equal(after.canUse,true);assert.equal(after.paymentSource,'manual_pix');assert.equal(after.trialEndsAt,before.trialEndsAt);
      assert.equal((await request(ids.customer,'/api/plan',{scopeId:ids.customer,revision:0,mutationId:id(),state},'PUT')).status,200);
      assert.equal((await db.query('select count(*)::int n from vpo_private.billing_accounts')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from vpo_private.billing_payments')).rows[0].n,0);
    });
    await t.test('retries are idempotent and a stale confirmation cannot extend access a second time',async()=>{
      const before=await billing(ids.customer),requestId=id();const payload={userId:ids.customer,requestId,paymentVersion:before.manualPaymentVersion,confirm:true};
      const first=await admin('/pix',payload),total=await count();assert.equal(first.status,200);
      const repeated=await admin('/pix',payload);assert.equal(repeated.body.replayed,true);assert.equal(await count(),total);
      assert.equal((await admin('/pix',{...payload,requestId:id()})).body.code,'PAYMENT_CHANGED');assert.equal(await count(),total);
      const receipts=(await db.query('select period_start,period_end from vpo_private.manual_pix_payments where owner_id=$1 order by period_start',[ids.customer])).rows;
      assert.equal(new Date(receipts[1].period_start).getTime(),new Date(receipts[0].period_end).getTime());
    });
    await t.test('prepayment starts after the original free trial and shared invitees inherit it without a second charge',async()=>{
      const before=await billing(ids.future);await confirm(ids.future);
      const after=await billing(ids.future);assert.equal(after.phase,'trialing');assert.equal(after.trialEndsAt,before.trialEndsAt);assert.ok(new Date(after.paidUntil)>new Date(after.trialEndsAt));
      const receipt=(await db.query('select period_start from vpo_private.manual_pix_payments where owner_id=$1',[ids.future])).rows[0];assert.equal(new Date(receipt.period_start).getTime(),new Date(before.trialEndsAt).getTime());
      assert.equal((await request(ids.future,'/api/plan',{scopeId:ids.future,revision:0,mutationId:id(),state},'PUT')).status,200);
      const invite=(await request(ids.future,'/api/sharing/invites',{},'POST')).body;
      assert.equal((await request(ids.guest,'/api/sharing/accept',{token:invite.token},'POST')).status,200);
      const guest=await billing(ids.guest);assert.equal(guest.isOwner,false);assert.equal(guest.paidUntil,after.paidUntil);assert.equal(guest.manualPix,undefined);
    });
    await t.test('removal overrides a paid month and restoring never invents a new trial or payment',async()=>{
      const before=await billing(ids.customer),total=await count();await manage(ids.customer,'revoke');
      assert.equal((await request(ids.customer,'/api/billing')).body.code,'ACCESS_REVOKED');assert.equal((await confirm(ids.customer)).status,409);
      await manage(ids.customer,'restore');const after=await billing(ids.customer);assert.equal(after.canUse,true);assert.equal(after.paidUntil,before.paidUntil);assert.equal(after.trialEndsAt,before.trialEndsAt);assert.equal(await count(),total);
    });
    await t.test('manual prepayment prevents a new automatic quote and a stale provider checkout',async()=>{
      assert.equal((await request(ids.future,'/api/billing/quote',{paymentMethod:'credit_card',consent:true},'POST')).body.code,'MANUAL_PERIOD_ACTIVE');
      await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query("select public.vpo_billing_gateway('prepare',$1,'{\"environment\":\"sandbox\"}')",[ids.future]);}),/not eligible/);
    });
    await t.test('an expired manual period removes editing and preserves the saved budget',async()=>{
      await db.query("update vpo_private.manual_pix_payments set period_start=now()-interval '40 days',period_end=now()-interval '10 days' where owner_id=$1",[ids.customer]);
      const expired=await billing(ids.customer);assert.equal(expired.phase,'payment_required');assert.equal(expired.canUse,false);
      assert.equal((await request(ids.customer,'/api/plan',{scopeId:ids.customer,revision:1,mutationId:id(),state},'PUT')).body.code,'BILLING_REQUIRED');
      assert.equal((await request(ids.customer,'/api/plan')).body.state.planId,state.planId);
    });
    await t.test('an active provider authorization blocks manual Pix to avoid billing the same customer twice',async()=>{
      await db.exec('update vpo_private.billing_config set enabled=true,checkout_ready=true');
      const quote=await request(ids.provider,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-asaas-monthly-v1'},'POST');assert.equal(quote.status,200);
      await db.query('update vpo_private.billing_accounts set authorization_confirmed=true where owner_id=$1',[ids.provider]);
      assert.equal((await billing(ids.provider)).manualPix,undefined);assert.equal((await confirm(ids.provider)).body.code,'BILLING_CANCEL_FIRST');
    });
  }finally{await db.close();}
});
