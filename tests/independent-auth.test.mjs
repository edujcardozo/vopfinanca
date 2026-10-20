import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailAuth,mountLogin} from '../standalone/auth.js';
import {accountStorage} from '../standalone/storage.js';
import {publicConfig} from '../standalone/config.js';
import {restoreSession,signOutDevice} from '../standalone/session.js';
import {dom} from './helpers/dom.mjs';
const waitFor=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Action did not finish');};
test('email flow creates/verifies a managed session without revealing account existence',async()=>{
  let clock=100000,requests=[],authorized=null;
  const session={user:{id:'10000000-0000-4000-8000-000000000001'}};
  const auth={signInWithOtp:async request=>{requests.push(request);return {error:null};},verifyOtp:async request=>{requests.push(request);return {data:{session},error:null};}};
  const flow=createEmailAuth({auth,now:()=>clock,onSession:s=>authorized=s});
  assert.equal(await flow.send('bad'),false);assert.equal(requests.length,0);
  assert.equal(await flow.send(' Edu@Example.test '),true);assert.deepEqual(requests[0],{email:'edu@example.test',options:{shouldCreateUser:false}});assert.equal(flow.state.stage,'code');
  assert.equal(await flow.send(flow.state.email),false);assert.equal(requests.length,1);
  assert.equal(await flow.verify('123'),false);assert.equal(authorized,null);
  clock+=60001;assert.equal(await flow.send(flow.state.email),true);
  assert.equal(await flow.verify('123456'),true);assert.deepEqual(requests.at(-1),{email:'edu@example.test',token:'123456',type:'email'});assert.equal(authorized,session);
});
test('expired, failed and duplicate requests never open a budget',async()=>{
  let release,open=false,calls=0;
  const auth={signInWithOtp:async()=>{calls++;await new Promise(r=>release=r);return {error:null};},verifyOtp:async()=>({error:{code:'otp_expired'}})};
  const flow=createEmailAuth({auth,onSession:()=>open=true});const sending=flow.send('x@example.test');assert.equal(flow.state.busy,true);assert.equal(await flow.send('x@example.test'),false);release();await sending;assert.equal(calls,1);
  assert.equal(await flow.verify('000000'),false);assert.equal(open,false);assert.match(flow.state.error,/expirou/);
  flow.changeEmail();assert.equal(flow.state.stage,'email');assert.equal(flow.state.email,'x@example.test');
});
test('mobile code field supports paste/autofill and an invitation stays in the URL',async()=>{
  const {document,event}=dom('<section id="login"></section>');let interval,verified=false;
  const hash='#plano/convite/'+'a'.repeat(64);
  const mounted=mountLogin({root:document.querySelector('section'),auth:{signInWithOtp:async()=>({error:null}),verifyOtp:async()=>({data:{session:{user:{id:'x'}}}})},onSession:()=>verified=true,windowObject:{location:{hash},setInterval:fn=>(interval=fn,1),clearInterval:()=>interval=null}});
  assert.equal(document.querySelector('#vpo-invite-preserved').hidden,false);
  const email=document.querySelector('#vpo-email');assert.equal(email.getAttribute('autocomplete'),'email');email.value='larissa@example.test';event(document.querySelector('#vpo-email-form'),'submit');await waitFor(()=>mounted.flow.state.stage==='code');
  const input=document.querySelector('#vpo-code');assert.equal(input.getAttribute('autocomplete'),'one-time-code');assert.equal(input.getAttribute('inputmode'),'numeric');assert.equal(document.activeElement,input);
  input.value='12 34a56';event(input,'input');assert.equal(input.value,'123456');event(document.querySelector('#vpo-code-form'),'submit');await waitFor(()=>verified);assert.equal(hash,'#plano/convite/'+'a'.repeat(64));mounted.destroy();assert.equal(interval,null);
});
test('local caches, pending operations and recoveries are isolated by authenticated account',()=>{
  const map=new Map([['ynab-edu-plan-v1','previous ChatGPT budget']]);const raw={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
  const a=accountStorage(raw,'vpo.supabase.co','10000000-0000-4000-8000-000000000001'),b=accountStorage(raw,'vpo.supabase.co','10000000-0000-4000-8000-000000000002');
  assert.equal(a.getItem('ynab-edu-plan-v1'),null);a.setItem('ynab-edu-plan-v1','A');a.setItem('ynab-edu-outbox-v1-123','pendingA');b.setItem('ynab-edu-plan-v1','B');assert.equal(b.getItem('ynab-edu-outbox-v1-123'),null);assert.equal(a.length,2);assert.equal(b.length,1);
  a.clear();assert.equal(b.getItem('ynab-edu-plan-v1'),'B');assert.equal(raw.getItem('ynab-edu-plan-v1'),'previous ChatGPT budget');
});
test('independent build rejects secret keys and missing configuration',()=>{
  const valid={VPO_SUPABASE_URL:'https://vpo.supabase.co',VPO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example_public_configuration'};
  assert.equal(publicConfig(valid).url,'https://vpo.supabase.co');
  assert.throws(()=>publicConfig({}),/Configure/);assert.throws(()=>publicConfig({...valid,VPO_SUPABASE_PUBLISHABLE_KEY:'sb_secret_123456789012345678901234567890'}),/proibidas/);
  const secret='eyJ.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';assert.throws(()=>publicConfig({...valid,VPO_SUPABASE_PUBLISHABLE_KEY:secret}),/proibidas/);
  assert.throws(()=>publicConfig({...valid,VPO_SUPABASE_URL:'http://vpo.supabase.co'}),/HTTPS/);
});
test('restoring a session verifies its identity online and allows the same account cache offline',async()=>{
  const session={user:{id:'verified-user'}};let checks=0;
  const auth={getSession:async()=>({data:{session}}),getUser:async()=>{checks++;return {data:{user:session.user}};}};
  assert.equal(await restoreSession(auth),session);assert.equal(checks,1);
  auth.getUser=async()=>{throw new Error('An offline restore must not request the server');};assert.equal(await restoreSession(auth,{online:false}),session);
  auth.getUser=async()=>({data:{user:{id:'different-user'}}});assert.equal(await restoreSession(auth),null);
  auth.getUser=async()=>({error:{name:'AuthApiError',status:401}});assert.equal(await restoreSession(auth),null);
});
test('sign-out waits for confirmed writes, preserves pending data and clears only after local session termination',async()=>{
  let cleared=0,stopped=0,signedOut=0,flushed=0;
  const sync={flush:async()=>flushed++,stop:()=>stopped++,status:{initialized:true,dirty:true,conflict:false}};
  const auth={signOut:async options=>{assert.equal(options.scope,'local');signedOut++;return {error:null};}};
  const storage={clear:()=>cleared++};assert.equal((await signOutDevice({auth,sync,storage})).ok,false);assert.equal(signedOut,0);assert.equal(cleared,0);
  sync.status.dirty=false;sync.status.conflict=true;assert.equal((await signOutDevice({auth,sync,storage})).ok,false);assert.equal(cleared,0);
  sync.status.conflict=false;auth.signOut=async()=>({error:{message:'offline'}});assert.equal((await signOutDevice({auth,sync,storage})).ok,false);assert.equal(cleared,0);
  auth.signOut=async options=>{assert.deepEqual(options,{scope:'local'});return {error:null};};assert.equal((await signOutDevice({auth,sync,storage})).ok,true);assert.equal(cleared,1);assert.equal(stopped,1);assert.equal(flushed,4);
});
