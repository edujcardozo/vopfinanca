import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {presetPeriod,monthCount,validatePeriod,createReportPeriod} from '../web/report-period.js';
import {createState,saveTransaction} from '../web/core.js';
import {buildReports} from '../web/reports-core.js';
test('period presets cross year boundaries correctly and reject invalid or excessive intervals',()=>{
 assert.deepEqual(presetPeriod('3','2026-01'),{start:'2025-11',end:'2026-01'});assert.deepEqual(presetPeriod('year','2026-10'),{start:'2026-01',end:'2026-10'});assert.deepEqual(presetPeriod('previous','2026-10'),{start:'2025-01',end:'2025-12'});assert.deepEqual(presetPeriod('all','2026-10','2024-02','2026-09'),{start:'2024-02',end:'2026-10'});assert.equal(monthCount('2025-12','2026-01'),2);
 for(const p of [{start:'2026-11',end:'2026-10'},{start:'2026-99',end:'2026-10'},{start:'2000-01',end:'2026-10'}])assert.throws(()=>validatePeriod(p));assert.deepEqual(validatePeriod({start:'2006-11',end:'2026-10'}),{start:'2006-11',end:'2026-10'});
});
test('explicit calendar intervals include selected empty months, constrain every report and keep prior carryovers',()=>{
 const s=createState(false,'2026-09');saveTransaction(s,{id:'in',type:'income',description:'Salário',payee:'Salário',amount:100000,date:'2026-09-01',categoryId:null});saveTransaction(s,{id:'out',type:'expense',description:'Mercado',payee:'Mercado',amount:20000,date:'2026-10-01',categoryId:'mercado'});
 const d=buildReports(s,'2026-10',1,'all',{startMonth:'2026-08'});assert.deepEqual(d.series.map(r=>r.month),['2026-08','2026-09','2026-10']);assert.equal(d.income,100000);assert.equal(d.filteredExpense,20000);assert.equal(d.series.at(-1).balance,80000);
 const october=buildReports(s,'2026-10',1,'all',{startMonth:'2026-10'});assert.equal(october.income,0);assert.equal(october.series[0].balance,80000);assert.equal(october.filteredExpense,20000);
 assert.throws(()=>buildReports(s,'2026-10',1,'all',{startMonth:'2026-11'}));assert.throws(()=>buildReports(s,'2026-10',1,'all',{startMonth:'2000-01'}));
});
test('month calendar separates draft and applied ranges, cancels safely and supports keyboard and touch-size layouts',()=>{
 for(const width of [390,1440]){
  const f=dom('<html><body><div id="root"></div></body></html>'),root=f.document.querySelector('#root');f.window.innerWidth=width;f.window.innerHeight=900;let period={start:'2026-10',end:'2026-10'},applied=[];
  const picker=createReportPeriod({root,getPeriod:()=>period,getNow:()=>'2026-10',getBounds:()=>({start:'2025-01',end:'2026-10'}),onApply:p=>{period=p;applied.push(p);root.innerHTML=picker.renderTrigger();}});root.innerHTML=picker.renderTrigger();
  const click=selector=>f.event(f.document.querySelector(selector),'click');click('[data-period-toggle]');assert.equal(f.document.querySelectorAll('[data-period-month]').length,24);assert.equal(f.document.querySelector('#report-period-picker').getAttribute('aria-modal'),'true');
  click('[data-period-month="2026-09"][data-period-endpoint=start]');assert.equal(applied.length,0);click('[data-period-cancel]');assert.equal(f.document.querySelector('#report-period-picker'),null);assert.equal(period.start,'2026-10');assert.equal(f.document.activeElement,root.querySelector('[data-period-toggle]'));
  click('[data-period-toggle]');f.event(f.document.activeElement,'keydown',{key:'ArrowLeft'});assert.equal(f.document.activeElement.dataset.periodMonth,'2026-09');f.event(f.document.activeElement,'keydown',{key:'Escape'});assert.equal(applied.length,0);assert.equal(f.document.querySelector('#report-period-picker'),null);
  click('[data-period-toggle]');click('[data-period-preset="3"]');assert.equal(applied.length,0);click('[data-period-apply]');assert.deepEqual(period,{start:'2026-08',end:'2026-10'});assert.equal(f.document.querySelector('#report-period-picker'),null);assert.ok(root.textContent.includes('ago'));
  click('[data-period-shift="-1"]');assert.deepEqual(period,{start:'2026-07',end:'2026-09'});
  click('[data-period-toggle]');click('[data-period-year=end][data-year-step="-1"]');click('[data-period-month="2025-12"][data-period-endpoint=end]');click('[data-period-apply]');assert.deepEqual(period,{start:'2025-12',end:'2025-12'});
  click('[data-period-toggle]');click('button[data-calendar-endpoint=end]');assert.equal(f.document.querySelector('#report-period-picker').dataset.calendarEndpoint,'end');const presetSelect=f.document.querySelector('[data-period-select]');Object.defineProperty(presetSelect,'value',{value:'6',configurable:true});f.event(presetSelect,'change');click('[data-period-apply]');assert.deepEqual(period,{start:'2026-05',end:'2026-10'});
 }
});
