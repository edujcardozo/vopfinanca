import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {createState} from '../web/core.js';
import {saveSavingsGoal} from '../web/savings-goals.js';
import {createSavingsGoalsUI} from '../web/savings-goals-ui.js';
import {mountBillingAccess} from '../standalone/billing-access.js';
test('three goals appear in the sidebar; the popup offers every goal and supports create, update and removal',()=>{
 const original=globalThis.FormData;
 try{
 const {document,window,event}=dom('<aside class="app-sidebar"><nav></nav><section id="goals"></section><div class="sidebar-bottom"></div></aside><dialog></dialog>');
 window.innerHeight=800;window.matchMedia=()=>({matches:true});
 globalThis.FormData=class{constructor(form){this.form=form;}get(name){return this.form.querySelector(`[name="${name}"]`)?.value??null;}};
 const state=createState(false,'2026-10');for(let i=1;i<=5;i++)saveSavingsGoal(state,{name:'Objetivo '+i,targetAmount:10000*i,savedAmount:1000*i});
 const root=document.querySelector('#goals'),dialog=document.querySelector('dialog');let changes=0;
 const ui=createSavingsGoalsUI({root,getState:()=>state,documentObject:document,windowObject:window,openDialog:(_,html)=>dialog.innerHTML=html,closeDialog:()=>dialog.innerHTML='',onChange:()=>{changes++;ui.render();}});
 assert.equal(root.querySelectorAll('[data-savings-edit]').length,3);assert.equal(root.querySelector('[data-savings-all]').hidden,false);
 event(root.querySelector('[data-savings-all]'),'click');assert.equal(dialog.querySelectorAll('.savings-card').length,4);
 event(dialog.querySelector('[data-savings-page="1"]'),'click');assert.ok(dialog.textContent.includes('Objetivo 5'));
 event(dialog.querySelector('[data-savings-add]'),'click');const form=dialog.querySelector('form');
 form.querySelector('[name=goalName]').value='Férias';form.querySelector('[name=targetAmount]').value='2.000,00';form.querySelector('[name=savedAmount]').value='450,50';event(form,'submit');
 assert.equal(state.savingsGoals.at(-1).savedAmount,45050);assert.equal(state.savingsGoals.at(-1).targetAmount,200000);assert.equal(changes,1);
 ui.showAll(1);event(dialog.querySelector(`[data-savings-edit="${state.savingsGoals.at(-1).id}"]`),'click');
 dialog.querySelector('[name=savedAmount]').value='800,00';event(dialog.querySelector('form'),'submit');assert.equal(state.savingsGoals.at(-1).savedAmount,80000);
 ui.showAll(1);event(dialog.querySelector(`[data-savings-edit="${state.savingsGoals.at(-1).id}"]`),'click');event(dialog.querySelector('[data-savings-remove]'),'click');assert.equal(state.savingsGoals.length,6);
 event(dialog.querySelector('[data-savings-confirm-remove]'),'click');assert.equal(state.savingsGoals.length,5);assert.equal(changes,3);
 }finally{globalThis.FormData=original;}
});
test('goal names are escaped, privacy hides progress, and an expired plan cannot edit goals',()=>{
 const {document,window,event}=dom('<section id="app"><aside class="app-sidebar"><nav></nav><section id="goals"></section><div class="sidebar-bottom"></div></aside></section><dialog></dialog>');
 window.innerHeight=800;window.matchMedia=()=>({matches:true});const state=createState(false,'2026-10');saveSavingsGoal(state,{name:'<img src=x onerror=alert(1)>',targetAmount:10000,savedAmount:3000});
 const root=document.querySelector('#goals');let access=0;
 const guard=mountBillingAccess({root:document.querySelector('#app'),documentObject:document,showBilling:()=>access++});
 const ui=createSavingsGoalsUI({root,getState:()=>state,documentObject:document,windowObject:window,openDialog:(_,html)=>document.querySelector('dialog').innerHTML=html,closeDialog(){},onChange(){}});
 assert.equal(root.querySelector('img'),null);assert.equal(root.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'30');
 state.hideBalances=true;ui.render();assert.equal(root.querySelector('[role=progressbar]'),null);assert.ok(!root.textContent.includes('30%'));
 guard.update({accessEnforced:true,canUse:false});
 assert.equal(event(root.querySelector('[data-savings-add]'),'click').defaultPrevented,true);assert.equal(access,1);guard.destroy();
});
