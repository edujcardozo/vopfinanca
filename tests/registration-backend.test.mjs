import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createState,id} from '../web/core.js';
const admin='10000000-0000-4000-8000-000000000001',customer='10000000-0000-4000-8000-000000000002',guest='10000000-0000-4000-8000-000000000003',rejected='10000000-0000-4000-8000-000000000004',unverified='10000000-0000-4000-8000-000000000005',attacker='10000000-0000-4000-8000-000000000006';
test('manual approval and invitation authorization run in the real SQL API',async t=>{
  const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  for(const file of ['database.sql','billing.sql','asaas.sql','registration.sql'])await db.exec(await readFile(new URL('../standalone/'+file,import.meta.url),'utf8'));
  for(const [uid,email] of [[admin,'edujcardozo@gmail.com'],[customer,'cliente@example.test'],[guest,'convidada@example.test'],[rejected,'recusado@example.test'],[unverified,'not-verified@example.test'],[attacker,'attacker@example.test']])await db.query('insert into auth.users values($1,$2,$3,$4::jsonb)',[uid,email,uid===unverified?null:new Date().toISOString(),JSON.stringify({admin:true,status:'approved',role:'service_role',email:'edujcardozo@gmail.com'})]);
  const request=(actor,path,body={},method='GET')=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role authenticated');return (await tx.query('select public.vpo_api($1,$2,$3::jsonb) as result',[method,path,JSON.stringify(body)])).rows[0].result;});
  const register=(actor,purpose='personal',more={})=>request(actor,'/api/access/register',{fullName:'Pessoa de Teste',phone:'(11) 99999-0000',purpose,...more},'POST');
  const delivery=(action,actor=null,data={},role='service_role')=>db.transaction(async tx=>{await tx.exec('set local role '+role);return (await tx.query('select public.vpo_registration_delivery($1,$2,$3::jsonb) as result',[action,actor,JSON.stringify(data)])).rows[0].result;});
  const state=createState(false,'2026-10');let invitation;
  try{
    await t.test('verified identity is required and client metadata cannot grant approval or administration',async()=>{
      assert.equal((await request(null,'/api/access')).status,401);assert.equal((await request(unverified,'/api/access')).status,401);
      assert.equal((await request(attacker,'/api/access')).body.isAdmin,false);
      assert.equal((await request(attacker,'/api/plan')).body.code,'ACCESS_PROFILE_REQUIRED');
      const a=(await request(admin,'/api/access')).body;assert.equal(a.isAdmin,true);assert.equal(a.hasProfile,false);
      assert.equal((await register(admin)).body.canUse,true);
      assert.equal((await request(admin,'/api/plan',{scopeId:admin,revision:0,mutationId:id(),state},'PUT')).status,200);
    });
    await t.test('new personal accounts require approval for reads and writes; duplicate submissions keep one request',async()=>{
      for(const patch of [{fullName:''},{fullName:'x'},{fullName:{bad:true}},{phone:'not-a-number'},{purpose:'approved'}])assert.equal((await register(customer,'personal',patch)).status,400);
      const response=await register(customer,'personal',{status:'approved',isAdmin:true,userId:admin});assert.equal(response.body.status,'pending');assert.equal(response.body.canUse,false);
      await register(customer,'personal',{fullName:'Cliente Atualizado'});
      assert.equal((await db.query('select count(*)::int n from vpo_private.registration_mail')).rows[0].n,1);
      for(const [path,method] of [['/api/plan','GET'],['/api/plan/head','GET'],['/api/sharing','GET'],['/api/billing','GET'],['/api/plan','PUT'],['/api/sharing/invites','POST']])assert.equal((await request(customer,path,{},method)).body.code,'ACCESS_PENDING');
      for(const table of ['access_config','registrations','registration_mail'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from vpo_private.'+table);}),/permission denied/);
      for(const fn of ['approved_plan_api','billing_api','plan_api'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query(`select vpo_private.${fn}('GET','/api/plan','{}')`);}),/permission denied/);
    });
    await t.test('mail jobs are private, leased, retried and acknowledged only after provider acceptance',async()=>{
      for(const role of ['anon','authenticated'])await assert.rejects(delivery('claim',customer,{},role),/permission denied/);
      const {job}=await delivery('claim',customer);assert.equal(job.recipient,'edujcardozo@gmail.com');assert.equal(job.payload.email,'cliente@example.test');assert.equal(job.payload.name,'Pessoa de Teste');
      assert.equal((await delivery('claim',customer)).job,null);
      assert.equal((await delivery('finish',null,{id:job.id,lease:guest,sent:true,providerId:'forged'})).ok,false);
      await delivery('finish',null,{id:job.id,lease:job.lease,sent:false});assert.equal((await request(customer,'/api/access')).body.notification,'queued');assert.equal((await delivery('claim',customer)).job,null);
      await db.query("update vpo_private.registration_mail set next_attempt_at=now() where user_id=$1",[customer]);
      const retried=(await delivery('claim',customer)).job;assert.equal(retried.id,job.id);assert.notEqual(retried.lease,job.lease);
      await delivery('finish',null,{id:retried.id,lease:retried.lease,sent:true,providerId:'provider-accepted'});
      assert.equal((await request(customer,'/api/access')).body.notification,'sent');assert.equal((await delivery('claim',customer)).job,null);
      await register(customer);assert.equal((await request(customer,'/api/access')).body.notification,'sent');
    });
    await t.test('a guest must confirm an explicit valid invitation and cannot open an unapproved personal budget',async()=>{
      const response=await register(guest,'guest');assert.equal(response.body.status,'guest');assert.equal(response.body.canUse,false);assert.equal(response.body.notification,'none');
      assert.equal((await request(guest,'/api/plan')).status,403);
      assert.equal((await request(guest,'/api/sharing/accept',{token:'0'.repeat(64)},'POST')).status,410);
      invitation=(await request(admin,'/api/sharing/invites',{},'POST')).body;
      assert.equal((await request(guest,'/api/sharing/preview',{token:invitation.token},'POST')).body.ownerEmail,'edujcardozo@gmail.com');
      assert.equal((await request(guest,'/api/access')).body.canUse,false);
      assert.equal((await request(guest,'/api/sharing/accept',{token:invitation.token},'POST')).status,200);
      assert.equal((await request(guest,'/api/access')).body.canUse,true);
      assert.equal((await request(guest,'/api/plan')).body.state.planId,state.planId);
      const plans=(await request(guest,'/api/sharing')).body.plans;assert.deepEqual(plans.map(x=>x.id),[admin]);
      assert.equal((await request(guest,'/api/sharing/switch',{scopeId:guest},'POST')).body.code,'ACCESS_PENDING');
      assert.equal((await request(guest,'/api/access')).body.canUse,true);
    });
    await t.test('only the owner can review the queue and approve accounts; approval does not activate billing',async()=>{
      assert.equal((await request(customer,'/api/access/requests',{},'POST')).status,403);
      assert.equal((await request(customer,'/api/access/decision',{userId:customer,decision:'approved'},'POST')).status,403);
      const list=(await request(admin,'/api/access/requests',{},'POST')).body;assert.equal(list.total,1);assert.equal(list.items[0].name,'Pessoa de Teste');assert.equal(list.items[0].phone,'(11) 99999-0000');
      assert.equal((await request(admin,'/api/access/decision',{userId:customer,decision:'approved'},'POST')).status,200);
      assert.equal((await request(admin,'/api/access/decision',{userId:customer,decision:'approved'},'POST')).status,200);
      assert.equal((await request(customer,'/api/access')).body.canUse,true);assert.equal((await request(customer,'/api/plan')).body.state,null);
      const audit=(await db.query('select decided_by,decided_at from vpo_private.registrations where user_id=$1',[customer])).rows[0];assert.equal(audit.decided_by,admin);assert.ok(audit.decided_at);
      assert.equal((await db.query('select enabled from vpo_private.billing_config')).rows[0].enabled,false);
    });
    await t.test('rejected accounts cannot resubmit, accept invitations or read budget data',async()=>{
      await register(rejected);assert.equal((await request(admin,'/api/access/decision',{userId:rejected,decision:'rejected'},'POST')).status,200);
      assert.equal((await register(rejected)).body.code,'ACCESS_REJECTED');assert.equal((await request(rejected,'/api/plan')).body.code,'ACCESS_REJECTED');
      assert.equal((await request(rejected,'/api/sharing/accept',{token:invitation.token},'POST')).body.code,'ACCESS_REJECTED');assert.equal((await delivery('claim',rejected)).job,null);
      assert.equal((await request(admin,'/api/access/decision',{userId:rejected,decision:'approved'},'POST')).status,409);
    });
    await t.test('removing a guest immediately revokes cloud reads and writes without granting personal access',async()=>{
      assert.equal((await request(admin,'/api/sharing/remove-member',{memberId:guest},'POST')).status,200);
      assert.equal((await request(guest,'/api/access')).body.canUse,false);assert.equal((await request(guest,'/api/plan')).status,403);
      await register(guest,'personal');assert.equal((await request(guest,'/api/access')).body.status,'pending');
    });
    await t.test('admin authorization stays bound to the verified immutable UUID after an email change',async()=>{
      await db.query("update auth.users set email='owner-new@example.test' where id=$1",[admin]);await db.query("update auth.users set email='edujcardozo@gmail.com' where id=$1",[attacker]);
      assert.equal((await request(attacker,'/api/access')).body.isAdmin,false);assert.equal((await request(admin,'/api/access')).body.isAdmin,true);
    });
  }finally{await db.close();}
});
