import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {revealTransactionComposer} from '../web/transaction-focus.js';

function fixture(reduced=false){
 const {document}=dom('<section id="composer"><input><div id="sharing" hidden></div><button>Salvar</button></section>');
 const composer=document.querySelector('section'),focusTarget=document.querySelector('input'),calls=[];
 let frame;
 focusTarget.focus=options=>calls.push({kind:'focus',options});
 composer.scrollIntoView=options=>calls.push({kind:'scroll',options,sharingVisible:!document.querySelector('#sharing').hidden});
 composer.animate=()=>calls.push({kind:'animation'});
 const windowObject={matchMedia:()=>({matches:reduced}),requestAnimationFrame:callback=>frame=callback};
 return {document,composer,focusTarget,calls,windowObject,paint:()=>frame()};
}
test('the complete composer is centered after layout and focused without a second browser scroll',()=>{
 const f=fixture();revealTransactionComposer(f.composer,{focusTarget:f.focusTarget,windowObject:f.windowObject});
 assert.equal(f.calls.length,0);
 f.document.querySelector('#sharing').hidden=false;f.paint();
 assert.deepEqual(f.calls,[{kind:'focus',options:{preventScroll:true}},{kind:'scroll',options:{block:'center',inline:'nearest',behavior:'smooth'},sharingVisible:true},{kind:'animation'}]);
});
test('reduced motion still centers the whole form without animated scrolling or entry animation',()=>{
 const f=fixture(true);revealTransactionComposer(f.composer,{focusTarget:f.focusTarget,windowObject:f.windowObject});f.paint();
 assert.equal(f.calls.find(call=>call.kind==='scroll').options.behavior,'instant');
 assert.equal(f.calls.some(call=>call.kind==='animation'),false);
});
test('closing or replacing a composer before the next paint never steals focus or scrolls the page',()=>{
 for(const change of [f=>f.composer.hidden=true,f=>f.focusTarget.remove(),f=>f.composer.remove()]){
  const f=fixture();revealTransactionComposer(f.composer,{focusTarget:f.focusTarget,windowObject:f.windowObject});change(f);f.paint();assert.equal(f.calls.length,0);
 }
});
