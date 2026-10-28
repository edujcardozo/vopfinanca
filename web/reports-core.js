import {currentMonth,shiftMonth,totals,groupsFor,validMonth} from './core.js?v=vpo-118';

export function wealthAt(state,month){
  const cash=totals(state,month).balance;
  const recordedMonth=Object.keys(state.wealth||{}).filter(m=>m<=month).sort().at(-1)||null;
  if(!recordedMonth)return {known:false,cash,assets:null,debt:null,netWorth:null,otherAssets:null,recordedMonth:null};
  const snapshot=state.wealth[recordedMonth];
  const assets=Math.max(0,cash)+snapshot.otherAssets,debt=snapshot.debt+Math.max(0,-cash);
  return {known:true,cash,assets,debt,netWorth:assets-debt,otherAssets:snapshot.otherAssets,recordedMonth};
}
const dayNumber=date=>Date.parse(date+'T00:00:00Z')/86400000;
// A disclosed cash-only estimate, not a reproduction of YNAB's account-aware metric.
export function cashAgeHistory(state){
  const entries=Object.values(state.months).flatMap(m=>m.transactions).sort((a,b)=>a.date.localeCompare(b.date)||(a.type===b.type?0:a.type==='income'?-1:1));
  const queue=[],recent=[],history=[];let head=0,deficit=0,outflowCount=0;
  for(const tx of entries){
    if(tx.type==='income'){
      const covers=Math.min(deficit,tx.amount);deficit-=covers;
      if(tx.amount>covers)queue.push({remaining:tx.amount-covers,day:dayNumber(tx.date)});
      continue;
    }
    outflowCount++;let remaining=tx.amount,age=0;
    while(remaining>0&&head<queue.length){
      const bucket=queue[head],used=Math.min(remaining,bucket.remaining);
      age+=used/tx.amount*Math.max(0,dayNumber(tx.date)-bucket.day);
      remaining-=used;bucket.remaining-=used;if(!bucket.remaining)head++;
    }
    if(remaining)deficit+=remaining;
    recent.push(remaining?null:age);if(recent.length>10)recent.shift();
    const days=recent.length===10&&recent.every(n=>n!==null)?Math.round(recent.reduce((a,b)=>a+b,0)/10):null;
    history.push({date:tx.date,days,outflowCount,funded:recent.filter(n=>n!==null).length});
  }
  return history;
}
export function ageAt(history,month){
  const latest=history.filter(h=>h.date.slice(0,7)<=month).at(-1);
  return latest||{date:null,days:null,outflowCount:0,funded:0};
}
export function buildReports(state,endMonth=currentMonth(),range=6,filterGroup='all',options={}){
  const allowed=options.categoryIds?new Set(options.categoryIds):null;
  const includeCategory=c=>c&&(filterGroup==='all'||c.group===filterGroup)&&(!allowed||allowed.has(c.id));
  if(!validMonth(endMonth))throw new Error('Período inválido.');
  const count=range==='year'?Number(endMonth.slice(5)):Math.max(1,Math.min(24,Number(range)||6));
  if(options.startMonth!==undefined&&(!validMonth(options.startMonth)||options.startMonth>endMonth||(Number(endMonth.slice(0,4))-Number(options.startMonth.slice(0,4)))*12+Number(endMonth.slice(5))-Number(options.startMonth.slice(5))>=240))throw new Error('Período inválido. Escolha até 20 anos.');
  const requestedStart=options.startMonth??shiftMonth(endMonth,1-count);
  const transactions=Object.values(state.months).flatMap(m=>m.transactions).filter(t=>t.date.slice(0,7)<=endMonth);
  const earliest=transactions.map(t=>t.date.slice(0,7)).concat(Object.keys(state.wealth||{}).filter(m=>m<=endMonth)).sort()[0]||endMonth;
  const start=options.startMonth!==undefined?requestedStart:earliest>requestedStart?earliest:requestedStart;
  const categories=new Map(state.categories.map(c=>[c.id,c])),byMonth=new Map(),categorySpend=new Map(),incomePayees=new Map();
  const ageHistory=cashAgeHistory(state),series=[],categoryMonths=new Map(),incomeMonths=new Map();
  for(let month=start;month<=endMonth;month=shiftMonth(month,1)){
    const row={month,income:0,expense:0,filteredExpense:0,net:0,balance:0,stacks:{},wealth:wealthAt(state,month),age:ageAt(ageHistory,month)};
    series.push(row);byMonth.set(month,row);if(month===endMonth)break;
  }
  for(const tx of transactions){
    const row=byMonth.get(tx.date.slice(0,7));if(!row)continue;
    if(tx.type==='income'){
      row.income+=tx.amount;
      const incomeKey=row.month+':'+(tx.payee||tx.description);incomeMonths.set(incomeKey,(incomeMonths.get(incomeKey)||0)+tx.amount);
      const label=tx.payee||tx.description;incomePayees.set(label,(incomePayees.get(label)||0)+tx.amount);
    }else{
      row.expense+=tx.amount;const category=categories.get(tx.categoryId);
      if(includeCategory(category)){
        row.filteredExpense+=tx.amount;const categoryKey=row.month+':'+category.id;categoryMonths.set(categoryKey,(categoryMonths.get(categoryKey)||0)+tx.amount);
        const key=filterGroup==='all'?category.group:category.id;
        row.stacks[key]=(row.stacks[key]||0)+tx.amount;
        categorySpend.set(category.id,(categorySpend.get(category.id)||0)+tx.amount);
      }
    }
  }
  for(const row of series){row.net=row.income-row.expense;row.balance=totals(state,row.month).balance;}
  const income=series.reduce((s,r)=>s+r.income,0),expense=series.reduce((s,r)=>s+r.expense,0),filteredExpense=series.reduce((s,r)=>s+r.filteredExpense,0);
  const spending=state.categories.filter(c=>categorySpend.has(c.id)).map(c=>({...c,spent:categorySpend.get(c.id)})).sort((a,b)=>b.spent-a.spent);
  const dimensions=(filterGroup==='all'?groupsFor(state).map(g=>({id:g.id,name:g.name})):state.categories.filter(c=>c.group===filterGroup).map(c=>({id:c.id,name:c.name}))).filter(d=>series.some(r=>r.stacks[d.id]>0));
  const expenseGroups=groupsFor(state).map(g=>({...g,rows:state.categories.filter(c=>c.group===g.id&&includeCategory(c)).map(c=>{const values=series.map(r=>categoryMonths.get(r.month+':'+c.id)||0);return {...c,values,total:values.reduce((a,n)=>a+n,0)};}).filter(c=>c.total)})).filter(g=>g.rows.length);
  const incomeRows=[...incomePayees.keys()].map(name=>{const values=series.map(r=>incomeMonths.get(r.month+':'+name)||0);return {name,values,total:values.reduce((a,n)=>a+n,0)};});
  const groupSpending=groupsFor(state).map(g=>({...g,spent:spending.filter(c=>c.group===g.id).reduce((a,c)=>a+c.spent,0)})).filter(g=>g.spent).sort((a,b)=>b.spent-a.spent);
  return {start,end:endMonth,series,incomeRows,expenseGroups,groupSpending,income,expense,net:income-expense,filteredExpense,spending,dimensions,incomePayees:[...incomePayees].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount),wealth:wealthAt(state,endMonth),age:ageAt(ageHistory,endMonth),hasTransactions:transactions.some(t=>t.date.slice(0,7)>=start),savingsRate:income?((income-expense)/income*100):null};
}
