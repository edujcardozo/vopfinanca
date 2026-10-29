import {sharingLabel,PERSON_NAMES} from './couple-core.js?v=vpo-73';
import {categoryActivityData} from './category-activity.js?v=vpo-84';
import {formatMoney} from './core.js?v=vpo-126';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function categorySpendingPopup(state,month,categoryId,people={}){
 people={...PERSON_NAMES,...people};
 const data=categoryActivityData(state,month,categoryId);if(!data)return null;
 const money=n=>state.hideBalances?'••••':formatMoney(n),period=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(month+'-15T12:00:00'));
 return {title:data.category.name,body:`<div class="spending-popup-summary"><div><span>${esc(period)}</span><small>${data.transactions.length} lançamento${data.transactions.length===1?'':'s'}</small></div><div><span>Total gasto</span><strong>${money(data.spent)}</strong></div></div><label class="spending-popup-search"><span>Buscar nos lançamentos</span><input type="search" data-spending-search placeholder="Estabelecimento, observação ou divisão" autocomplete="off"></label><p class="spending-popup-results" data-spending-results role="status" aria-live="polite" hidden></p><div class="spending-popup-list" role="region" aria-label="Transações da categoria" tabindex="0"><table><thead><tr><th>Data</th><th>Estabelecimento / observação</th><th>Valor</th></tr></thead><tbody>${data.transactions.map(t=>`<tr data-spending-row data-spending-amount="${t.amount}"><td>${esc(t.date.slice(8,10)+'/'+t.date.slice(5,7))}</td><td><strong>${esc(t.payee||t.description||'Sem estabelecimento')}</strong>${t.memo?`<small>${esc(t.memo)}</small>`:''}<small class="spending-popup-sharing">${esc(sharingLabel(t,people))}</small></td><td>− ${money(t.amount)}</td></tr>`).join('')}</tbody></table>${data.transactions.length?'':'<p class="spending-popup-empty">Nenhum gasto nesta categoria no mês selecionado.</p>'}</div><footer class="spending-popup-footer"><span>Somente gastos deste mês</span><button type="button" class="btn btn-blue" data-close-spending>Fechar</button></footer>`};
}

export function filterSpendingPopup(root,query,hidden=false){
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const words=normalize(query.trim()).split(/\s+/).filter(Boolean);let count=0,total=0;
 root.querySelectorAll('[data-spending-row]').forEach(row=>{const text=normalize(row.textContent);row.hidden=!words.every(word=>text.includes(word));if(!row.hidden){count++;total+=Number(row.dataset.spendingAmount);}});
 const status=root.querySelector('[data-spending-results]');status.hidden=!words.length;status.textContent=count?`${count} resultado${count===1?'':'s'} · ${hidden?'••••':formatMoney(total)}`:'Nenhum lançamento encontrado.';
 root.querySelector('.spending-popup-list').scrollTop=0;
}
