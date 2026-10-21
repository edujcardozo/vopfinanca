import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dom} from './helpers/dom.mjs';
import {createState,currentMonth,shiftMonth,saveTransaction,STORAGE_KEY,formatMoney} from '../web/core.js';
import {MemoryStorage} from './helpers/sync-env.mjs';

test('historical planning dropdown, review, partial selection, apply, undo, privacy and mobile options work in the app',async()=>{
  const saved=Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval','fetch'].map(key=>[key,globalThis[key]]));
  try{
    globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};globalThis.fetch=async()=>new Response('{}',{status:503});
    const {document,window,event}=dom(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
    let mobile=false;window.matchMedia=query=>({matches:query.includes('min-width')?!mobile:query.includes('max-width')?mobile:false,addEventListener(){}});globalThis.matchMedia=window.matchMedia;window.scrollTo=()=>{};
    const dialog=document.querySelector('dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;event(dialog,'close');};
    Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===value));},configurable:true});
    const month=currentMonth(),previous=shiftMonth(month,-1),state=createState(false,month);
    state.months[month].assigned={mercado:3000,reserva:5000};
    for(const [index,category] of state.categories.entries())saveTransaction(state,{id:'expense-'+index,type:'expense',amount:10000+index*100,categoryId:category.id,date:previous+'-10',description:'Compra'});
    globalThis.location={hash:'#plano/planejar'};globalThis.localStorage=new MemoryStorage();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    await import('../web/app.js?history-ui');await new Promise(setImmediate);
    assert.equal(dialog.open,true);assert.ok(document.querySelector('.history-welcome'));
    const planBeforeIntro=localStorage.getItem(STORAGE_KEY);
    event(document.querySelector('[data-history-intro-dismiss]'),'click');await new Promise(setImmediate);
    assert.equal(dialog.open,false);assert.equal(localStorage.getItem(STORAGE_KEY),planBeforeIntro);
    const trigger=document.querySelector('#planning-history'),click=selector=>event(document.querySelector(selector),'click');
    click('#planning-history');assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(document.querySelectorAll('#planning-history-menu [role=menuitem]').length,3);
    click('[data-history-method="last-month"]');assert.equal(dialog.open,true);assert.equal(document.querySelector('#planning-history-menu'),null);
    assert.equal(document.querySelectorAll('[data-history-category]').length,5);assert.equal(document.querySelector('[data-history-page]').textContent,'1 de 2');
    const mercado=document.querySelector('[data-history-category="mercado"]');mercado.checked=false;event(mercado,'change');
    click('[data-history-next]');assert.equal(document.querySelectorAll('[data-history-category]').length,1);click('[data-history-prev]');assert.equal(!!document.querySelector('[data-history-category="mercado"]').checked,false);
    click('[data-history-apply]');assert.equal(dialog.open,false);
    let stored=JSON.parse(localStorage.getItem(STORAGE_KEY));assert.equal(stored.months[month].assigned.mercado,3000);assert.equal(stored.months[month].assigned.moradia,10000);assert.equal(stored.months[month].transactions.length,0);assert.equal(stored.months[previous].transactions.length,6);
    click('#toast-undo');stored=JSON.parse(localStorage.getItem(STORAGE_KEY));assert.deepEqual(stored.months[month].assigned,{mercado:3000,reserva:5000});
    click('#privacy-toggle');click('#planning-history');click('[data-history-method="last-month"]');
    assert.ok(document.querySelector('.history-review').textContent.includes('••••'));assert.ok(!document.querySelector('.history-review').textContent.includes(formatMoney(10000)));
    click('#close-dialog');click('#planning-history');event(document.querySelector('#planning-history-menu'),'keydown',{key:'Escape'});assert.equal(trigger.getAttribute('aria-expanded'),'false');
    mobile=true;click('[data-app-options]');assert.ok(document.querySelector('[data-options-history]'));click('[data-options-history]');assert.equal(document.querySelectorAll('.history-options [data-history-method]').length,3);
    click('[data-history-method="six-months"]');assert.ok(document.querySelector('.history-explanation').textContent.includes('histórico disponível'));
    click('#close-dialog');
    document.querySelector('#budget-app').setAttribute('data-subscription-readonly','');click('#planning-history');assert.equal(document.querySelector('#planning-history-menu'),null);
  }finally{await new Promise(setImmediate);Object.assign(globalThis,saved);}
});
