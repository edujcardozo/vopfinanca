import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationConfig,registrationEmail,deliverRegistration,createRegistrationHandler} from '../standalone/server/registration.mjs';
const env={SUPABASE_URL:'https://vpo.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_server_only_test',VPO_SITE_URL:'https://vpo.netlify.app',RESEND_API_KEY:'re_transactional_test_secret',VPO_EMAIL_FROM:'VPO <acesso@vpo.test>'};
const actor='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const job={id:actor,lease:other,recipient:'edujcardozo@gmail.com',payload:{name:'<script>alert(1)</script>',email:'confirmed@example.test',phone:'11 99999-0000',requestedAt:'2026-10-20T12:00:00Z'}};
const request=(body={},extra={})=>new Request('https://vpo.netlify.app/.netlify/functions/vpo-registration?action=notify',{method:'POST',headers:{origin:env.VPO_SITE_URL,'Content-Type':'application/json',Authorization:'Bearer user-session',...extra},body:JSON.stringify(body)});
test('registration mail works independently of Asaas and rejects public-only or insecure configuration',()=>{
  assert.equal(registrationConfig(env).siteUrl,env.VPO_SITE_URL);
  for(const patch of [{SUPABASE_SECRET_KEY:'sb_publishable_not_secret'},{VPO_SITE_URL:'http://vpo.test'},{RESEND_API_KEY:''},{VPO_EMAIL_FROM:'VPO\r\nBcc:bad@bad.test'}])assert.throws(()=>registrationConfig({...env,...patch}),/configurado/);
});
test('registration message escapes user data and links to a logged-in admin screen without an approval token',()=>{
  const payload=registrationEmail(job,registrationConfig(env));assert.deepEqual(payload.to,['edujcardozo@gmail.com']);assert.doesNotMatch(payload.html,/<script>/);assert.match(payload.html,/&lt;script&gt;/);assert.match(payload.html,/https:\/\/vpo.netlify.app\/#plano\/ajustes/);assert.doesNotMatch(payload.html,/token=|decision=|approved=true/);
});
test('delivery records sent only after a positive provider response and reuses a stable idempotency key',async()=>{
  const calls=[],finishes=[];const db=async(action,actor,data)=>action==='claim'?{job}:(finishes.push(data),{ok:true});
  const fetcher=async(url,options)=>{calls.push({url,options});return Response.json({id:'resend-id'});};
  assert.equal((await deliverRegistration({config:registrationConfig(env),db,fetcher,actor})).sent,true);assert.equal(calls[0].options.headers['Idempotency-Key'],'vpo-registration/'+job.id);assert.equal(finishes[0].sent,true);assert.equal(finishes[0].providerId,'resend-id');
  await assert.rejects(deliverRegistration({config:registrationConfig(env),db,fetcher:async()=>new Response('',{status:503}),actor}),/tentado novamente/);assert.equal(finishes.at(-1).sent,false);
  await assert.rejects(deliverRegistration({config:registrationConfig(env),db,fetcher:async()=>Response.json({}),actor}),/tentado novamente/);assert.equal(finishes.at(-1).sent,false);
});
test('mail endpoint verifies live identity, origin and empty input; an account cannot notify for someone else',async()=>{
  let claimed=null,emails=0;const logs=[];
  const fetcher=async(url,options)=>{
    if(url.endsWith('/auth/v1/user')){assert.equal(options.headers.Authorization,'Bearer user-session');return Response.json({id:actor,email_confirmed_at:'2026-10-20'});}
    if(url.endsWith('/rpc/vpo_registration_delivery')){const body=JSON.parse(options.body);assert.equal(options.headers.apikey,env.SUPABASE_SECRET_KEY);if(body.p_action==='claim'){claimed=body.p_actor;return Response.json({job});}return Response.json({ok:true});}
    if(url==='https://api.resend.com/emails'){emails++;return Response.json({id:'accepted'});}throw new Error('Unexpected URL');
  };
  const handler=createRegistrationHandler({env,fetcher,logger:entry=>logs.push(entry)});
  assert.equal((await handler(request({userId:other}))).status,400);assert.equal(emails,0);
  assert.equal((await handler(request({}, {origin:'https://attacker.test'}))).status,403);
  assert.equal((await handler(request({}, {Authorization:''}))).status,401);
  assert.equal((await handler(request())).status,200);assert.equal(claimed,actor);assert.equal(emails,1);assert.equal(logs.length,0);
  const denied=createRegistrationHandler({env,fetcher:async()=>Response.json({id:actor,email_confirmed_at:null})});assert.equal((await denied(request())).status,401);
});
test('missing mail configuration reports an honest pending state without sending anything or logging secrets',async()=>{
  let called=0;const logs=[];const handler=createRegistrationHandler({env:{...env,RESEND_API_KEY:''},fetcher:async()=>called++,logger:entry=>logs.push(entry)});
  const response=await handler(request());assert.equal(response.status,503);assert.equal((await response.json()).code,'EMAIL_NOT_CONFIGURED');assert.equal(called,0);assert.deepEqual(logs,[{code:'EMAIL_NOT_CONFIGURED'}]);
});
