import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dom} from './helpers/dom.mjs';
import {createState,STORAGE_KEY} from '../web/core.js';
import {MemoryStorage} from './helpers/sync-env.mjs';

test('home waits for its real participants and keeps their names through the ten-second refresh',async()=>{
  const saved=Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval','fetch'].map(key=>[key,globalThis[key]]));
  try{
    const intervals=[];
    globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};globalThis.clearInterval=()=>{};
    globalThis.setInterval=(callback,ms)=>{intervals.push({callback,ms});return 0;};
    let release,roster={user:{id:'owner'},scope:{id:'owner',role:'owner'},participants:[{id:'owner',role:'owner',name:'Ana Cliente',email:'ana@example.test'},{id:'guest',role:'editor',name:'Bruno Convidado',email:'bruno@example.test'}],members:[{id:'guest'}],plans:[],invites:[]};
    const first=new Promise(resolve=>release=resolve);let calls=0;
    globalThis.fetch=async url=>String(url)==='/api/sharing'?Response.json(++calls===1?await first:roster):new Response('{}',{status:503});
    const {document,window}=dom(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
    window.matchMedia=query=>({matches:query.includes('max-width'),addEventListener(){}});globalThis.matchMedia=window.matchMedia;window.scrollTo=()=>{};
    Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===value));},configurable:true});
    globalThis.location={hash:'#plano/inicio'};globalThis.localStorage=new MemoryStorage();
    const state=createState(true,'2026-10');localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    await import('../web/app.js?household-refresh');
    const home=()=>document.querySelector('#mobile-home-content');
    assert.equal(home().querySelector('.couple-card'),null,'Example names must not flash in a signed-in plan.');
    release(roster);await new Promise(setImmediate);
    assert.equal(home().querySelector('.couple-kicker').textContent,'Ana Cliente + Bruno Convidado');
    const savedPlan=localStorage.getItem(STORAGE_KEY),refresh=intervals.find(item=>item.ms===10000);
    assert.ok(refresh);
    roster={...roster,participants:roster.participants.map(person=>({...person,name:person.email}))};
    for(let i=0;i<3;i++){
      refresh.callback();await new Promise(setImmediate);
      assert.equal(home().querySelector('.couple-kicker').textContent,'Ana Cliente + Bruno Convidado');
      assert.doesNotMatch(home().textContent,/@example\.test/);
      assert.equal(localStorage.getItem(STORAGE_KEY),savedPlan,'Refreshing labels must not alter any budget data.');
    }
    roster={...roster,participants:[roster.participants[0],{id:'replacement',role:'editor',name:'carla@example.test',email:'carla@example.test'}]};
    refresh.callback();await new Promise(setImmediate);
    assert.equal(home().querySelector('.couple-kicker').textContent,'Ana Cliente + carla');
    assert.doesNotMatch(home().textContent,/Bruno Convidado|@example\.test/);
  }finally{Object.assign(globalThis,saved);}
});
