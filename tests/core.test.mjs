import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoney,createState,totals,categoryTotals,autoAssign,validateState,validDate,shiftMonth,ensureMonth,dateOffset,formatTransactionDate,payeeHistory,saveTransaction,groupsFor,createGroup,renameGroup,moveCategory} from '../web/core.js';
test('Brazilian currency parsing preserves cents and rejects malformed values',()=>{
  for(const [raw,cents] of [['1.234,56',123456],['R$ 6.500,00',650000],['1.500',150000],['1500.5',150050],['0,01',1],['6500',650000],['0',0]])assert.equal(parseMoney(raw),cents,raw);
  for(const raw of ['','-10','1,234','1,2,3','1.23.45','NaN','Infinity','<script>','99999999999999999'])assert.equal(parseMoney(raw),null,raw);
});
test('example ledger balances and allocations use exact integer cents',()=>{
  const s=createState(true,'2026-10'),t=totals(s,'2026-10');
  assert.equal(t.income,650000);assert.equal(t.spent,230740);assert.equal(t.balance,419260);assert.equal(t.toAssign,100000);
  assert.equal(t.categoryAvailable+t.toAssign,t.balance);
  assert.equal(categoryTotals(s,'2026-10','mercado').available,56510);
});
test('legacy allocation helper conserves money without being exposed by the planned-only app',()=>{
  const s=createState(true,'2026-10'),before=totals(s,'2026-10');
  const legacyTargets={moradia:200000,mercado:100000,transporte:40000,lazer:45000,reserva:300000,viagem:250000};for(const c of s.categories)c.target=legacyTargets[c.id];
  assert.equal(autoAssign(s,'2026-10'),100000);
  assert.equal(totals(s,'2026-10').toAssign,0);assert.equal(totals(s,'2026-10').balance,before.balance);
  assert.equal(s.months['2026-10'].assigned.mercado,100000);assert.equal(s.months['2026-10'].assigned.transporte,40000);assert.equal(s.months['2026-10'].assigned.lazer,45000);assert.equal(autoAssign(s,'2026-10'),0);
});
test('unspent categories and unassigned money carry forward without double counting',()=>{
  const s=createState(true,'2026-10');ensureMonth(s,'2026-11').transactions.push({id:'nov-income',type:'income',amount:100000,categoryId:null,date:'2026-11-01',description:'Nova receita'});
  const nov=totals(s,'2026-11');assert.equal(nov.income,100000);assert.equal(nov.spent,0);assert.equal(nov.toAssign,200000);assert.equal(nov.balance,519260);
  assert.equal(categoryTotals(s,'2026-11','mercado').carryover,56510);
  s.months['2026-11'].assigned.mercado=10000;assert.equal(categoryTotals(s,'2026-11','mercado').available,66510);
  assert.equal(totals(s,'2026-10').balance,419260);assert.equal(totals(s,'2026-11').categoryAvailable+totals(s,'2026-11').toAssign,totals(s,'2026-11').balance);
});
test('negative availability stays negative and is never converted to a positive balance',()=>{
  const s=createState(false,'2026-10');s.months['2026-10'].transactions.push({id:'negative',type:'expense',amount:25000,categoryId:'mercado',date:'2026-10-01',description:'Mercado'});
  assert.equal(categoryTotals(s,'2026-10','mercado').available,-25000);assert.equal(totals(s,'2026-10').balance,-25000);assert.equal(categoryTotals(s,'2026-11','mercado').carryover,-25000);
});
test('automatic allocation covers overspending before considering a category funded',()=>{
  const s=createState(false,'2026-10');const m=s.months['2026-10'];
  s.categories=s.categories.filter(c=>c.id==='mercado');s.categories[0].target=0;
  m.assigned.mercado=10000;
  m.transactions.push({id:'cash',type:'income',amount:80000,categoryId:null,date:'2026-10-01',description:'Receita'},{id:'overspent',type:'expense',amount:30000,categoryId:'mercado',date:'2026-10-02',description:'Compra'});
  assert.equal(autoAssign(s,'2026-10'),20000);assert.equal(categoryTotals(s,'2026-10','mercado').available,0);
  assert.equal(totals(s,'2026-10').toAssign,50000);
});
test('backup roundtrip keeps ledger and rejects inconsistent, unsafe or excessive inputs',()=>{
  const s=createState(true,'2026-10');assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
  const bad=structuredClone(s);bad.months['2026-10'].transactions[1].amount=.5;assert.throws(()=>validateState(bad));
  const missing=structuredClone(s);missing.months['2026-10'].transactions[1].categoryId='not-a-category';assert.throws(()=>validateState(missing));
  const duplicate=structuredClone(s);duplicate.categories.push({...duplicate.categories[0]});assert.throws(()=>validateState(duplicate));
  const wrongDate=structuredClone(s);wrongDate.months['2026-10'].transactions[0].date='2026-11-01';assert.throws(()=>validateState(wrongDate));
  const polluted=structuredClone(s);polluted.categories[0].id='__proto__';assert.throws(()=>validateState(polluted));
});
test('month navigation and date checks handle calendar boundaries',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2026-02-29'),false);
});
test('Brazilian display and shortcuts preserve local calendar days across month and year boundaries',()=>{
  assert.equal(formatTransactionDate('2026-10-18','2026-10-18'),'Hoje · 18/10/2026');
  assert.equal(formatTransactionDate('2026-10-17','2026-10-18'),'Ontem · 17/10/2026');
  assert.equal(formatTransactionDate('2026-10-01','2026-10-18'),'01/10/2026');
  assert.equal(dateOffset('2027-01-01',-1),'2026-12-31');
  assert.equal(dateOffset('2028-03-01',-1),'2028-02-29');
});
test('payee and memo survive backup roundtrip without converting old descriptions into invented merchants',()=>{
  const s=createState(true,'2026-10');
  s.months['2026-10'].transactions[2].payee='Zaffari';s.months['2026-10'].transactions[2].memo='Compras da semana';
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
  assert.equal(validateState(s).months['2026-10'].transactions[1].payee,undefined);
  const bad=structuredClone(s);bad.months['2026-10'].transactions[2].payee={name:'wrong'};assert.throws(()=>validateState(bad));
  const long=structuredClone(s);long.months['2026-10'].transactions[2].memo='a'.repeat(281);assert.throws(()=>validateState(long));
});
test('payee suggestions ignore legacy descriptions and remember the latest category without case duplicates',()=>{
  const s=createState(true,'2026-10');const m=s.months['2026-10'];
  m.transactions.push({id:'p1',type:'expense',payee:'Zaffari',description:'Zaffari',memo:'',amount:1000,date:'2026-10-10',categoryId:'mercado'},{id:'p2',type:'expense',payee:'zaffari',description:'zaffari',memo:'',amount:2000,date:'2026-10-11',categoryId:'lazer'},{id:'p3',type:'income',payee:'Empresa',description:'Empresa',memo:'',amount:1000,date:'2026-10-12',categoryId:null});
  assert.deepEqual(payeeHistory(s),[{name:'zaffari',categoryId:'lazer'}]);
  assert.deepEqual(payeeHistory(s,'income'),[{name:'Empresa',categoryId:null}]);
});
test('editing a transaction changes amount and month once, preserving its ID and ledger integrity',()=>{
  const s=createState(false,'2026-10');
  saveTransaction(s,{id:'income',type:'income',description:'Empresa',payee:'Empresa',memo:'',amount:100000,date:'2026-10-01',categoryId:null});
  const t={id:'purchase',type:'expense',description:'Zaffari',payee:'Zaffari',memo:'Almoço',amount:1000,date:'2026-10-18',categoryId:'mercado'};
  saveTransaction(s,t);assert.equal(totals(s,'2026-10').balance,99000);
  saveTransaction(s,{...t,amount:2500,date:'2026-11-01'},'purchase');
  assert.equal(totals(s,'2026-10').spent,0);assert.equal(totals(s,'2026-11').spent,2500);assert.equal(totals(s,'2026-11').balance,97500);
  assert.equal(Object.values(s.months).flatMap(m=>m.transactions).filter(t=>t.id==='purchase').length,1);
  assert.deepEqual(validateState(s),s);
  const before=structuredClone(s);assert.throws(()=>saveTransaction(s,{...t,date:'2026-02-30'},'purchase'));assert.deepEqual(s,before);
});
test('creating and renaming groups preserves ledger, allocation IDs and backups including empty groups',()=>{
  const s=createState(true,'2026-10'),before=structuredClone(s.months),balance=totals(s,'2026-10');
  const group=createGroup(s,'Casa e família');assert.equal(groupsFor(s)[0].id,group.id);
  renameGroup(s,group.id,'Família');renameGroup(s,'essentials','Despesas da casa');
  assert.equal(group.name,'Família');assert.equal(s.categories[0].group,'essentials');
  assert.deepEqual(s.months,before);assert.deepEqual(totals(s,'2026-10'),balance);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
  assert.throws(()=>createGroup(s,' família '));assert.throws(()=>renameGroup(s,group.id,''));
});
test('moving a category into a custom group keeps spending and available money unchanged',()=>{
  const s=createState(true,'2026-10'),group=createGroup(s,'Compras da casa'),before=structuredClone(s.months),amount=categoryTotals(s,'2026-10','mercado');
  moveCategory(s,'mercado',group.id);assert.equal(s.categories.find(c=>c.id==='mercado').group,group.id);
  assert.deepEqual(s.months,before);assert.deepEqual(categoryTotals(s,'2026-10','mercado'),amount);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);assert.throws(()=>moveCategory(s,'mercado','missing'));
});
test('legacy version-one backups gain default groups without losing transactions and invalid group references are rejected',()=>{
  const s=createState(true,'2026-10'),legacy=structuredClone(s);delete legacy.groups;
  assert.deepEqual(validateState(legacy),s);
  const duplicate=structuredClone(s);duplicate.groups.push({...duplicate.groups[0]});assert.throws(()=>validateState(duplicate));
  const orphan=structuredClone(s);orphan.categories[0].group='missing';assert.throws(()=>validateState(orphan));
  const bad=structuredClone(s);bad.groups[0].name={value:'unsafe'};assert.throws(()=>validateState(bad));
});
