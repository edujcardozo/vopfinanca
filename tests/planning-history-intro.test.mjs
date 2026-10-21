import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {MemoryStorage} from './helpers/sync-env.mjs';
import {accountStorage} from '../standalone/storage.js';
import {createPlanningHistoryIntro,HISTORY_INTRO_KEY} from '../web/planning-history-intro.js';

function setup(storage=new MemoryStorage()){
  const {document,event}=dom('<html><body><div id="content"></div></body></html>');
  let allowed=false,opened=0,closed=0,explored=0;
  const options={storage,documentObject:document,canShow:()=>allowed,openDialog:(_title,body)=>{opened++;document.querySelector('#content').innerHTML=body;},closeDialog:()=>closed++,onExplore:()=>explored++};
  return {document,event,options,allow:()=>allowed=true,get opened(){return opened;},get closed(){return closed;},get explored(){return explored;}};
}

test('history introduction waits for the planning view, opens once and stays dismissed after reload',()=>{
  const f=setup(),intro=createPlanningHistoryIntro(f.options);
  assert.equal(intro.maybeShow(),false);assert.equal(f.options.storage.getItem(HISTORY_INTRO_KEY),null);
  f.allow();assert.equal(intro.maybeShow(),true);assert.equal(f.document.querySelectorAll('.history-welcome-methods li').length,3);
  f.event(f.document.querySelector('[data-history-intro-dismiss]'),'click');assert.equal(f.closed,1);
  assert.equal(intro.maybeShow(),false);
  assert.equal(createPlanningHistoryIntro(f.options).maybeShow(),false);assert.equal(f.opened,1);
});

test('exploring opens the actual options and dismissing with X or Escape also stays dismissed',()=>{
  const f=setup();f.allow();const intro=createPlanningHistoryIntro(f.options);intro.maybeShow();
  f.event(f.document.querySelector('[data-history-intro-explore]'),'click');assert.equal(f.closed,1);assert.equal(f.explored,1);
  assert.equal(createPlanningHistoryIntro(f.options).maybeShow(),false);
  const second=setup();second.allow();createPlanningHistoryIntro(second.options).maybeShow();
  // The global modal owns X/Escape. Receipt is saved when the introduction is displayed.
  second.options.closeDialog();assert.equal(createPlanningHistoryIntro(second.options).maybeShow(),false);
});

test('introduction preferences belong to each person, not to their shared budget',()=>{
  const storage=new MemoryStorage(),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
  for(const id of ids){
    const cache=accountStorage(storage,'vpo.example',id),f=setup(storage);f.allow();
    const options={...f.options,getAccount:()=>id};
    cache.setItem('budget','private data');
    assert.equal(createPlanningHistoryIntro(options).maybeShow(),true);
    cache.clear(); // Signing out removes financial data, retaining only this non-sensitive preference.
    assert.equal(createPlanningHistoryIntro(options).maybeShow(),false);
  }
  assert.equal(storage.length,2);
});

test('blocked browser storage does not prevent use or repeat the introduction within the visit',()=>{
  const f=setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});f.allow();
  const intro=createPlanningHistoryIntro(f.options);assert.equal(intro.maybeShow(),true);assert.equal(intro.maybeShow(),false);
  f.event(f.document.querySelector('[data-history-intro-dismiss]'),'click');assert.equal(f.closed,1);
});
