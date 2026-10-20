import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLogin,createEmailAuth} from '../standalone/auth.js';
import {mountAccessGate,mountRegistrationAdmin,accessAPI} from '../standalone/registration.js';
import {createSupabaseTransport} from '../standalone/api.js';
import {dom} from './helpers/dom.mjs';
const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Action did not finish');};
const windowFor=(hash='')=>({location:{hash},history:{replaceState(){}},setInterval:()=>1,clearInterval(){}});
test('login, registration and invitation have distinct fields and retain the OTP context',async()=>{
  const {document,event}=dom('<section></section>');let sent,context;
  const auth={signInWithOtp:async input=>(sent=input,{error:null}),verifyOtp:async()=>({data:{session:{user:{id:'new-user'}}}})};
  const view=mountLogin({root:document.querySelector('section'),auth,windowObject:windowFor(),onSession:(session,intent)=>context=intent});
  assert.equal(document.querySelectorAll('[data-access-mode]').length,3);assert.equal(document.querySelector('#vpo-signup-fields').hidden,true);
  event(document.querySelector('[data-access-mode=signup]'),'click');assert.equal(document.querySelector('#vpo-signup-fields').hidden,false);assert.equal(document.querySelector('#vpo-name').getAttribute('autocomplete'),'name');
  document.querySelector('#vpo-name').value='';document.querySelector('#vpo-email').value='novo@example.test';event(document.querySelector('form'),'submit');assert.equal(sent,undefined);
  document.querySelector('#vpo-name').value='Maria de Souza';document.querySelector('#vpo-phone').value='(11) 99999-0000';event(document.querySelector('form'),'submit');await waitFor(()=>view.flow.state.stage==='code');assert.equal(sent.options.shouldCreateUser,true);
  document.querySelector('#vpo-code').value='123456';event(document.querySelector('#vpo-code-form'),'submit');await waitFor(()=>context);assert.deepEqual(context.profile,{fullName:'Maria de Souza',phone:'(11) 99999-0000'});assert.equal(context.mode,'signup');view.destroy();
});
test('sign-in does not create accounts or disclose that an email is unknown',async()=>{
  const requests=[],flow=createEmailAuth({auth:{signInWithOtp:async data=>(requests.push(data),{error:{code:'signup_disabled'}})}});
  assert.equal(await flow.send('unknown@example.test'),true);assert.equal(requests[0].options.shouldCreateUser,false);assert.equal(flow.state.error,'');assert.equal(flow.state.stage,'code');
});
test('unapproved registration stays at the access screen until the server approves it',async()=>{
  const {document}=dom('<section></section>');let info={hasProfile:false,status:'incomplete',canUse:false,email:'cliente@example.test'},notified=0,opened=0;const calls=[];
  const api=async(path='',body)=>{calls.push([path,body]);if(path==='/register')info={...info,hasProfile:true,status:'pending',fullName:body.fullName,phone:body.phone};return {...info};};
  const gate=mountAccessGate({root:document.querySelector('section'),api,intent:{mode:'signup',profile:{fullName:'Cliente Novo',phone:''}},notifyRegistration:async()=>notified++,onVerified:()=>opened++,windowObject:windowFor()});
  await waitFor(()=>document.querySelector('#gate-refresh'));assert.equal(opened,0);assert.equal(notified,1);assert.equal(calls[1][1].purpose,'personal');assert.match(document.querySelector('section').textContent,/Aguardando aprovação/);
  info={...info,status:'approved',canUse:true};await gate.refresh();assert.equal((await gate.ready).canUse,true);assert.equal(opened,1);gate.destroy();
});
test('invitation previews the owner and requires an explicit acceptance before opening data',async()=>{
  const {document,event}=dom('<section></section>');let allowed=false,accepted=0,opened=0;const token='a'.repeat(64),hash='#plano/convite/'+token;
  const gate=mountAccessGate({root:document.querySelector('section'),windowObject:windowFor(hash),api:async(path='',body)=>{
    if(path==='/api/sharing/preview'){assert.equal(body.token,token);return {ownerEmail:'edu@example.test'};}
    if(path==='/api/sharing/accept'){accepted++;allowed=true;return {ok:true};}
    return {hasProfile:true,status:'guest',canUse:allowed,fullName:'Convidada',email:'guest@example.test'};
  },onVerified:()=>opened++});
  await waitFor(()=>document.querySelector('#gate-accept'));assert.equal(opened,0);assert.equal(accepted,0);assert.match(document.querySelector('section').textContent,/edu@example.test/);
  event(document.querySelector('#gate-accept'),'click');await gate.ready;assert.equal(opened,1);assert.equal(accepted,1);gate.destroy();
});
test('a pasted invitation on a pending account opens a validated preview',async()=>{
  const {document,event}=dom('<section></section>'),token='b'.repeat(64);let previewed=false;
  const gate=mountAccessGate({root:document.querySelector('section'),windowObject:windowFor(),api:async(path='')=>{if(path==='/api/sharing/preview'){previewed=true;return {ownerEmail:'Larissa'};}return {hasProfile:true,status:'pending',canUse:false,fullName:'Pessoa',email:'p@example.test'};}});
  await waitFor(()=>document.querySelector('#gate-have-invite'));event(document.querySelector('#gate-have-invite'),'click');document.querySelector('#gate-invite').value='bad';event(document.querySelector('#gate-invitation'),'submit');assert.equal(previewed,false);assert.match(document.querySelector('#gate-status').textContent,/válido/);
  document.querySelector('#gate-invite').value='https://vpo.test/#plano/convite/'+token;event(document.querySelector('#gate-invitation'),'submit');await waitFor(()=>document.querySelector('#gate-accept'));assert.equal(previewed,true);gate.destroy();
});
test('approval API routes also work through the actual Supabase transport',async()=>{
  const calls=[];const api=accessAPI(createSupabaseTransport({rpc:(name,args)=>{calls.push([name,args]);const result=Promise.resolve({data:{status:200,body:{ok:true}}});result.abortSignal=()=>result;return result;}}));
  await api('/register',{fullName:'Pessoa',purpose:'personal'});await api('/api/sharing/preview',{token:'c'.repeat(64)});
  assert.equal(calls[0][1].p_path,'/api/access/register');assert.equal(calls[1][1].p_path,'/api/sharing/preview');
});
test('admin reviews escaped registration details, approves and confirms a rejection',async()=>{
  const {document,event}=dom('<article></article>');let decisions=[];const items=[{id:'one',name:'<img src=x onerror=alert(1)>',email:'client@example.test',phone:'11 99999-0000',requestedAt:new Date().toISOString(),notification:'queued'}];
  const view=mountRegistrationAdmin({root:document.querySelector('article'),notifier:async()=>{throw new Error('Not configured');},api:async(path,body)=>{if(path==='/decision'){decisions.push(body);return {ok:true};}return {items,total:1,page:0};}});
  await waitFor(()=>document.querySelector('[data-approve]'));assert.equal(document.querySelector('img'),null);assert.match(document.querySelector('#admin-email-status').textContent,/precisa ser configurado/);
  event(document.querySelector('[data-approve]'),'click');await waitFor(()=>decisions.length===1);assert.deepEqual(decisions[0],{userId:'one',decision:'approved'});
  await view.refresh();event(document.querySelector('[data-reject]'),'click');assert.equal(decisions.length,1);assert.equal(document.querySelector('[data-confirm-reject]').hidden,false);
  event(document.querySelector('[data-decision]'),'click');await waitFor(()=>decisions.length===2);assert.equal(decisions[1].decision,'rejected');
});
