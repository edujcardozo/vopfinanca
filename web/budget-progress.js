import {formatMoney} from './core.js?v=vpo-118';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function categorySpendingProgress(t){
  const net=t.assigned+t.carryover,funded=Math.max(0,net),priorShortfall=Math.max(0,-net),spentFunded=Math.min(t.spent,funded),remaining=Math.max(0,t.available),overspent=Math.max(0,-t.available);
  const scale=Math.max(funded,t.spent+priorShortfall,1);
  return {funded,spent:t.spent,remaining,overspent,priorShortfall,scale,spentRatio:spentFunded/scale,availableRatio:remaining/scale,overspentRatio:overspent/scale,status:overspent>0?'overspent':funded||t.spent?'funded':'empty'};
}
export function categoryBudgetDetails(category,t,hidden=false){
  const p=categorySpendingProgress(t),money=n=>hidden?'••••':formatMoney(n);
  const meta=`Planejado ${money(t.assigned)}`;
  const carry=t.carryover?' · Saldo anterior '+money(t.carryover):'';
  const description=hidden?'Valores ocultos':`Gasto no mês ${money(t.spent)} · Disponível ${money(t.available)}${carry}`;
  const caption=hidden?'Valores ocultos':p.overspent?`${money(t.spent)} gastos · ${money(p.overspent)} a cobrir`:t.spent?`${money(t.spent)} gastos · ${money(p.remaining)} restantes`:p.funded?`Sem gastos · ${money(p.remaining)} disponíveis`:'Sem gastos neste mês';
  return `<span class="category-meta">${esc(meta)}</span><span class="spending-progress ${hidden?'amounts-hidden':p.status}" role="img" aria-label="${esc(description)}" title="${esc(description)}">${hidden?'':`<i class="progress-spent" style="width:${p.spentRatio*100}%"></i><i class="progress-available" style="width:${p.availableRatio*100}%"></i><i class="progress-overspent" style="width:${p.overspentRatio*100}%"></i>`}</span><span class="category-spending-caption ${!hidden&&p.overspent?'overspent':''}">${esc(caption)}</span>`;
}

export function categorySpendingLabel(t,hidden=false){
  if(hidden)return '<span class="category-spending-summary">Valores ocultos</span>';
  const p=categorySpendingProgress(t),label=`Gasto ${formatMoney(t.spent)} de ${formatMoney(p.funded)}`;
  const details=`Planejado no mês: ${formatMoney(t.assigned)}${t.carryover?', saldo anterior '+formatMoney(t.carryover):''}.${p.overspent?' Falta cobrir '+formatMoney(p.overspent)+'.':''}`;
  return `<span class="category-spending-summary ${p.overspent?'is-overspent':''}" title="${esc(details)}">${esc(label)}</span>`;
}
