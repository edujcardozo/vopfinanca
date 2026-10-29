import {test} from 'node:test';import assert from 'node:assert/strict';
import {createState,validateState,monthlyPlanTotals,saveTransaction} from '../web/core.js';
import {prepareInvoice,commitInvoice} from '../web/invoice-import.js';
import {invoiceBillTotal,saveInvoiceBill,checkedInvoiceBills} from '../web/invoice-bills-data.js';
import {mergePlans} from '../web/sync-core.js';
const csv='date,title,amount\n2026-10-28,Loja,20.50';
test('November expenses due in December survive backup, editing and paid status without duplicate expenses',async()=>{
 const state=createState(false,'2026-11'),draft=await prepareInvoice(csv,state);
 const next=commitInvoice(state,draft.rows,'invoice-test','2026-11',{dueDate:'2026-12-10',card:'Nubank · Larissa'}),bill=next.invoiceBills[0];
 assert.equal(next.months['2026-11'].transactions.length,1);assert.equal(monthlyPlanTotals(next,'2026-12').spent,0);
 assert.equal(invoiceBillTotal(next,bill),2050);assert.deepEqual(validateState(next).invoiceBills,[bill]);
 const months=structuredClone(next.months);saveInvoiceBill(next,{...bill,paidDate:'2026-12-09'});assert.deepEqual(next.months,months);
 const tx=next.months['2026-11'].transactions[0];saveTransaction(next,{...tx,amount:2500},tx.id);assert.equal(invoiceBillTotal(next,bill),2500);
 saveInvoiceBill(next,{...bill,paidDate:null});assert.equal(next.invoiceBills[0].paidDate,null);
 for(const change of [{dueDate:'2026-02-30'},{paidDate:'bad'},{month:'2026-13'},{transactionIds:['__proto__']}])assert.throws(()=>checkedInvoiceBills([{...bill,...change}]));
 assert.throws(()=>checkedInvoiceBills([bill,{...bill,id:'other'}]));
 const replay=await prepareInvoice(csv,next);assert.equal(replay.rows[0].exact,true);
});
test('invoice edits merge with independent financial edits and conflicting payment dates require review',async()=>{
 const initial=createState(false,'2026-11'),draft=await prepareInvoice(csv,initial),base=commitInvoice(initial,draft.rows,'invoice-merge','2026-11',{dueDate:'2026-12-10',card:''});
 const left=structuredClone(base),right=structuredClone(base);left.invoiceBills[0].paidDate='2026-12-09';right.months['2026-11'].transactions[0].amount=3000;
 const merged=mergePlans(base,left,right);assert.equal(merged.ok,true);assert.equal(merged.state.invoiceBills[0].paidDate,'2026-12-09');assert.equal(invoiceBillTotal(merged.state,merged.state.invoiceBills[0]),3000);
 right.invoiceBills[0].paidDate='2026-12-10';assert.equal(mergePlans(base,left,right).ok,false);
});
test('hosted API retains invoice data and rejects an outdated tab before it can erase invoices',async()=>{
 const {server}=await import('./helpers/sync-env.mjs'),{id}=await import('../web/core.js');const api=server();
 try{const state=createState(false,'2026-11'),draft=await prepareInvoice(csv,state),next=commitInvoice(state,draft.rows,'hosted-bill','2026-11',{dueDate:'2026-12-10',card:'Nubank'});
 const put=(value,revision)=>api.request('/api/plan',{method:'PUT',body:JSON.stringify({scopeId:'owner',revision,mutationId:id(),state:value})});
 assert.equal((await put(next,0)).status,200);const old=structuredClone(next);delete old.invoiceBills;const response=await put(old,1);assert.equal(response.status,426);assert.equal((await response.json()).code,'CLIENT_UPDATE_REQUIRED');
 assert.deepEqual((await (await api.request('/api/plan')).json()).state.invoiceBills,next.invoiceBills);
 }finally{api.sqlite.close();}
});
test('the original October Nubank import appears alongside newer CSV batches without changing any transactions',async()=>{
 const {unlinkedInvoiceImports}=await import('../web/invoice-bills-data.js');const state=createState(false,'2026-10');
 for(const [id,amount,type,memo]of [['old-one',4800,'expense','Importado do Nubank · Larissa · Categoria sugerida. Loja'],['old-two',8091,'expense','Importado do Nubank · Larissa · Categoria a revisar. Outra'],['manual',3000,'expense','Compra manual'],['income',50000,'income','Importado do Nubank · Larissa']])saveTransaction(state,{id,date:'2026-10-27',type,amount,payee:'Loja',description:'Loja',memo,categoryId:type==='expense'?'mercado':null,...(type==='expense'?{sharing:{paidBy:'larissa',eduPercent:50}}:{})});
 state.months['2026-10'].transactions.find(t=>t.id==='old-two').sharing.paidBy='edu';
 const draft=await prepareInvoice('date,title,amount\n2026-10-28,Nova loja,10.00',state),next=commitInvoice(state,draft.rows,'new-november','2026-11'),before=structuredClone(next.months);
 const candidates=unlinkedInvoiceImports(next);assert.equal(candidates.length,2);assert.equal(candidates[0][0],'new-november');assert.equal(candidates[1][0],'legacy-nb-2026-10-larissa');assert.equal(candidates[1][1].length,2);assert.equal(candidates[1][1].reduce((n,t)=>n+t.amount,0),12891);assert.deepEqual(next.months,before);
 saveInvoiceBill(next,{id:candidates[1][0],month:'2026-10',dueDate:'2026-11-10',card:'Nubank · Larissa',paidDate:null,transactionIds:candidates[1][1].map(t=>t.id)});
 assert.equal(unlinkedInvoiceImports(next).length,1);assert.equal(invoiceBillTotal(next,next.invoiceBills[0]),12891);assert.deepEqual(next.months,before);
});
