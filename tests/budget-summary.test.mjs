import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dom} from './helpers/dom.mjs';
import {createState,currentMonth,shiftMonth,ensureMonth,saveTransaction,formatMoney,STORAGE_KEY} from '../web/core.js';
import {MemoryStorage} from './helpers/sync-env.mjs';

test('monthly planned and spent figures remain distinct from cumulative funding and respect hidden balances',async()=>{
  const saved=Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval','fetch'].map(key=>[key,globalThis[key]]));
  try{
    globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
    globalThis.fetch=async()=>new Response('{}',{status:503});
    const {document,window,event}=dom(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
    window.matchMedia=query=>({matches:query.includes('min-width'),addEventListener(){}});globalThis.matchMedia=window.matchMedia;window.scrollTo=()=>{};
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
    const expected=(planned,spent)=>[formatMoney(planned),formatMoney(spent)];
    assert.deepEqual(amounts(),expected(50000,12500));
    assert.equal(document.querySelector('[data-funding-amount]').textContent,formatMoney(110500));
    assert.equal(document.querySelector('.plan-funding-copy>span').textContent,'Falta cobrir o plano');
    assert.equal(document.querySelectorAll('[data-monthly-planned]').length,1);assert.equal(document.querySelectorAll('[data-monthly-spent]').length,1);
    event(document.querySelector('#privacy-toggle'),'click');assert.deepEqual(amounts(),['••••','••••']);assert.equal(document.querySelector('[data-funding-amount]').textContent,'••••');
    event(document.querySelector('#privacy-toggle'),'click');
    event(document.querySelector('#prev-month'),'click');assert.deepEqual(amounts(),expected(70000,100000));
    event(document.querySelector('#next-month'),'click');assert.deepEqual(amounts(),expected(50000,12500));
    event(document.querySelector('#next-month'),'click');assert.deepEqual(amounts(),expected(30000,99999));
    event(document.querySelector('#next-month'),'click');assert.deepEqual(amounts(),expected(0,0));
  }finally{await new Promise(setImmediate);Object.assign(globalThis,saved);}
});
