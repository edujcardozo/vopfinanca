import test from 'node:test';
import assert from 'node:assert/strict';
import {gmailTransportOptions,sendGmailRegistration} from '../standalone/server/gmail.mjs';
import {registrationConfig,registrationEmail,deliverRegistration,createRegistrationHandler} from '../standalone/server/registration.mjs';
import {authMessage} from '../standalone/auth.js';
const actor='30000000-0000-4000-8000-000000000001',lease='30000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://vpo.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_server_only_test',VPO_SITE_URL:'https://vpo.netlify.app',VPO_EMAIL_PROVIDER:'gmail',GMAIL_USER:'edujcardozo@gmail.com',GMAIL_APP_PASSWORD:'abcd efgh ijkl mnop'};
const job={id:actor,lease,recipient:'edujcardozo@gmail.com',payload:{name:'Cadastro de Teste',email:'cliente@example.test',phone:'',requestedAt:'2026-10-20T16:00:00Z'}};
const req=(body={})=>new Request(env.VPO_SITE_URL+'/.netlify/functions/vpo-registration',{method:'POST',headers:{Origin:env.VPO_SITE_URL,'Content-Type':'application/json',Authorization:'Bearer verified-session'},body:JSON.stringify(body)});
test('Gmail setup requires no domain or Resend key and keeps the sender bound to the authenticated account',()=>{
  const config=registrationConfig({...env,GMAIL_USER:' EDUJCARDOZO@GMAIL.COM ',VPO_EMAIL_FROM:'Someone <other@example.test>'});
  assert.equal(config.provider,'gmail');assert.equal(config.gmailUser,'edujcardozo@gmail.com');assert.equal(config.gmailPassword,'abcdefghijklmnop');assert.equal(config.from,'VPO <edujcardozo@gmail.com>');assert.equal(config.resendKey,undefined);
  for(const patch of [{GMAIL_USER:'x@domain.test'},{GMAIL_USER:'x@gmail.com\r\nBcc:a@x.test'},{GMAIL_APP_PASSWORD:''},{GMAIL_APP_PASSWORD:'ordinary-password'},{VPO_EMAIL_PROVIDER:'unknown'},{SUPABASE_SECRET_KEY:'sb_publishable_public_only'}])assert.throws(()=>registrationConfig({...env,...patch}),/configurado/);
});
test('SMTP uses validated TLS, fixed Gmail host, private credentials and one server-selected recipient',async()=>{
  const config=registrationConfig(env);let options,message,closed=0;
  const transport={sendMail:async input=>(message=input,{accepted:[job.recipient],messageId:input.messageId}),close:()=>closed++};
  const result=await sendGmailRegistration(config,job,{...registrationEmail(job,config),from:'spoof@example.test',to:['attacker@example.test']},input=>(options=input,transport));
  assert.equal(options.host,'smtp.gmail.com');assert.equal(options.port,465);assert.equal(options.secure,true);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.tls.minVersion,'TLSv1.2');assert.equal(options.auth.pass,'abcdefghijklmnop');
  for(const key of ['logger','debug','transactionLog'])assert.equal(options[key],false);
  assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true);assert.equal(options.maxRecipients,1);
  assert.deepEqual(message.envelope,{from:config.gmailUser,to:[job.recipient]});assert.equal(message.from,config.from);assert.deepEqual(message.to,[job.recipient]);assert.equal(result,`<vpo-registration.${job.id}@gmail.com>`);assert.equal(closed,1);
});
test('SMTP rejection and connection failures always close the transport and do not count as successful delivery',async()=>{
  const config=registrationConfig(env);let closed=0;
  await assert.rejects(sendGmailRegistration(config,job,{},()=>({sendMail:async()=>({accepted:['someone-else@example.test'],messageId:'wrong'}),close:()=>closed++})),/did not accept/);
  await assert.rejects(sendGmailRegistration(config,job,{},()=>({sendMail:async()=>{throw new Error('SMTP failed');},close:()=>closed++})),/SMTP failed/);assert.equal(closed,2);
});
test('Gmail notifications use the existing leased outbox, require SMTP acceptance and never call Resend',async()=>{
  const finishes=[];const config=registrationConfig(env),db=async(action,uid,data)=>action==='claim'?{job}:(finishes.push(data),{ok:true});
  let sent=0;
  await deliverRegistration({config,db,actor,fetcher:async()=>assert.fail('No Resend request expected'),smtpSend:async(c,j,m)=>{sent++;assert.equal(c.provider,'gmail');assert.deepEqual(m.to,[job.recipient]);return '<smtp-accepted@gmail.com>';}});
  assert.equal(sent,1);assert.equal(finishes[0].sent,true);assert.equal(finishes[0].providerId,'<smtp-accepted@gmail.com>');
  await assert.rejects(deliverRegistration({config,db,actor,smtpSend:async()=>{throw new Error('SMTP failed');}}),/tentado novamente/);assert.equal(finishes.at(-1).sent,false);
});
test('Gmail endpoint verifies identity and rejects browser-chosen messages, SMTP credentials and recipients',async()=>{
  let claimed=null,sends=0;const logs=[];
  const fetcher=async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,email_confirmed_at:'2026-10-20'});
    if(url.endsWith('/rpc/vpo_registration_delivery')){const b=JSON.parse(options.body);if(b.p_action==='claim'){claimed=b.p_actor;return Response.json({job});}return Response.json({ok:true});}
    assert.fail('Unexpected URL');
  };
  const handler=createRegistrationHandler({env,fetcher,logger:entry=>logs.push(entry),smtpSend:async()=>{sends++;return '<gmail-accepted@gmail.com>';}});
  assert.equal((await handler(req({recipient:'attacker@example.test',gmailPassword:'password',smtpHost:'attacker.test'}))).status,400);assert.equal(sends,0);
  assert.equal((await handler(req())).status,200);assert.equal(claimed,actor);assert.equal(sends,1);assert.equal(logs.length,0);
  const failed=createRegistrationHandler({env,fetcher,logger:entry=>logs.push(entry),smtpSend:async()=>{throw new Error(env.GMAIL_APP_PASSWORD);}});
  const response=await failed(req());assert.equal(response.status,503);assert.equal((await response.json()).code,'EMAIL_PROVIDER_UNAVAILABLE');assert.deepEqual(logs,[{code:'EMAIL_PROVIDER_UNAVAILABLE'}]);
});
test('mail quota exhaustion is distinguished from a short request cooldown',()=>{
  assert.match(authMessage({status:429,code:'over_email_send_rate_limit'}),/limite de envios/);
  assert.match(authMessage({status:429,code:'over_request_rate_limit'}),/Aguarde um pouco/);
  assert.equal(gmailTransportOptions(registrationConfig(env)).ignoreTLS,undefined);
});
