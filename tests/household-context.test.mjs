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
test('email-only rosters display usernames and preserve names across refreshes for the same identities',()=>{
  const initial=info();initial.participants[0].name='Edu';initial.participants[1].name='Larissa';
  const previous=householdForSharing(initial);
  const emails={...initial,participants:initial.participants.map((p,i)=>({...p,name:i?'larissa@example.test':'edu@example.test',email:i?'larissa@example.test':'edu@example.test'}))};
  assert.deepEqual(householdForSharing(emails).people,{edu:'edu',larissa:'larissa'});
  for(let i=0;i<4;i++)assert.deepEqual(householdForSharing(emails,previous).people,{edu:'Edu',larissa:'Larissa'});
  emails.participants[1].id='replacement';emails.participants[1].email=emails.participants[1].name='carla@example.test';
  assert.deepEqual(householdForSharing(emails,previous).people,{edu:'Edu',larissa:'carla'});
  const other=info('another-owner','another-guest');other.participants.forEach((p,i)=>p.name=i?'davi@example.test':'carla@example.test');
  assert.deepEqual(householdForSharing(other,previous).people,{edu:'carla',larissa:'davi'});
  assert.equal(householdForSharing({...emails,scope:{...emails.scope,revoked:true}},previous).enabled,false);
});
test('legacy Sites responses use the signed-in name and accepted member usernames on both accounts',()=>{
  const owner={user:{id:'owner',name:'João da Silva',email:'joao@example.test'},scope:{id:'owner',role:'owner',ownerEmail:'joao@example.test'},members:[{id:'guest',email:'ana@example.test'}]};
  assert.deepEqual(householdForSharing(owner).people,{edu:'João da Silva',larissa:'ana'});
  const guest={...owner,user:{id:'guest',name:'Ana',email:'ana@example.test'},scope:{...owner.scope,role:'editor'}};
  assert.deepEqual(householdForSharing(guest).people,{edu:'joao',larissa:'Ana'});
  assert.equal(householdForSharing({...owner,members:[]}).enabled,false);
});
test('cards, calculations and mobile home use the active people safely and personal home has no settlement',()=>{
  const state=createState(false,'2026-10');saveTransaction(state,{id:'expense',type:'expense',amount:10000,date:'2026-10-19',description:'Mercado',categoryId:'mercado',sharing:{paidBy:'edu',eduPercent:50}});
  const people={edu:'Ana & João',larissa:'<img src=x onerror=alert(1)>'};
  for(const html of [coupleCard(state,'2026-10',{people}),coupleCard(state,'2026-10',{people,compact:true}),coupleCard(state,'2026-10',{people,header:true}),...['summary','expenses','calculation'].map(panel=>coupleDetail(state,'2026-10',{people,panel}))]){
    assert.doesNotMatch(html,/Edu|Larissa|<img|&amp;amp;/);assert.match(html,/Ana &amp; João/);assert.match(html,/&lt;img/);
  }
  assert.doesNotMatch(mobileHome(state,'2026-10',{household:{enabled:false}}),/Nosso acerto|data-open-couple/);
});
