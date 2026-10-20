import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,validateState,totals,categoryTotals} from '../web/core.js';
import {deleteCategory,categoryHasActivity} from '../web/category-actions.js';
import {matchingCategories} from '../web/category-search.js';
import {applyLayout} from '../web/reorder-core.js';
import {mergePlans} from '../web/sync-core.js';
test('hidden categories keep money/history across backup, sync and visible-only reordering',()=>{
 const base=createState(),s=structuredClone(base),cat=s.categories[0],month=Object.keys(s.months)[0],before=totals(s,month);cat.hidden=true;
 assert.equal(validateState(s).categories[0].hidden,true);assert.deepEqual(totals(s,month),before);assert.equal(matchingCategories(s,'').some(c=>c.id===cat.id),false);
 const layout=s.groups.map(g=>({id:g.id,categories:s.categories.filter(c=>!c.hidden&&c.group===g.id).map(c=>c.id).reverse()}));applyLayout(s,layout);assert.equal(s.categories.find(c=>c.id===cat.id).hidden,true);assert.deepEqual(totals(s,month),before);
 const remote=structuredClone(base);remote.categories[1].name='Outro nome';const merged=mergePlans(base,s,remote);assert.equal(merged.ok,true);assert.equal(merged.state.categories.find(c=>c.id===cat.id).hidden,true);
 delete cat.hidden;assert.ok(matchingCategories(s,'').some(c=>c.id===cat.id));
});
test('deletion transfers every month allocation and transaction while preserving all balances',()=>{
 const s=createState(),source=s.categories.find(c=>categoryHasActivity(s,c.id)),destination=s.categories.find(c=>c.id!==source.id),months=Object.keys(s.months),before=structuredClone(s),balances=months.map(m=>totals(s,m)),combined=months.map(m=>categoryTotals(s,m,source.id).available+categoryTotals(s,m,destination.id).available);
 deleteCategory(s,source.id,destination.id);validateState(s);
 months.forEach((m,i)=>{assert.deepEqual(totals(s,m),balances[i]);assert.equal(categoryTotals(s,m,destination.id).available,combined[i]);assert.equal(s.months[m].transactions.length,before.months[m].transactions.length);assert.equal(s.months[m].assigned[source.id],undefined);assert.ok(s.months[m].transactions.every(t=>t.categoryId!==source.id));});
});
test('invalid deletion is atomic and the final category cannot be deleted',()=>{
 const s=createState(),c=s.categories.find(c=>categoryHasActivity(s,c.id)),before=structuredClone(s);assert.throws(()=>deleteCategory(s,c.id));assert.deepEqual(s,before);assert.throws(()=>deleteCategory(s,c.id,c.id));assert.deepEqual(s,before);
 const empty=createState(false);for(const c of [...empty.categories].slice(1))deleteCategory(empty,c.id);assert.throws(()=>deleteCategory(empty,empty.categories[0].id));
});
