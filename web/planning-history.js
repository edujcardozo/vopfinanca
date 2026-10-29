import {currentMonth,validMonth,shiftMonth,getMonth,ensureMonth} from './core.js?v=vpo-126';
import {isCategoryVisible} from './group-actions.js?v=vpo-78';

export const HISTORY_METHODS=[
  {id:'last-month',title:'Gastos do mês passado',description:'Use o que você realmente gastou em cada categoria.'},
  {id:'six-months',title:'Média dos últimos 6 meses',description:'Suavize as variações de um mês para outro.'},
  {id:'year',title:'Média do ano',description:'Use os meses anteriores do mesmo ano do plano.'}
];
const amountLimit=1e12;
const sameWindow=(a,b)=>a.start===b.start&&a.end===b.end&&a.count===b.count;
const stale=()=>new Error('O histórico ou o planejado mudou. Revise os valores atualizados antes de aplicar.');

// Empty months after the first recorded expense count as zero in the average.
// Only expense records enter the calculation; assignments and carryover never do.
export function planningHistory(state,target,method,now=currentMonth()){
  if(!validMonth(target)||!validMonth(now)||!HISTORY_METHODS.some(item=>item.id===method))throw new Error('Escolha um mês e uma opção de histórico válidos.');
  const previous=shiftMonth(target,-1);
  const end=method==='last-month'?previous:(previous<now?previous:now);
  const desiredStart=method==='six-months'?shiftMonth(end,-5):method==='year'?target.slice(0,4)+'-01':end;
  const base={planId:state.planId,target,method,start:desiredStart,end,count:0,partial:false,inProgress:false,rows:[]};
  if(previous===target||end>now||desiredStart>end)return base;
  const expenseMonths=Object.keys(state.months).filter(key=>key<=end&&state.months[key].transactions.some(tx=>tx.type==='expense')).sort();
  const first=expenseMonths[0];
  if(!first)return base;
  const start=method==='last-month'?desiredStart:(first>desiredStart?first:desiredStart);
  if(start>end)return base;
  const count=(Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5))-Number(start.slice(5))+1;
  const sums=new Map();
  for(const [key,month] of Object.entries(state.months)){
    if(key<start||key>end)continue;
    for(const tx of month.transactions)if(tx.type==='expense')sums.set(tx.categoryId,(sums.get(tx.categoryId)||0n)+BigInt(tx.amount));
  }
  const assigned=getMonth(state,target).assigned;
  const rows=state.categories.filter(category=>isCategoryVisible(state,category)&&(sums.get(category.id)||0n)>0n).map(category=>{
    const sum=sums.get(category.id),divisor=BigInt(count);
    const suggested=Number((sum+divisor/2n)/divisor);
    if(!Number.isSafeInteger(suggested)||suggested>amountLimit)throw new Error('Há valores acima do limite do planejado neste período. Use outro período ou edite as categorias individualmente.');
    return {id:category.id,name:category.name,group:category.group,before:assigned[category.id]||0,suggested};
  });
  return {...base,start,count,partial:start!==desiredStart,inProgress:end===now,rows};
}

export function applyPlanningHistory(state,preview,categoryIds,now=currentMonth()){
  if(state.planId!==preview.planId)throw stale();
  const fresh=planningHistory(state,preview.target,preview.method,now);
  if(!sameWindow(fresh,preview))throw stale();
  const ids=[...new Set(categoryIds)];
  if(!ids.length)throw new Error('Selecione ao menos uma categoria com alteração.');
  const changes=ids.map(id=>{
    const prior=preview.rows.find(row=>row.id===id),next=fresh.rows.find(row=>row.id===id);
    if(!prior||!next||prior.name!==next.name||prior.before!==next.before||prior.suggested!==next.suggested)throw stale();
    return {id,before:next.before,after:next.suggested,hadValue:Object.hasOwn(getMonth(state,preview.target).assigned,id)};
  }).filter(change=>change.before!==change.after);
  if(!changes.length)throw new Error('Os valores selecionados já estão no planejado.');
  // Validate everything before making any change, including the month limit.
  if(!state.months[preview.target]&&Object.keys(state.months).length>=240)throw new Error('Seu plano atingiu o limite de meses.');
  const month=ensureMonth(state,preview.target);
  for(const change of changes)month.assigned[change.id]=change.after;
  return {planId:state.planId,month:preview.target,changes};
}

export function undoPlanningHistory(state,receipt){
  const month=state.months[receipt.month];
  if(state.planId!==receipt.planId||!month||receipt.changes.some(change=>!state.categories.some(category=>category.id===change.id)||month.assigned[change.id]!==change.after))throw new Error('O planejado já foi alterado. Revise as categorias para ajustar os valores.');
  for(const change of receipt.changes){if(change.hadValue)month.assigned[change.id]=change.before;else delete month.assigned[change.id];}
}
