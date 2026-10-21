import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dom} from './helpers/dom.mjs';
import {createState,currentMonth,shiftMonth,ensureMonth,saveTransaction,formatMoney,STORAGE_KEY} from '../web/core.js';
import {MemoryStorage} from './helpers/sync-env.mjs';

test('the plan caption compares only the selected month and respects hidden balances',async()=>{
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
    globalThis.location={hash:'#plano/planejar'};globalThis.localStorage=new MemoryStorage();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    await import('../web/app.js?monthly-budget-summary');await new Promise(setImmediate);
    const caption=()=>document.querySelector('.assign-card>div>small').textContent;
    const expected=(planned,spent)=>`Você planejou ${formatMoney(planned)} para este mês e já gastou ${formatMoney(spent)}.`;
    assert.equal(caption(),expected(50000,12500));
    event(document.querySelector('#privacy-toggle'),'click');assert.equal(caption(),'Você planejou •••• para este mês e já gastou ••••.');
    event(document.querySelector('#privacy-toggle'),'click');
    event(document.querySelector('#prev-month'),'click');assert.equal(caption(),expected(70000,100000));
    event(document.querySelector('#next-month'),'click');assert.equal(caption(),expected(50000,12500));
    event(document.querySelector('#next-month'),'click');assert.equal(caption(),expected(30000,99999));
    event(document.querySelector('#next-month'),'click');assert.equal(caption(),expected(0,0));
  }finally{await new Promise(setImmediate);Object.assign(globalThis,saved);}
});
