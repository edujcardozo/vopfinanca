import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,saveTransaction,validateState} from '../web/core.js';
import {organizeUnclassifiedGroup} from '../web/unclassified-group.js';
import {prepareInvoice,commitInvoice} from '../web/invoice-import.js';

test('unclassified categories move together without changing financial history and grouping is idempotent',()=>{
 const state=createState(false,'2026-11');
 state.categories.push({id:'pending',name:'A classificar',group:'daily',icon:'🏷️',target:0});
 state.months['2026-11'].assigned.pending=10000;
 saveTransaction(state,{id:'existing',type:'expense',date:'2026-11-28',amount:45468,categoryId:'pending',payee:'Loja',description:'Loja',memo:'Compra',sharing:{paidBy:'larissa',eduPercent:50}});
 const before=structuredClone(state.months),other=structuredClone(state.categories.filter(c=>c.id!=='pending'));
 assert.equal(organizeUnclassifiedGroup(state),true);
 const group=state.groups.find(g=>g.name==='A classificar');assert.ok(group);
 assert.equal(state.categories.find(c=>c.id==='pending').group,group.id);
 assert.deepEqual(state.months,before);assert.deepEqual(state.categories.filter(c=>c.id!=='pending'),other);
 assert.equal(organizeUnclassifiedGroup(state),false);assert.equal(state.groups.filter(g=>g.name==='A classificar').length,1);
 assert.equal(validateState(state).categories.find(c=>c.id==='pending').group,group.id);
});
test('unclassified imports create or reuse the dedicated group while empty plans stay unchanged',async()=>{
 const state=createState(false,'2026-11');assert.equal(organizeUnclassifiedGroup(state),false);
 const draft=await prepareInvoice('date,title,amount\n2026-11-01,Loja desconhecida,10.00',state);
 const next=commitInvoice(state,draft.rows,'group-import');
 const fallback=next.categories.find(c=>c.name==='A classificar'),group=next.groups.find(g=>g.name==='A classificar');
 assert.equal(fallback.group,group.id);assert.equal(next.months['2026-11'].transactions[0].categoryId,fallback.id);
 assert.equal(organizeUnclassifiedGroup(next),false);
});
