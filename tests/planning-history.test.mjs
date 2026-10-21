import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,ensureMonth,saveTransaction,validateState} from '../web/core.js';
import {planningHistory,applyPlanningHistory,undoPlanningHistory} from '../web/planning-history.js';

function expense(state,month,amount,categoryId='mercado',suffix=''){
  saveTransaction(state,{id:`expense-${month}-${categoryId}-${suffix}`,type:'expense',amount,categoryId,date:month+'-10',description:'Compra'});
}
const plan=()=>createState(false,'2026-10');

test('last month uses actual category expenses only and replaces selected assignments without duplicating transactions',()=>{
  const state=plan();expense(state,'2026-09',5000);expense(state,'2026-09',2000,'mercado','two');expense(state,'2026-09',3000,'moradia');
  expense(state,'2026-08',99999);expense(state,'2026-10',88888);expense(state,'2026-11',77777);
  saveTransaction(state,{id:'income',type:'income',amount:600000,categoryId:null,date:'2026-09-01',description:'Entrada'});
  state.months['2026-09'].assigned.mercado=90000;state.months['2026-10'].assigned={mercado:1000,moradia:20000,reserva:6000};
  const transactions=JSON.stringify(Object.values(state.months).map(month=>month.transactions));
  const preview=planningHistory(state,'2026-10','last-month','2026-10');
  assert.deepEqual(preview.rows.map(row=>[row.id,row.suggested]),[['moradia',3000],['mercado',7000]]);
  const receipt=applyPlanningHistory(state,preview,['mercado'],'2026-10');
  assert.deepEqual(state.months['2026-10'].assigned,{mercado:7000,moradia:20000,reserva:6000});
  assert.equal(JSON.stringify(Object.values(state.months).map(month=>month.transactions)),transactions);
  assert.equal(state.months['2026-09'].assigned.mercado,90000);assert.equal(receipt.changes.length,1);validateState(state);
});

test('six-month average includes empty months as zero and rounds each category to the nearest cent',()=>{
  const state=plan();expense(state,'2026-01',1234);expense(state,'2026-04',1000);expense(state,'2026-09',1001);expense(state,'2026-09',3,'moradia');
  const preview=planningHistory(state,'2026-10','six-months','2026-10');
  assert.deepEqual([preview.start,preview.end,preview.count,preview.partial],['2026-04','2026-09',6,false]);
  assert.equal(preview.rows.find(row=>row.id==='mercado').suggested,334);
  assert.equal(preview.rows.find(row=>row.id==='moradia').suggested,1);
});

test('shorter history uses available months and discloses the sample size',()=>{
  const state=plan();expense(state,'2026-07',600);expense(state,'2026-09',300);
  const preview=planningHistory(state,'2026-10','six-months','2026-10');
  assert.deepEqual([preview.start,preview.end,preview.count,preview.partial],['2026-07','2026-09',3,true]);
  assert.equal(preview.rows[0].suggested,300);
});

test('year average excludes the selected month and prior years, while including empty months after history began',()=>{
  const state=plan();expense(state,'2025-12',90000);expense(state,'2026-01',9000);expense(state,'2026-09',9000);expense(state,'2026-10',800000);
  const preview=planningHistory(state,'2026-10','year','2026-10');
  assert.deepEqual([preview.start,preview.end,preview.count],['2026-01','2026-09',9]);assert.equal(preview.rows[0].suggested,2000);
  const january=planningHistory(state,'2026-01','year','2026-10');assert.equal(january.count,0);assert.equal(january.rows.length,0);
});

test('planning future months caps averages at the present and indicates the ongoing month',()=>{
  const state=plan();expense(state,'2026-09',1000);expense(state,'2026-10',3000);expense(state,'2026-11',99999);
  const preview=planningHistory(state,'2026-12','six-months','2026-10');
  assert.deepEqual([preview.start,preview.end,preview.count,preview.inProgress],['2026-09','2026-10',2,true]);assert.equal(preview.rows[0].suggested,2000);
  assert.equal(planningHistory(state,'2026-12','last-month','2026-10').rows.length,0);
});

test('hidden categories and categories without historical expenses preserve their current plan',()=>{
  const state=plan();state.categories.find(category=>category.id==='moradia').hidden=true;
  expense(state,'2026-09',9000,'moradia');expense(state,'2026-09',1000);
  state.months['2026-10'].assigned={moradia:5000,reserva:6000};
  const preview=planningHistory(state,'2026-10','last-month','2026-10');assert.deepEqual(preview.rows.map(row=>row.id),['mercado']);
  applyPlanningHistory(state,preview,['mercado'],'2026-10');assert.deepEqual(state.months['2026-10'].assigned,{moradia:5000,reserva:6000,mercado:1000});
});

test('missing source history never clears planned values',()=>{
  const state=plan();state.months['2026-10'].assigned.mercado=1000;
  const before=JSON.stringify(state),preview=planningHistory(state,'2026-10','last-month','2026-10');
  assert.equal(preview.rows.length,0);assert.throws(()=>applyPlanningHistory(state,preview,['mercado'],'2026-10'),/mudou/);assert.equal(JSON.stringify(state),before);
});

test('stale source expenses or planned amounts abort the entire operation before changing anything',()=>{
  for(const mutate of [state=>expense(state,'2026-09',600,'moradia','new'),state=>state.months['2026-10'].assigned.moradia=5000,state=>state.categories.find(category=>category.id==='moradia').hidden=true]){
    const state=plan();expense(state,'2026-09',1000);expense(state,'2026-09',2000,'moradia');
    const preview=planningHistory(state,'2026-10','last-month','2026-10');mutate(state);const before=JSON.stringify(state);
    assert.throws(()=>applyPlanningHistory(state,preview,['mercado','moradia'],'2026-10'),/mudou/);assert.equal(JSON.stringify(state),before);
  }
});

test('undo restores missing and existing assignments while keeping unrelated edits and new transactions',()=>{
  const state=plan();expense(state,'2026-09',1000);expense(state,'2026-09',2000,'moradia');state.months['2026-10'].assigned.mercado=500;
  const receipt=applyPlanningHistory(state,planningHistory(state,'2026-10','last-month','2026-10'),['mercado','moradia'],'2026-10');
  state.months['2026-10'].assigned.reserva=1234;expense(state,'2026-10',300);ensureMonth(state,'2026-11').assigned.mercado=555;
  undoPlanningHistory(state,receipt);assert.deepEqual(state.months['2026-10'].assigned,{mercado:500,reserva:1234});
  assert.equal(state.months['2026-10'].transactions.length,1);assert.equal(state.months['2026-11'].assigned.mercado,555);
});

test('undo refuses to overwrite a more recent edit, including when another receipt field could be restored',()=>{
  const state=plan();expense(state,'2026-09',1000);expense(state,'2026-09',2000,'moradia');
  const receipt=applyPlanningHistory(state,planningHistory(state,'2026-10','last-month','2026-10'),['mercado','moradia'],'2026-10');
  state.months['2026-10'].assigned.moradia=9000;const before=JSON.stringify(state);
  assert.throws(()=>undoPlanningHistory(state,receipt),/já foi alterado/);assert.equal(JSON.stringify(state),before);
});

test('a different plan cannot receive a stale preview or undo',()=>{
  const state=plan();expense(state,'2026-09',1000);const preview=planningHistory(state,'2026-10','last-month','2026-10');
  state.planId='other';assert.throws(()=>applyPlanningHistory(state,preview,['mercado'],'2026-10'),/mudou/);
});

test('averages may round to zero but amounts exceeding the assignment limit cannot be applied',()=>{
  const state=plan();expense(state,'2026-04',1);assert.equal(planningHistory(state,'2026-10','six-months','2026-10').rows[0].suggested,0);
  expense(state,'2026-09',1e12,'moradia');expense(state,'2026-09',1,'moradia','two');
  assert.throws(()=>planningHistory(state,'2026-10','last-month','2026-10'),/limite/);
});
