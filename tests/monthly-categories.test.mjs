import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,ensureMonth,monthlyCategoryTotals,monthlyPlanTotals,totals,saveTransaction} from '../web/core.js';
import {categorySpendingProgress,categorySpendingLabel} from '../web/budget-progress.js';

test('unplanned future categories start at zero despite prior surpluses and deficits, without creating months',()=>{
  const state=createState(false,'2026-10');state.months['2026-10'].assigned.mercado=100000;
  saveTransaction(state,{id:'old-deficit',type:'expense',amount:50000,categoryId:'moradia',date:'2026-10-10',description:'Despesa anterior'});
  const before=JSON.stringify(state),cash=totals(state,'2026-10');
  for(const month of ['2026-11','2026-12','2027-01'])for(const category of ['mercado','moradia']){
    const values=monthlyCategoryTotals(state,month,category);assert.deepEqual(values,{assigned:0,spent:0,carryover:0,available:0});
    const bar=categorySpendingProgress(values);assert.equal(bar.status,'empty');assert.equal(bar.availableRatio,0);assert.equal(bar.overspentRatio,0);
  }
  assert.equal(JSON.stringify(state),before);assert.deepEqual(totals(state,'2026-10'),cash);
});

test('manual planning funds only the chosen month and never adds prior balances or changes another month',()=>{
  const state=createState(true,'2026-10');const prior=structuredClone(state.months['2026-10']);
  ensureMonth(state,'2026-11').assigned.mercado=20000;
  saveTransaction(state,{id:'nov-expense',type:'expense',amount:3500,categoryId:'mercado',date:'2026-11-05',description:'Compra'});
  assert.deepEqual(monthlyCategoryTotals(state,'2026-11','mercado'),{assigned:20000,spent:3500,carryover:0,available:16500});
  assert.equal(monthlyCategoryTotals(state,'2026-12','mercado').available,0);
  assert.deepEqual(state.months['2026-10'],prior);
  assert.doesNotMatch(categorySpendingLabel(monthlyCategoryTotals(state,'2026-11','mercado')),/saldo anterior/i);
});

test('real expenses remain visible without planning, and future income never becomes an automatic allocation',()=>{
  const state=createState(true,'2026-10');
  saveTransaction(state,{id:'nov-income',type:'income',amount:90000,categoryId:null,date:'2026-11-01',description:'Entrada'});
  saveTransaction(state,{id:'nov-expense',type:'expense',amount:5000,categoryId:'mercado',date:'2026-11-05',description:'Compra'});
  assert.deepEqual(monthlyCategoryTotals(state,'2026-11','mercado'),{assigned:0,spent:5000,carryover:0,available:-5000});
  assert.equal(monthlyCategoryTotals(state,'2026-11','moradia').available,0);
  assert.deepEqual(monthlyPlanTotals(state,'2026-11'),{planned:0,spent:5000,remaining:-5000});
});

test('category monthly amounts reconcile with the header in past, current and future periods',()=>{
  const state=createState(true,'2026-10');ensureMonth(state,'2026-11').assigned.mercado=12000;ensureMonth(state,'2027-01').assigned.moradia=20000;
  for(const month of ['2026-09','2026-10','2026-11','2026-12','2027-01']){
    const sum=state.categories.map(category=>monthlyCategoryTotals(state,month,category.id)).reduce((result,item)=>({planned:result.planned+item.assigned,spent:result.spent+item.spent,remaining:result.remaining+item.available}),{planned:0,spent:0,remaining:0});
    assert.deepEqual(sum,monthlyPlanTotals(state,month));
  }
});
