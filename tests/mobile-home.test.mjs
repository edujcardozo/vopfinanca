import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,saveTransaction,formatMoney,ensureMonth} from '../web/core.js';
import {mobileHome} from '../web/mobile-home.js';
import {dom} from './helpers/dom.mjs';
test('home summary uses real monthly allocations and transactions, hides amounts and escapes names',()=>{
 const s=createState(false,'2026-10');s.months['2026-10'].assigned.mercado=20000;s.categories.find(c=>c.id==='mercado').name='<img src=x>';
 saveTransaction(s,{id:'in',type:'income',amount:30000,categoryId:null,date:'2026-10-01',payee:'Empresa',description:'Empresa'});saveTransaction(s,{id:'out',type:'expense',amount:5000,categoryId:'mercado',date:'2026-10-10',payee:'Mercado',description:'Mercado'});
 const html=mobileHome(s,'2026-10');assert.ok(html.includes('200,00'));assert.ok(html.includes('50,00'));assert.ok(html.includes('150,00'));assert.ok(html.includes('2026-11'));assert.equal(html.includes('<img'),false);assert.equal(html.includes('Meta'),false);s.hideBalances=true;const hidden=mobileHome(s,'2026-10');assert.equal(hidden.includes('R$'),false);assert.equal(hidden.includes('150,00'),false);
});
test('mobile category balances and the available metric use only the open month, including unplanned future months',()=>{
 const state=createState(true,'2026-10');
 const view=()=>dom(mobileHome(state,'2026-11',{household:{enabled:false}})).document;
 let document=view();assert.ok([...document.querySelectorAll('.home-category-list strong')].every(node=>node.textContent===formatMoney(0)));
 const metric=doc=>[...doc.querySelectorAll('.home-metrics button')].find(node=>node.querySelector('span').textContent==='Disponível').querySelector('strong').textContent;
 assert.equal(metric(document),formatMoney(0));
 ensureMonth(state,'2026-11').assigned.mercado=20000;
 saveTransaction(state,{id:'nov',type:'expense',amount:5000,categoryId:'mercado',date:'2026-11-10',description:'Compra'});
 document=view();assert.equal(document.querySelector('[data-home-category="mercado"] strong').textContent,formatMoney(15000));assert.equal(metric(document),formatMoney(15000));
});
