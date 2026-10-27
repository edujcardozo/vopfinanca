import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dom} from './helpers/dom.mjs';
import {createState,currentMonth,STORAGE_KEY,validateState} from '../web/core.js';
import {MemoryStorage} from './helpers/sync-env.mjs';

test('group options hide, restore, cancel and delete safely on desktop and mobile',async()=>{
 const keys=['setTimeout','clearTimeout','setInterval','clearInterval','fetch','FormData'],saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 try{
  globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};globalThis.fetch=async()=>new Response('{}',{status:503});
  for(const width of [1440,390]){
   const {document,window,event}=dom(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
   window.matchMedia=query=>({matches:query.includes('min-width')?width>=1000:query.includes('max-width')?width<=719:false,addEventListener(){}});globalThis.matchMedia=window.matchMedia;window.scrollTo=()=>{};
   Object.defineProperty(window.HTMLElement.prototype,'elements',{get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(el=>[el.name||el.getAttribute('name'),el]));},configurable:true});
   Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===value));},configurable:true});
   const dialog=document.querySelector('dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;event(dialog,'close');};
   globalThis.FormData=class{constructor(form){this.values=new Map([...form.querySelectorAll('[name]')].map(el=>[el.getAttribute('name'),el.value]));}get(key){return this.values.get(key)??null;}};
   const state=createState(true,currentMonth());state.categories.find(c=>c.id==='lazer').hidden=true;const financial=structuredClone(state.months);
   globalThis.localStorage=new MemoryStorage();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));globalThis.location={hash:'#plano/planejar'};
   await import('../web/app.js?group-options-'+width);await new Promise(setImmediate);
   const click=selector=>{const node=document.querySelector(selector);assert.ok(node,selector);event(node,'click');},stored=()=>JSON.parse(localStorage.getItem(STORAGE_KEY));
   click('[data-edit-group="daily"]');assert.ok(document.querySelector('[data-hide-group]'));assert.ok(document.querySelector('[data-remove-group]'));
   click('[data-hide-group]');assert.equal(document.querySelector('[data-sort-group="daily"]'),null);assert.equal(document.querySelector('[data-category="mercado"]'),null);assert.equal(stored().groups.find(g=>g.id==='daily').hidden,true);assert.deepEqual(stored().months,financial);
   click('[data-hidden-groups]');click('[data-show-group="daily"]');assert.ok(document.querySelector('[data-category="mercado"]'));assert.equal(document.querySelector('[data-category="lazer"]'),null);assert.equal(stored().categories.find(c=>c.id==='lazer').hidden,true);
   click('[data-edit-group="daily"]');click('[data-remove-group]');click('[data-cancel-group-delete]');assert.ok(document.querySelector('#group-form'));assert.ok(stored().groups.find(g=>g.id==='daily'));
   click('[data-remove-group]');let form=document.querySelector('#delete-group-form');event(form,'submit');assert.equal(document.querySelector('#form-error').hidden,false);assert.ok(stored().groups.find(g=>g.id==='daily'));
   form.elements.destination.value='essentials';event(form,'submit');assert.equal(document.querySelector('[data-sort-group="daily"]'),null);assert.equal(document.querySelector('[data-category="mercado"]').closest('[data-sort-group]').dataset.sortGroup,'essentials');assert.equal(stored().categories.find(c=>c.id==='lazer').group,'essentials');assert.deepEqual(stored().months,financial);assert.deepEqual(validateState(stored()),stored());
   click('#add-group');form=document.querySelector('#quick-create-form');form.elements.name.value='Temporário';event(form,'submit');const empty=stored().groups.find(g=>g.name==='Temporário');assert.ok(empty);
   click(`[data-edit-group="${empty.id}"]`);click('[data-remove-group]');form=document.querySelector('#delete-group-form');assert.equal(form.elements.destination,undefined);event(form,'submit');assert.equal(stored().groups.some(g=>g.id===empty.id),false);assert.deepEqual(stored().months,financial);
   for(const group of stored().groups){click(`[data-edit-group="${group.id}"]`);click('[data-hide-group]');}
   assert.equal(document.querySelectorAll('[data-sort-group]').length,0);assert.ok(document.querySelector('[data-hidden-groups]'));click('[data-app-options]');click('[data-options-category]');assert.equal(document.querySelector('#new-category-form'),null);
   click('[data-hidden-groups]');click('[data-show-group="essentials"]');assert.ok(document.querySelector('[data-category="mercado"]'));assert.deepEqual(stored().months,financial);
  }
 }finally{await new Promise(setImmediate);Object.assign(globalThis,saved);}
});
