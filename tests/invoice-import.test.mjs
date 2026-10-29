import test from 'node:test';import assert from 'node:assert/strict';import{parseInvoice,prepareInvoice,commitInvoice}from'../web/invoice-import.js';import{createState}from'../web/core.js';
const csv='date,title,amount\n2026-10-25,"Loja, teste","43,38"\n2026-10-25,"Loja, teste","43,38"\n2026-10-01,Pagamento recebido,"- 9.378,55"';
test('Nubank preserves equal purchases and cents, excludes invoice payment and rejects malformed input',()=>{const r=parseInvoice(csv);assert.equal(r.purchases.length,2);assert.equal(r.excluded,1);assert.equal(r.purchases[0].amount,4338);assert.equal(r.purchases[0].payee,'Loja, teste');assert.throws(()=>parseInvoice('date,title,amount\n2026-02-30,x,1'));assert.throws(()=>parseInvoice('date,title,amount\n2026-10-01,x,-1'));assert.throws(()=>parseInvoice('a,b,c'));});
test('review edits commit atomically, preserve original plan, split and prevent reimport while keeping duplicates',async()=>{const state=createState(false,'2026-10'),before=JSON.stringify(state),d=await prepareInvoice(csv,state);assert.notEqual(d.rows[0].id,d.rows[1].id);d.rows[0].date='2026-09-12';d.rows[0].amount=1200;const next=commitInvoice(state,d.rows,'batch-test');assert.equal(JSON.stringify(state),before);const all=Object.values(next.months).flatMap(m=>m.transactions);assert.equal(all.length,2);assert.deepEqual(all[0].sharing,{paidBy:'larissa',eduPercent:50});assert.equal(all.reduce((s,t)=>s+t.amount,0),5538);const replay=await prepareInvoice(csv,next);assert.ok(replay.rows.every(r=>r.exact&&!r.selected));d.rows[0].date='bad';assert.throws(()=>commitInvoice(state,d.rows,'bad'));assert.equal(JSON.stringify(state),before);});
test('selected posting month moves all selected purchases, retains original date and prevents reimport across months',async()=>{
 const state=createState(false,'2026-10');
 const source='date,title,amount\n2026-08-31,Compra antiga,10.00\n2026-09-12,Outra compra,20.00';
 const draft=await prepareInvoice(source,state),before=JSON.stringify(state);
 const next=commitInvoice(state,draft.rows,'month-test','2027-02');
 assert.equal(JSON.stringify(state),before);
 const txs=next.months['2027-02'].transactions;
 assert.deepEqual(txs.map(t=>t.date),['2027-02-28','2027-02-12']);
 assert.ok(txs[0].memo.includes('31/08/2026'));assert.ok(txs[1].memo.includes('12/09/2026'));
 assert.equal(txs.reduce((n,t)=>n+t.amount,0),3000);
 const repeat=await prepareInvoice(source,next);assert.ok(repeat.rows.every(r=>r.exact&&!r.selected));
 assert.throws(()=>commitInvoice(state,draft.rows,'bad-month','2026-13'));
 const original=commitInvoice(state,draft.rows,'original','');
 assert.equal(original.months['2026-08'].transactions[0].date,'2026-08-31');
 assert.equal(original.months['2026-09'].transactions[0].date,'2026-09-12');
});
test('posting dates handle leap years, edited dates and invalid input atomically',async()=>{
 const {invoicePostingDate}=await import('../web/invoice-import.js');
 assert.equal(invoicePostingDate('2026-01-31','2028-02'),'2028-02-29');
 assert.equal(invoicePostingDate('2026-01-31','2026-04'),'2026-04-30');
 assert.equal(invoicePostingDate('2026-01-15','2026-01'),'2026-01-15');
 assert.throws(()=>invoicePostingDate('2026-02-31','2026-04'));
});
