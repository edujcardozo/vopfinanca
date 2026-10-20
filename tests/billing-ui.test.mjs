import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {billingSummary,subscriptionHTML,createBillingUI} from '../standalone/billing-ui.js';
import {mountBillingAccess} from '../standalone/billing-access.js';
const info={enabled:true,canUse:false,isOwner:true,phase:'choose_payment',monthlyCents:1290,allowedMethods:['credit_card','pix_automatic'],trialDays:15,checkoutReady:true,termsVersion:'vpo-monthly-v1',firstChargeAt:'2026-11-05T03:00:00Z'};
const waitFor=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Action did not finish');};
test('subscription clearly separates free trial, automatic payment authorization and payment confirmation',()=>{
  const html=subscriptionHTML(info,'pix_automatic');const {document}=dom(html);
  const content=document.querySelector('.vpo-subscription').textContent.replace(/\s/g,' ');
  assert.ok(content.includes('R$ 0,00'));assert.ok(content.includes('15 dias'));assert.ok(content.includes('R$ 12,90'));assert.ok(content.includes('05 de novembro de 2026'));
  assert.equal(document.querySelector('[data-billing-method=pix_automatic]').getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('#vpo-billing-consent').hasAttribute('checked'),false);
  assert.match(billingSummary({...info,phase:'awaiting_authorization'}).title,/confirmar/);assert.match(billingSummary({...info,isOwner:false}).description,/quem compartilhou/);
  const disabled=dom(subscriptionHTML({...info,enabled:false,phase:'not_enabled',monthlyCents:null,checkoutReady:false})).document;assert.equal(disabled.querySelector('[data-billing-continue]').disabled,true);assert.ok(!disabled.querySelector('.vpo-subscription').textContent.includes('12,90'));
});
test('CPF checkout offers only the available card method and cancellation preserves a paid period',()=>{
  const {document}=dom(subscriptionHTML({...info,allowedMethods:['credit_card']}));
  assert.equal(document.querySelector('[data-billing-method=pix_automatic]'),null);
  const paid=dom(subscriptionHTML({...info,phase:'active',canUse:true,canCancel:true,paidUntil:'2026-12-05T03:00:00Z'})).document;
  assert.ok(paid.querySelector('[data-billing-cancel]'));assert.equal(paid.querySelector('[data-billing-continue]'),null);
});
test('explicit consent is required and the selected automatic method reaches the trusted quote without a client-controlled amount',async()=>{
  const {document,event}=dom('<article id="settings"></article><dialog></dialog>');let calls=[],started=[];
  const root=document.querySelector('article'),dialog=document.querySelector('dialog');
  const fetcher=async(path,options)=>{calls.push({path,options});return new Response(JSON.stringify(info),{headers:{'content-type':'application/json'}});};
  const ui=createBillingUI({root,fetcher,openDialog:(_title,html)=>dialog.innerHTML=html,notify(){},checkout:data=>started.push(data)});
  await ui.refresh();event(root.querySelector('[data-manage-subscription]'),'click');event(dialog.querySelector('[data-billing-method=pix_automatic]'),'click');
  event(dialog.querySelector('[data-billing-continue]'),'click');assert.equal(started.length,0);assert.equal(dialog.querySelector('#vpo-billing-error').hidden,false);
  dialog.querySelector('#vpo-billing-consent').checked=true;event(dialog.querySelector('[data-billing-continue]'),'click');await waitFor(()=>started.length===1);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{paymentMethod:'pix_automatic',consent:true,termsVersion:'vpo-monthly-v1'});assert.equal(started[0].paymentMethod,'pix_automatic');
});
test('read-only UI protects edits while leaving navigation and backup available; the database remains the authority',()=>{
  const {document,event}=dom('<section id="app"><main id="app-main"><button data-add-transaction>Adicionar</button><input data-assigned-input><button id="export-data">Exportar</button><button data-view="overview">Ver</button></main></section>');
  let shown=0;const root=document.querySelector('section'),guard=mountBillingAccess({root,showBilling:()=>shown++,documentObject:document});guard.update({enabled:true,canUse:false});
  event(document.querySelector('[data-add-transaction]'),'click');assert.equal(shown,1);assert.equal(document.querySelector('[data-assigned-input]').readOnly,true);
  event(document.querySelector('#export-data'),'click');event(document.querySelector('[data-view]'),'click');assert.equal(shown,1);
  guard.update({enabled:true,canUse:true});event(document.querySelector('[data-add-transaction]'),'click');assert.equal(shown,1);assert.equal(document.querySelector('[data-assigned-input]').readOnly,false);guard.destroy();
});
