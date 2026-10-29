import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesTransactionSearch,searchAmountCents} from '../web/transaction-search.js';

test('amount searches accept Brazilian currency and decimal formats without confusing cents or thousands',()=>{
  for(const input of ['31','31,00','31.00','R$ 31,00','  R$ 31.00  '])assert.equal(searchAmountCents(input),3100,input);
  for(const input of ['1234,56','1234.56','1.234,56','R$ 1.234,56','1,234.56'])assert.equal(searchAmountCents(input),123456,input);
  assert.equal(searchAmountCents('1.234'),123400);
  assert.equal(searchAmountCents('0,90'),90);
  for(const input of ['','Uber','31abc','12,3456'])assert.equal(searchAmountCents(input),null,input);
  assert.equal(matchesTransactionSearch({amount:3100},null,'31,00'),true);
  assert.equal(matchesTransactionSearch({amount:13100},null,'31,00'),false);
  assert.equal(matchesTransactionSearch({amount:31},null,'31'),false);
});

test('text searches and empty search keep working alongside exact amounts',()=>{
  const tx={amount:3100,payee:'Restaurante',memo:'Almoço com amigos',description:'Compra'};
  for(const query of ['','RESTAURANTE','amigos','Alimentação','R$ 31,00'])assert.equal(matchesTransactionSearch(tx,{name:'Alimentação'},query),true,query);
  assert.equal(matchesTransactionSearch(tx,{name:'Alimentação'},'32'),false);
});
