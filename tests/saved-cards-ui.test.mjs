import {test} from 'node:test';import assert from 'node:assert/strict';import {dom} from './helpers/dom.mjs';import {createState} from '../web/core.js';import {savedCardField,mountSavedCards,selectedCard} from '../web/saved-cards-ui.js';
test('creating a card in a nested popup selects it and preserves the surrounding import draft',()=>{
 const state=createState(false,'2026-11'),{document,window,event}=dom('<section id="import"><input id="draft" value="2026-12-10">'+savedCardField(state)+'</section><section id="other">'+savedCardField(state)+'</section>');
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 let saves=0;mountSavedCards({getState:()=>state,onChange:()=>saves++});event(document.querySelector('#import [data-card-create]'),'click');
 document.querySelector('.saved-card-dialog input').value='Nubank · Larissa';event(document.querySelector('#saved-card-form'),'submit');
 assert.equal(saves,1);assert.equal(document.querySelector('.saved-card-dialog'),null);assert.equal(document.querySelector('#draft').value,'2026-12-10');assert.equal(selectedCard(state,document.querySelector('#import')).name,'Nubank · Larissa');assert.ok(document.querySelector('#other option[value="'+state.cards[0].id+'"]'));
 event(document.querySelector('#import [data-card-create]'),'click');document.querySelector('.saved-card-dialog input').value='nubank · larissa';event(document.querySelector('#saved-card-form'),'submit');assert.equal(state.cards.length,1);
});
