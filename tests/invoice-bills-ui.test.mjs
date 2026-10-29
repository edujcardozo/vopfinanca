import {test} from 'node:test';import assert from 'node:assert/strict';import {dom} from './helpers/dom.mjs';
import {createState,today} from '../web/core.js';import {prepareInvoice,commitInvoice} from '../web/invoice-import.js';
import {mountInvoiceBills,invoiceTransactionTag} from '../web/invoice-bills-ui.js';
test('invoice UI configures an existing import, shows due month, pays and reopens without touching purchases',async()=>{
 const {document,event}=dom('<div class="transaction-tools"></div><dialog></dialog>');
 const source=createState(false,'2026-11'),draft=await prepareInvoice('date,title,amount\n2026-10-28,Loja,20.50',source);
 let state=commitInvoice(source,draft.rows,'old-batch','2026-11'),month='2026-11',changes=0;state.cards=[{id:'nubank-test',name:'Nubank <Larissa>'}];
 const ui=mountInvoiceBills({getState:()=>state,getMonth:()=>month,openDialog:(_,html)=>document.querySelector('dialog').innerHTML=html,closeDialog(){},notify(){},onChange(){changes++;ui.render();}});
 event(document.querySelector('[data-bills-manage]'),'click');event(document.querySelector('[data-bill-legacy]'),'click');
 const form=document.querySelector('#invoice-bill-form');assert.equal(form.querySelector('[name=month]').value,'2026-11');form.querySelector('[name=dueDate]').value='2026-12-10';const card=form.querySelector('[data-card-select]');card.value='Nubank <Larissa>';event(form,'submit');
 assert.equal(changes,1);assert.equal(state.invoiceBills[0].dueDate,'2026-12-10');assert.equal(document.querySelector('Larissa'),null);assert.ok(invoiceTransactionTag(state,state.months['2026-11'].transactions[0]).includes('10/12/2026'));
 const before=structuredClone(state.months);month='2026-12';ui.render();assert.match(document.querySelector('.invoice-bills header p').textContent,/1 fatura vence/);
 const payment=document.querySelector('#invoice-bill-payment');payment.querySelector('input').value=today();event(payment,'submit');assert.equal(state.invoiceBills[0].paidDate,today());assert.deepEqual(state.months,before);
 assert.ok(document.querySelector('.invoice-bill-paid'));event(document.querySelector('[data-bill-reopen]'),'click');assert.equal(state.invoiceBills[0].paidDate,null);assert.deepEqual(state.months,before);
 state.hideBalances=true;ui.render();assert.ok(!document.querySelector('.invoice-bills').textContent.includes('20,50'));
});
