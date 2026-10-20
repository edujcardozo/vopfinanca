import test from 'node:test';
import assert from 'node:assert/strict';
import {householdForSharing} from '../web/household-context.js';
import {coupleCard,coupleDetail} from '../web/couple-ui.js';
import {mobileHome} from '../web/mobile-home.js';
import {createState,saveTransaction} from '../web/core.js';
const info=(owner='owner-a',guest='guest-a')=>({user:{id:owner},scope:{id:owner,role:'owner',revoked:false},participants:[{id:owner,name:'Ana Cliente',role:'owner'},{id:guest,name:'Bruno Convidado',role:'editor'}]});
test('personal plans and pending invitations do not enable who paid or settlement',()=>{
  const solo=info();solo.participants.pop();solo.invites=[{id:'pending'}];assert.equal(householdForSharing(solo).enabled,false);
  const revoked=info();revoked.scope.revoked=true;assert.equal(householdForSharing(revoked).enabled,false);
});
test('both clients use the same plan-relative people while each defaults to their own identity',()=>{
  const owner=info(),guest={...owner,user:{id:'guest-a'},scope:{...owner.scope,role:'editor'}};
  assert.deepEqual(householdForSharing(owner).people,householdForSharing(guest).people);
  assert.equal(householdForSharing(owner).current,'edu');assert.equal(householdForSharing(guest).current,'larissa');
  const other=info('owner-b','guest-b');other.participants[0].name='Carla';other.participants[1].name='Davi';
  assert.deepEqual(householdForSharing(other).people,{edu:'Carla',larissa:'Davi'});assert.equal(householdForSharing(owner).people.edu,'Ana Cliente');
  assert.equal(householdForSharing({...owner,user:{id:'outsider'}}).enabled,false);
});
test('cards, calculations and mobile home use the active people safely and personal home has no settlement',()=>{
  const state=createState(false,'2026-10');saveTransaction(state,{id:'expense',type:'expense',amount:10000,date:'2026-10-19',description:'Mercado',categoryId:'mercado',sharing:{paidBy:'edu',eduPercent:50}});
  const people={edu:'Ana & João',larissa:'<img src=x onerror=alert(1)>'};
  for(const html of [coupleCard(state,'2026-10',{people}),coupleCard(state,'2026-10',{people,compact:true}),...['summary','expenses','calculation'].map(panel=>coupleDetail(state,'2026-10',{people,panel}))]){
    assert.doesNotMatch(html,/Edu|Larissa|<img|&amp;amp;/);assert.match(html,/Ana &amp; João/);assert.match(html,/&lt;img/);
  }
  assert.doesNotMatch(mobileHome(state,'2026-10',{household:{enabled:false}}),/Nosso acerto|data-open-couple/);
});
