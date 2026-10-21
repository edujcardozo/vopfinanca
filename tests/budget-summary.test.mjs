import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dom} from './helpers/dom.mjs';
import {createState,currentMonth,shiftMonth,ensureMonth,saveTransaction,formatMoney,STORAGE_KEY} from '../web/core.js';
import {MemoryStorage} from './helpers/sync-env.mjs';

test('the header uses only monthly planned, spent and remaining amounts, removes the balance card and respects privacy',async()=>{
  const saved=Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval','fetch'].map(key=>[key,globalThis[key]]));
  try{
    globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
    globalThis.fetch=async()=>new Response('{}',{status:503});
    const {document,window,event}=dom(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
    window.matchMedia=query=>({matches:query.includes('min-width'),addEventListener(){}});globalThis.matchMedia=window.matchMedia;window.scrollTo=()=>{};
    const dialog=document.querySelector('dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;event(dialog,'close');};
    Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===value));},configurable:true});
    const month=currentMonth(),previous=shiftMonth(month,-1),next=shiftMonth(month,1),state=createState(false,month);
    for(const [key,planned,spent] of [[previous,70000,100000],[month,50000,12500],[next,30000,99999]]){
      ensureMonth(state,key).assigned.moradia=planned;
      saveTransaction(state,{id:key,type:'expense',amount:spent,categoryId:'moradia',date:key+'-10',payee:'Mercado',description:'Compra'});
    }
    saveTransaction(state,{id:'income',type:'income',amount:9500,categoryId:null,date:month+'-01',payee:'Entrada',description:'Entrada'});
    globalThis.location={hash:'#plano/planejar'};globalThis.localStorage=new MemoryStorage();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    await import('../web/app.js?monthly-budget-summary');await new Promise(setImmediate);
    const amounts=()=>[...document.querySelectorAll('.monthly-plan-summary strong')].map(node=>node.textContent);
    const remaining=()=>document.querySelector('[data-monthly-remaining]').textContent;
    const expected=(planned,spent)=>[formatMoney(planned),formatMoney(spent)];
    const categoryAvailable=()=>document.querySelector('[data-category="moradia"] .amount-badge').textContent;
    assert.deepEqual(amounts(),expected(50000,12500));assert.equal(remaining(),formatMoney(37500));
    assert.equal(categoryAvailable(),formatMoney(37500));
    assert.equal(document.querySelector('.monthly-balance-copy>span').textContent,'Restante do planejado');
    assert.equal(document.querySelectorAll('#budget-summary>.summary-card').length,1);
    assert.doesNotMatch(document.querySelector('#budget-summary').textContent,/O que entra e o que sai|acumulad/);
    assert.equal(document.querySelectorAll('[data-monthly-planned]').length,1);assert.equal(document.querySelectorAll('[data-monthly-spent]').length,1);
    event(document.querySelector('#privacy-toggle'),'click');assert.deepEqual(amounts(),['••••','••••']);assert.equal(remaining(),'••••');
    event(document.querySelector('#privacy-toggle'),'click');
    event(document.querySelector('#prev-month'),'click');assert.deepEqual(amounts(),expected(70000,100000));assert.equal(remaining(),formatMoney(30000));
    assert.equal(document.querySelector('.monthly-balance-copy>span').textContent,'Acima do planejado');
    event(document.querySelector('[data-fix-monthly-spending]'),'click');assert.equal(dialog.open,true);
    assert.ok(dialog.textContent.includes(formatMoney(30000)));assert.doesNotMatch(dialog.textContent,/entradas|acumulad/);
    event(document.querySelector('#close-dialog'),'click');
    event(document.querySelector('#next-month'),'click');assert.deepEqual(amounts(),expected(50000,12500));assert.equal(remaining(),formatMoney(37500));
    event(document.querySelector('#next-month'),'click');assert.deepEqual(amounts(),expected(30000,99999));assert.equal(remaining(),formatMoney(69999));
    assert.equal(categoryAvailable(),formatMoney(-69999));
    event(document.querySelector('#next-month'),'click');assert.deepEqual(amounts(),expected(0,0));assert.equal(remaining(),formatMoney(0));
    assert.ok([...document.querySelectorAll('#categories-list .amount-badge')].every(node=>node.textContent===formatMoney(0)));
    assert.ok([...document.querySelectorAll('#categories-list .spending-progress')].every(node=>node.classList.contains('empty')));
    const emptyMonth=shiftMonth(next,1);assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).months[emptyMonth],undefined);
    const assigned=document.querySelector('[data-assigned-input="moradia"]');event(assigned,'focus');assigned.value='120,00';event(assigned,'input');event(assigned,'blur');
    assert.equal(categoryAvailable(),formatMoney(12000));assert.deepEqual(amounts(),expected(12000,0));
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));assert.equal(stored.months[emptyMonth].assigned.moradia,12000);assert.equal(stored.months[next].assigned.moradia,30000);assert.equal(stored.months[month].assigned.moradia,50000);
    event(document.querySelector('#next-month'),'click');assert.equal(categoryAvailable(),formatMoney(0));
  }finally{await new Promise(setImmediate);Object.assign(globalThis,saved);}
});
