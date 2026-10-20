import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,saveTransaction,validateState,totals,categoryTotals,id} from '../web/core.js';
import {coupleSummary,expenseShares,saveSettlement} from '../web/couple-core.js';
import {coupleCard,coupleDetail} from '../web/couple-ui.js';
import {mergePlans,plansEqual} from '../web/sync-core.js';
import {createCloudSync} from '../web/cloud-sync.js';
import {server,MemoryStorage} from './helpers/sync-env.mjs';
const expense=(s,amount,paidBy,eduPercent=50,date='2026-10-19')=>{const t={id:id(),type:'expense',amount,date,payee:'Zaffari',description:'Zaffari',categoryId:'mercado',...(paidBy?{sharing:{paidBy,eduPercent}}:{})};saveTransaction(s,t);return t;};
test('50/50 settles half the paid difference and preserves budget totals',()=>{
 const s=createState(false,'2026-10');expense(s,120000,'edu');expense(s,80000,'larissa');const before=totals(s,'2026-10'),category=categoryTotals(s,'2026-10','mercado'),a=coupleSummary(s,'2026-10');
 assert.equal(a.expenses,200000);assert.equal(a.eduPaid,120000);assert.equal(a.eduShare,100000);assert.equal(a.larissaShare,100000);assert.equal(a.balance,20000);assert.equal(a.from,'larissa');
 saveSettlement(s,{from:'larissa',amount:12000,date:'2026-10-20',memo:'Parcial'});assert.equal(coupleSummary(s,'2026-10').balance,8000);assert.deepEqual(totals(s,'2026-10'),before);assert.deepEqual(categoryTotals(s,'2026-10','mercado'),category);
 saveSettlement(s,{from:'larissa',amount:8000,date:'2026-10-21',memo:''});assert.equal(coupleSummary(s,'2026-10').balance,0);assert.equal(coupleSummary(s,'2026-10').from,null);
});
test('custom percentages conserve every cent; own personal expenses are excluded and paying for the other is reimbursed in full',()=>{
 const s=createState(false,'2026-10'),odd=expense(s,101,'edu'),shares=expenseShares(odd);assert.equal(shares.edu,51);assert.equal(shares.larissa,50);assert.equal(shares.edu+shares.larissa,101);
 expense(s,10000,'larissa',60);expense(s,5000,'edu',100);expense(s,7000,'larissa',0);expense(s,3000,'edu',0);
 const a=coupleSummary(s,'2026-10');assert.equal(a.balance,50-6000+3000);assert.equal(a.transactions.length,3);assert.equal(a.expenses,13101);assert.equal(a.eduShare+a.larissaShare,a.expenses);assert.equal(a.from,'edu');
});
test('unknown legacy expenses and income never invent a payer, and late edits recalculate the carryover across empty months',()=>{
 const s=createState(false,'2026-10');delete s.household;const old=expense(s,10000),known=expense(s,20000,'edu');s.months['2026-10'].transactions.push({id:id(),type:'income',amount:100000,description:'Salário',date:'2026-10-01',categoryId:null});
 const restored=validateState(JSON.parse(JSON.stringify(s)));assert.equal(restored.months['2026-10'].transactions.find(t=>t.id===old.id).sharing,undefined);let a=coupleSummary(restored,'2026-10');assert.equal(a.unknownCount,1);assert.equal(a.unknownAmount,10000);assert.equal(a.balance,10000);
 saveSettlement(restored,{from:'larissa',amount:4000,date:'2026-11-01',memo:''});assert.equal(coupleSummary(restored,'2026-10').balance,10000);a=coupleSummary(restored,'2026-12');assert.equal(a.carryover,6000);assert.equal(a.balance,6000);
 saveTransaction(restored,{...known,sharing:{paidBy:'larissa',eduPercent:50}},known.id);assert.equal(coupleSummary(restored,'2026-12').balance,-14000);
});
test('settlements can be edited, moved, deleted or overpaid without duplicating spending',()=>{
 const s=createState(false,'2026-10');expense(s,10000,'edu');const r=saveSettlement(s,{from:'larissa',amount:3000,date:'2026-10-20',memo:'Pix'});
 saveSettlement(s,{from:'larissa',amount:7000,date:'2026-11-01',memo:'Alterado'},r.id);assert.equal(s.household.settlements.length,1);assert.equal(coupleSummary(s,'2026-10').balance,5000);assert.equal(coupleSummary(s,'2026-11').balance,-2000);
 s.household.settlements=[];assert.equal(coupleSummary(s,'2026-11').balance,5000);assert.equal(totals(s,'2026-11').balance,-10000);
});
test('backup validation rejects invalid sharing, income attribution and invalid or duplicate settlements atomically',()=>{
 const base=createState(false,'2026-10'),tx=expense(base,1000,'edu');assert.ok(plansEqual(validateState(JSON.parse(JSON.stringify(base))),base));
 for(const sharing of [null,[],{paidBy:'other',eduPercent:50},{paidBy:'edu',eduPercent:100.1},{paidBy:'edu',eduPercent:-1},{paidBy:'edu',eduPercent:101}]){const s=structuredClone(base);s.months['2026-10'].transactions[0].sharing=sharing;assert.throws(()=>validateState(s));const before=structuredClone(base);assert.throws(()=>saveTransaction(base,{...tx,sharing},tx.id));assert.deepEqual(base,before);}
 const income=structuredClone(base);income.months['2026-10'].transactions[0]={...tx,type:'income',categoryId:null};assert.throws(()=>validateState(income));
 for(const bad of [{from:'third',amount:100,date:'2026-10-19',memo:''},{from:'edu',amount:0,date:'2026-10-19',memo:''},{from:'edu',amount:1,date:'2026-02-30',memo:''}]){const before=structuredClone(base);assert.throws(()=>saveSettlement(base,bad));assert.deepEqual(base,before);}
 const r=saveSettlement(base,{from:'larissa',amount:100,date:'2026-10-19',memo:''}),copy=structuredClone(base);copy.household.settlements.push({...r});assert.throws(()=>validateState(copy));
});
test('independent sharing and settlements merge across devices while same-record conflicts require a choice',()=>{
 const base=createState(false,'2026-10'),tx=expense(base,10000),a=structuredClone(base),b=structuredClone(base);a.months['2026-10'].transactions[0].sharing={paidBy:'edu',eduPercent:50};const r=saveSettlement(b,{from:'larissa',amount:2000,date:'2026-10-19',memo:''});
 let merged=mergePlans(base,a,b);assert.equal(merged.ok,true);assert.equal(coupleSummary(merged.state,'2026-10').balance,3000);assert.equal(merged.state.household.settlements[0].id,r.id);
 const left=structuredClone(merged.state),right=structuredClone(merged.state);left.household.settlements[0].amount=1000;right.household.settlements[0].amount=4000;assert.equal(mergePlans(merged.state,left,right).ok,false);
});
test('new-device loading and concurrent offline edits retain sharing and settlement records end to end',async()=>{
 const api=server(),initial=createState(false,'2026-10');expense(initial,120000,'edu');expense(initial,80000,'larissa');let a=initial,b=createState(true,'2026-10');
 const make=(get,set)=>createCloudSync({getState:get,onApply:set,onStatus(){},onConflict(){assert.fail('Unexpected sync conflict');},hadStored:false,storage:new MemoryStorage(),fetcher:api.fetcher(),autoSchedule:false,autoPoll:false});
 const phone=make(()=>a,s=>a=s),pc=make(()=>b,s=>b=s);await phone.start();await pc.start();assert.ok(plansEqual(a,b));
 saveSettlement(a,{from:'larissa',amount:5000,date:'2026-10-20',memo:'Pix parcial'});phone.markLocal();expense(b,2000,'larissa',60);pc.markLocal();await phone.flush();await pc.flush();await phone.flush();assert.ok(plansEqual(a,b));assert.equal(coupleSummary(a,'2026-10').balance,13800);assert.equal(b.household.settlements.length,1);
 phone.stop();pc.stop();
});
test('an old open tab cannot erase payer assignments or settlements from the server',async()=>{
 const api=server(),s=createState(false,'2026-10');expense(s,10000,'edu');saveSettlement(s,{from:'larissa',amount:2000,date:'2026-10-19',memo:''});
 assert.equal((await api.request('/api/plan',{method:'PUT',body:JSON.stringify({revision:0,mutationId:id(),state:s})})).status,200);
 const old=structuredClone(s);delete old.household;for(const tx of old.months['2026-10'].transactions)delete tx.sharing;
 const r=await api.request('/api/plan',{method:'PUT',body:JSON.stringify({revision:1,mutationId:id(),state:old})});assert.equal(r.status,426);assert.equal((await r.json()).code,'CLIENT_UPDATE_REQUIRED');const current=await (await api.request('/api/plan')).json();assert.equal(current.revision,1);assert.equal(coupleSummary(current.state,'2026-10').balance,3000);
});
test('summary and history escape user input and privacy hides currency and paid proportions',()=>{
 const s=createState(false,'2026-10'),tx=expense(s,120000,'edu');tx.payee='<script>bad</script>';saveSettlement(s,{from:'larissa',amount:1000,date:'2026-10-19',memo:'<img src=x onerror=bad>'});
 const detail=coupleDetail(s,'2026-10',{panel:'expenses'})+coupleDetail(s,'2026-10',{panel:'settlements'});assert.ok(detail.includes('&lt;script&gt;'));assert.ok(detail.includes('&lt;img'));assert.ok(!detail.includes('<script>'));
 s.hideBalances=true;for(const html of [coupleCard(s,'2026-10'),coupleCard(s,'2026-10',{compact:true}),coupleCard(s,'2026-10',{header:true}),coupleDetail(s,'2026-10'),coupleDetail(s,'2026-10',{panel:'expenses'}),coupleDetail(s,'2026-10',{panel:'settlements'}),coupleDetail(s,'2026-10',{panel:'calculation'})]){assert.ok(!html.includes('R$'));assert.ok(html.includes('••••'));assert.ok(!html.includes('width:100.00%'));}
});
