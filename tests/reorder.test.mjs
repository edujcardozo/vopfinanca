import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,validateState,totals,categoryTotals} from '../web/core.js';
import {applyLayout} from '../web/reorder-core.js';
import {mergePlans} from '../web/sync-core.js';
const layout=s=>s.groups.map(g=>({id:g.id,categories:s.categories.filter(c=>c.group===g.id).map(c=>c.id)}));
test('reorders groups and moves categories into empty groups without changing money or history',()=>{
 const s=createState(),before=structuredClone(s),month=Object.keys(s.months)[0],cash=totals(s,month),cats=new Map(s.categories.map(c=>[c.id,categoryTotals(s,month,c.id)]));s.groups.push({id:'new-empty',name:'Novo'});
 const next=layout(s).reverse(),id=next.at(-1).categories.shift();next[0].categories.push(id);assert.equal(applyLayout(s,next),true);assert.equal(s.groups[0].id,'new-empty');assert.equal(s.categories.find(c=>c.id===id).group,'new-empty');assert.deepEqual(s.months,before.months);assert.deepEqual(totals(s,month),cash);for(const c of s.categories)assert.deepEqual(categoryTotals(s,month,c.id),cats.get(c.id));assert.deepEqual(validateState(s).groups,s.groups);
});
test('rejects stale, duplicate, missing and unknown IDs atomically',()=>{
 for(const alter of [l=>l.pop(),l=>l[0].categories.push(l[1].categories[0]),l=>l[0].categories.push('unknown'),l=>l[0].categories.pop(),l=>l[0].id='missing']){const s=createState(),before=structuredClone(s),next=layout(s);alter(next);assert.throws(()=>applyLayout(s,next));assert.deepEqual(s,before);}
});
test('repeated identical order is a no-op and intra-group order survives validation',()=>{
 const s=createState(),next=layout(s);next[1].categories.reverse();applyLayout(s,next);assert.equal(applyLayout(s,next),false);assert.deepEqual(layout(validateState(s)),next);
});
test('reordering merges with a transaction edited on another device',()=>{
 const base=createState(),local=structuredClone(base),remote=structuredClone(base),next=layout(local).reverse();next[0].categories.reverse();applyLayout(local,next);const tx=Object.values(remote.months).flatMap(m=>m.transactions)[0];tx.memo='Outra tela';const merged=mergePlans(base,local,remote);assert.equal(merged.ok,true);assert.deepEqual(layout(merged.state),next);assert.equal(Object.values(merged.state.months).flatMap(m=>m.transactions).find(t=>t.id===tx.id).memo,'Outra tela');
});
