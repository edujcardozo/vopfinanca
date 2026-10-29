import {test} from 'node:test';import assert from 'node:assert/strict';import {dom} from './helpers/dom.mjs';import {createState} from '../web/core.js';import {savedCardField,mountSavedCards,selectedCard} from '../web/saved-cards-ui.js';
test('inline card entry saves on Enter or leaving the field and preserves the import draft',()=>{
 const state=createState(false,'2026-11'),{document,event}=dom('<section id="import"><input id="draft" value="2026-12-10">'+savedCardField(state)+'</section><section id="other">'+savedCardField(state)+'</section>');
 let saves=0;mountSavedCards({getState:()=>state,onChange:()=>saves++});const input=document.querySelector('#import [data-card-select]');input.value='Nubank · Larissa';event(input,'keydown',{key:'Enter'});
 assert.equal(saves,1);assert.equal(document.querySelector('[data-card-create]'),null);assert.equal(document.querySelector('#draft').value,'2026-12-10');assert.equal(selectedCard(state,document.querySelector('#import')).name,'Nubank · Larissa');event(document.querySelector('#other [data-card-select]'),'focusin');assert.ok(document.querySelector('#other [data-card-options]').textContent.includes('Nubank · Larissa'));
 input.value='nubank · larissa';event(input,'focusout');assert.equal(state.cards.length,1);assert.equal(saves,1);assert.equal(input.value,'Nubank · Larissa');
 input.value='';event(input,'focusout');assert.equal(selectedCard(state,document.querySelector('#import')).cardId,'');assert.equal(state.cards.length,1);
 input.value='Nubank · Eduardo';event(input,'focusout');assert.equal(state.cards.length,2);assert.equal(saves,2);
});

test('styled card dropdown filters saved cards and supports keyboard selection, escape and inline creation',()=>{
 const state=createState(false,'2026-11');state.cards=[{id:'card-a',name:'Nubank · Larissa'},{id:'card-b',name:'Inter · Eduardo'}];
 const {document,event}=dom(savedCardField(state));mountSavedCards({getState:()=>state,onChange(){}});const input=document.querySelector('[data-card-select]');
 event(input,'focusin');assert.equal(input.getAttribute('aria-expanded'),'true');assert.equal(document.querySelector('datalist'),null);assert.equal(document.querySelectorAll('[data-card-option]').length,3);
 input.value='Inter';event(input,'input');assert.ok(!document.querySelector('[data-card-options]').textContent.includes('Larissa'));event(input,'keydown',{key:'ArrowDown'});event(input,'keydown',{key:'Enter'});assert.equal(input.value,'Inter · Eduardo');assert.equal(input.getAttribute('aria-expanded'),'false');
 event(input,'focusin');event(input,'keydown',{key:'Escape'});assert.equal(input.getAttribute('aria-expanded'),'false');
 input.value='Novo cartão';event(input,'input');const create=document.querySelector('[data-card-option]');assert.ok(create.textContent.includes('Salvar'));event(create,'click');assert.equal(state.cards.length,3);assert.equal(selectedCard(state,document.querySelector('[data-card-picker]')).name,'Novo cartão');
});
