import {id,validDate,validMonth,validateState} from './core.js?v=vpo-34';
export const PERSON_NAMES={edu:'Edu',larissa:'Larissa'};
export const otherPerson=person=>person==='edu'?'larissa':'edu';
export function expenseShares(tx){
 if(tx.type!=='expense'||!tx.sharing)return null;
 const {paidBy,eduPercent}=tx.sharing,edu=Math.round(tx.amount*eduPercent/100),larissa=tx.amount-edu;
 return {paidBy,edu,larissa,personal:eduPercent===0||eduPercent===100,inAcerto:eduPercent>0&&eduPercent<100||paidBy==='edu'&&larissa>0||paidBy==='larissa'&&edu>0,balance:(paidBy==='edu'?tx.amount:0)-edu};
}
export function sharingLabel(tx,names=PERSON_NAMES){const s=expenseShares(tx);if(!s)return 'Quem pagou não informado';const p=tx.sharing.eduPercent;return `${names[s.paidBy]} pagou · ${p===50?'50/50':p===100?'Só '+names.edu:p===0?'Só '+names.larissa:`${names.edu} ${p}% / ${names.larissa} ${100-p}%`}`;}
export function coupleSummary(state,month){
 if(!validMonth(month))throw new Error('Mês inválido.');
 const result={month,eduPaid:0,larissaPaid:0,eduShare:0,larissaShare:0,expenses:0,unknownCount:0,unknownAmount:0,carryover:0,generated:0,settled:0,balance:0,transactions:[],settlements:[]};
 for(const [key,m] of Object.entries(state.months)){
  if(key>month)continue;
  for(const tx of m.transactions){
   if(tx.type!=='expense')continue;
   const shares=expenseShares(tx);
   if(key<month){result.carryover+=shares?.balance||0;continue;}
   if(!shares){result.unknownCount++;result.unknownAmount+=tx.amount;continue;}
   if(!shares.inAcerto)continue;
   result.transactions.push(tx);result.expenses+=tx.amount;result.generated+=shares.balance;
   result[shares.paidBy==='edu'?'eduPaid':'larissaPaid']+=tx.amount;result.eduShare+=shares.edu;result.larissaShare+=shares.larissa;
  }
 }
 for(const r of state.household?.settlements||[]){
  const key=r.date.slice(0,7);if(key>month)continue;
  const effect=r.from==='larissa'?r.amount:-r.amount;
  if(key<month)result.carryover-=effect;else{result.settled+=effect;result.settlements.push(r);}
 }
 result.balance=result.carryover+result.generated-result.settled;
 result.from=result.balance>0?'larissa':result.balance<0?'edu':null;result.to=result.from?otherPerson(result.from):null;
 result.transactions.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));result.settlements.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return result;
}
export function saveSettlement(state,record,originalId=null){
 if(!['edu','larissa'].includes(record.from)||!Number.isSafeInteger(record.amount)||record.amount<=0||record.amount>1e12||!validDate(record.date)||typeof record.memo!=='string'||record.memo.length>280)throw new Error('Confira quem transferiu, o valor e a data do acerto.');
 const records=state.household?.settlements||[];
 if(originalId&&!records.some(r=>r.id===originalId))throw new Error('Este acerto mudou. Abra novamente para editar.');
 const next={id:originalId||id(),from:record.from,amount:record.amount,date:record.date,memo:record.memo.trim()};
 const household={version:1,settlements:originalId?records.map(r=>r.id===originalId?next:r):[...records,next]};
 validateState({...state,household});state.household=household;return next;
}
