import {checkedSavedCards} from './saved-cards-data.js?v=vpo-126';
import {checkedInvoiceBills} from './invoice-bills-data.js?v=vpo-126';
import {checkedSavingsGoals} from './savings-goals.js';
// All monetary values are integer centavos. No floating-point ledger arithmetic.
export const STORAGE_KEY = 'ynab-edu-plan-v1';
export const GROUPS = {essentials:'Contas essenciais',daily:'O dia a dia',dreams:'Planos e sonhos'};
export const defaultGroups=()=>Object.entries(GROUPS).map(([id,name])=>({id,name}));
export const groupsFor=state=>state.groups??defaultGroups();
function checkedGroupName(state,name,exceptId=null){
  const trimmed=String(name).trim();
  if(!trimmed||trimmed.length>70)throw new Error('Informe um nome de grupo com até 70 caracteres.');
  if(groupsFor(state).some(g=>g.id!==exceptId&&g.name.toLocaleLowerCase('pt-BR')===trimmed.toLocaleLowerCase('pt-BR')))throw new Error('Já existe um grupo com esse nome. Escolha outro.');
  return trimmed;
}
export function createGroup(state,name){
  const clean=checkedGroupName(state,name);
  if(groupsFor(state).length>=200)throw new Error('Seu plano atingiu o limite de grupos.');
  state.groups??=defaultGroups();const group={id:id(),name:clean};state.groups.unshift(group);return group;
}
export function renameGroup(state,groupId,name){
  const clean=checkedGroupName(state,name,groupId);state.groups??=defaultGroups();
  const group=state.groups.find(g=>g.id===groupId);if(!group)throw new Error('Este grupo não está mais disponível.');
  group.name=clean;return group;
}
export function moveCategory(state,categoryId,groupId){
  if(!groupsFor(state).some(g=>g.id===groupId))throw new Error('Escolha um grupo válido.');
  const category=state.categories.find(c=>c.id===categoryId);if(!category)throw new Error('Categoria não encontrada.');
  category.group=groupId;
}
export const formatMoney = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
export function parseMoney(input){
  let s=String(input).trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if(!s || !/^[\d.,]+$/.test(s)) return null;
  if(s.includes(',')){
    if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(s)) return null;
    s=s.replace(/\./g,'').replace(',','.');
  } else if(/^\d{1,3}(?:\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  else if(!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const n=Math.round(Number(s)*100);
  return Number.isSafeInteger(n)&&n>=0&&n<=1e12?n:null;
}
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export const currentMonth=()=>today().slice(0,7);
export function dateOffset(date,days){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function formatTransactionDate(date,reference=today()){
  if(!validDate(date))return 'Escolha uma data';
  const formatted=date.split('-').reverse().join('/');
  return `${date===reference?'Hoje · ':date===dateOffset(reference,-1)?'Ontem · ':''}${formatted}`;
}
export const payeeKey=name=>String(name).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export const searchPayeeKey=name=>payeeKey(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function rememberPayee(state,name){
  const clean=String(name).trim().replace(/\s+/g,' ');if(!clean||clean.length>100)throw new Error('Informe um estabelecimento com até 100 caracteres.');
  state.payees??=[];const key=payeeKey(clean);if(!state.payees.some(p=>payeeKey(p)===key)){if(state.payees.length>=20000)throw new Error('Limite de estabelecimentos atingido.');state.payees.push(clean);}return state.payees.find(p=>payeeKey(p)===key);
}
export function payeeHistory(state,type='expense'){
  const seen=new Set(),history=Object.values(state.months).flatMap(m=>m.transactions).reverse().sort((a,b)=>b.date.localeCompare(a.date)).filter(t=>{
    if(t.type!==type||!t.payee?.trim())return false;
    const key=payeeKey(t.payee);if(seen.has(key))return false;seen.add(key);return true;
  }).map(t=>({name:t.payee.trim(),categoryId:t.categoryId}));
  for(const name of state.payees||[]){const key=payeeKey(name);if(!seen.has(key)){seen.add(key);history.push({name,categoryId:null});}}
  return history;
}
export function matchingPayees(state,query,type='expense',limit=8){
  const q=searchPayeeKey(query),words=q.split(' ').filter(Boolean);
  return payeeHistory(state,type).map((p,index)=>({...p,index,key:searchPayeeKey(p.name)})).filter(p=>words.every(word=>p.key.includes(word))).sort((a,b)=>(a.key===q?0:a.key.startsWith(q)?1:2)-(b.key===q?0:b.key.startsWith(q)?1:2)||a.index-b.index).slice(0,limit).map(({name,categoryId})=>({name,categoryId}));
}
export function checkedSharing(sharing,type='expense'){
  if(sharing===undefined)return undefined;
  if(type!=='expense'||!sharing||typeof sharing!=='object'||Array.isArray(sharing)||!['edu','larissa'].includes(sharing.paidBy)||!Number.isInteger(sharing.eduPercent)||sharing.eduPercent<0||sharing.eduPercent>100)throw new Error('Escolha quem pagou e uma divisão válida, de 0% a 100%.');
  return {paidBy:sharing.paidBy,eduPercent:sharing.eduPercent};
}
export function saveTransaction(state,transaction,originalId=null){
  checkedSharing(transaction.sharing,transaction.type);
  const previous=originalId?Object.values(state.months).flatMap(m=>m.transactions).find(t=>t.id===originalId):null;
  const originalCreatedAt=previous?.createdAt;
  if(!validDate(transaction.date))throw new Error('Data inválida.');
  if(originalId&&!Object.values(state.months).some(m=>m.transactions.some(t=>t.id===originalId)))throw new Error('Este lançamento foi alterado. Abra novamente antes de editar.');
  if(transaction.payee)rememberPayee(state,transaction.payee);
  if(originalId){
    let found=false;
    for(const m of Object.values(state.months)){const index=m.transactions.findIndex(t=>t.id===originalId);if(index!==-1){m.transactions.splice(index,1);found=true;break;}}
    if(!found)throw new Error('Este lançamento foi alterado. Abra novamente antes de editar.');
  }
  if(originalId){delete transaction.createdAt;if(originalCreatedAt)transaction.createdAt=originalCreatedAt;}else transaction.createdAt=new Date().toISOString();
  ensureMonth(state,transaction.date.slice(0,7)).transactions.push(transaction);
}
export const validMonth=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&Number(s.slice(0,4))>=1900&&Number(s.slice(0,4))<=2199;
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!validMonth(s.slice(0,7)))return false;const d=new Date(`${s}T12:00:00Z`);return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
export function shiftMonth(key,offset){const d=new Date(`${key}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+offset);const next=d.toISOString().slice(0,7);return validMonth(next)?next:key;}
export const id=()=>globalThis.crypto?.randomUUID?.()||`id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
const baseCategories=()=>[
  {id:'moradia',name:'Moradia',group:'essentials',icon:'🏠',target:0},
  {id:'mercado',name:'Supermercado',group:'daily',icon:'🛒',target:0},
  {id:'transporte',name:'Transporte',group:'daily',icon:'🚗',target:0},
  {id:'lazer',name:'Cafés e bons momentos',group:'daily',icon:'☕',target:0},
  {id:'reserva',name:'Reserva de tranquilidade',group:'dreams',icon:'🌱',target:0},
  {id:'viagem',name:'Próxima viagem',group:'dreams',icon:'✈️',target:0}
];
export function createState(example=true,month=currentMonth()){
  const state={version:1,planId:id(),example,hideBalances:false,groups:defaultGroups(),categories:baseCategories(),months:{},wealth:{},payees:[],household:{version:1,settlements:[]},savingsGoals:[],invoiceBills:[],cards:[]};
  state.months[month]={assigned:{},transactions:[]};
  if(example){
    state.months[month].assigned={moradia:200000,mercado:80000,transporte:35000,lazer:30000,reserva:120000,viagem:85000};
    state.months[month].transactions=[
      {id:id(),type:'income',description:'Receita do mês',amount:650000,categoryId:null,date:month+'-01'},
      {id:id(),type:'expense',description:'Aluguel',amount:200000,categoryId:'moradia',date:month+'-02'},
      {id:id(),type:'expense',description:'Compras da semana',amount:23490,categoryId:'mercado',date:month+'-05'},
      {id:id(),type:'expense',description:'Combustível',amount:4850,categoryId:'transporte',date:month+'-06'},
      {id:id(),type:'expense',description:'Café da tarde',amount:2400,categoryId:'lazer',date:month+'-07'}
    ];
  }
  return state;
}
export function getMonth(state,key){return state.months[key]||{assigned:{},transactions:[]};}
export function ensureMonth(state,key){if(!validMonth(key))throw new Error('Mês inválido.');return state.months[key]??=( {assigned:{},transactions:[]} );}
export function totals(state,key){
  let income=0,spent=0,allIncome=0,allSpent=0,allAssigned=0;
  for(const [ym,data] of Object.entries(state.months)){
    if(ym>key)continue;
    allAssigned+=Object.values(data.assigned).reduce((a,b)=>a+b,0);
    for(const tx of data.transactions){
      if(tx.type==='income'){allIncome+=tx.amount;if(ym===key)income+=tx.amount;}
      else{allSpent+=tx.amount;if(ym===key)spent+=tx.amount;}
    }
  }
  return {income,spent,balance:allIncome-allSpent,toAssign:allIncome-allAssigned,categoryAvailable:allAssigned-allSpent};
}
export function monthlyPlanTotals(state,key){
  const month=getMonth(state,key),planned=Object.values(month.assigned).reduce((sum,amount)=>sum+amount,0);
  const spent=month.transactions.reduce((sum,transaction)=>sum+(transaction.type==='expense'?transaction.amount:0),0);
  return {planned,spent,remaining:planned-spent};
}
// Monthly planning is independent from the cumulative cash ledger. Opening a
// month never funds its categories or carries another month's surplus/deficit.
export function monthlyCategoryTotals(state,key,categoryId){
  const month=getMonth(state,key),assigned=month.assigned[categoryId]||0;
  const spent=month.transactions.reduce((sum,transaction)=>sum+(transaction.type==='expense'&&transaction.categoryId===categoryId?transaction.amount:0),0);
  return {assigned,spent,carryover:0,available:assigned-spent};
}
export function categoryTotals(state,key,categoryId){
  let carryover=0,spent=0;
  for(const [ym,data] of Object.entries(state.months)){
    if(ym>key)continue;
    const expenses=data.transactions.filter(t=>t.type==='expense'&&t.categoryId===categoryId).reduce((sum,t)=>sum+t.amount,0);
    if(ym<key)carryover+=(data.assigned[categoryId]||0)-expenses;
    else spent+=expenses;
  }
  const assigned=getMonth(state,key).assigned[categoryId]||0;
  return {assigned,spent,carryover,available:carryover+assigned-spent};
}
export function autoAssign(state,key){
  let remaining=totals(state,key).toAssign;
  if(remaining<=0)return 0;
  let moved=0;
  const month=ensureMonth(state,key);
  for(const category of state.categories){
    const ct=categoryTotals(state,key,category.id);
    const need=Math.max(0,category.target-ct.carryover-ct.assigned,-ct.available);
    const amount=Math.min(remaining,need);
    if(amount){month.assigned[category.id]=(month.assigned[category.id]||0)+amount;remaining-=amount;moved+=amount;}
    if(!remaining)break;
  }
  return moved;
}
export function validateState(raw){
  const fail=()=>{throw new Error('Este arquivo não é um backup válido do Meu plano.');};
  const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
  const safeId=s=>typeof s==='string'&&/^[a-z0-9_-]{1,64}$/i.test(s)&&!['__proto__','constructor','prototype'].includes(s);
  const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
  if(!plain(raw)||raw.version!==1||!Array.isArray(raw.categories)||raw.categories.length<1||raw.categories.length>1000||!plain(raw.months))fail();
  if(raw.planId!==undefined&&!safeId(raw.planId))fail();
  const inputGroups=raw.groups===undefined?defaultGroups():raw.groups;
  if(!Array.isArray(inputGroups)||!inputGroups.length||inputGroups.length>200)fail();
  const groupIds=new Set();
  const groups=inputGroups.map(g=>{
    if(!plain(g)||!safeId(g.id)||groupIds.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>70)fail();
    if(g.hidden!==undefined&&typeof g.hidden!=='boolean')fail();
    groupIds.add(g.id);return {id:g.id,name:g.name.trim(),...(g.hidden?{hidden:true}:{})};
  });
  const ids=new Set(),transactionIds=new Set();
  const categories=raw.categories.map(c=>{
    if(!plain(c)||!safeId(c.id)||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>70||!groupIds.has(c.group)||!cents(c.target)||typeof c.icon!=='string'||c.icon.length>12)fail();
    if(c.hidden!==undefined&&typeof c.hidden!=='boolean')fail();
    ids.add(c.id);return {id:c.id,name:c.name.trim(),group:c.group,icon:c.icon,target:c.target,...(c.hidden?{hidden:true}:{})};
  });
  const keys=Object.keys(raw.months);if(keys.length>240)fail();
  const inputWealth=raw.wealth===undefined?{}:raw.wealth;
  if(!plain(inputWealth)||Object.keys(inputWealth).length>240)fail();
  const wealth={};
  for(const [month,snapshot] of Object.entries(inputWealth)){
    if(!validMonth(month)||!plain(snapshot)||!cents(snapshot.otherAssets)||!cents(snapshot.debt))fail();
    wealth[month]={otherAssets:snapshot.otherAssets,debt:snapshot.debt};
  }
  const cards=checkedSavedCards(raw.cards),cardIds=new Set(cards.map(c=>c.id));
  const months={};let count=0;
  for(const key of keys){
    const m=raw.months[key];
    if(!validMonth(key)||!plain(m)||!plain(m.assigned)||!Array.isArray(m.transactions)||m.transactions.length>10000)fail();
    const assigned={};
    for(const [cid,amount] of Object.entries(m.assigned)){if(!ids.has(cid)||!cents(amount))fail();assigned[cid]=amount;}
    const transactions=m.transactions.map(t=>{
      if(!plain(t)||!safeId(t.id)||transactionIds.has(t.id)||!['income','expense'].includes(t.type)||!cents(t.amount)||t.amount===0||typeof t.description!=='string'||!t.description.trim()||t.description.length>100||!validDate(t.date)||t.date.slice(0,7)!==key||t.type==='expense'&&!ids.has(t.categoryId)||t.type==='income'&&t.categoryId!==null)fail();
      if(++count>20000)fail();transactionIds.add(t.id);
      if(t.payee!==undefined&&(typeof t.payee!=='string'||!t.payee.trim()||t.payee.length>100))fail();
      if(t.memo!==undefined&&(typeof t.memo!=='string'||t.memo.length>280))fail();
      if(t.createdAt!==undefined&&(typeof t.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t.createdAt)||!Number.isFinite(Date.parse(t.createdAt))))fail();
      if(t.cardId!==undefined&&(!safeId(t.cardId)||!cardIds.has(t.cardId)||t.type!=='expense'))fail();
      const sharing=checkedSharing(t.sharing,t.type);
      return {...(t.cardId?{cardId:t.cardId}:{}),...(t.createdAt?{createdAt:t.createdAt}:{}),...(sharing?{sharing}:{}),id:t.id,type:t.type,amount:t.amount,description:t.description.trim(),date:t.date,categoryId:t.categoryId,...(t.payee!==undefined?{payee:t.payee.trim()}:{}),...(t.memo!==undefined?{memo:t.memo.trim()}:{})};
    });
    months[key]={assigned,transactions};
  }
  const inputPayees=raw.payees===undefined?Object.values(months).flatMap(m=>m.transactions).filter(t=>t.payee).map(t=>t.payee):raw.payees;
  if(!Array.isArray(inputPayees)||inputPayees.length>20000)fail();
  const payeeNames=new Set(),payees=[];
  for(const name of inputPayees){if(typeof name!=='string'||!name.trim()||name.length>100)fail();const key=payeeKey(name);if(!payeeNames.has(key)){payeeNames.add(key);payees.push(name.trim().replace(/\s+/g,' '));}}
  const inputHousehold=raw.household===undefined?{version:1,settlements:[]}:raw.household;
  if(!plain(inputHousehold)||inputHousehold.version!==1||!Array.isArray(inputHousehold.settlements)||inputHousehold.settlements.length>20000)fail();
  const settlementIds=new Set();
  const settlements=inputHousehold.settlements.map(r=>{
    if(!plain(r)||!safeId(r.id)||settlementIds.has(r.id)||!['edu','larissa'].includes(r.from)||!cents(r.amount)||r.amount===0||!validDate(r.date)||typeof r.memo!=='string'||r.memo.length>280)fail();
    settlementIds.add(r.id);return {id:r.id,from:r.from,amount:r.amount,date:r.date,memo:r.memo.trim()};
  });
  const savingsGoals=checkedSavingsGoals(raw.savingsGoals),invoiceBills=checkedInvoiceBills(raw.invoiceBills);
  if(invoiceBills.some(b=>b.cardId&&!cardIds.has(b.cardId)))fail();
  return {household:{version:1,settlements},version:1,planId:raw.planId||id(),example:raw.example===true,hideBalances:raw.hideBalances===true,groups,categories,months,wealth,payees,savingsGoals,invoiceBills,cards};
}
