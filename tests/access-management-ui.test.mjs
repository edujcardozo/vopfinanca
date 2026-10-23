import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {mountRegistrationAdmin,mountAccessGate} from '../standalone/registration.js';
import {billingSummary,subscriptionHTML} from '../standalone/billing-ui.js';
import {mountBillingAccess} from '../standalone/billing-access.js';
import {mountAccountSettings,updateAccountAccess} from '../standalone/account-ui.js';
const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Action did not finish');};
const access={accessEnforced:true,accessSource:'approval',enabled:false,canUse:true,phase:'trialing',trialDaysRemaining:12,trialStartedAt:'2026-10-20T15:00:00Z',trialEndsAt:'2026-11-04T15:00:00Z',isOwner:true,checkoutReady:false};
test('admin confirms permanent grants, removal and restoration without deleting a user or resetting dates',async()=>{
  const {document,event}=dom('<article></article>'),root=document.querySelector('article'),calls=[];
  let mode='subscription',removed=false;
  const api=async(path,body)=>{calls.push([path,body]);if(path==='/manage'){if(body.action==='permanent')mode='permanent';if(body.action==='revoke')removed=true;if(body.action==='restore')removed=false;return {ok:true};}
    return {items:body.status===(removed?'revoked':'approved')?[{id:'one',name:'Pessoa de Teste',email:'client@example.test',status:'approved',accessMode:mode,revokedAt:removed?'2026-10-23T13:00:00Z':null,requestedAt:'2026-10-20',access:{...access,phase:mode==='permanent'?'permanent':'trialing'}}]:[],total:1};};
  mountRegistrationAdmin({root,api,notifier:async()=>({configured:true})});await waitFor(()=>calls.length>0);
  event(root.querySelector('[data-admin-filter=approved]'),'click');await waitFor(()=>root.querySelector('[data-user-options]'));
  event(root.querySelector('[data-user-options]'),'click');event(root.querySelector('[data-user-action=permanent]'),'click');assert.equal(calls.some(x=>x[0]==='/manage'),false);
  event(root.querySelector('[data-user-confirm]'),'click');await waitFor(()=>root.textContent.includes('Acesso permanente')&&!root.querySelector('[data-user-confirm]'));
  assert.deepEqual(calls.find(x=>x[0]==='/manage')[1],{userId:'one',action:'permanent',confirm:true});
  event(root.querySelector('[data-user-options]'),'click');event(root.querySelector('[data-user-action=revoke]'),'click');assert.match(root.textContent,/orçamento fica salvo/);
  event(root.querySelector('[data-user-confirm]'),'click');await waitFor(()=>root.querySelector('.vpo-admin-note')?.textContent.includes('Nenhum'));
  event(root.querySelector('[data-admin-filter=revoked]'),'click');await waitFor(()=>root.querySelector('[data-user-options]'));
  event(root.querySelector('[data-user-options]'),'click');event(root.querySelector('[data-user-action=restore]'),'click');assert.match(root.textContent,/não reinicia/);
  event(root.querySelector('[data-user-confirm]'),'click');await waitFor(()=>!removed);assert.equal(mode,'permanent');
  assert.ok(calls.filter(x=>x[0]==='/manage').every(x=>!('trialEndsAt' in x[1])));
});
test('a permanent approval is explicit and a server refusal remains visible',async()=>{
  const {document,event}=dom('<article></article>'),root=document.querySelector('article'),calls=[];
  mountRegistrationAdmin({root,notifier:async()=>({}),api:async(path,body)=>{calls.push([path,body]);if(path==='/decision')throw new Error('Acesso restrito ao administrador.');return {items:[{id:'one',name:'Pessoa',email:'p@example.test',status:'pending',requestedAt:'2026-10-20'}],total:1};}});
  await waitFor(()=>root.querySelector('[data-approve-permanent]'));event(root.querySelector('[data-approve-permanent]'),'click');assert.equal(calls.length,1);
  event(root.querySelector('[data-user-confirm]'),'click');await waitFor(()=>root.querySelector('[role=status]')?.textContent.includes('Acesso restrito'));
  assert.deepEqual(calls.at(-1),['/decision',{userId:'one',decision:'approved',accessMode:'permanent'}]);
});
test('removing the last user of a page returns to an existing page',async()=>{
  const {document,event}=dom('<article></article>'),root=document.querySelector('article');
  const users=Array.from({length:11},(_,i)=>({id:'user-'+i,name:'Pessoa '+i,email:'p'+i+'@example.test',status:'approved',accessMode:'subscription',requestedAt:'2026-10-20T15:00:00Z',access}));
  mountRegistrationAdmin({root,notifier:async()=>({}),api:async(path,body)=>{if(path==='/manage'){users.splice(users.findIndex(x=>x.id===body.userId),1);return {ok:true};}return body.status==='approved'?{items:users.slice(body.page*10,body.page*10+10),total:users.length}:{items:[],total:0};}});
  await waitFor(()=>root.querySelector('[data-admin-filter=approved]'));event(root.querySelector('[data-admin-filter=approved]'),'click');await waitFor(()=>root.querySelector('[data-admin-next]'));
  event(root.querySelector('[data-admin-next]'),'click');await waitFor(()=>root.querySelector('[data-user-options="user-10"]'));
  event(root.querySelector('[data-user-options="user-10"]'),'click');event(root.querySelector('[data-user-action=revoke]'),'click');event(root.querySelector('[data-user-confirm]'),'click');
  await waitFor(()=>root.querySelectorAll('[data-user-row]').length===10);assert.equal(root.querySelector('[data-admin-next]'),null);
});
test('trial and permanent status use server dates and do not imply a charge before Asaas is enabled',()=>{
  const summary=billingSummary(access);assert.match(summary.title,/12 dias/);assert.match(summary.description,/04 de novembro de 2026/);assert.match(summary.description,/Nenhuma cobrança automática/);
  assert.match(billingSummary({...access,enabled:true,firstChargeAt:'2026-11-05T03:00:00Z',hasBillingAccount:false}).description,/Nenhuma cobrança automática/);
  const html=dom(subscriptionHTML(access)).document;assert.equal(html.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'12');assert.equal(html.querySelector('#vpo-billing-consent'),null);
  const permanent=dom(subscriptionHTML({...access,phase:'permanent'})).document;assert.match(permanent.querySelector('.vpo-subscription').textContent,/sem mensalidade/);assert.equal(permanent.querySelector('[role=progressbar]'),null);
  assert.match(billingSummary({...access,isOwner:false}).description,/quem convidou/);
  const {document}=dom('<article></article>');mountAccountSettings({root:document.querySelector('article'),email:'p@example.test'});updateAccountAccess(document,access);
  assert.match(document.querySelector('[data-account-access]').textContent,/12 dias/);updateAccountAccess(document,{...access,phase:'permanent'});assert.equal(document.querySelector('[data-account-access]').textContent,'Acesso permanente');
});
test('expired manual trials block local edit controls even with billing disabled, while leaving backup available',()=>{
  const {document,event}=dom('<section><main id="app-main"><button data-add-transaction>Adicionar</button><input data-assigned-input><button id="export-data">Exportar</button></main></section>');let shown=0;
  const guard=mountBillingAccess({root:document.querySelector('section'),documentObject:document,showBilling:()=>shown++});guard.update({...access,phase:'payment_required',canUse:false});
  assert.equal(document.querySelector('[data-assigned-input]').readOnly,true);assert.equal(event(document.querySelector('[data-add-transaction]'),'click').defaultPrevented,true);
  event(document.querySelector('#export-data'),'click');assert.equal(shown,1);
  guard.update({...access,phase:'permanent'});assert.equal(document.querySelector('[data-assigned-input]').readOnly,false);guard.destroy();
});
test('a removed account sees the revoked screen and cannot follow an invite past the gate',async()=>{
  const {document}=dom('<section></section>');let opened=0,previewed=false;
  const gate=mountAccessGate({root:document.querySelector('section'),onVerified:()=>opened++,windowObject:{location:{hash:'#plano/convite/'+'a'.repeat(64)},setInterval:()=>1,clearInterval(){}},api:async path=>{if(path)previewed=true;return {hasProfile:true,status:'revoked',canUse:false};}});
  await waitFor(()=>document.querySelector('h2')?.textContent.includes('removido'));assert.equal(opened,0);assert.equal(previewed,false);assert.equal(document.querySelector('#gate-accept'),null);gate.destroy();
});
