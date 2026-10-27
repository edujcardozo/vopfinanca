import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {createState,id} from '../web/core.js';
test('freeze and removal deny existing authenticated clients; verified Pix resumes the exact budget',async()=>{
 const db=new PGlite(),ids={admin:'50000000-0000-4000-8000-000000000001',customer:'50000000-0000-4000-8000-000000000002',guest:'50000000-0000-4000-8000-000000000003'};
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
 for(const file of ['database.sql','billing.sql','asaas.sql','registration.sql','participants.sql','access-management.sql','manual-pix.sql','savings-goals.sql','plan-freeze.sql'])await db.exec(await readFile(new URL('../standalone/'+file,import.meta.url),'utf8'));
 for(const [name,uid]of Object.entries(ids))await db.query('insert into auth.users values($1,$2,now())',[uid,name==='admin'?'edujcardozo@gmail.com':name+'@example.test']);
 const req=(actor,path,body={},method='GET')=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await tx.exec('set local role authenticated');return (await tx.query('select public.vpo_api($1,$2,$3::jsonb) r',[method,path,JSON.stringify(body)])).rows[0].r;});
 const admin=(path,body)=>req(ids.admin,'/api/access'+path,body,'POST');const manage=action=>admin('/manage',{userId:ids.customer,action,confirm:true});
 for(const [name,uid]of Object.entries(ids))await req(uid,'/api/access/register',{fullName:name+' pessoa',purpose:name==='guest'?'guest':'personal'},'POST');
 await admin('/decision',{userId:ids.customer,decision:'approved'});
 await db.exec("update vpo_private.manual_pix_config set enabled=true,pix_key='11144477735',merchant_name='VPO FINANCAS',merchant_city='PORTO ALEGRE',whatsapp='5511999990000'");
 const state=createState(false,'2026-10');state.months['2026-10'].transactions=[{id:'saved-expense',date:'2026-10-02',amount:1500,type:'expense',categoryId:'mercado',description:'Compra',payee:'Mercado'}];
 assert.equal((await req(ids.customer,'/api/plan',{scopeId:ids.customer,revision:0,mutationId:id(),state},'PUT')).status,200);
 const stored=(await req(ids.customer,'/api/plan')).body;
 await db.query('insert into vpo_private.members(owner_id,member_id) values($1,$2)',[ids.customer,ids.guest]);await db.query('insert into vpo_private.preferences(user_id,active_owner_id) values($1,$2)',[ids.guest,ids.customer]);
 assert.equal((await req(ids.guest,'/api/plan')).status,200);
 assert.equal((await req(ids.customer,'/api/access/manage',{userId:ids.customer,action:'freeze',confirm:true},'POST')).status,403);
 assert.equal((await manage('freeze')).status,200);
 assert.equal((await req(ids.customer,'/api/access')).body.status,'frozen');assert.equal((await req(ids.customer,'/api/access')).body.canUse,false);
 for(const actor of [ids.customer,ids.guest])for(const [path,method]of [['/api/plan','GET'],['/api/plan/head','GET'],['/api/plan','PUT'],['/api/sharing','GET']])assert.equal((await req(actor,path,method==='PUT'?{scopeId:ids.customer,revision:stored.revision,mutationId:id(),state}:{},method)).status,403);
 const renewal=(await req(ids.customer,'/api/access/renewal')).body;assert.equal(renewal.phase,'frozen');assert.equal(renewal.manualPix.amountCents,1290);assert.equal(renewal.state,undefined);
 assert.equal((await req(ids.guest,'/api/access/renewal')).body.manualPix,undefined);
 const list=(await admin('/requests',{status:'frozen'})).body;assert.equal(list.items.length,1);assert.ok(list.items[0].frozenAt);
 assert.equal((await admin('/pix',{userId:ids.customer,requestId:id(),paymentVersion:renewal.manualPaymentVersion,confirm:false})).status,409);assert.equal((await req(ids.customer,'/api/access')).body.status,'frozen');
 const payment={userId:ids.customer,requestId:id(),paymentVersion:renewal.manualPaymentVersion,confirm:true};assert.equal((await admin('/pix',payment)).status,200);assert.equal((await admin('/pix',payment)).body.replayed,true);
 assert.equal((await req(ids.customer,'/api/access')).body.canUse,true);assert.deepEqual((await req(ids.customer,'/api/plan')).body.state,stored.state);assert.equal((await req(ids.guest,'/api/plan')).status,200);
 assert.equal((await manage('revoke')).status,200);assert.equal((await req(ids.customer,'/api/plan')).status,403);assert.equal((await req(ids.guest,'/api/plan')).status,403);
 const removed=(await req(ids.customer,'/api/access/renewal')).body;assert.equal(removed.manualPix.ready,true);
 assert.equal((await admin('/pix',{userId:ids.customer,requestId:id(),paymentVersion:'stale',confirm:true})).status,409);assert.equal((await req(ids.customer,'/api/access')).body.status,'revoked');
 assert.equal((await admin('/pix',{userId:ids.customer,requestId:id(),paymentVersion:removed.manualPaymentVersion,confirm:true})).status,200);assert.deepEqual((await req(ids.customer,'/api/plan')).body.state,stored.state);
 for(const fn of ['retained_plan_api','retained_billing_access','retained_access_info'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query(fn==='retained_plan_api'?`select vpo_private.${fn}('GET','/api/plan','{}')`:`select vpo_private.${fn}('${ids.customer}')`);}),/permission denied/);
 }finally{await db.close();}
});
