import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {createState,saveTransaction} from '../web/core.js';
import {createReportsUI} from '../web/reports-ui.js';
function fixture(width){
 const f=dom('<html><body><div id="reports"></div></body></html>');f.window.matchMedia=()=>({matches:width<720,addEventListener(){}});
 Object.defineProperty(f.window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(v){this.querySelectorAll('option').forEach(o=>o.toggleAttribute('selected',o.value===v));},configurable:true});
 const state=createState(false,'2026-09');const add=(id,type,amount,date,categoryId=null,payee='Empresa')=>saveTransaction(state,{id,type,amount,date,categoryId,payee,description:payee,memo:''});
 add('in-sep','income',500000,'2026-09-01');add('out-sep','expense',100000,'2026-09-04','moradia','Aluguel');add('in-oct','income',300000,'2026-10-01');add('out-oct','expense',50000,'2026-10-03','mercado','Mercado');add('coffee','expense',20000,'2026-10-04','lazer','Café');state.wealth['2026-10']={otherAssets:100000,debt:20000};
 const root=f.document.querySelector('#reports');let wealthClicks=0,wealthMonth=null;const ui=createReportsUI({root,getState:()=>state,getEndMonth:()=>'2026-10',onEditWealth(month){wealthClicks++;wealthMonth=month;},notify(){}});ui.render();
 const click=s=>f.event(root.querySelector(s),'click'),change=(id,value)=>{const el=root.querySelector('#'+id);el.value=value;f.event(el,'change');};
 return {...f,root,state,ui,click,change,get wealthClicks(){return wealthClicks;},get wealthMonth(){return wealthMonth;}};
}
test('five independent report tabs support filtering, drilldown and keyboard navigation on desktop and mobile',()=>{
 for(const width of [1440,390]){
  const f=fixture(width),{root,click,change,event}=f;
  assert.equal(root.querySelectorAll('[role=tab]').length,5);assert.equal(root.querySelector('[role=tab][aria-selected=true]').dataset.reportTab,'breakdown');assert.ok(root.querySelector('.donut'));assert.equal(root.querySelector('.report-svg'),null);
  click('[data-breakdown-mode=groups]');assert.equal(root.querySelector('[data-breakdown-mode=groups]').getAttribute('aria-pressed'),'true');click('[data-report-group=daily]');assert.equal(root.querySelector('#report-group').value,'daily');assert.equal(root.querySelectorAll('[data-report-category]').length,2);
  change('report-category-filter','mercado');assert.equal(root.querySelectorAll('[data-report-category]').length,1);click('[data-report-category=mercado]');assert.ok(root.querySelector('[data-edit-tx=out-oct]'));
  click('#report-tab-spending');assert.ok(root.querySelector('.report-svg'));assert.equal(root.querySelector('.donut'),null);assert.ok(root.textContent.includes('Comparação com a média'));
  click('[data-period-toggle]');event(f.document.querySelector('[data-period-month="2026-09"][data-period-endpoint=start]'),'click');event(f.document.querySelector('[data-period-apply]'),'click');assert.equal(root.querySelectorAll('[data-report-month]').length,4); // two SVG points + two table buttons
  click('#report-tab-income');assert.ok(root.querySelector('.income-matrix'));assert.equal(root.querySelector('.donut'),null);assert.ok(root.textContent.includes('Média'));assert.ok(root.querySelector('.income-matrix tfoot').textContent.includes('7.500,00'));
  click('[data-income-detail=expense][data-income-key=mercado][data-income-month="2026-10"]');assert.ok(root.querySelector('[data-edit-tx=out-oct]'));
  click('[data-income-collapse=daily]');assert.equal(root.querySelector('[data-income-group=daily]').hidden,true);click('[data-income-collapse=daily]');assert.equal(root.querySelector('[data-income-group=daily]').hidden,false);
  click('#report-tab-wealth');assert.equal(root.querySelector('#report-group'),null);assert.equal(root.querySelector('#report-category-filter'),null);assert.ok(root.textContent.includes('7.100,00'));click('[data-report-wealth]');assert.equal(f.wealthClicks,1);click('[data-period-shift="-1"]');click('[data-report-wealth]');assert.equal(f.wealthMonth,'2026-09');click('[data-period-shift="1"]');
  click('#report-tab-age');assert.ok(root.textContent.includes('3 de 10 saídas registradas'));assert.equal(root.querySelector('.income-matrix'),null);assert.ok(root.textContent.includes('Estimativa'));
  event(root.querySelector('#report-tab-age'),'keydown',{key:'Home'});assert.equal(root.querySelector('[role=tab][aria-selected=true]').dataset.reportTab,'breakdown');event(root.querySelector('#report-tab-breakdown'),'keydown',{key:'End'});assert.equal(root.querySelector('[role=tab][tabindex="0"]').dataset.reportTab,'age');
  f.state.hideBalances=true;f.ui.render();for(const id of ['breakdown','spending','wealth','income','age']){click('#report-tab-'+id);assert.equal(root.innerHTML.includes('R$'),false,id);assert.equal(root.innerHTML.includes('NaN'),false,id);}
 }
});
test('each tab exports its own filtered CSV, and user-provided spreadsheet formulas stay text',async()=>{
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let blob;
 try{
  URL.createObjectURL=value=>{blob=value;return 'blob:report-test';};URL.revokeObjectURL=()=>{};
  const f=fixture(1440);f.state.categories.find(c=>c.id==='mercado').name='=1+1';f.ui.render();f.change('report-category-filter','mercado');f.click('[data-report-export]');let csv=await blob.text();assert.ok(csv.includes("'=1+1"));assert.ok(csv.includes('500,00'));assert.equal(csv.includes('Aluguel'),false);
  for(const [tab,header] of [['spending','Diferença da média'],['wealth','Patrimônio líquido'],['income','Média mensal'],['age','Idade estimada (dias)']]){f.click('#report-tab-'+tab);f.click('[data-report-export]');csv=await blob.text();assert.ok(csv.includes(header),tab);assert.ok(csv.includes('2026-10'),tab);}
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
test('mobile report cards open a detail and return to the overview without losing period controls',()=>{
 const f=fixture(390);assert.ok(f.root.querySelector('.mobile-reflect'));assert.equal(f.root.querySelector('.mobile-reflect').textContent.includes('Meta'),false);f.click('[data-mobile-report=income]');assert.equal(f.root.querySelector('.mobile-reflect'),null);assert.ok(f.root.querySelector('.report-detail.mobile-detail-open'));assert.ok(f.root.querySelector('.income-matrix'));f.click('[data-mobile-report-back]');assert.ok(f.root.querySelector('.mobile-reflect'));f.click('[data-mobile-report=wealth]');assert.ok(f.root.querySelector('[data-report-wealth]'));assert.ok(f.root.querySelector('[data-period-toggle]'));f.ui.resetMobile();f.ui.render();assert.ok(f.root.querySelector('.mobile-reflect'));
});
