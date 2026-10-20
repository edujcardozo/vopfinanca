import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,saveTransaction,totals,validateState} from '../web/core.js';
import {buildReports,wealthAt,cashAgeHistory,ageAt} from '../web/reports-core.js';
import {chartSvg,createReportsUI} from '../web/reports-ui.js';

const add=(s,id,type,amount,date,categoryId=null,payee='Pessoa')=>saveTransaction(s,{id,type,amount,date,categoryId,description:payee,payee,memo:''});
function history(){
  const s=createState(false,'2026-09');
  add(s,'in-sep','income',500000,'2026-09-01',null,'Empresa');
  add(s,'out-sep','expense',100000,'2026-09-10','moradia','Aluguel');
  add(s,'in-oct','income',300000,'2026-10-01',null,'Cliente');
  add(s,'out-oct','expense',50000,'2026-10-03','mercado','Mercado');
  add(s,'out-oct2','expense',20000,'2026-10-04','lazer','Café');
  return s;
}
test('reports aggregate dates and expenses exactly without treating allocations as spending',()=>{
  const s=history();s.months['2026-10'].assigned.mercado=90000;
  const d=buildReports(s,'2026-10',6);
  assert.deepEqual(d.series.map(r=>r.month),['2026-09','2026-10']);
  assert.equal(d.income,800000);assert.equal(d.expense,170000);assert.equal(d.net,630000);
  assert.equal(d.series[1].balance,630000);assert.equal(d.spending[0].id,'moradia');
  assert.equal(d.savingsRate,78.75);assert.equal(d.spending.reduce((a,c)=>a+c.spent,0),170000);
  const october=buildReports(s,'2026-10',1);assert.equal(october.net,230000);assert.equal(october.series[0].balance,630000);
});
test('group filters affect spending breakdown and trends, not total income, total expenses or wealth',()=>{
  const s=history();s.wealth['2026-09']={otherAssets:100000,debt:20000};
  const d=buildReports(s,'2026-10',6,'daily');
  assert.equal(d.filteredExpense,70000);assert.equal(d.expense,170000);assert.equal(d.income,800000);
  assert.equal(d.spending.length,2);assert.equal(d.series[0].filteredExpense,0);assert.equal(d.wealth.netWorth,710000);
});
test('net worth needs an explicit snapshot, carries it forward and never counts cash twice',()=>{
  const s=history(),before=structuredClone(s.months);
  assert.equal(wealthAt(s,'2026-10').known,false);
  s.wealth['2026-10']={otherAssets:200000,debt:100000};
  assert.equal(wealthAt(s,'2026-09').netWorth,null);
  assert.equal(wealthAt(s,'2026-10').assets,830000);assert.equal(wealthAt(s,'2026-10').netWorth,730000);
  assert.equal(wealthAt(s,'2026-11').recordedMonth,'2026-10');
  s.wealth['2026-11']={otherAssets:0,debt:0};assert.equal(wealthAt(s,'2026-11').netWorth,630000);
  assert.deepEqual(s.months,before);assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
  const negative=createState(false,'2026-10');add(negative,'overdraft','expense',50000,'2026-10-01','mercado');negative.wealth['2026-10']={otherAssets:20000,debt:10000};
  assert.deepEqual(wealthAt(negative,'2026-10'),{known:true,cash:-50000,assets:20000,debt:60000,netWorth:-40000,otherAssets:20000,recordedMonth:'2026-10'});
});
test('wealth snapshots validate and migrate old backups without altering the ledger',()=>{
  const s=history(),old=structuredClone(s);delete old.wealth;
  assert.deepEqual(validateState(old),s);
  const bad=structuredClone(s);bad.wealth['2026-10']={otherAssets:-1,debt:0};assert.throws(()=>validateState(bad));
  const month=structuredClone(s);month.wealth['2026-99']={otherAssets:0,debt:0};assert.throws(()=>validateState(month));
});
test('cash age is unavailable before 10 covered outflows and follows the disclosed FIFO estimate',()=>{
  const s=createState(false,'2026-01');
  add(s,'old','income',50000,'2026-01-01');add(s,'new','income',50000,'2026-01-11');
  for(let i=0;i<9;i++)add(s,'e'+i,'expense',10000,'2026-01-21','mercado');
  assert.equal(ageAt(cashAgeHistory(s),'2026-01').days,null);
  add(s,'last','expense',10000,'2026-01-21','mercado');
  assert.equal(ageAt(cashAgeHistory(s),'2026-01').days,15);assert.equal(ageAt(cashAgeHistory(s),'2025-12').days,null);
  const unknown=createState(false,'2026-01');for(let i=0;i<10;i++)add(unknown,'u'+i,'expense',1000,'2026-01-01','mercado');
  assert.equal(ageAt(cashAgeHistory(unknown),'2026-01').days,null);
  add(unknown,'repay','income',10000,'2026-01-02');add(unknown,'still-unknown','expense',1000,'2026-01-03','mercado');
  assert.equal(ageAt(cashAgeHistory(unknown),'2026-01').days,null);
});
test('new plans do not invent historical months or substitute cash balances for missing wealth',()=>{
  const d=buildReports(createState(true,'2026-10'),'2026-10',12);
  assert.equal(d.series.length,1);assert.equal(d.start,'2026-10');assert.equal(d.wealth.netWorth,null);assert.equal(d.age.days,null);
  const empty=buildReports(createState(false,'2026-10'),'2026-10',6);assert.equal(empty.hasTransactions,false);assert.equal(empty.savingsRate,null);
});
test('all chart types handle negative and missing data, and hiding amounts also hides accessible labels',()=>{
  const s=history();s.wealth['2026-10']={otherAssets:0,debt:900000};const d=buildReports(s,'2026-10',6);
  for(const kind of ['income','spending','wealth','age']){
    const svg=chartSvg(d.series,{kind,dimensions:d.dimensions,selected:'2026-10',compact:true});
    assert.ok(svg.startsWith('<svg'));assert.ok(!svg.includes('NaN'));assert.ok(!svg.includes('Infinity'));
  }
  const hidden=chartSvg(d.series,{kind:'income',selected:'2026-10',hidden:true});
  assert.ok(!hidden.includes('R$'));assert.ok(hidden.includes('••••'));
});
test('every report panel renders with empty and populated plans while escaping user-entered labels',()=>{
  globalThis.window={matchMedia:()=>({matches:true,addEventListener(){}})};
  for(const empty of [false,true]){
    const state=empty?createState(false,'2026-10'):history();state.categories[0].name='<img src=x onerror=alert(1)>';
    const handlers={},root={innerHTML:'',addEventListener:(name,fn)=>handlers[name]=fn,querySelector:()=>null};
    const ui=createReportsUI({root,getState:()=>state,getEndMonth:()=>'2026-10',onEditWealth(){},notify(){}});
    ui.render();assert.ok(root.innerHTML.includes('Distribuição dos gastos'));assert.ok(root.innerHTML.includes('role="tablist"'));
    for(const name of ['income','spending','wealth','age','breakdown']){
      handlers.click({target:{closest:selector=>selector==='[data-report-tab]'?{dataset:{reportTab:name}}:null}});
      assert.ok(!root.innerHTML.includes('<img src=x'));assert.ok(!root.innerHTML.includes('NaN'));
    }
  }
  delete globalThis.window;
});
test('report matrices reconcile sources, categories, groups and category filters including blank months',()=>{
 const s=history();s.categories.find(c=>c.id==='mercado').hidden=true;const before=structuredClone(s);
 const d=buildReports(s,'2026-11',3);
 assert.deepEqual(d.series.map(r=>r.month),['2026-09','2026-10','2026-11']);
 assert.deepEqual(d.incomeRows.find(r=>r.name==='Empresa').values,[500000,0,0]);
 assert.equal(d.incomeRows.reduce((a,r)=>a+r.total,0),d.income);
 assert.equal(d.expenseGroups.flatMap(g=>g.rows).reduce((a,r)=>a+r.total,0),d.filteredExpense);
 assert.equal(d.groupSpending.reduce((a,g)=>a+g.spent,0),d.filteredExpense);
 const filtered=buildReports(s,'2026-11',3,'all',{categoryIds:['mercado']});
 assert.equal(filtered.filteredExpense,50000);assert.equal(filtered.income,800000);assert.equal(filtered.expense,170000);assert.equal(filtered.spending.length,1);assert.equal(filtered.spending[0].hidden,true);assert.deepEqual(filtered.expenseGroups[0].rows[0].values,[0,50000,0]);
 assert.deepEqual(s,before);
});
