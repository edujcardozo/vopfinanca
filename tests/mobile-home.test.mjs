import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,saveTransaction} from '../web/core.js';
import {mobileHome} from '../web/mobile-home.js';
test('home summary uses real monthly allocations and transactions, hides amounts and escapes names',()=>{
 const s=createState(false,'2026-10');s.months['2026-10'].assigned.mercado=20000;s.categories.find(c=>c.id==='mercado').name='<img src=x>';
 saveTransaction(s,{id:'in',type:'income',amount:30000,categoryId:null,date:'2026-10-01',payee:'Empresa',description:'Empresa'});saveTransaction(s,{id:'out',type:'expense',amount:5000,categoryId:'mercado',date:'2026-10-10',payee:'Mercado',description:'Mercado'});
 const html=mobileHome(s,'2026-10');assert.ok(html.includes('200,00'));assert.ok(html.includes('50,00'));assert.ok(html.includes('150,00'));assert.ok(html.includes('2026-11'));assert.equal(html.includes('<img'),false);assert.equal(html.includes('Meta'),false);s.hideBalances=true;const hidden=mobileHome(s,'2026-10');assert.equal(hidden.includes('R$'),false);assert.equal(hidden.includes('150,00'),false);
});
