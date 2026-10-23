import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,validateState,totals,id} from '../web/core.js';
import {saveSavingsGoal,savingsProgress} from '../web/savings-goals.js';
import {mergePlans,plansEqual} from '../web/sync-core.js';
import {server} from './helpers/sync-env.mjs';
test('objectives persist in backups without modifying the ledger or planned amounts',()=>{
 const state=createState(true,'2026-10'),before=structuredClone(state.months),balance=totals(state,'2026-10');
 const goal=saveSavingsGoal(state,{name:' Viagem ',targetAmount:100000,savedAmount:25000});
 assert.equal(goal.name,'Viagem');assert.deepEqual(savingsProgress(goal),{percent:25,remaining:75000,complete:false});
 const restored=validateState(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.savingsGoals,[goal]);
 assert.deepEqual(restored.months,before);assert.deepEqual(totals(restored,'2026-10'),balance);
 const legacy=structuredClone(state);delete legacy.savingsGoals;assert.deepEqual(validateState(legacy).savingsGoals,[]);
 saveSavingsGoal(state,{...goal,savedAmount:120000},goal.id);assert.deepEqual(savingsProgress(state.savingsGoals[0]),{percent:100,remaining:0,complete:true});
 for(const change of [{targetAmount:0},{savedAmount:-1},{targetAmount:1.5},{name:' '},{id:'__proto__'}])assert.throws(()=>validateState({...state,savingsGoals:[{...goal,...change}]}));
 assert.throws(()=>validateState({...state,savingsGoals:[goal,goal]}));
});
test('independent goals and edits merge across devices, while conflicts require a choice',()=>{
 const base=createState(false,'2026-10');saveSavingsGoal(base,{name:'Carro',targetAmount:500000,savedAmount:10000});
 const local=structuredClone(base),remote=structuredClone(base);
 local.savingsGoals[0].name='Carro novo';remote.savingsGoals[0].savedAmount=30000;
 saveSavingsGoal(local,{name:'Viagem',targetAmount:100000,savedAmount:0});saveSavingsGoal(remote,{name:'Reserva',targetAmount:200000,savedAmount:3000});
 const merged=mergePlans(base,local,remote);assert.equal(merged.ok,true);assert.equal(merged.state.savingsGoals.length,3);assert.equal(merged.state.savingsGoals.find(g=>g.id===base.savingsGoals[0].id).savedAmount,30000);
 assert.equal(merged.state.savingsGoals.find(g=>g.id===base.savingsGoals[0].id).name,'Carro novo');assert.equal(plansEqual(base,local),false);
 const a=structuredClone(base),b=structuredClone(base);a.savingsGoals[0].savedAmount=20000;b.savingsGoals[0].savedAmount=40000;
 assert.equal(mergePlans(base,a,b).ok,false);assert.ok(mergePlans(base,a,b).conflicts.some(p=>p.endsWith('.savedAmount')));
});
test('the hosted API saves goals and prevents an older tab from erasing them',async()=>{
 const api=server(),state=createState(false,'2026-10');saveSavingsGoal(state,{name:'Reserva',targetAmount:100000,savedAmount:25000});
 const put=(value,revision)=>api.request('/api/plan',{method:'PUT',body:JSON.stringify({scopeId:'owner',revision,mutationId:id(),state:value})});
 assert.equal((await put(state,0)).status,200);const loaded=await (await api.request('/api/plan')).json();assert.deepEqual(loaded.state.savingsGoals,state.savingsGoals);
 const old=structuredClone(state);delete old.savingsGoals;const rejected=await put(old,1);assert.equal(rejected.status,426);assert.equal((await rejected.json()).code,'CLIENT_UPDATE_REQUIRED');
 assert.deepEqual((await (await api.request('/api/plan')).json()).state.savingsGoals,state.savingsGoals);
 assert.equal((await api.request('/api/plan',{},'someone-else')).status,200);assert.equal((await (await api.request('/api/plan',{},'someone-else')).json()).exists,false);
 api.sqlite.close();
});
