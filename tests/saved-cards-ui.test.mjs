import {test} from 'node:test';import assert from 'node:assert/strict';import {dom} from './helpers/dom.mjs';import {createState} from '../web/core.js';import {savedCardField,mountSavedCards,selectedCard} from '../web/saved-cards-ui.js';
test('inline card entry saves on Enter or leaving the field and preserves the import draft',()=>{
 const state=createState(false,'2026-11'),{document,event}=dom('<section id="import"><input id="draft" value="2026-12-10">'+savedCardField(state)+'</section><section id="other">'+savedCardField(state)+'</section>');
 let saves=0;mountSavedCards({getState:()=>state,onChange:()=>saves++});const input=document.querySelector('#import [data-card-select]');input.value='Nubank · Larissa';event(input,'keydown',{key:'Enter'});
 assert.equal(saves,1);assert.equal(document.querySelector('[data-card-create]'),null);assert.equal(document.querySelector('#draft').value,'2026-12-10');assert.equal(selectedCard(state,document.querySelector('#import')).name,'Nubank · Larissa');assert.ok(document.querySelector('#other datalist option[value="Nubank · Larissa"]'));
 input.value='nubank · larissa';event(input,'focusout');assert.equal(state.cards.length,1);assert.equal(saves,1);assert.equal(input.value,'Nubank · Larissa');
 input.value='';event(input,'focusout');assert.equal(selectedCard(state,document.querySelector('#import')).cardId,'');assert.equal(state.cards.length,1);
 input.value='Nubank · Eduardo';event(input,'focusout');assert.equal(state.cards.length,2);assert.equal(saves,2);
});
