import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryIcon} from '../web/category-icons.js';
test('category icons recognize the screenshot examples, Portuguese accents and compound names',()=>{for(const [name,icon] of [['Moradia','🏠'],['Luz','💡'],['Internet','🌐'],['Conta de energia elétrica','💡'],['Escola','🏫'],['Higiene','🧼'],['Farmácia','💊'],['Combustível','⛽'],['Seguro do carro','🛡️'],['Plano de saúde','🩺']])assert.equal(categoryIcon(name),icon,name);});
test('category icon matching uses words, avoids misleading partial matches and respects explicit emoji',()=>{assert.equal(categoryIcon('Luzia'),'📁');assert.equal(categoryIcon('Compras diversas'),'🛍️');assert.equal(categoryIcon('🦄 Projetos especiais'),'🦄');assert.equal(categoryIcon(''),'📁');assert.equal(categoryIcon('Saúde'),'🩺');assert.equal(categoryIcon('SAUDE'),'🩺');});
