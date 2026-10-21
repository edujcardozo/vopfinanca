import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryIcon} from '../web/category-icons.js';
test('category icons recognize the screenshot examples, Portuguese accents and compound names',()=>{for(const [name,icon] of [['Moradia','🏠'],['Luz','💡'],['Internet','🌐'],['Conta de energia elétrica','💡'],['Escola','🏫'],['Higiene','🧼'],['Farmácia','💊'],['Combustível','⛽'],['Seguro do carro','🛡️'],['Plano de saúde','🩺']])assert.equal(categoryIcon(name),icon,name);});
test('category icon matching uses words, avoids misleading partial matches and respects explicit emoji',()=>{assert.equal(categoryIcon('Luzia'),'💰');assert.equal(categoryIcon('Compras diversas'),'🛍️');assert.equal(categoryIcon('🦄 Projetos especiais'),'🦄');assert.equal(categoryIcon(''),'💰');assert.equal(categoryIcon('Saúde'),'🩺');assert.equal(categoryIcon('SAUDE'),'🩺');});
test('leisure categories from the screenshot and specific descriptions get matching icons',()=>{
 for(const [name,icon] of [['Passeios','🎡'],['Cinema','🎬'],['Futebol','⚽'],['Bebidas','🥤'],['Cervejas','🍺'],['VINHOS','🍷'],['Happy hour','🍻'],['Teatro e cultura','🎭'],['Trilhas','🏞️'],['Praia','🏖️'],['Pizza','🍕'],['Brinquedos','🧸'],['Reforma','🛠️'],['Passeios de fim de semana','🎡']])assert.equal(categoryIcon(name),icon,name);
});
test('folder placeholders never remain the icon, even in old category names',()=>{
 for(const folder of ['📁','📂','🗂️','🗃️','🗄️']){
  assert.equal(categoryIcon(folder+' Futebol'),'⚽');
  assert.equal(categoryIcon(folder+' Passeios'),'🎡');
  assert.equal(categoryIcon(folder+' Nome personalizado'),'💰');
 }
 assert.equal(categoryIcon('📁 🦄 Projetos especiais'),'🦄');
});
