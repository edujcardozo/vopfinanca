import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createGroup,validateState,totals,monthlyPlanTotals} from '../web/core.js';
import {deleteGroup,setGroupHidden,visibleGroups,isCategoryVisible} from '../web/group-actions.js';
import {matchingCategories} from '../web/category-search.js';
import {planningHistory} from '../web/planning-history.js';
import {applyLayout} from '../web/reorder-core.js';
import {mergePlans,cloudPlan} from '../web/sync-core.js';

test('hiding and restoring a group preserves money and individually hidden categories',()=>{
 const state=createState(true,'2026-10');state.categories.find(c=>c.id==='lazer').hidden=true;
 const original=structuredClone(state),cash=totals(state,'2026-10'),monthly=monthlyPlanTotals(state,'2026-10');
 setGroupHidden(state,'daily',true);
 assert.equal(visibleGroups(state).some(g=>g.id==='daily'),false);
 assert.equal(matchingCategories(state,'super').length,0);
 assert.equal(planningHistory(state,'2026-11','last-month','2026-11').rows.some(c=>c.group==='daily'),false);
 assert.deepEqual(state.months,original.months);assert.deepEqual(state.categories,original.categories);
 assert.deepEqual(totals(state,'2026-10'),cash);assert.deepEqual(monthlyPlanTotals(state,'2026-10'),monthly);
 assert.equal(cloudPlan(state).groups.find(g=>g.id==='daily').hidden,true);
 const restored=validateState(JSON.parse(JSON.stringify(state)));setGroupHidden(restored,'daily',false);
 assert.equal(matchingCategories(restored,'super')[0].id,'mercado');assert.equal(isCategoryVisible(restored,restored.categories.find(c=>c.id==='lazer')),false);
 assert.deepEqual(restored,original);
 for(const group of state.groups)setGroupHidden(state,group.id,true);
 assert.deepEqual(visibleGroups(state),[]);assert.deepEqual(matchingCategories(state,''),[]);assert.doesNotThrow(()=>validateState(state));
});

test('group visibility rejects malformed backups and stale changes without mutation',()=>{
 for(const value of ['true',1,null,[],{}]){const state=createState();state.groups[0].hidden=value;assert.throws(()=>validateState(state));}
 for(const operation of [s=>setGroupHidden(s,'missing',true),s=>setGroupHidden(s,'daily','true')]){const state=createState(),before=structuredClone(state);assert.throws(()=>operation(state));assert.deepEqual(state,before);}
 const state=createState();state.groups[0].hidden=false;assert.equal(validateState(state).groups[0].hidden,undefined);
});

test('deleting a group moves all its categories while retaining every financial record and ID',()=>{
 const state=createState(true,'2026-10');state.categories.find(c=>c.id==='lazer').hidden=true;state.months['2026-11']={assigned:{mercado:18000},transactions:[]};
 const before=structuredClone(state);deleteGroup(state,'daily','essentials');
 assert.equal(state.groups.some(g=>g.id==='daily'),false);assert.deepEqual(state.months,before.months);
 assert.deepEqual(state.categories.map(c=>c.id),before.categories.map(c=>c.id));
 for(const category of before.categories){const moved=state.categories.find(c=>c.id===category.id);assert.deepEqual(moved,{...category,group:category.group==='daily'?'essentials':category.group});}
 assert.deepEqual(validateState(state),state);
 const empty=createGroup(state,'Vazio'),categories=structuredClone(state.categories);deleteGroup(state,empty.id);
 assert.deepEqual(state.categories,categories);assert.deepEqual(state.months,before.months);
});

test('deleting a group validates the destination and keeps the last group atomically',()=>{
 for(const destination of [undefined,'daily','missing']){const state=createState(),before=structuredClone(state);assert.throws(()=>deleteGroup(state,'daily',destination));assert.deepEqual(state,before);}
 const state=createState();deleteGroup(state,'daily','essentials');deleteGroup(state,'dreams','essentials');
 const before=structuredClone(state);assert.throws(()=>deleteGroup(state,'essentials'),/pelo menos um grupo/);assert.deepEqual(state,before);
 assert.throws(()=>deleteGroup(state,'missing','essentials'));assert.deepEqual(state,before);
});

test('dragging visible groups and categories preserves hidden groups and their ordering slots',()=>{
 const state=createState(true,'2026-10');setGroupHidden(state,'essentials',true);state.categories.find(c=>c.id==='lazer').hidden=true;
 const before=structuredClone(state),layout=visibleGroups(state).reverse().map(g=>({id:g.id,categories:state.categories.filter(c=>c.group===g.id&&isCategoryVisible(state,c)).map(c=>c.id)}));
 const category=layout[1].categories.shift();layout[0].categories.push(category);
 assert.equal(applyLayout(state,layout),true);assert.deepEqual(state.groups.map(g=>g.id),['essentials','dreams','daily']);
 assert.equal(state.groups[0].hidden,true);assert.equal(state.categories.find(c=>c.id==='moradia').group,'essentials');
 assert.equal(state.categories.find(c=>c.id==='lazer').hidden,true);assert.equal(state.categories.find(c=>c.id===category).group,'dreams');
 assert.deepEqual(state.months,before.months);assert.deepEqual(validateState(state),state);
});

test('group changes merge with other-device transactions and reject dangling concurrent categories',()=>{
 for(const operation of [s=>setGroupHidden(s,'daily',true),s=>deleteGroup(s,'daily','essentials')]){
  const base=createState(true,'2026-10'),local=structuredClone(base),remote=structuredClone(base);operation(local);remote.months['2026-10'].transactions[1].memo='Outra pessoa editou';
  const result=mergePlans(base,local,remote);assert.equal(result.ok,true);assert.deepEqual(result.state.groups,local.groups);assert.deepEqual(result.state.categories,local.categories);assert.equal(result.state.months['2026-10'].transactions[1].memo,'Outra pessoa editou');
 }
 const base=createState(true,'2026-10'),local=structuredClone(base),remote=structuredClone(base);deleteGroup(local,'daily','essentials');remote.categories.push({id:'concurrent',name:'Nova',group:'daily',icon:'☕',target:0});
 const result=mergePlans(base,local,remote);assert.equal(result.ok,false);assert.ok(result.conflicts.includes('structure'));
});
