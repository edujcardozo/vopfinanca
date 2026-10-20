import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createGateway,monthlyPeriod,paymentRecord,webhookTokenMatches} from '../standalone/server/asaas.mjs';
import {createBillingHandler,serverConfig} from '../standalone/server/http.mjs';
import {createBillingClient} from '../standalone/billing-client.js';

const owner='30000000-0000-4000-8000-000000000001',other='30000000-0000-4000-8000-000000000002';
test('Asaas gateway uses PostgreSQL reservations, a trusted price and canonical provider objects',async t=>{
  const pg=new PGlite();
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  for(const file of ['database.sql','billing.sql','asaas.sql'])await pg.exec(await readFile(new URL('../standalone/'+file,import.meta.url),'utf8'));
  for(const uid of [owner,other])await pg.query('insert into auth.users values($1,$2,now())',[uid,uid+'@example.test']);
  const rpc=(name,args,role='service_role')=>pg.transaction(async tx=>{await tx.exec('set local role '+role);return (await tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as data',args)).rows[0].data;});
  const request=(who,path,body={},method='GET')=>pg.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[who]);await tx.exec('set local role authenticated');return (await tx.query('select public.vpo_api($1,$2,$3::jsonb) as data',[method,path,JSON.stringify(body)])).rows[0].data;});
  const db={gateway:(action,who,data)=>rpc('vpo_billing_gateway',[action,who,JSON.stringify(data)]),event:(id,who,data)=>rpc('vpo_billing_verified_event',[id,who,JSON.stringify(data)])};
  const context=()=>db.gateway('context',owner,{environment:'sandbox'});
  const calls=[];let canonical=null,subscription=null;
  const asaas=async(path,options={})=>{
    calls.push({path,options});
    if(path==='/checkouts'&&options.method==='POST')return {id:'checkout_00000002'};
    if(path.startsWith('/payments?'))return {data:canonical?[canonical]:[],hasMore:false};
    if(path==='/payments/pay_00000001')return canonical;
    if(path==='/subscriptions/sub_00000001'&&options.method==='DELETE'){subscription={...subscription,deleted:true};return {deleted:true,id:'sub_00000001'};}
    if(path==='/subscriptions/sub_00000001')return subscription;
    if(path==='/checkouts/checkout_00000001/cancel')return {status:'CANCELED'};
    throw new Error('Unexpected test API path '+path);
  };
  const gateway=createGateway({db,asaas,environment:'sandbox',siteUrl:'https://vpo.example.test'});
  try{
    await t.test('price is R$12.90, commercial mode stays off, and browser roles cannot access the gateway',async()=>{
      const info=(await request(owner,'/api/billing')).body;
      assert.equal(info.monthlyCents,1290);assert.equal(info.enabled,false);assert.deepEqual(info.allowedMethods,['credit_card']);
      await assert.rejects(rpc('vpo_billing_gateway',['context',owner,'{"environment":"sandbox"}'],'authenticated'),/permission denied/);
      await assert.rejects(rpc('vpo_billing_gateway',['context',owner,'{"environment":"sandbox"}'],'anon'),/permission denied/);
      await assert.rejects(pg.exec('set role authenticated;select * from vpo_private.billing_checkouts'),/permission denied/);await pg.exec('reset role');
      await pg.exec('update vpo_private.billing_config set enabled=true,checkout_ready=true');
      assert.equal((await request(owner,'/api/billing/quote',{paymentMethod:'pix_automatic',consent:true,termsVersion:'vpo-asaas-monthly-v1'},'POST')).body.code,'BILLING_METHOD_UNAVAILABLE');
      const quote=(await request(owner,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-asaas-monthly-v1',monthlyCents:1},'POST')).body;
      assert.equal(quote.monthlyCents,1290);assert.equal(new Date(quote.trialEndsAt)-new Date(quote.trialStartedAt),15*86400000);
    });
    await t.test('a pending reservation never creates a second checkout, even after a timeout',async()=>{
      const first=await db.gateway('prepare',owner,{environment:'sandbox'});assert.equal(first.create,true);
      const second=await db.gateway('prepare',owner,{environment:'sandbox'});assert.equal(second.create,false);assert.equal(second.attemptId,first.attemptId);
      await assert.rejects(gateway.start(owner),/preparada/);assert.equal(calls.filter(c=>c.path==='/checkouts').length,0);
      await assert.rejects(db.gateway('attach',owner,{environment:'sandbox',attemptId:other,checkoutId:'checkout_00000001'}),/identity mismatch/);
      await db.gateway('attach',owner,{environment:'sandbox',attemptId:first.attemptId,checkoutId:'checkout_00000001'});
      await assert.rejects(db.gateway('context',owner,{environment:'production'}),/environment mismatch/);
    });
    await t.test('a known checkout is reused; caller price, dates and owner cannot change its scope',async()=>{
      const result=await gateway.start(owner);assert.match(result.url,/sandbox\.asaas\.com/);
      await gateway.start(owner);assert.equal(calls.filter(c=>c.path==='/checkouts').length,0);
      const info=(await request(owner,'/api/billing')).body;
      canonical={id:'pay_00000001',checkoutSession:'checkout_00000001',customer:'cus_00000001',subscription:'sub_00000001',billingType:'CREDIT_CARD',value:12.9,status:'PENDING',dueDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(info.firstChargeAt))};
      subscription={id:'sub_00000001',customer:'cus_00000001',billingType:'CREDIT_CARD',cycle:'MONTHLY',value:12.9,status:'ACTIVE',creditCard:{creditCardToken:'sandbox-only-fake-token'}};
    });
    await t.test('forged webhook financial fields do not mark a payment paid; the canonical card authorization unlocks only the trial',async()=>{
      await gateway.webhook({id:'evt_canonical_0001',event:'PAYMENT_RECEIVED',payment:{id:'pay_00000001',status:'RECEIVED',value:0.01,ownerId:other}});
      const info=(await request(owner,'/api/billing')).body;assert.equal(info.phase,'trialing');assert.equal(info.paidUntil,null);
      assert.equal((await pg.query('select count(*)::int as n from vpo_private.billing_payments')).rows[0].n,0);
      assert.equal((await request(other,'/api/billing')).body.phase,'choose_payment');
      await gateway.webhook({id:'evt_duplicate_0001',event:'PAYMENT_RECEIVED',payment:{id:'pay_00000001'}});
      assert.equal((await pg.query('select count(*)::int as n from vpo_private.billing_events')).rows[0].n,1);
    });
    await t.test('different values, subscriptions and early card captures cannot extend access',async()=>{
      const original=canonical;canonical={...canonical,value:0.01};await assert.rejects(gateway.webhook({id:'evt_bad_00000001',event:'PAYMENT_RECEIVED',payment:{id:'pay_00000001'}}),/valor/);canonical=original;
      assert.throws(()=>paymentRecord({...canonical,status:'RECEIVED',paymentDate:'2000-01-01'}, {ownerId:owner,firstChargeAt:(new Date(Date.now()+15*86400000)).toISOString(),monthlyCents:1290,customerId:'cus_00000001',subscriptionId:'sub_00000001'}),/anterior/);
    });
    await t.test('cancellation is completed at Asaas before local confirmation and prevents another trial',async()=>{
      await gateway.cancel(owner);
      assert.ok(calls.some(c=>c.path==='/subscriptions/sub_00000001'&&c.options.method==='DELETE'));
      assert.ok((await context()).canceledAt);assert.equal((await request(owner,'/api/billing')).body.phase,'canceled');
      assert.equal((await request(owner,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-asaas-monthly-v1'},'POST')).body.code,'BILLING_CANCELLATION_PENDING');
      await assert.rejects(gateway.start(owner),/canceled/);
    });
    await t.test('new checkout creation sends only recurring card settings, the trusted price and a future first date',async()=>{
      const quote=(await request(other,'/api/billing/quote',{paymentMethod:'credit_card',consent:true,termsVersion:'vpo-asaas-monthly-v1'},'POST')).body;
      const result=await gateway.start(other);assert.match(result.url,/checkout_00000002/);
      const sent=calls.find(c=>c.path==='/checkouts'&&c.options.method==='POST').options.body;
      assert.deepEqual(sent.billingTypes,['CREDIT_CARD']);assert.deepEqual(sent.chargeTypes,['RECURRENT']);assert.equal(sent.items[0].value,12.9);assert.equal(sent.subscription.cycle,'MONTHLY');
      assert.ok(new Date(sent.subscription.nextDueDate.replace(' ','T')+'-03:00')>=new Date(quote.trialEndsAt));
      assert.equal(sent.creditCard,undefined);assert.equal(sent.customerData,undefined);assert.equal(sent.callback.successUrl,'https://vpo.example.test/#plano');
      assert.equal((await request(other,'/api/billing')).body.phase,'awaiting_authorization');
    });
  }finally{await pg.close();}
});

test('monthly periods preserve the first billing day across short months and leap years',()=>{
  const account={firstChargeAt:'2027-01-31T03:00:00Z'};
  assert.deepEqual(monthlyPeriod({dueDate:'2027-02-28'},account),{periodStart:'2027-02-28T03:00:00.000Z',periodEnd:'2027-03-31T03:00:00.000Z'});
  assert.throws(()=>monthlyPeriod({dueDate:'2027-02-27'},account),/data/);
  assert.equal(monthlyPeriod({dueDate:'2028-02-29'},account).periodEnd,'2028-03-31T03:00:00.000Z');
});

test('the Netlify boundary requires a private key, exact origin, live confirmed identity and a separate webhook secret',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture_only',VPO_SITE_URL:'https://vpo.example.test',ASAAS_ENVIRONMENT:'sandbox',ASAAS_API_KEY:'sandbox-fake-key',ASAAS_WEBHOOK_TOKEN:'sandbox-webhook-token-with-more-than-32-characters',VPO_BILLING_ENABLED:'true'};
  assert.throws(()=>serverConfig({...env,SUPABASE_SECRET_KEY:'sb_publishable_fixture'}),/preparadas/);
  assert.throws(()=>serverConfig({...env,VPO_BILLING_ENABLED:'false'}),/preparadas/);
  assert.equal(webhookTokenMatches('wrong',env.ASAAS_WEBHOOK_TOKEN),false);assert.equal(webhookTokenMatches(env.ASAAS_WEBHOOK_TOKEN,env.ASAAS_WEBHOOK_TOKEN),true);
  const requests=[];const fetcher=async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({id:owner,email_confirmed_at:null}),{headers:{'Content-Type':'application/json'}});};
  const handler=createBillingHandler({env,fetcher});
  const req=(action,headers={},body='{}')=>new Request('https://vpo.example.test/.netlify/functions/vpo-billing?action='+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://vpo.example.test',...headers},body});
  assert.equal((await handler(req('start',{Origin:'https://attacker.test'}))).status,403);
  assert.equal((await handler(req('start'))).status,401);
  assert.equal((await handler(req('start',{Authorization:'Bearer fake-session'},JSON.stringify({ownerId:other})))).status,400);
  assert.equal((await handler(req('start',{Authorization:'Bearer fake-session'}))).status,401);
  assert.equal(requests.length,1);assert.ok(requests[0].url.endsWith('/auth/v1/user'));
  assert.equal((await handler(req('webhook',{'asaas-access-token':'wrong'}))).status,401);
});

test('the browser sends no customer ID, card details or price and refuses foreign checkout URLs',async()=>{
  const requests=[],navigated=[];let response={url:'https://asaas.com/checkoutSession/show?id=checkout_00000001'};
  const client=createBillingClient({auth:{getSession:async()=>({data:{session:{access_token:'fake-session'}}})},fetcher:async(path,options)=>{requests.push({path,options});return new Response(JSON.stringify(response));},navigate:url=>navigated.push(url)});
  await client.checkout();assert.equal(navigated.length,1);assert.equal(requests[0].options.body,'{}');
  response={url:'https://attacker.test/checkoutSession/show?id=checkout_00000001'};
  await assert.rejects(client.checkout(),/link/);assert.equal(navigated.length,1);
});
