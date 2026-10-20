import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchingCategories} from '../web/category-search.js';
import {createState} from '../web/core.js';
test('category search accepts partial names, accents and group names while preserving IDs',()=>{const s=createState(false);assert.equal(matchingCategories(s,'super')[0].id,'mercado');assert.equal(matchingCategories(s,'cafe')[0].id,'lazer');assert.deepEqual(matchingCategories(s,'essenciais').map(c=>c.id),s.categories.filter(c=>c.group==='essentials').map(c=>c.id));assert.ok(matchingCategories(s,'dia').some(c=>c.id==='mercado'));assert.equal(matchingCategories(s,'nao existe').length,0);assert.equal(matchingCategories(s,'')[0].id,s.categories.find(c=>c.group===s.groups[0].id).id);});
test('same-name categories remain distinguishable by group and ID',()=>{const s=createState(false);s.categories[0].name='Compras';s.categories[1].name='Compras';const results=matchingCategories(s,'compras');assert.equal(results.length,2);assert.notEqual(results[0].id,results[1].id);assert.notEqual(results[0].categoryName,results[1].categoryName);});
