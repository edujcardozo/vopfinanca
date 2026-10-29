import {test} from 'node:test';import assert from 'node:assert/strict';
import {createState,validateState,saveTransaction,id} from '../web/core.js';
import {saveCard} from '../web/saved-cards-data.js';import {prepareInvoice,commitInvoice} from '../web/invoice-import.js';
import {mergePlans} from '../web/sync-core.js';import {server} from './helpers/sync-env.mjs';
test('saved cards are reusable, deduplicated and retained in imports and backups without changing amounts',async()=>{
 const state=createState(false,'2026-11'),card=saveCard(state,' Nubank · Larissa ');assert.equal(saveCard(state,'nubank · larissa').id,card.id);assert.equal(state.cards.length,1);
 const draft=await prepareInvoice('date,title,amount\n2026-10-28,Loja,10.00',state),next=commitInvoice(state,draft.rows,'card-batch','2026-11',{dueDate:'2026-12-10',card:card.name,cardId:card.id});
 assert.equal(next.invoiceBills[0].cardId,card.id);assert.equal(next.months['2026-11'].transactions[0].cardId,card.id);assert.deepEqual(validateState(next).cards,state.cards);
 assert.throws(()=>validateState({...next,cards:[]}));
 const base=createState(false,'2026-11'),local=structuredClone(base),remote=structuredClone(base);saveCard(local,'Nubank · Eduardo');saveCard(remote,'Nubank · Larissa');const merged=mergePlans(base,local,remote);assert.equal(merged.ok,true);assert.equal(merged.state.cards.length,2);
});
test('hosted cards and transaction references reject older writes which omit the card registry',async()=>{
 const api=server();try{const state=createState(false,'2026-11'),card=saveCard(state,'Nubank');saveTransaction(state,{id:'manual-card',date:'2026-11-01',type:'expense',amount:1000,payee:'Loja',description:'Loja',categoryId:'mercado',cardId:card.id});
 const put=(value,revision)=>api.request('/api/plan',{method:'PUT',body:JSON.stringify({scopeId:'owner',revision,mutationId:id(),state:value})});assert.equal((await put(state,0)).status,200);
 const legacy=structuredClone(state);delete legacy.cards;delete legacy.months['2026-11'].transactions[0].cardId;assert.equal((await put(legacy,1)).status,426);
 const loaded=await (await api.request('/api/plan')).json();assert.equal(loaded.state.months['2026-11'].transactions[0].cardId,card.id);
 }finally{api.sqlite.close();}
});
