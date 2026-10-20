import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryTotals,createState,ensureMonth,saveTransaction} from '../web/core.js';
import {categorySpendingProgress,categoryBudgetDetails,categorySpendingLabel} from '../web/budget-progress.js';
const totals=(assigned,spent,carryover=0)=>({assigned,spent,carryover,available:assigned+carryover-spent});
test('consumption grows as transactions are added in the selected month and excludes future spending',()=>{const s=createState(false,'2026-10');ensureMonth(s,'2026-10').assigned.mercado=100000;const tx={id:'oct',type:'expense',description:'Mercado',amount:24700,categoryId:'mercado',date:'2026-10-19'};saveTransaction(s,tx);saveTransaction(s,{...tx,id:'nov',date:'2026-11-01',amount:20000});const p=categorySpendingProgress(categoryTotals(s,'2026-10','mercado'),100000);assert.equal(p.spentRatio,.247);assert.equal(p.availableRatio,.753);assert.equal(p.overspentRatio,0);});
test('legacy targets do not appear or affect consumption; only planned funds and spending count',()=>{const t=totals(0,24700),p=categorySpendingProgress(t),html=categoryBudgetDetails({target:100000},t);assert.equal(p.spentRatio,0);assert.equal(p.overspentRatio,1);assert.equal(html.includes('Meta'),false);assert.equal(html.includes('1.000,00'),false);assert.ok(html.includes('Planejado R$'));assert.ok(html.includes('247,00 a cobrir'));assert.equal(html,categoryBudgetDetails({target:0},t));});
test('bars remain bounded with empty plans, overspending, carried funds and previous-month deficits',()=>{for(const t of [totals(0,0),totals(0,30000),totals(10000,20000),totals(10000,20000,40000),totals(10000,20000,-30000)]){for(const goal of [0,100000]){const p=categorySpendingProgress(t,goal),sum=p.spentRatio+p.availableRatio+p.overspentRatio;assert.ok(sum>=0&&sum<=1+1e-9);assert.ok(Number.isFinite(sum));assert.equal(p.overspent,Math.max(0,-t.available));}}});
test('spending display works without a target and privacy suppresses amounts and visual ratios',()=>{const t=totals(100000,24700),plain=categoryBudgetDetails({target:0},t),hidden=categoryBudgetDetails({target:100000},t,true);assert.ok(plain.includes('24.7%'));assert.ok(plain.includes('restantes'));assert.ok(hidden.includes('Valores ocultos'));assert.equal(hidden.includes('247'),false);assert.equal(hidden.includes('width:'),false);});

test('visible spending summary follows the monthly bar and never exposes hidden amounts',()=>{
 const normal=categorySpendingLabel(totals(20000,15000));assert.ok(normal.includes('150,00'));assert.ok(normal.includes('200,00'));
 const carried=categorySpendingLabel(totals(10000,15000,10000));assert.ok(carried.includes('de R$ 200,00'));assert.ok(carried.includes('saldo anterior'));
 const hidden=categorySpendingLabel(totals(20000,15000),true);assert.ok(hidden.includes('Valores ocultos'));assert.equal(hidden.includes('150'),false);assert.equal(hidden.includes('200'),false);assert.equal(hidden.includes('title='),false);
 assert.ok(categorySpendingLabel(totals(10000,15000)).includes('is-overspent'));
});
