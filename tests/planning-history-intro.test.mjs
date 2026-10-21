import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {MemoryStorage} from './helpers/sync-env.mjs';
import {accountStorage} from '../standalone/storage.js';
import {createPlanningHistoryIntro,HISTORY_INTRO_KEY} from '../web/planning-history-intro.js';

function setup(storage=new MemoryStorage()){
  const {document,window,event}=dom('<html><body><button id="planning-history" aria-describedby="existing-help">Usar histórico</button><button id="outside">Outro campo</button></body></html>');
  let allowed=false,rect={left:900,right:1030,top:320,bottom:360,width:130,height:40};
  const anchor=document.querySelector('#planning-history');
  anchor.getBoundingClientRect=()=>rect;window.innerWidth=1280;window.innerHeight=900;
  const options={storage,documentObject:document,windowObject:window,canShow:()=>allowed};
  return {document,window,event,anchor,options,allow:()=>allowed=true,setBounds:value=>rect=value};
}

test('first-use history note sits above the button without a modal, scroll lock or stolen focus and persists after reload',()=>{
  const f=setup(),intro=createPlanningHistoryIntro(f.options),focused=f.document.activeElement;
  assert.equal(intro.maybeShow(),false);assert.equal(f.options.storage.getItem(HISTORY_INTRO_KEY),null);
  f.allow();assert.equal(intro.maybeShow(),true);
  const tip=f.document.querySelector('.history-tip');
  assert.equal(tip.getAttribute('role'),'note');assert.equal(tip.dataset.side,'above');assert.ok(Number.parseFloat(tip.style.top)<320);
  assert.equal(f.document.querySelector('dialog'),null);assert.equal(f.document.body.style.overflow,undefined);assert.equal(f.document.activeElement,focused);
  assert.ok(f.anchor.getAttribute('aria-describedby').includes('history-tip-description'));
  f.event(f.document.querySelector('[data-history-tip-done]'),'click');
  assert.equal(f.document.querySelector('.history-tip'),null);assert.equal(f.anchor.getAttribute('aria-describedby'),'existing-help');
  assert.equal(intro.maybeShow(),false);assert.equal(createPlanningHistoryIntro(f.options).maybeShow(),false);
});

test('close, Escape, clicking outside and using the button dismiss the note without blocking the next action',()=>{
  for(const action of ['close','escape','outside','trigger']){
    const f=setup();f.allow();createPlanningHistoryIntro(f.options).maybeShow();
    if(action==='close')f.event(f.document.querySelector('[data-history-intro-dismiss]'),'click');
    if(action==='escape')f.event(f.document,'keydown',{key:'Escape'});
    if(action==='outside')f.event(f.document.querySelector('#outside'),'click');
    if(action==='trigger'){let used=false;f.anchor.onclick=()=>used=true;f.event(f.anchor,'click');assert.equal(used,true);}
    assert.equal(f.document.querySelector('.history-tip'),null);
    assert.equal(createPlanningHistoryIntro(f.options).maybeShow(),false);
  }
});

test('a hidden mobile button does not consume the first-use note; revealing it shows a bounded note',()=>{
  const f=setup();f.allow();f.window.innerWidth=390;
  f.setBounds({left:0,right:0,top:0,bottom:0,width:0,height:0});
  const intro=createPlanningHistoryIntro(f.options);assert.equal(intro.maybeShow(),false);assert.equal(f.options.storage.length,0);
  f.setBounds({left:240,right:375,top:280,bottom:320,width:135,height:40});intro.refresh();
  const tip=f.document.querySelector('.history-tip');assert.ok(tip);assert.ok(Number.parseFloat(tip.style.left)>=12);
  assert.ok(Number.parseFloat(tip.style.left)+Number.parseFloat(tip.style.width)<=378);
});

test('note preferences belong to each person and survive signing out of their shared budget',()=>{
  const storage=new MemoryStorage(),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
  for(const id of ids){
    const cache=accountStorage(storage,'vpo.example',id),f=setup(storage);f.allow();
    const options={...f.options,getAccount:()=>id};cache.setItem('budget','private data');
    assert.equal(createPlanningHistoryIntro(options).maybeShow(),true);cache.clear();
    assert.equal(createPlanningHistoryIntro(options).maybeShow(),false);
  }
  assert.equal(storage.length,2);
});

test('blocked storage does not prevent dismissal or repeat the note within the visit',()=>{
  const f=setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});f.allow();
  const intro=createPlanningHistoryIntro(f.options);assert.equal(intro.maybeShow(),true);
  f.event(f.document.querySelector('[data-history-tip-done]'),'click');assert.equal(intro.maybeShow(),false);
});
