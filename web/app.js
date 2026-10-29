import {mountSavedCards,savedCardField,selectedCard} from './saved-cards-ui.js?v=vpo-129';
import {mountInvoiceBills,invoiceTransactionTag} from './invoice-bills-ui.js?v=vpo-129';
import {organizeUnclassifiedGroup} from './unclassified-group.js?v=vpo-126';
import {matchesTransactionSearch} from './transaction-search.js?v=vpo-126';
import {mountRecentTransactions} from './recent-transactions.js?v=vpo-126';
import {categorySpendingPopup,filterSpendingPopup} from './category-spending-popup.js?v=vpo-126';
import {openQuickCreate} from './quick-create.js?v=vpo-126';
import {needsCategory} from './transaction-category-filter.js?v=vpo-126';
import {overspendingInsights,overspendingHTML} from './overspending-insights.js?v=vpo-126';
import {mountCategoryActivity} from './category-activity.js?v=vpo-126';
import {mountInvoiceImport} from './invoice-import.js?v=vpo-129';
import {createDialogPages} from './dialog-pages.js?v=vpo-126';
import {coupleSummary,sharingLabel,expenseShares,saveSettlement} from './couple-core.js?v=vpo-126';
import {coupleCard,coupleDetail} from './couple-ui.js?v=vpo-126';
import {mobileHome} from './mobile-home.js?v=vpo-126';
import {deleteCategory,categoryHasActivity} from './category-actions.js?v=vpo-126';
import {deleteGroup,setGroupHidden,visibleGroups} from './group-actions.js?v=vpo-126';
import {matchingCategories} from './category-search.js?v=vpo-126';
import {categoryBudgetDetails,categorySpendingLabel} from './budget-progress.js?v=vpo-126';
import {categoryIcon} from './category-icons.js?v=vpo-126';
import {mountPayeeAutocomplete} from './payee-autocomplete.js?v=vpo-126';
import {applyLayout} from './reorder-core.js?v=vpo-126';
import {createReorder} from './reorder.js?v=vpo-126';
import {STORAGE_KEY,formatMoney,parseMoney,today,currentMonth,validDate,validMonth,shiftMonth,id,createState,getMonth,ensureMonth,totals,monthlyPlanTotals,monthlyCategoryTotals,validateState,dateOffset,formatTransactionDate,payeeHistory,matchingPayees,payeeKey,searchPayeeKey,saveTransaction,groupsFor,createGroup,renameGroup,moveCategory} from './core.js?v=vpo-126';
import {createReportsUI} from './reports-ui.js?v=vpo-126';
import {wealthAt} from './reports-core.js?v=vpo-126';
import {createCloudSync} from './cloud-sync.js?v=vpo-126';
import {createSharingUI} from './sharing-ui.js?v=vpo-126';
import {platform} from './platform.js';
import {householdForSharing,inactiveHousehold} from './household-context.js?v=vpo-126';
import {accountUsername} from './account-identity.js?v=vpo-126';
import {createPlanningHistoryUI,historyIcon} from './planning-history-ui.js?v=vpo-126';
import {createPlanningHistoryIntro} from './planning-history-intro.js';
import {createSavingsGoalsUI} from './savings-goals-ui.js?v=vpo-126';
import {revealTransactionComposer} from './transaction-focus.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name,extra='')=>`<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const money=n=>state.hideBalances?'••••':formatMoney(n);
const inputMoney=n=>(n/100).toFixed(2).replace('.',',');
const percentage=(n,d)=>d?Math.min(100,Math.max(0,Math.round(n/d*100))):0;
const monthName=k=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(k+'-15T12:00:00'));
const dayName=d=>new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',weekday:'long'}).format(new Date(d+'T12:00:00'));
const collapsedGroups=new Set();
let mobileStructure=false;
let historyPlanning,savingsGoals,categoryActivity,recentActivity,invoiceBillsUI;
let historyIntro,historyIntroReady=false;
const routes={home:'inicio',budget:'planejar',transactions:'movimentos',overview:'visao',settings:'ajustes'};
let state,hadStored=false,loadWarning=false,selectedMonth=currentMonth(),view='budget',txFilter='all',personFilter='all',uncategorizedOnly=false,toastTimer,undoAction=null;
const planStorage=platform.storage;
try{const stored=planStorage.getItem(STORAGE_KEY);hadStored=!!stored;state=stored?validateState(JSON.parse(stored)):createState(platform.example);}catch{state=createState(platform.example);loadWarning=true;}
const initialPlanSnapshot=JSON.stringify(state);
let household=inactiveHousehold();
function updateHousehold(info){const next=householdForSharing(info,household);if(JSON.stringify(next)===JSON.stringify(household))return;household=next;if(!household.enabled)personFilter='all';renderAll();}
const reportUI=createReportsUI({root:$('#overview-content'),getState:()=>state,getEndMonth:()=>selectedMonth,onEditWealth:wealthDialog,onTogglePrivacy:()=>$('#privacy-toggle').click(),notify:toast});
const cloudSync=createCloudSync({getState:()=>state,onApply:applyCloudPlan,onStatus:showSyncStatus,onConflict:syncConflictDialog,canApplyRemote:()=>!dialog.open&&$('#transaction-composer').hidden&&!document.querySelector('[data-assigned-input][data-editing=true]')&&!document.querySelector('#category-menu'),hadStored,storage:planStorage,fetcher:platform.fetcher});
const sharingUI=createSharingUI({root:$('#sharing-settings'),sync:cloudSync,openDialog,closeDialog,notify:toast,fetcher:platform.fetcher,independent:platform.independent,onChange:updateHousehold,allowEmptySwitch:()=>platform.independent&&!hadStored&&JSON.stringify(state)===initialPlanSnapshot&&!cloudSync.status.conflict});
platform.onReady?.(cloudSync,toast,{getState:()=>state,openDialog,closeDialog});

const reorder=createReorder({root:$('#categories-list'),announce:message=>{$('#reorder-announcement').textContent=message;},onCancel:()=>renderBudget(),onCommit:(layout,label,focus)=>{
  try{if(applyLayout(state,layout)){persist();$('#reorder-announcement').textContent=label+' reposicionado. Ordem salva automaticamente.';}renderAll();if(focus){const nodes=$$('[data-sort-handle]');nodes.find(h=>h.dataset.sortHandle===focus.type&&h.closest(focus.type==='group'?'[data-sort-group]':'[data-sort-category]').dataset[focus.type==='group'?'sortGroup':'sortCategory']===focus.id)?.focus({preventScroll:true});}}
  catch(error){renderAll();toast(error.message);}
}});
function sortHandle(type,label){return `<button type="button" class="sort-handle" data-sort-handle="${type}" data-sort-label="${esc(label)}" aria-label="Mover ${esc(label)}" aria-describedby="reorder-help" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg></button>`;}
function toast(message,undo=null){
  clearTimeout(toastTimer);undoAction=undo;$('#toast-text').textContent=message;$('#toast-undo').hidden=!undo;$('#toast').hidden=false;
  toastTimer=setTimeout(()=>{$('#toast').hidden=true;undoAction=null;},undo?9000:4500);
}
function cachePlan(){
  try{planStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}
  catch{toast('O navegador não permitiu guardar a cópia local. Mantenha o app aberto até sincronizar.');return false;}
}
function persist(){cachePlan();cloudSync.markLocal();}
function applyCloudPlan(incoming){
  const menuEditing=!!document.querySelector('#category-menu');closeCategoryMenu(false);
  const editing=menuEditing||!!document.querySelector('[data-assigned-input][data-editing=true]')||dialog.open||!$('#transaction-composer').hidden;if(dialog.open)closeDialog();closeComposer();
  state=incoming;undoAction=null;$('#toast-undo').hidden=true;cachePlan();renderAll();
  if(editing)toast('O plano mudou em outro aparelho. Reabra o formulário para editar a versão atualizada.');
}
function showSyncStatus(info){
  platform.onSyncStatus?.(info);
  if(info.kind==='synced')queueMicrotask(()=>{
    const status=cloudSync.status;
    if(status.initialized&&!status.dirty&&!status.blocked&&!status.conflict&&!dialog.open&&$('#transaction-composer').hidden&&!document.querySelector('#category-menu')){
      try{const next=structuredClone(state);if(organizeUnclassifiedGroup(next)){cloudSync.backupCurrent();state=next;persist();renderAll();}}
      catch(error){toast(error.message);}
    }
    historyIntro?.maybeShow();
  });
  const label={connecting:'Conectando à conta…',saving:'Salvando na conta…',pending:'Atualizando o plano…',synced:'Plano sincronizado',offline:'Sem conexão · cópia local',auth:'Entre na conta para sincronizar',conflict:'Conflito: revisão necessária',warning:'Verifique o salvamento',blocked:'Revise o acesso ao plano em Ajustes'}[info.kind]||info.message;
  $('#save-status').textContent=label;
  $('#sync-footer-use').setAttribute('href',info.kind==='synced'?'#i-check':['offline','auth','conflict','warning','blocked'].includes(info.kind)?'#i-warning':'#i-cloud');
  $('#sync-header-label').textContent=info.kind==='synced'?'Conta sincronizada':info.kind==='offline'?'Cópia local':info.kind==='conflict'?'Revisar alterações':'Sincronizando';
  $('#sync-banner').hidden=['synced','pending','saving'].includes(info.kind);$('#sync-banner').className='sync-banner sync-'+info.kind;
  $('#sync-banner-text').textContent=info.message;
  $('#sync-retry').hidden=info.kind==='auth'||info.kind==='connecting';$('#sync-retry').textContent=info.kind==='conflict'?'Revisar':info.kind==='blocked'?'Abrir Ajustes':'Tentar agora';
  $('#sync-signin').hidden=info.kind!=='auth';
  $('#sync-settings-status').textContent=label;
  $('#sync-account-label').textContent=info.user?.email?'Conta: '+accountUsername(info.user.email):platform.independent?'Sua conta VPO em todos os aparelhos.':'A mesma conta do ChatGPT em todos os aparelhos.';
  $('#sync-last-update').textContent=info.updatedAt?'Última confirmação: '+new Date(info.updatedAt).toLocaleString('pt-BR'):'Aguardando a primeira confirmação da conta.';
  $('#sync-retry').onclick=()=>{if(info.kind==='conflict')cloudSync.review();else if(info.kind==='blocked'){goPlan('settings');sharingUI.refresh();}else cloudSync.flush();};
}
function downloadPlan(plan,filename){
  const blob=new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function syncConflictDialog(info){
  const summary=p=>{const transactions=Object.values(p.months).flatMap(m=>m.transactions),last=transactions.map(t=>t.date).sort().at(-1),t=totals(p,selectedMonth);return `<span>${transactions.length} lançamentos · ${p.categories.length} categorias</span><strong>Saldo: ${money(t.balance)}</strong><small>${last?'Último lançamento: '+last.split('-').reverse().join('/'):'Sem lançamentos'}</small><small>${esc(p.groups.map(g=>g.name).slice(0,5).join(' · '))}</small>`;};
  const fieldConflict=info.reason==='edit';
  openDialog('Vamos manter seu plano seguro.',`<p class="confirm-text">${fieldConflict?'O mesmo dado recebeu alterações diferentes. A escolha abaixo decide quais valores prevalecem nos conflitos. As alterações que não se contradizem serão combinadas.':'Este aparelho e a conta têm planos diferentes. Escolha qual plano completo deve continuar sincronizado. As duas versões poderão ser baixadas antes da escolha.'}</p><div class="sync-conflict-copies"><section><h3>Este aparelho</h3>${summary(info.local)}<button type="button" class="text-link" id="backup-local-conflict">${icon('download')} Baixar esta cópia</button></section><section><h3>Conta sincronizada</h3>${summary(info.remote)}<button type="button" class="text-link" id="backup-remote-conflict">${icon('download')} Baixar esta cópia</button></section></div><p class="dialog-note">Uma cópia de recuperação será guardada neste aparelho antes de substituir os dados. Ela fica disponível em Ajustes.</p><div class="sync-conflict-actions"><button class="btn btn-blue" id="use-remote">${fieldConflict?'Preferir valores da conta':'Usar plano da conta'}</button><button class="subtle-button" id="use-local">${fieldConflict?'Preferir valores deste aparelho':'Enviar plano deste aparelho'}</button></div>`,'REVISÃO DO PLANO');
  $('#backup-local-conflict').onclick=()=>{downloadPlan(info.local,`plano-aparelho-${today()}.json`);cloudSync.acknowledgeBackup();};
  $('#backup-remote-conflict').onclick=()=>downloadPlan(info.remote,`plano-conta-${today()}.json`);
  $('#use-remote').onclick=async()=>{closeDialog();await cloudSync.resolve('remote');};
  $('#use-local').onclick=async()=>{closeDialog();await cloudSync.resolve('local');};
}
function recoveryDialog(){
  const copies=cloudSync.recoveries();
  openDialog('Cópias de recuperação.',copies.length?`<p class="confirm-text">Baixe uma cópia para conferir ou importar depois. Importar um backup substitui o plano sincronizado em todos os seus aparelhos.</p><div class="recovery-list">${copies.map((r,i)=>`<button class="subtle-button" data-download-recovery="${i}"><span><strong>${esc(r.source)}</strong><small>${esc(new Date(r.date).toLocaleString('pt-BR'))}</small></span>${icon('download')}</button>`).join('')}</div>`:'<p class="confirm-text">Ainda não há cópias de recuperação neste aparelho. Elas são criadas ao resolver conflitos, importar ou substituir um plano.</p>','GUARDAR UMA CÓPIA TAMBÉM É CUIDAR');
  $$('[data-download-recovery]').forEach(b=>b.onclick=()=>{const r=copies[Number(b.dataset.downloadRecovery)];downloadPlan(r.state,`plano-recuperacao-${today()}.json`);});
}
function goPlan(next='budget'){location.hash='#plano/'+routes[next];}
function positionMonthRow(){
  const desktop=window.matchMedia('(min-width: 720px)').matches;
  const slot=$(view==='budget'?(desktop?'#budget-desktop-month-slot':'#budget-month-slot'):view==='transactions'&&desktop?'#transactions-desktop-month-slot':'#shared-month-slot'),row=$('.app-month-row');
  if(row.parentElement!==slot)slot.append(row);
  const summary=$('#couple-transactions-summary'),summarySlot=$(view==='transactions'&&desktop?'#transactions-settlement-slot':'#shared-month-slot');
  if(summary.parentElement!==summarySlot)summarySlot.append(summary);
  $('#shared-month-slot').hidden=['overview','home','budget'].includes(view)||view==='transactions'&&desktop;
}
function renderAll(){
  categoryActivity?.refresh();
  recentActivity?.refresh();
  invoiceBillsUI?.render();
  $('#app-main').classList.toggle('budget-active',view==='budget');
  $('#app-main').classList.toggle('overview-active',view==='overview');
  $('#app-main').classList.toggle('home-active',view==='home');
  $('#app-main').classList.toggle('transactions-active',view==='transactions');
  $('#shared-month-slot').classList.toggle('transactions-month-header',view==='transactions');$('#couple-transactions-summary').hidden=view!=='transactions';
  $('.app-header').hidden=['overview','home'].includes(view);
  positionMonthRow();
  $('#month-title').textContent=monthName(selectedMonth);$('#mobile-plan-month').value=selectedMonth;
  $('#example-banner').hidden=!state.example;
  $('#privacy-toggle').innerHTML=icon(state.hideBalances?'eye-off':'eye');
  $('#privacy-toggle').setAttribute('aria-label',state.hideBalances?'Mostrar valores':'Ocultar valores');
  $('#privacy-toggle').setAttribute('aria-pressed',String(state.hideBalances));
  renderBudget();renderTransactions();renderOverview();renderHome();renderCouple();savingsGoals?.render();
}
function route(){
  const isPlan=location.hash.startsWith('#plano');
  const wasOpen=!$('#budget-app').hidden;
  $('#budget-app').hidden=!isPlan;$('#landing').hidden=isPlan;
  document.querySelector('meta[name="theme-color"]').content=isPlan&&window.matchMedia('(max-width:719px)').matches?'#f4f2eb':isPlan?'#f7f7fc':'#1c1f58';
  if(isPlan){
    const path=location.hash.split('/')[1]||'planejar';
    view=path==='convite'?'settings':Object.keys(routes).find(k=>routes[k]===path)||'budget';
    if(view==='overview')reportUI.resetMobile?.();
    const titles={home:'Meu plano',budget:'Seu dinheiro, com direção.',transactions:'Cada movimento conta.',overview:'Veja o seu plano acontecer.',settings:'Do seu jeito.'};
    document.title=`${{home:'Início',budget:'Planejar',transactions:'Movimentos',overview:'Visão geral',settings:'Ajustes'}[view]} · VPO`;
    $('#view-title').textContent=window.matchMedia('(max-width:719px)').matches?({budget:'Planejar',transactions:'Movimentos',settings:'Ajustes',home:'Meu plano',overview:'Visão geral'}[view]):titles[view];
    $$('.app-view').forEach(el=>el.hidden=el.id!==`view-${view}`);
    $$('[data-view]').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    $('.mobile-fab').hidden=['settings','overview'].includes(view);
    document.querySelector('meta[name="theme-color"]').content=window.matchMedia('(max-width:719px)').matches?(view==='home'?'#555af5':'#f4f2eb'):'#f7f7fc';
    cachePlan();cloudSync.start().then(()=>{sharingUI.handleInvitation();historyIntroReady=true;historyIntro?.maybeShow();});renderAll();if(view!=='transactions'||$('#transaction-composer').hidden)window.scrollTo({top:0,behavior:'instant'});
    if(view==='settings')sharingUI.refresh();
    if(loadWarning){toast(platform.independent?'Não foi possível ler a cópia local. Conectando ao plano salvo na conta.':'Não foi possível ler o plano salvo. Um exemplo foi aberto.');loadWarning=false;}
  }else{
    document.title='VPO — Você Precisa de um Orçamento';
    if(wasOpen)requestAnimationFrame(()=>document.getElementById(location.hash.slice(1)||'inicio')?.scrollIntoView());
  }
}
function renderBudgetSummary(){
  const t=monthlyPlanTotals(state,selectedMonth),overspent=t.remaining<0;
  const remainingLabel=overspent?'Acima do planejado':'Restante do planejado';
  const remainingHelp='Planejado menos gastos, somente do mês selecionado.';
  const remainingContent=`<span class="monthly-balance-copy"><span>${remainingLabel}</span><b data-monthly-remaining>${money(Math.abs(t.remaining))}</b></span>${overspent?'<span class="monthly-balance-action">Como ajustar</span>'+icon('chevron'):''}`;
  const remainingClass='monthly-plan-balance '+(overspent?'is-negative':t.remaining?'is-positive':'is-balanced');
  const remainingHTML=overspent?`<button type="button" class="${remainingClass}" data-fix-monthly-spending title="${remainingHelp}" aria-label="${remainingLabel} ${money(-t.remaining)} no mês selecionado. Como ajustar.">${remainingContent}</button>`:`<div class="${remainingClass}" title="${remainingHelp}">${remainingContent}</div>`;
  $('#budget-summary').innerHTML=`<article class="summary-card assign-card monthly-plan-card">
    <div class="monthly-plan-summary" aria-label="Resumo do mês selecionado">
      <div class="plan-metric plan-metric-planned"><span class="summary-label">Planejado no mês</span><strong data-monthly-planned>${money(t.planned)}</strong></div>
      <div class="plan-metric plan-metric-spent"><span class="summary-label">Gasto no mês</span><strong data-monthly-spent>${money(t.spent)}</strong></div>
    </div>
    ${remainingHTML}
  </article>`;
}
function renderBudget(){
  closeCategoryMenu(false);
  historyPlanning?.closeMenu();
  reorder.cancel();
  $('#categories-list').classList.add('direct-reorder');
  $('#view-budget').classList.toggle('mobile-structure-open',mobileStructure);$('[data-mobile-structure]').setAttribute('aria-expanded',String(mobileStructure));
  renderBudgetSummary();
  $('#categories-list').innerHTML=visibleGroups(state).map(({id:key,name:label})=>{
    const cats=state.categories.filter(c=>!c.hidden&&c.group===key);
    const sum=cats.reduce((a,c)=>a+monthlyCategoryTotals(state,selectedMonth,c.id).available,0),assigned=cats.reduce((a,c)=>a+monthlyCategoryTotals(state,selectedMonth,c.id).assigned,0),spent=cats.reduce((a,c)=>a+monthlyCategoryTotals(state,selectedMonth,c.id).spent,0),folded=collapsedGroups.has(key);
    return `<section class="category-group" data-sort-group="${esc(key)}"><div class="group-header">${sortHandle('group',label)}<button type="button" class="group-collapse" data-collapse-group="${esc(key)}" aria-expanded="${!folded}" aria-label="${folded?'Expandir':'Recolher'} ${esc(label)}"><svg class="group-collapse-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></button><h3><button type="button" class="group-name" data-edit-group="${esc(key)}" aria-label="Opções do grupo ${esc(label)}">${esc(label)}</button></h3><div class="group-header-actions"><span class="group-planned-total"><small>Planejado</small><strong>${money(assigned)}</strong></span><span class="group-spent-total"><small>Gasto</small><strong>${money(spent)}</strong></span><span class="group-total"><small>Disponível</small><strong>${money(sum)}</strong></span><button type="button" class="icon-button" data-add-category-group="${esc(key)}" aria-label="Adicionar categoria em ${esc(label)}">${icon('plus')}</button><button type="button" class="icon-button" data-edit-group="${esc(key)}" aria-label="Opções do grupo ${esc(label)}">${icon('edit')}</button></div></div><div class="category-items" ${folded?'hidden':''}>${cats.map(c=>{
      const ct=monthlyCategoryTotals(state,selectedMonth,c.id);
      return `<div class="category-sort-row" data-sort-category="${esc(c.id)}">${sortHandle('category',c.name)}<div class="category-row" data-category="${esc(c.id)}" aria-label="Editar ${esc(c.name)}, disponível ${money(ct.available)}"><span class="category-info"><span class="category-emoji" aria-hidden="true">${esc(categoryIcon(c.name))}</span><span><span class="category-heading"><button type="button" class="category-name category-menu-trigger" data-category-menu="${esc(c.id)}" aria-controls="category-activity-panel" aria-expanded="false">${esc(c.name)}</button>${categorySpendingLabel(ct,state.hideBalances)}</span><span class="category-budget-details">${categoryBudgetDetails(c,ct,state.hideBalances)}</span></span></span><span class="category-assigned"><input type="text" class="assigned-input" data-assigned-input="${esc(c.id)}" value="${money(ct.assigned)}" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="20" aria-label="Planejado de ${esc(c.name)}" aria-describedby="assigned-help"></span><button type="button" class="category-spent" data-category-spending="${esc(c.id)}" aria-haspopup="dialog" aria-label="Gasto de ${esc(c.name)}: ${money(ct.spent)}">${money(ct.spent)}</button><button type="button" class="category-available category-value-edit" aria-label="Editar valores de ${esc(c.name)}"><span class="amount-badge ${ct.available<0?'negative':!ct.available?'zero':''}">${money(ct.available)}</span></button></div></div>`;
    }).join('')}</div>${!cats.length&&!folded?`<div class="empty-group"><p>Seu grupo está pronto. Qual categoria vem primeiro?</p><button type="button" class="text-link" data-add-category-group="${esc(key)}">${icon('plus')} Adicionar categoria</button></div>`:''}</section>`;
  }).join('')+hiddenGroupsHTML()+hiddenCategoriesHTML();
  bindAssignedInputs();
  queueMicrotask(()=>historyIntro?.refresh());
}
function refreshBudgetAmounts(){
  renderBudgetSummary();
  $$('[data-category]').forEach(row=>{
    const c=state.categories.find(c=>c.id===row.dataset.category);if(!c)return;
    const ct=monthlyCategoryTotals(state,selectedMonth,c.id);
    row.querySelector('.category-budget-details').innerHTML=categoryBudgetDetails(c,ct,state.hideBalances);
    row.querySelector('.category-spending-summary').outerHTML=categorySpendingLabel(ct,state.hideBalances);
    row.querySelector('.category-spent').textContent=money(ct.spent);row.querySelector('.category-spent').setAttribute('aria-label',`Gasto de ${c.name}: ${money(ct.spent)}`);
    const badge=row.querySelector('.amount-badge');badge.textContent=money(ct.available);badge.classList.toggle('negative',ct.available<0);badge.classList.toggle('zero',ct.available===0);
    row.setAttribute('aria-label',`${c.name}, disponível ${money(ct.available)}`);
  });
  $$('[data-sort-group]').forEach(group=>{const sum=state.categories.filter(c=>!c.hidden&&c.group===group.dataset.sortGroup).reduce((a,c)=>a+monthlyCategoryTotals(state,selectedMonth,c.id).available,0);group.querySelector('.group-spent-total strong').textContent=money(state.categories.filter(c=>!c.hidden&&c.group===group.dataset.sortGroup).reduce((a,c)=>a+monthlyCategoryTotals(state,selectedMonth,c.id).spent,0));group.querySelector('.group-total strong').textContent=money(sum);group.querySelector('.group-planned-total strong').textContent=money(state.categories.filter(c=>!c.hidden&&c.group===group.dataset.sortGroup).reduce((a,c)=>a+monthlyCategoryTotals(state,selectedMonth,c.id).assigned,0));});
  renderOverview();renderHome();
}
function bindAssignedInputs(){
  $$('[data-assigned-input]').forEach(input=>{
    const categoryId=input.dataset.assignedInput,month=selectedMonth;
    const stored=()=>getMonth(state,month).assigned[categoryId]||0;
    const restore=()=>{input.dataset.editing='false';input.value=money(stored());input.removeAttribute('aria-invalid');};
    const save=(leaving=false)=>{
      if(input.dataset.editing!=='true')return true;
      const amount=input.value.trim()?parseMoney(input.value):0;
      if(amount===null){input.setAttribute('aria-invalid','true');toast('Informe um valor planejado válido, como 200,00.');if(leaving)restore();return false;}
      const changed=amount!==stored();
      if(changed){ensureMonth(state,month).assigned[categoryId]=amount;persist();}
      restore();if(changed){refreshBudgetAmounts();$('#reorder-announcement').textContent='Valor planejado salvo. Saldos e consumo atualizados.';}return true;
    };
    input.onfocus=()=>{if(input.dataset.editing==='true')return;input.dataset.editing='true';input.value=inputMoney(stored());input.select?.();};
    input.oninput=()=>input.removeAttribute('aria-invalid');
    input.onblur=()=>save(true);
    input.onkeydown=e=>{
      if(e.key==='Enter'){e.preventDefault();if(save())input.blur();}
      else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();restore();input.blur();}
    };
  });
}
function matchesPayerFilter(tx,filter){
 const key=filter.split('-')[0],shares=expenseShares(tx);
 return tx.type==='expense'&&tx.sharing?.paidBy===key&&!!shares&&(filter.endsWith('-personal')?!shares.inAcerto:shares.inAcerto);
}
function renderTransactions(){
  const search=$('#transaction-search').value.trim().toLocaleLowerCase('pt-BR');
  const transactions=[...getMonth(state,selectedMonth).transactions].sort((a,b)=>b.date.localeCompare(a.date));
  const mobileFilters=$('#transaction-mobile-filter-toggle'),activeFilterCount=Number(uncategorizedOnly)+Number(personFilter!=='all');mobileFilters.querySelector('b').hidden=!activeFilterCount;mobileFilters.querySelector('b').textContent=String(activeFilterCount);mobileFilters.classList.toggle('has-active-filters',!!activeFilterCount);
  const pendingCount=transactions.filter(t=>needsCategory(t,state.categories)).length;
  const pendingButton=$('#transaction-uncategorized');pendingButton.setAttribute('aria-pressed',String(uncategorizedOnly));pendingButton.querySelector('b').textContent=String(pendingCount);
  for(const button of $$('[data-payer-filter]')){const filter=button.dataset.payerFilter,key=filter.split('-')[0],personal=filter.endsWith('-personal'),name=household.people[key]||'',short=accountUsername(name).split(/\s+/)[0].replace(/^larissabassi(?:borges)?$/i,'Larissa')||name;const paid=transactions.filter(t=>matchesPayerFilter(t,filter));button.hidden=!household.enabled;button.setAttribute('aria-pressed',String(personFilter===filter));button.setAttribute('aria-label','Filtrar gastos '+(personal?'individuais':'compartilhados')+' pagos por '+name);button.title=name+' pagou · '+money(paid.reduce((n,t)=>n+t.amount,0))+' no mês';button.querySelector('[data-payer-name]').dataset.shortName=short;button.querySelector('[data-payer-name]').textContent=short+(personal?' pagou seu gasto':' pagou');button.querySelector('.payer-filter-avatar').textContent=short.slice(0,1).toLocaleUpperCase('pt-BR');button.querySelector('b').textContent=String(paid.length);}
  for(const group of $$('[data-payer-filter-group]'))group.hidden=!household.enabled;
  const filtered=transactions.filter(t=>{
    const category=state.categories.find(c=>c.id===t.categoryId);
    const personMatches=personFilter==='all'||personFilter==='unknown'&&t.type==='expense'&&!t.sharing||personFilter==='shared'&&t.sharing?.eduPercent>0&&t.sharing.eduPercent<100||['edu','larissa','edu-personal','larissa-personal'].includes(personFilter)&&matchesPayerFilter(t,personFilter);
    return (!uncategorizedOnly||needsCategory(t,state.categories))&&personMatches&&(txFilter==='all'||t.type===txFilter)&&matchesTransactionSearch(t,category,search);
  });
  const filterSummary=$('#transaction-filter-summary');
  filterSummary.hidden=!(uncategorizedOnly||personFilter!=='all'||txFilter!=='all'||search);
  if(!filterSummary.hidden){
    const spent=filtered.filter(t=>t.type==='expense').reduce((sum,t)=>sum+t.amount,0),income=filtered.filter(t=>t.type==='income').reduce((sum,t)=>sum+t.amount,0);
    const selectedPayer=$$('[data-payer-filter]').find(b=>b.dataset.payerFilter===personFilter);
    const description=[selectedPayer?(personFilter.endsWith('-personal')?'Individual · ':'Compartilhado · ')+selectedPayer.querySelector('[data-payer-name]').textContent:'',uncategorizedOnly?'Sem categoria':'',search?'Busca aplicada':''].filter(Boolean).join(' · ');
    filterSummary.innerHTML=`<span class="filter-total-copy"><strong>${txFilter==='income'?'Entradas filtradas':'Gastos filtrados'}</strong><small>${filtered.length} ${filtered.length===1?'movimento':'movimentos'} no mês${description?' · '+esc(description):''}</small></span><span class="filter-total-amount"><b>${money(txFilter==='income'?income:spent)}</b>${income&&txFilter!=='income'?`<small>Entradas: ${money(income)}</small>`:''}</span>`;
  }
  if(!filtered.length){$('#transactions-list').innerHTML=`<div class="empty-state">${icon('swap')}<h3>${uncategorizedOnly&&!pendingCount?'Tudo classificado neste mês.':transactions.length?'Nenhum resultado por aqui.':'Seu próximo movimento começa aqui.'}</h3><p>${uncategorizedOnly&&!pendingCount?'Nenhuma despesa está sem categoria. Desative o filtro para ver os demais movimentos.':transactions.length?'Tente outro termo ou escolha um filtro diferente.':'Registre uma entrada ou uma despesa e acompanhe tudo no mesmo lugar.'}</p>${transactions.length?'':`<button class="btn btn-blue" data-add-transaction>${icon('plus')} Novo lançamento</button>`}</div>`;return;}
  let date='';
  $('#transactions-list').innerHTML=filtered.map(t=>{
    const c=state.categories.find(c=>c.id===t.categoryId),income=t.type==='income';
    const heading=t.date!==date?`<h3 class="tx-date">${esc(dayName(t.date))}</h3>`:'';date=t.date;
    return `${heading}<article class="tx-row"><span class="tx-icon ${income?'income':''}">${income?icon('plus'):esc(c?categoryIcon(c.name):'•')}</span><button type="button" class="tx-info tx-edit" data-edit-tx="${esc(t.id)}" aria-label="Editar lançamento: ${esc(t.payee||t.description)}"><strong>${esc(t.payee||t.description)}</strong><small class="tx-category-tag ${income?'income':''}">${income?'Entrada de dinheiro':esc(c?categoryIcon(c.name)+' '+c.name:'Categoria')}</small>${!income&&household.enabled?`<span class="tx-person-tag ${t.sharing?'':'unclassified'}">${esc(sharingLabel(t,household.people))}</span>`:''}${invoiceTransactionTag(state,t)}${t.memo?`<span class="tx-memo">${esc(t.memo)}</span>`:''}</button><span class="tx-amount ${income?'income':''}">${income?'+':'−'} ${money(t.amount)}</span><button class="icon-button tx-delete" data-delete-tx="${esc(t.id)}" aria-label="Excluir ${esc(t.payee||t.description)}">${icon('trash')}</button></article>`;
  }).join('');
}
function renderOverview(){reportUI.render();}
function renderHome(){$('#mobile-home-content').innerHTML=mobileHome(state,selectedMonth,{household});}
function renderCouple(){
  $('#couple-budget-summary').hidden=!household.enabled;
  $('#couple-transactions-summary').hidden=!household.enabled||view!=='transactions';
  $('#transaction-person-filter').closest('label').hidden=true;
  for(const key of ['edu','larissa'])$('#transaction-person-filter').querySelector(`[value=${key}]`).textContent=household.people[key]+' pagou';
  $('#couple-budget-summary').innerHTML=household.enabled?coupleCard(state,selectedMonth,{compact:true,people:household.people}):'';
  $('#couple-transactions-summary').innerHTML=household.enabled?coupleCard(state,selectedMonth,{header:true,people:household.people}):'';
  $('#transaction-person-filter').value=personFilter;
}
function coupleDialog(panel='summary'){
  if(!household.enabled)return;
  closeComposer();
  openDialog('Nosso acerto',coupleDetail(state,selectedMonth,{panel,people:household.people}),'UM PLANO PARA DOIS');dialog.classList.add('couple-dialog');
  $('#couple-month').onchange=e=>{if(validMonth(e.target.value)){selectedMonth=e.target.value;renderAll();coupleDialog(panel);}};
}
function settlementDialog(recordId=null){
  if(!household.enabled)return;const people=household.people;
  const existing=recordId?state.household?.settlements.find(r=>r.id===recordId):null;
  if(recordId&&!existing)return toast('Este acerto não está mais disponível.');
  const summary=coupleSummary(state,selectedMonth),from=existing?.from||summary.from||'larissa',date=existing?.date||(selectedMonth===currentMonth()?today():selectedMonth+'-01');
  openDialog(existing?'Editar acerto':'Registrar acerto',`<button type="button" class="couple-back" data-open-couple>‹ Voltar ao resumo</button><p class="settlement-note">Registre uma transferência que vocês já fizeram. Ela abate o saldo entre vocês e não muda as receitas, despesas ou o planejado da casa. Você pode registrar uma parte do valor.</p><form id="settlement-form"><label class="form-group"><span>Quem transferiu?</span><select name="from"><option value="edu" ${from==='edu'?'selected':''}>${esc(people.edu)} → ${esc(people.larissa)}</option><option value="larissa" ${from==='larissa'?'selected':''}>${esc(people.larissa)} → ${esc(people.edu)}</option></select></label><label class="form-group"><span>Valor transferido</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${existing?inputMoney(existing.amount):summary.balance?inputMoney(Math.abs(summary.balance)):''}" maxlength="20" required><small>Informe o valor que foi efetivamente transferido.</small></label><label class="form-group"><span>Data da transferência</span><input type="date" name="date" value="${date}" min="1900-01-01" max="2199-12-31" required></label><label class="form-group"><span>Observação (opcional)</span><input name="memo" maxlength="280" value="${esc(existing?.memo||'')}" placeholder="Ex.: Pix do acerto de outubro"></label><p class="sharing-preview" id="settlement-preview" aria-live="polite"></p><p id="form-error" class="form-error" role="alert" hidden></p><button type="submit" class="btn btn-blue form-submit">${existing?'Salvar alterações':'Registrar transferência'} ${icon('check')}</button></form>`,people.edu+' + '+people.larissa);
  const form=$('#settlement-form');
  const preview=()=>{const amount=parseMoney(form.elements.amount.value),originalEffect=existing?(existing.from==='larissa'?existing.amount:-existing.amount):0,selectedEffect=form.elements.from.value==='larissa'?amount:-amount;
    if(!amount){$('#settlement-preview').textContent='';return;}
    const newMonth=form.elements.date.value.slice(0,7),balance=summary.balance+(existing&&existing.date.slice(0,7)<=selectedMonth?originalEffect:0)-(newMonth<=selectedMonth?selectedEffect:0);
    $('#settlement-preview').textContent=newMonth!==selectedMonth?'O acerto será registrado no mês da data escolhida.':balance?`Após registrar: ${balance>0?people.larissa+' transfere para '+people.edu:people.edu+' transfere para '+people.larissa} ${money(Math.abs(balance))}.`:'Após registrar: tudo equilibrado entre vocês.';
  };
  form.elements.amount.oninput=preview;form.elements.from.onchange=preview;form.elements.date.onchange=preview;preview();
  form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),amount=parseMoney(f.get('amount'));
    try{saveSettlement(state,{from:String(f.get('from')),amount,date:String(f.get('date')),memo:String(f.get('memo')||'')},existing?.id||null);}catch(error){return formError(error.message);}
    selectedMonth=String(f.get('date')).slice(0,7);persist();renderAll();coupleDialog();toast(existing?'Acerto atualizado.':'Acerto registrado. O orçamento da casa foi mantido.');
  };
}
function removeSettlement(recordId){
  const record=state.household?.settlements.find(r=>r.id===recordId);if(!record)return;
  confirmAction('Excluir este acerto?','A transferência será removida do histórico e o saldo entre vocês será recalculado. As despesas da casa permanecem no plano.','Excluir acerto',()=>{state.household.settlements=state.household.settlements.filter(r=>r.id!==recordId);persist();renderAll();coupleDialog();toast('Acerto excluído.',()=>{if(!state.household.settlements.some(r=>r.id===record.id))state.household.settlements.push(record);persist();renderAll();if(dialog.open)coupleDialog();});});
}
function appOptions(){openDialog('Seu plano',`<div class="app-options">${household.enabled?`<button type="button" data-options-couple>${icon('home')} Nosso acerto</button>`:''}<button type="button" data-savings-open>${icon('sparkle')} Objetivos</button><button type="button" data-options-privacy>${icon(state.hideBalances?'eye-off':'eye')} ${state.hideBalances?'Mostrar':'Ocultar'} valores</button>${view==='budget'?`<button type="button" data-options-history>${historyIcon} Planejar com histórico</button>`:''}<button type="button" data-options-group>${icon('plus')} Novo grupo</button><button type="button" data-options-category>${icon('plus')} Nova categoria</button><button type="button" data-options-settings>${icon('gear')} Ajustes e sincronização</button></div>`);if($('[data-options-couple]'))$('[data-options-couple]').onclick=()=>coupleDialog();$('[data-options-privacy]').onclick=()=>{closeDialog();$('#privacy-toggle').click();};if($('[data-options-history]'))$('[data-options-history]').onclick=()=>historyPlanning.showOptions();$('[data-options-group]').onclick=()=>groupDialog();$('[data-options-category]').onclick=()=>newCategoryDialog();$('[data-options-settings]').onclick=()=>{closeDialog();goPlan('settings');};}

function wealthDialog(month=selectedMonth){
  const wealth=wealthAt(state,month),snapshot=state.wealth?.[month];
  const assets=snapshot?.otherAssets??wealth.otherAssets??0;
  const debt=snapshot?.debt??(wealth.known?state.wealth[wealth.recordedMonth].debt:0);
  openDialog('Seu patrimônio em detalhes.',`<p class="dialog-note"><strong>${esc(monthName(month))}</strong><br>Saldo do plano: <strong>${money(wealth.cash)}</strong>, já incluído automaticamente.</p><form id="wealth-form"><label class="form-group"><span>Outros ativos fora do plano</span><input name="otherAssets" inputmode="decimal" value="${inputMoney(assets)}" maxlength="20" required><small>Investimentos, bens e saldos que não estão registrados neste plano. Se não tiver, informe zero.</small></label><label class="form-group"><span>Dívidas fora do plano</span><input name="debt" inputmode="decimal" value="${inputMoney(debt)}" maxlength="20" required><small>O valor que você ainda deve. Não repita saldos negativos que já estejam no plano.</small></label><p class="dialog-note">Estes valores completam o patrimônio líquido e não são lançados como receita ou despesa. Não inclua novamente nenhum saldo que já está no plano. Os valores serão mantidos nos meses seguintes até você atualizá-los.</p><p id="form-error" class="form-error" role="alert" hidden></p><button class="btn btn-blue form-submit" type="submit">Salvar patrimônio ${icon('check')}</button></form>`,'ATIVOS MENOS DÍVIDAS');
  $('#wealth-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.currentTarget),otherAssets=parseMoney(f.get('otherAssets')),debt=parseMoney(f.get('debt'));
    if(otherAssets===null||debt===null)return formError('Informe valores válidos em reais, sem sinal negativo.');
    state.wealth??={};state.wealth[month]={otherAssets,debt};persist();closeDialog();renderAll();toast('Patrimônio atualizado. Os valores do orçamento foram mantidos.');
  };
}
const dialog=$('#action-dialog');
const dialogPages=createDialogPages(dialog,{body:$('#dialog-body'),heading:$('#dialog-title')});
savingsGoals=createSavingsGoalsUI({root:$('#sidebar-goals'),getState:()=>state,openDialog,closeDialog,onChange:()=>{persist();renderAll();},notify:toast});
historyPlanning=createPlanningHistoryUI({getState:()=>state,getMonth:()=>selectedMonth,money,openDialog,closeDialog,refreshDialog:()=>dialogPages.refresh(),onChange:()=>{persist();renderAll();},notify:toast});
historyIntro=createPlanningHistoryIntro({storage:globalThis.localStorage,getAccount:()=>platform.accountId||cloudSync.status.ownerId,canShow:()=>historyIntroReady&&!$('#budget-app').hidden&&view==='budget'&&!dialog.open&&$('#transaction-composer').hidden&&!cloudSync.status.conflict&&!cloudSync.status.blocked&&!$('#budget-app').hasAttribute('data-subscription-readonly')&&!document.querySelector('[data-assigned-input][data-editing=true],#category-menu')});
function openDialog(title,body,eyebrow='SEU PLANO',variant=''){
  historyIntro?.close();
  closeCategoryMenu(false);
  historyPlanning?.closeMenu();
  if(dialog.open)dialog.close();dialog.classList.remove('transaction-dialog','couple-dialog','new-category-dialog','savings-dialog','savings-form-dialog','category-spending-dialog','invoice-bills-modal');
  if(variant)dialog.classList.add(variant);
  $('#dialog-title').textContent=title;$('#dialog-eyebrow').textContent=eyebrow;$('#dialog-body').innerHTML=body;
  dialog.showModal();document.body.style.overflow='hidden';$('#dialog-title').tabIndex=-1;$('#dialog-title').focus({preventScroll:true});dialogPages.reset();
}
function closeDialog(){dialog.close();}
function formError(message){const el=$('#form-error');el.textContent=message;el.hidden=false;dialogPages.reveal(el);}
function confirmAction(title,message,button,action){
  openDialog(title,`<p class="confirm-text">${esc(message)}</p><div class="confirm-actions"><button class="subtle-button" id="confirm-cancel">Cancelar</button><button class="btn btn-blue" id="confirm-accept">${esc(button)}</button></div>`,'UM NOVO PASSO');
  $('#confirm-cancel').onclick=closeDialog;$('#confirm-accept').onclick=()=>{closeDialog();action();};
}
function groupOptions(selected){return groupsFor(state).filter(g=>!g.hidden||g.id===selected).map(g=>`<option value="${esc(g.id)}" ${g.id===selected?'selected':''}>${esc(g.name)}${g.hidden?' (oculto)':''}</option>`).join('');}

function quickCreate(trigger,groupId=null){
 const planId=state.planId;
 openQuickCreate({trigger,title:groupId?'Nova categoria':'Novo grupo',placeholder:groupId?'Nome da categoria':'Nome do grupo',onCreate:name=>{
  if(state.planId!==planId)throw Error('O orçamento mudou. Abra novamente.');
  if(groupId){
   if(!visibleGroups(state).some(g=>g.id===groupId))throw Error('Este grupo não está disponível.');
   if(state.categories.length>=1000)throw Error('Seu plano atingiu o limite de categorias.');
   if(state.categories.some(c=>c.group===groupId&&c.name.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('Já existe uma categoria com esse nome neste grupo.');
   state.categories.push({id:id(),name,group:groupId,target:0,icon:categoryIcon(name)});collapsedGroups.delete(groupId);
  }else createGroup(state,name);
  persist();renderAll();toast(groupId?'Categoria criada.':'Grupo criado. Use o + para adicionar categorias.');
 }});
}
function groupDialog(groupId=null){
  const group=groupId?groupsFor(state).find(g=>g.id===groupId):null;
  if(groupId&&!group)return toast('Este grupo não está mais disponível.');
  openDialog(group?'Editar grupo.':'Um novo grupo.',`<p class="group-dialog-intro">${group?'Renomeie ou organize o grupo. Seus valores e lançamentos serão mantidos.':'Organize categorias relacionadas em um só lugar. Por exemplo: Casa, Família ou Viagens.'}</p><form id="group-form"><label class="form-group"><span>Nome do grupo</span><input name="name" value="${esc(group?.name||'')}" placeholder="Ex.: Casa e família" maxlength="70" required autocomplete="off" autocapitalize="sentences"></label><p id="form-error" class="form-error" role="alert" hidden></p><button class="btn btn-blue form-submit" type="submit">${group?'Salvar nome':'Criar grupo'} ${icon(group?'check':'plus')}</button>${group?`<div class="group-management-actions"><button type="button" data-hide-group="${esc(group.id)}">${icon(group.hidden?'eye':'eye-off')}<span>${group.hidden?'Reexibir grupo':'Ocultar grupo'}</span></button><button type="button" class="group-remove-action" data-remove-group="${esc(group.id)}">${icon('trash')}<span>Excluir grupo</span></button></div>`:''}</form>`,'SEU PLANO, DO SEU JEITO');
  $('#group-form').onsubmit=e=>{
    e.preventDefault();const name=new FormData(e.currentTarget).get('name');
    try{if(group)renameGroup(state,group.id,name);else createGroup(state,name);}catch(error){return formError(error.message);}
    persist();closeDialog();renderAll();toast(group?'Nome do grupo atualizado.':'Grupo criado. Use o + para adicionar categorias.');
  };
  if(group){
    $('[data-hide-group]').onclick=()=>{
      const hidden=!group.hidden,planId=state.planId;
      try{setGroupHidden(state,group.id,hidden);}catch(error){return formError(error.message);}
      collapsedGroups.delete(group.id);persist();closeDialog();renderAll();
      toast(hidden?'Grupo e categorias ocultos. Valores e histórico mantidos.':'Grupo de volta ao plano.',hidden?()=>{if(state.planId!==planId||!groupsFor(state).some(g=>g.id===group.id))return;setGroupHidden(state,group.id,false);collapsedGroups.delete(group.id);persist();renderAll();}:undefined);
    };
    $('[data-remove-group]').onclick=()=>deleteGroupDialog(group.id);
  }
}
function hiddenGroupsHTML(){const groups=groupsFor(state).filter(group=>group.hidden);return groups.length?`<button type="button" class="hidden-categories-button hidden-groups-button" data-hidden-groups>Grupos ocultos <span>${groups.length}</span></button>`:'';}
function hiddenGroupsDialog(){
  openDialog('Grupos ocultos',`<p class="dialog-note">O histórico e os valores continuam no plano. Reexibir o grupo mantém as categorias que você já havia ocultado individualmente.</p><div class="hidden-group-list" data-dialog-flow>${groupsFor(state).filter(group=>group.hidden).map(group=>{const count=state.categories.filter(c=>c.group===group.id).length;return `<div class="hidden-group-row"><span><strong>${esc(group.name)}</strong><small>${count} ${count===1?'categoria':'categorias'}</small></span><div><button type="button" class="icon-button" data-edit-group="${esc(group.id)}" aria-label="Editar grupo ${esc(group.name)}">${icon('edit')}</button><button type="button" class="subtle-button" data-show-group="${esc(group.id)}">Reexibir</button></div></div>`;}).join('')}</div>`);
  $$('[data-show-group]').forEach(button=>button.onclick=()=>{try{setGroupHidden(state,button.dataset.showGroup,false);}catch(error){return toast(error.message);}collapsedGroups.delete(button.dataset.showGroup);persist();closeDialog();renderAll();toast('Grupo de volta ao plano.');});
}
function deleteGroupDialog(groupId){
  const group=groupsFor(state).find(item=>item.id===groupId);if(!group)return toast('Este grupo não está mais disponível.');
  if(groupsFor(state).length===1)return toast('Mantenha pelo menos um grupo no seu plano.');
  const count=state.categories.filter(category=>category.group===groupId).length;
  openDialog('Excluir '+group.name+'?',`<form id="delete-group-form"><p class="confirm-text">${count?`${count===1?'A categoria será movida':'As '+count+' categorias serão movidas'} para o grupo escolhido. Todas as categorias, inclusive as ocultas, manterão seus valores planejados e lançamentos de todos os meses.`:'Este grupo está vazio. Nenhuma categoria ou lançamento será alterado.'}</p>${count?`<label class="form-group"><span>Mover categorias para</span><select name="destination" required><option value="">Selecione outro grupo</option>${groupsFor(state).filter(item=>item.id!==groupId).map(item=>`<option value="${esc(item.id)}">${esc(item.name)}${item.hidden?' (oculto)':''}</option>`).join('')}</select></label>`:''}<p id="form-error" class="form-error" role="alert" hidden></p><div class="confirm-actions"><button type="button" class="subtle-button" data-cancel-group-delete>Cancelar</button><button type="submit" class="btn btn-blue">${count?'Mover e excluir grupo':'Excluir grupo'}</button></div></form>`,'HISTÓRICO PRESERVADO');
  $('[data-cancel-group-delete]').onclick=()=>groupDialog(groupId);
  $('#delete-group-form').onsubmit=event=>{event.preventDefault();try{deleteGroup(state,groupId,event.currentTarget.elements.destination?.value);}catch(error){return formError(error.message);}collapsedGroups.delete(groupId);persist();closeDialog();renderAll();toast(count?'Grupo excluído. Categorias e histórico preservados.':'Grupo vazio excluído.');};
}
function closeComposer(){$('#transaction-composer').hidden=true;$('#transaction-composer').replaceChildren();}
function transactionDialog(type='expense',transactionId=null,options={}){
  const people=household.people;
  const existing=transactionId?Object.values(state.months).flatMap(m=>m.transactions).find(t=>t.id===transactionId):null;
  if(transactionId&&!existing)return toast('Este lançamento não está mais disponível.');
  let txType=existing?.type||type;
  const date=existing?.date||options.date||(selectedMonth===currentMonth()?today():selectedMonth+'-01');
  const memo=existing?.memo??(existing&&!existing.payee?existing.description:'');
  const title=existing?'Editar lançamento':'Novo lançamento',desktop=matchMedia('(min-width: 1000px)').matches;
  const body=`
    <div class="tx-type-switch" aria-label="Tipo de lançamento"><button type="button" data-tx-type="expense">− Saída</button><button type="button" data-tx-type="income">+ Entrada</button></div>
    <form id="transaction-form"><div class="transaction-fields">
      <label class="form-group tx-amount-field"><span>Valor</span><input class="amount-input" name="amount" inputmode="decimal" value="${existing?inputMoney(existing.amount):''}" placeholder="0,00" autocomplete="off" required maxlength="20" aria-label="Valor em reais"><small>Valor em reais.</small></label>
      <div class="form-group tx-payee-field"><label for="transaction-payee" id="payee-label">Estabelecimento</label><div class="payee-combobox"><div class="payee-input-wrap"><input id="transaction-payee" name="payee" value="${esc(existing?.payee||'')}" required maxlength="100" autocomplete="off" autocapitalize="words" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="payee-options" aria-describedby="payee-help" placeholder="Busque ou digite um novo"><button type="button" id="payee-toggle" aria-label="Mostrar estabelecimentos salvos" tabindex="-1">${icon('chevron')}</button></div><div id="payee-panel" class="payee-panel" hidden><div class="payee-panel-label">ESTABELECIMENTOS</div><div id="payee-options" role="listbox" aria-label="Estabelecimentos salvos"></div><div class="payee-panel-status" data-payee-status role="status" aria-live="polite"></div></div></div><small id="payee-help">Os novos nomes são guardados automaticamente ao salvar.</small></div>
      <div class="form-group" id="tx-category-field"><label for="transaction-category">Categoria</label><div class="payee-combobox category-combobox"><div class="payee-input-wrap"><input id="transaction-category" name="categorySearch" value="${esc(state.categories.find(c=>c.id===existing?.categoryId)?.name||'')}" placeholder="Digite para buscar uma categoria" maxlength="140" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="category-options" required><button type="button" id="category-toggle" aria-label="Mostrar categorias" tabindex="-1">${icon('chevron')}</button></div><input type="hidden" name="categoryId" value="${esc(existing?.categoryId||'')}" hidden><div id="category-panel" class="payee-panel" hidden><div class="payee-panel-label">CATEGORIAS</div><div id="category-options" role="listbox" aria-label="Categorias disponíveis"></div><div class="payee-panel-status" data-payee-status role="status" aria-live="polite"></div></div></div></div>
      <label class="form-group transaction-date-field"><span>Data</span><span class="date-control">${icon('calendar')}<span class="date-text" id="transaction-date-value">${formatTransactionDate(date)}</span><span class="date-change">Alterar ${icon('chevron')}</span><input type="date" name="date" value="${date}" min="1900-01-01" max="2199-12-31" required aria-label="Data do lançamento"></span></label>
      ${savedCardField(state,{cardId:existing?.cardId||'',attribute:'name=cardId'})}
      <div class="sharing-fields" id="tx-sharing-fields"><div class="sharing-grid"><div class="form-group tx-payer-field"><span id="transaction-payer-label">Quem pagou?</span><input type="hidden" name="paidBy" value=""><div class="payer-options" role="group" aria-labelledby="transaction-payer-label"><button type="button" class="payer-option" data-paid-by="edu" aria-label="${esc(people.edu)} pagou" aria-pressed="false"><span class="payer-glyph" aria-hidden="true">${esc(Array.from(people.edu)[0])}</span><span>${esc(people.edu)}</span><span class="payer-check" aria-hidden="true">✓</span></button><button type="button" class="payer-option" data-paid-by="larissa" aria-label="${esc(people.larissa)} pagou" aria-pressed="false"><span class="payer-glyph" aria-hidden="true">${esc(Array.from(people.larissa)[0])}</span><span>${esc(people.larissa)}</span><span class="payer-check" aria-hidden="true">✓</span></button></div></div><label class="form-group"><span>Como dividir?</span><select name="splitMode" aria-label="Como dividir a despesa"><option value="equal">Meio a meio · 50/50</option><option value="edu">Só ${esc(people.edu)}</option><option value="larissa">Só ${esc(people.larissa)}</option><option value="custom">Personalizar</option></select></label></div><label class="form-group custom-split" id="custom-split-field" hidden><span>Parte de ${esc(people.edu)} (%)</span><input type="number" name="eduPercent" min="0" max="100" step="1" inputmode="numeric" value="50"><small>A parte de ${esc(people.larissa)} completa 100%.</small></label><p class="sharing-preview" id="sharing-preview" aria-live="polite"></p></div>
      <div class="date-shortcuts" aria-label="Atalhos de data"><button type="button" data-quick-date="today">Hoje</button><button type="button" data-quick-date="yesterday">Ontem</button></div>
      <details class="memo-details" ${memo?'open':''}><summary>Adicionar observação <span>Opcional</span></summary><label class="form-group"><span class="visually-hidden">Observações do lançamento</span><textarea name="memo" maxlength="280" rows="2" placeholder="Ex.: compras da semana, almoço com a família">${esc(memo||'')}</textarea></label></details>
      ${existing&&!existing.payee?'<p class="legacy-transaction-note">A descrição anterior está nas observações. Complete o estabelecimento acima.</p>':''}
      </div><p id="form-error" class="form-error" role="alert" hidden></p>
      <div class="transaction-form-actions"><span class="tx-save-note">${icon('cloud')} Sincronização automática ativada</span><button class="btn btn-blue" type="submit">${existing?'Salvar alterações':'Salvar'} ${icon('check')}</button>${existing?'':'<button class="subtle-button save-another" type="submit" name="action" value="another">Salvar e adicionar outra</button>'}</div>
    </form>`;
  const closeTransaction=()=>{if(desktop)closeComposer();else closeDialog();};
  if(desktop){if(dialog.open)closeDialog();$('#dialog-body').replaceChildren();goPlan('transactions');route();const composer=$('#transaction-composer');composer.innerHTML=`<div class="composer-heading"><div><span class="small-label">REGISTRO RÁPIDO</span><h2>${title}</h2></div><button type="button" id="close-composer" class="icon-button" aria-label="Fechar formulário de lançamento">${icon('close')}</button></div>${body}`;composer.hidden=false;$('#close-composer').onclick=closeTransaction;}
  else{closeComposer();openDialog(title,body,'CADA MOVIMENTO CONTA');dialog.classList.add('transaction-dialog');}
  const form=$('#transaction-form');
  if(desktop){const fields=form.querySelector('.transaction-fields');fields.prepend(fields.querySelector('.transaction-date-field'),fields.querySelector('.tx-payee-field'),fields.querySelector('#tx-category-field'),fields.querySelector('.tx-amount-field'));form.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();closeTransaction();}});}
  function updateType(){
    $$('[data-tx-type]').forEach(b=>{const active=b.dataset.txType===txType;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    const income=txType==='income';
    $('#tx-sharing-fields').hidden=income||!household.enabled;
    form.querySelector('[data-card-picker]').hidden=income;['paidBy','splitMode','eduPercent'].forEach(name=>form.elements[name].disabled=income||!household.enabled);
    $('#tx-category-field').hidden=income;form.elements.categoryId.disabled=income;form.elements.categorySearch.disabled=income;form.elements.categorySearch.required=!income;categoryPicker.close();
    $('#payee-label').textContent=income?'Recebido de':'Estabelecimento';
    form.elements.payee.placeholder=income?'Ex.: empresa, cliente, pessoa':'Ex.: Zaffari, Uber, farmácia';
    $('#payee-help').textContent=income?'A origem do dinheiro também fica guardada para a próxima vez.':'Busque com 3 letras. Novos nomes são guardados ao salvar.';
    autocomplete.refresh();updateSharing();
  }
  $$('[data-tx-type]').forEach(b=>b.onclick=()=>{txType=b.dataset.txType;updateType();});
  let categoryChosen=!!existing?.categoryId;
  function setCategory(id){const category=state.categories.find(c=>c.id===id);form.elements.categoryId.value=category?.id||'';form.elements.categorySearch.value=category?.name||'';categoryPicker.close();}
  const categoryPicker=mountPayeeAutocomplete({input:form.elements.categorySearch,panel:$('#category-panel'),list:$('#category-options'),minLetters:0,optionPrefix:'category-option',optionSymbol:p=>p.icon,emptyMessage:'Nenhuma categoria encontrada. Tente outro nome ou grupo.',getOptions:query=>{const matches=matchingCategories(state,query),name=query.trim();if(name&&name.length<=70&&!state.categories.some(c=>searchPayeeKey(c.name)===searchPayeeKey(name)))matches.push({id:'__quick_create__',name:'Criar “'+name+'”',newName:name,categoryName:'Nova categoria · escolha o grupo',icon:'+'});return matches;},onSelect:category=>{categoryChosen=true;if(category.id==='__quick_create__'){quickCategory(category.newName);return;}$('#tx-quick-category')?.remove();setCategory(category.id);}});
  function quickCategory(name){
    $('#tx-quick-category')?.remove();categoryPicker.close();form.elements.categorySearch.value=name;form.elements.categoryId.value='';
    const groups=visibleGroups(state);if(!groups.length){toast('Crie ou reexiba um grupo no Planejar primeiro.');return;}
    const suggested=groups.find(g=>searchPayeeKey(g.name).includes(searchPayeeKey(name)))?.id||groups[0].id;
    const box=document.createElement('div');box.id='tx-quick-category';box.className='tx-quick-category';box.setAttribute('role','group');box.setAttribute('aria-label','Criar categoria sem sair do lançamento');
    box.innerHTML=`<div class="quick-category-title"><strong>Nova categoria</strong><span>Sem sair do lançamento</span></div><label>Nome<input data-quick-name maxlength="70" value="${esc(name)}" autocomplete="off"></label><label>Grupo<select data-quick-group>${groups.map(g=>`<option value="${esc(g.id)}" ${g.id===suggested?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><p data-quick-error role="alert" hidden></p><div class="quick-category-actions"><button type="button" data-quick-cancel>Cancelar</button><button type="button" data-quick-save>Criar e selecionar</button></div>`;
    $('#tx-category-field').append(box);
    const create=()=>{const value=box.querySelector('[data-quick-name]').value.trim(),group=box.querySelector('[data-quick-group]').value,error=box.querySelector('[data-quick-error]');if(!value||value.length>70||!visibleGroups(state).some(g=>g.id===group)){error.hidden=false;error.textContent='Informe o nome e escolha um grupo disponível.';return;}
      let category=state.categories.find(c=>c.group===group&&searchPayeeKey(c.name)===searchPayeeKey(value));if(category?.hidden){error.hidden=false;error.textContent='Esta categoria está oculta. Reexiba-a no Planejar.';return;}if(!category){category={id:id(),name:value,group,icon:categoryIcon(value),target:0};state.categories.push(category);persist();}
      categoryChosen=true;box.remove();setCategory(category.id);form.elements.amount?.focus({preventScroll:true});toast('Categoria selecionada. Continue seu lançamento.');
    };
    box.querySelector('[data-quick-save]').onclick=create;box.querySelector('[data-quick-cancel]').onclick=()=>{box.remove();form.elements.categorySearch.value='';form.elements.categorySearch.focus();};
    box.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();create();}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();box.querySelector('[data-quick-cancel]').click();}});
    box.querySelector('[data-quick-name]').focus({preventScroll:true});
  }
  form.elements.categorySearch.addEventListener('focus',()=>{if(form.elements.categoryId.value)form.elements.categorySearch.select?.();});
  $('#category-toggle').onclick=()=>{form.elements.categorySearch.focus();categoryPicker.open();};
  form.elements.categorySearch.addEventListener('input',()=>{categoryChosen=true;const exact=state.categories.filter(c=>searchPayeeKey(c.name)===searchPayeeKey(form.elements.categorySearch.value));form.elements.categoryId.value=exact.length===1?exact[0].id:'';});
  function suggestCategory(prior){if(txType==='expense'&&!existing&&!categoryChosen&&prior?.categoryId&&state.categories.some(c=>c.id===prior.categoryId))setCategory(prior.categoryId);}
  const autocomplete=mountPayeeAutocomplete({input:form.elements.payee,panel:$('#payee-panel'),list:$('#payee-options'),normalize:payeeKey,getOptions:query=>matchingPayees(state,query,txType).map(p=>({...p,categoryName:state.categories.find(c=>c.id===p.categoryId)?.name})),onSelect:suggestCategory});
  form.elements.payee.addEventListener('input',()=>{if(!existing&&!categoryChosen){const prior=payeeHistory(state,txType).find(p=>payeeKey(p.name)===payeeKey(form.elements.payee.value));setCategory(prior?.categoryId||'');}});
  $('#payee-toggle').onclick=()=>{form.elements.payee.focus();autocomplete.open();};
  form.elements.payee.addEventListener('change',()=>suggestCategory(payeeHistory(state,txType).find(p=>payeeKey(p.name)===payeeKey(form.elements.payee.value))));
  function updateDate(){
    $('#transaction-date-value').textContent=formatTransactionDate(form.elements.date.value);
    $$('[data-quick-date]').forEach(b=>{const d=b.dataset.quickDate==='today'?today():dateOffset(today(),-1),active=form.elements.date.value===d;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  form.elements.date.onchange=updateDate;
  form.elements.date.onclick=()=>{try{form.elements.date.showPicker?.();}catch{}};
  $$('[data-quick-date]').forEach(b=>b.onclick=()=>{form.elements.date.value=b.dataset.quickDate==='today'?today():dateOffset(today(),-1);updateDate();});
  form.elements.paidBy.value=household.enabled?(existing?.sharing?.paidBy||options.paidBy||household.current||''):'';
  const priorPercent=existing?.sharing?.eduPercent??options.eduPercent??50;
  form.elements.splitMode.value=priorPercent===50?'equal':priorPercent===100?'edu':priorPercent===0?'larissa':'custom';form.elements.eduPercent.value=String(priorPercent);
  const splitPercent=()=>form.elements.splitMode.value==='equal'?50:form.elements.splitMode.value==='edu'?100:form.elements.splitMode.value==='larissa'?0:Number(form.elements.eduPercent.value);
  function updateSharing(){
    $('#custom-split-field').hidden=form.elements.splitMode.value!=='custom';
    form.elements.eduPercent.disabled=!household.enabled||txType==='income'||form.elements.splitMode.value!=='custom'||!form.elements.paidBy.value;form.elements.eduPercent.required=!form.elements.eduPercent.disabled;
    const n=parseMoney(form.elements.amount.value),p=splitPercent(),payer=form.elements.paidBy.value;
    $$('[data-paid-by]').forEach(button=>{const active=button.dataset.paidBy===payer;button.setAttribute('aria-pressed',String(active));button.classList.toggle('selected',active);button.disabled=!household.enabled||txType==='income';});
    $('#sharing-preview').textContent=!payer?'Toque em quem pagou para incluir no acerto.':!Number.isInteger(p)||p<0||p>100?'Informe um percentual inteiro entre 0 e 100.':!n?'O acerto será calculado quando você informar o valor.':(()=>{const parts=expenseShares({type:'expense',amount:n,sharing:{paidBy:payer,eduPercent:p}});return parts.inAcerto?`${people.edu}: ${money(parts.edu)} · ${people.larissa}: ${money(parts.larissa)}.`:'Despesa pessoal: fica fora do acerto entre vocês.';})();
  }
  $$('[data-paid-by]').forEach(button=>button.onclick=()=>{form.elements.paidBy.value=form.elements.paidBy.value===button.dataset.paidBy?'':button.dataset.paidBy;updateSharing();});
  form.elements.paidBy.onchange=updateSharing;form.elements.splitMode.onchange=updateSharing;form.elements.eduPercent.oninput=updateSharing;form.elements.amount.oninput=updateSharing;
  updateType();updateDate();updateSharing();
  form.onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.currentTarget),amount=parseMoney(f.get('amount')),payee=String(f.get('payee')||'').trim(),memo=String(f.get('memo')||'').trim(),date=String(f.get('date'));
    if(!amount)return formError('Informe um valor maior que zero, como 125,50.');
    if(!payee)return formError(txType==='income'?'Informe de quem você recebeu.':'Informe o estabelecimento ou a pessoa que recebeu.');
    if(!validDate(date))return formError('Escolha uma data válida.');
    const month=date.slice(0,7),categoryId=txType==='income'?null:String(f.get('categoryId')||'');
    if(txType==='expense'&&!state.categories.some(c=>c.id===categoryId))return formError('Escolha uma categoria válida.');
    const storedName=payeeHistory(state,txType).find(p=>payeeKey(p.name)===payeeKey(payee))?.name||payee;
    const card=selectedCard(state,form);
    const transaction={...(txType==='expense'&&card.cardId?{cardId:card.cardId}:{}),id:existing?.id||id(),type:txType,description:storedName,payee:storedName,memo,amount,date,categoryId};
    if(txType==='expense'&&household.enabled&&form.elements.paidBy.value){
      const p=splitPercent();if(!Number.isInteger(p)||p<0||p>100||form.elements.splitMode.value==='custom'&&!form.elements.eduPercent.value.trim())return formError('Informe um percentual inteiro entre 0 e 100 para '+people.edu+'.');
      transaction.sharing={paidBy:form.elements.paidBy.value,eduPercent:p};
    }
    if(txType==='expense'&&!household.enabled&&existing?.sharing)transaction.sharing={...existing.sharing};
    try{saveTransaction(state,transaction,existing?.id||null);}catch(error){return formError(error.message);}
    selectedMonth=month;persist();closeTransaction();renderAll();toast(existing?'Lançamento atualizado.':txType==='income'?'Entrada salva.':'Saída salva.');
    if(e.submitter?.value==='another')transactionDialog(txType,null,{date,paidBy:transaction.sharing?.paidBy,eduPercent:transaction.sharing?.eduPercent});
  };
  if(desktop)revealTransactionComposer($('#transaction-composer'),{focusTarget:form.elements.payee});
}
function closeCategoryMenu(restore=true){
  const menu=$('#category-menu');if(!menu)return;
  const trigger=document.querySelector(`[data-category-menu="${menu.dataset.id}"]`);menu.remove();trigger?.setAttribute('aria-expanded','false');if(restore)trigger?.focus({preventScroll:true});
}
function categoryMenu(categoryId,trigger){
  if($('#category-menu')?.dataset.id===categoryId){closeCategoryMenu();return;}
  closeCategoryMenu(false);const c=state.categories.find(c=>c.id===categoryId);if(!c)return;
  const menu=document.createElement('form');menu.id='category-menu';menu.className='category-menu';menu.dataset.id=c.id;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Opções da categoria '+c.name);
  menu.innerHTML=`<label for="category-menu-name" class="reorder-sr">Nome da categoria</label><input id="category-menu-name" name="name" value="${esc(c.name)}" maxlength="70" required autocomplete="off"><div class="category-menu-actions"><div><button type="button" data-hide-category>Ocultar</button><button type="button" class="category-menu-delete" data-remove-category>Excluir</button></div><div><button type="button" data-cancel-category>Cancelar</button><button type="submit" class="category-menu-ok">OK</button></div></div><p class="form-error" role="alert" hidden></p>`;
  document.body.append(menu);trigger.setAttribute('aria-expanded','true');
  const rect=trigger.getBoundingClientRect(),width=Math.min(400,window.innerWidth-24);menu.style.width=width+'px';menu.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';menu.style.top=Math.max(12,Math.min(rect.bottom+12,window.innerHeight-menu.getBoundingClientRect().height-12))+'px';
  const input=menu.querySelector('input');input.focus({preventScroll:true});input.select?.();
  menu.onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name){input.focus();return;}c.name=name;c.icon=categoryIcon(name);closeCategoryMenu(false);persist();renderAll();document.querySelector(`[data-category-menu="${c.id}"]`)?.focus({preventScroll:true});toast('Nome da categoria atualizado.');};
  menu.querySelector('[data-cancel-category]').onclick=()=>closeCategoryMenu();
  menu.querySelector('[data-hide-category]').onclick=()=>{c.hidden=true;closeCategoryMenu(false);persist();renderAll();toast('Categoria oculta. Seu histórico e seus valores foram mantidos.',()=>{delete c.hidden;persist();renderAll();});};
  menu.querySelector('[data-remove-category]').onclick=()=>{closeCategoryMenu(false);deleteCategoryDialog(c.id);};
  menu.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCategoryMenu();}if(e.key==='Tab'){const nodes=[...menu.querySelectorAll('input,button')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
}
window.addEventListener('resize',()=>{closeCategoryMenu(false);positionMonthRow();});
document.addEventListener('scroll',e=>{if(!e.target.closest?.('#category-menu'))closeCategoryMenu(false);},true);
function individuallyHiddenCategories(){const active=new Set(visibleGroups(state).map(group=>group.id));return state.categories.filter(category=>category.hidden&&active.has(category.group));}
function hiddenCategoriesHTML(){const cats=individuallyHiddenCategories();return cats.length?`<button type="button" class="hidden-categories-button" data-hidden-categories>Categorias ocultas <span>${cats.length}</span></button>`:'';}
function hiddenCategoriesDialog(){
  openDialog('Categorias ocultas',`<p class="dialog-note">Os valores e o histórico continuam no plano. Reexiba uma categoria quando precisar.</p><div class="hidden-category-list">${individuallyHiddenCategories().map(c=>`<button type="button" class="subtle-button" data-unhide="${esc(c.id)}"><span>${categoryIcon(c.name)} ${esc(c.name)}</span><strong>Reexibir</strong></button>`).join('')}</div>`);
  $$('[data-unhide]').forEach(b=>b.onclick=()=>{const c=state.categories.find(c=>c.id===b.dataset.unhide);delete c.hidden;persist();closeDialog();renderAll();toast('Categoria de volta ao plano.');});
}
function deleteCategoryDialog(categoryId){
  const c=state.categories.find(c=>c.id===categoryId);if(!c)return;
  if(state.categories.length===1){toast('Mantenha pelo menos uma categoria no seu plano.');return;}
  const activity=categoryHasActivity(state,c.id),others=state.categories.filter(x=>x.id!==c.id);
  openDialog('Excluir '+c.name+'?',`<form id="delete-category-form"><p class="confirm-text">${activity?'Escolha a categoria que receberá todos os lançamentos e valores planejados de todos os meses. Seu histórico e o saldo total serão preservados.':'Esta categoria não tem lançamentos nem valores planejados.'}</p>${activity?`<label class="form-group"><span>Transferir histórico e valores para</span><select name="destination" required><option value="">Selecione uma categoria</option>${others.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}${x.hidden?' (oculta)':''}</option>`).join('')}</select></label>`:''}<p id="form-error" class="form-error" role="alert" hidden></p><div class="confirm-actions"><button type="button" class="subtle-button" id="cancel-category-delete">Cancelar</button><button type="submit" class="btn btn-blue">${activity?'Transferir e excluir':'Excluir categoria'}</button></div></form>`);
  $('#cancel-category-delete').onclick=closeDialog;
  $('#delete-category-form').onsubmit=e=>{e.preventDefault();try{deleteCategory(state,c.id,e.currentTarget.elements.destination?.value);persist();closeDialog();renderAll();toast('Categoria excluída. Histórico preservado.');}catch(error){formError(error.message);}};
}
function categoryDialog(categoryId){
  const c=state.categories.find(c=>c.id===categoryId);if(!c)return;
  const ct=monthlyCategoryTotals(state,selectedMonth,c.id),toAssign=totals(state,selectedMonth).toAssign;
  openDialog(`${categoryIcon(c.name)} ${c.name}`,`<p class="dialog-note">Planejado neste mês: <strong>${money(ct.assigned)}</strong><br>Gasto neste mês: <strong>${money(ct.spent)}</strong><br>Disponível na categoria: <strong>${money(ct.available)}</strong></p><form id="category-form"><p class="category-icon-preview"><span id="suggested-category-icon" aria-hidden="true">${categoryIcon(c.name)}</span><small>O ícone acompanha o nome da categoria.</small></p><label class="form-group"><span>Nome da categoria</span><input name="name" value="${esc(c.name)}" required maxlength="70"></label><label class="form-group"><span>Grupo</span><select name="group" required>${groupOptions(c.group)}</select><small>Você pode mover esta categoria sem alterar seu histórico.</small></label><label class="form-group"><span>Planejado em ${esc(monthName(selectedMonth))}</span><input name="assigned" class="amount-input" inputmode="decimal" value="${inputMoney(ct.assigned)}" required maxlength="20"><small id="allocation-feedback" aria-live="polite">Este é o valor da coluna Planejado. Você tem ${money(toAssign)} para distribuir.</small></label><p id="form-error" class="form-error" role="alert" hidden></p><button class="btn btn-blue form-submit" type="submit">Salvar meu plano ${icon('check')}</button></form>`,'UM DESTINO PARA CADA REAL');
  $('#category-form').elements.name.oninput=e=>{$('#suggested-category-icon').textContent=categoryIcon(e.target.value);};
  $('#category-form').elements.assigned.oninput=e=>{
    const n=parseMoney(e.target.value);if(n===null)return;
    const remaining=toAssign+ct.assigned-n;
    $('#allocation-feedback').textContent=remaining<0?`Atenção: faltariam ${money(-remaining)} para cobrir esse plano.`:`Após salvar: ${money(remaining)} para distribuir.`;
    $('#allocation-feedback').style.color=remaining<0?'var(--red)':'var(--muted)';
  };
  $('#category-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.currentTarget),assigned=parseMoney(f.get('assigned')),name=String(f.get('name')).trim();
    if(assigned===null)return formError('Use valores válidos em reais, sem sinal negativo.');
    if(!name)return formError('Informe um nome para a categoria.');
    try{moveCategory(state,c.id,String(f.get('group')));}catch(error){return formError(error.message);}
    c.name=name;c.icon=categoryIcon(name);ensureMonth(state,selectedMonth).assigned[c.id]=assigned;
    persist();closeDialog();renderAll();toast(totals(state,selectedMonth).toAssign<0?'Plano salvo. Reduza alguma categoria ou registre uma entrada para cobrir o valor.':'Categoria atualizada. Seu plano acompanha você.');
  };
}
function newCategoryDialog(selectedGroup=visibleGroups(state)[0]?.id){
  if(!selectedGroup)return toast('Crie um grupo ou reexiba um grupo oculto antes de adicionar categorias.');
  openDialog('Nova categoria',`<form id="new-category-form"><label class="form-group"><span>Nome da categoria</span><span class="new-category-name-control"><span id="suggested-category-icon" aria-hidden="true">${categoryIcon('')}</span><input name="name" placeholder="Ex.: reforma, estudos, aniversário" required maxlength="70" autocomplete="off"></span></label><div class="new-category-details"><label class="form-group"><span>Grupo</span><select name="group">${groupOptions(selectedGroup)}</select></label><label class="form-group"><span>Planejado</span><input name="assigned" inputmode="decimal" placeholder="0,00" maxlength="20" aria-describedby="new-category-help"></label></div><p class="new-category-help" id="new-category-help">O ícone acompanha o nome. O planejado pode começar em zero.</p><p id="form-error" class="form-error" role="alert" hidden></p><button class="btn btn-blue form-submit" type="submit">Criar categoria ${icon('plus')}</button></form>`,`SEU PLANO · ${esc(monthName(selectedMonth))}`,'new-category-dialog');
  $('#new-category-form').elements.name.oninput=e=>{$('#suggested-category-icon').textContent=categoryIcon(e.target.value);};
  $('#new-category-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name')).trim(),group=String(f.get('group')),assigned=String(f.get('assigned')).trim()?parseMoney(f.get('assigned')):0;
    if(!name)return formError('Dê um nome à sua categoria.');if(assigned===null)return formError('Informe um valor planejado válido em reais.');
    if(state.categories.length>=1000)return formError('Seu plano atingiu o limite de categorias.');
    if(!groupsFor(state).some(g=>g.id===group))return formError('Escolha um grupo válido.');
    const category={id:id(),name,group,target:0,icon:categoryIcon(name)};state.categories.push(category);if(assigned)ensureMonth(state,selectedMonth).assigned[category.id]=assigned;persist();closeDialog();renderAll();toast('Categoria criada. Mais espaço para o que importa.');
  };
}
function removeTransaction(transactionId){
  const month=getMonth(state,selectedMonth),index=month.transactions.findIndex(t=>t.id===transactionId);if(index===-1)return;
  const [transaction]=month.transactions.splice(index,1),key=selectedMonth;
  persist();renderAll();toast('Lançamento excluído.',()=>{
    const m=ensureMonth(state,key);if(!m.transactions.some(t=>t.id===transaction.id))m.transactions.splice(Math.min(index,m.transactions.length),0,transaction);
    persist();renderAll();toast('Lançamento restaurado.');
  });
}
function replacePlan(example){
  confirmAction(example?'Voltar ao exemplo?':'Um plano com a sua realidade.',`Isso substitui o plano sincronizado em todos os aparelhos desta conta. ${example?'Você vai abrir um plano com valores ilustrativos.':'Seu novo plano começa sem valores ou lançamentos.'} Exporte um backup em Ajustes se quiser guardar o plano atual.`,example?'Carregar exemplo':'Começar do zero',()=>{
    cloudSync.backupCurrent();const hide=state.hideBalances;state=createState(example);state.hideBalances=hide;selectedMonth=currentMonth();persist();goPlan('budget');renderAll();toast(example?'Exemplo carregado. Explore à vontade.':'Seu plano está pronto. Comece registrando uma entrada.');
  });
}
function exportBackup(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`meu-plano-backup-${today()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup preparado para download.');
}
async function importBackup(file){
  if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('O arquivo é grande demais. Escolha um backup de até 10 MB.');
    const imported=validateState(JSON.parse(await file.text()));
    confirmAction('Importar este plano?','O arquivo foi validado. A importação substitui o plano da conta em todos os aparelhos sincronizados. Exporte o plano atual antes se quiser manter uma cópia.','Importar plano',()=>{cloudSync.backupCurrent();imported.planId=id();state=imported;selectedMonth=currentMonth();persist();renderAll();toast('Backup importado. Seu plano está aqui.');});
  }catch(error){toast(error instanceof SyntaxError?'Não foi possível ler esse arquivo JSON.':error.message);}
  finally{$('#import-file').value='';}
}

// The landing page preview is intentionally separate from the user's ledger.
let previewSelected='viagem';
const previews=[{id:'moradia',name:'Moradia',icon:'🏠',amount:230000,target:230000,copy:'Um lugar para chamar de seu. Contas essenciais com um destino definido.'},{id:'mercado',name:'Supermercado',icon:'🛒',amount:80000,target:100000,copy:'O básico bem cuidado. Saiba quanto pode usar na próxima compra.'},{id:'lazer',name:'Bons momentos',icon:'☕',amount:35000,target:50000,copy:'Aproveitar também faz parte do plano. Separe um valor para viver o agora.'},{id:'viagem',name:'Viagem dos sonhos',icon:'✈️',amount:150000,target:300000,copy:'Seu próximo destino começa aqui. Um pouco a cada vez, sem perder o presente.'}];
function renderPreview(){
  $('#preview-rows').innerHTML=previews.map(p=>`<button class="preview-row ${p.id===previewSelected?'selected':''}" data-preview="${p.id}" aria-pressed="${p.id===previewSelected}"><span><span class="p-icon" aria-hidden="true">${p.icon}</span>${p.name}</span><strong>${formatMoney(p.amount)}</strong></button>`).join('');
  const p=previews.find(c=>c.id===previewSelected),pct=percentage(p.amount,p.target);
  $('#preview-detail').innerHTML=`<span class="detail-emoji" aria-hidden="true">${p.icon}</span><h4>${p.name}</h4><p>${p.copy}</p><span class="detail-amount">${formatMoney(p.amount)}</span><span class="detail-target">de ${formatMoney(p.target)} planejados</span><div class="detail-progress" role="progressbar" aria-label="Planejamento de ${p.name}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><button id="preview-add" ${pct>=100?'disabled':''}>${pct>=100?'Plano completo ✓':'+ Planejar R$ 100'}</button><small>${pct>=100?'Seu plano ganhou forma.':'Um pouquinho hoje. Mais possibilidades amanhã.'}</small>`;
}
let chosenGoal='viagem';
const goalTexts={viagem:'Uma viagem começa bem antes da mala. Separe um pouco por mês e veja esse plano se aproximar.',reserva:'Imprevistos fazem parte da vida. Uma reserva ajuda você a atravessar cada um deles com mais tranquilidade.',lazer:'Um café, um jantar, um encontro. Quando esses momentos estão no plano, fica mais fácil aproveitar.'};
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.repeat||e.isComposing||!e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.getModifierState?.('AltGraph')||(e.code!=='KeyN'&&e.key?.toLowerCase()!=='n'))return;
  if($('#budget-app').hidden||!window.matchMedia('(min-width: 720px)').matches||dialog.open||document.querySelector('#quick-create-popover')||!$('#transaction-composer').hidden||e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
  const trigger=$('.app-header [data-add-transaction]');
  if(!trigger||trigger.disabled)return;
  e.preventDefault();
  // Use the button so subscription/access checks follow the same path.
  trigger.click();
});
document.addEventListener('click',e=>{
  const open=e.target.closest('[data-open-plan]');if(open){
    const fromGoal=!!open.closest('.goal-answer');goPlan();$('#mobile-menu').hidden=true;$('#menu-toggle').setAttribute('aria-expanded','false');
    if(fromGoal)setTimeout(()=>categoryDialog(chosenGoal),80);return;
  }
  const coupleView=e.target.closest('[data-couple-view]');if(coupleView){coupleDialog(coupleView.dataset.coupleView);return;}
  if(e.target.closest('[data-open-couple]')){coupleDialog();return;}
  if(e.target.closest('[data-new-settlement]')){settlementDialog();return;}
  const settlementEdit=e.target.closest('[data-edit-settlement]');if(settlementEdit){settlementDialog(settlementEdit.dataset.editSettlement);return;}
  const settlementDelete=e.target.closest('[data-delete-settlement]');if(settlementDelete){removeSettlement(settlementDelete.dataset.deleteSettlement);return;}
  if(e.target.closest('[data-couple-unclassified]')){if(dialog.open)closeDialog();personFilter='unknown';txFilter='all';$('#transaction-search').value='';$$('[data-tx-filter]').forEach(b=>{const active=b.dataset.txFilter==='all';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});goPlan('transactions');renderAll();return;}
  if(e.target.closest('[data-app-options]')){appOptions();return;}
  if(e.target.closest('[data-mobile-structure]')){mobileStructure=!mobileStructure;renderBudget();return;}
  const folded=e.target.closest('[data-collapse-group]');if(folded){const id=folded.dataset.collapseGroup;collapsedGroups.has(id)?collapsedGroups.delete(id):collapsedGroups.add(id);renderBudget();return;}
  const homeMonth=e.target.closest('[data-home-month]');if(homeMonth){selectedMonth=homeMonth.dataset.homeMonth;goPlan('budget');return;}
  const homeCategory=e.target.closest('[data-home-category]');if(homeCategory){goPlan('budget');setTimeout(()=>document.querySelector(`[data-assigned-input="${homeCategory.dataset.homeCategory}"]`)?.focus(),80);return;}
  const nav=e.target.closest('[data-view]');if(nav){goPlan(nav.dataset.view);return;}
  const groupEdit=e.target.closest('[data-edit-group]');if(groupEdit){groupDialog(groupEdit.dataset.editGroup);return;}
  if(e.target.closest('[data-hidden-groups]')){hiddenGroupsDialog();return;}
  const groupAdd=e.target.closest('[data-add-category-group]');if(groupAdd){quickCreate(groupAdd,groupAdd.dataset.addCategoryGroup);return;}
  if(e.target.closest('[data-close-spending]')){closeDialog();return;}
  const spending=e.target.closest('[data-category-spending]');if(spending){const popup=categorySpendingPopup(state,selectedMonth,spending.dataset.categorySpending,household.people);if(popup)openDialog(popup.title,popup.body,'ATIVIDADE DA CATEGORIA','category-spending-dialog');return;}
  const menu=e.target.closest('[data-category-menu]');if(menu){categoryActivity.open(menu.dataset.categoryMenu,menu);return;}
  if(e.target.closest('[data-hidden-categories]')){hiddenCategoriesDialog();return;}
  if(e.target.closest('#category-menu'))return;
  closeCategoryMenu(false);
  if(e.target.closest('[data-assigned-input]'))return;
  const category=e.target.closest('[data-category]');if(category){category.querySelector('[data-assigned-input]')?.focus();return;}
  if(e.target.closest('[data-add-transaction]')){transactionDialog();return;}
  const edit=e.target.closest('[data-edit-tx]');if(edit){transactionDialog('expense',edit.dataset.editTx);return;}
  const remove=e.target.closest('[data-delete-tx]');if(remove){removeTransaction(remove.dataset.deleteTx);return;}
  const mobileFiltersToggle=e.target.closest('#transaction-mobile-filter-toggle');if(mobileFiltersToggle){const expanded=mobileFiltersToggle.getAttribute('aria-expanded')!=='true';mobileFiltersToggle.setAttribute('aria-expanded',String(expanded));$('.transaction-tools').classList.toggle('mobile-filters-open',expanded);return;}
  const payerButton=e.target.closest('[data-payer-filter]');if(payerButton){personFilter=personFilter===payerButton.dataset.payerFilter?'all':payerButton.dataset.payerFilter;$('#transaction-person-filter').value=personFilter;if(txFilter==='income'){txFilter='all';$$('[data-tx-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.txFilter==='all');b.setAttribute('aria-pressed',String(b.dataset.txFilter==='all'));});}renderTransactions();return;}
  if(e.target.closest('#transaction-uncategorized')){uncategorizedOnly=!uncategorizedOnly;if(uncategorizedOnly&&txFilter==='income'){txFilter='all';$$('[data-tx-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.txFilter==='all');b.setAttribute('aria-pressed',String(b.dataset.txFilter==='all'));});}renderTransactions();return;}
  const filter=e.target.closest('[data-tx-filter]');if(filter){txFilter=filter.dataset.txFilter;if(txFilter==='income')uncategorizedOnly=false;$$('[data-tx-filter]').forEach(b=>{const active=b===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});renderTransactions();return;}
  if(e.target.closest('[data-fix-monthly-spending]')){monthlySpendingDialog();return;}
  const insightPage=e.target.closest('[data-overspend-page]');if(insightPage){monthlySpendingDialog(Number(insightPage.dataset.overspendPage));return;}
  const insightCategory=e.target.closest('[data-overspend-category]');if(insightCategory){closeDialog();const categoryId=insightCategory.dataset.overspendCategory;const trigger=$$('[data-category-menu]').find(b=>b.dataset.categoryMenu===categoryId);categoryActivity.open(categoryId,trigger);return;}
  if(e.target.closest('[data-fix-budget]')){openDialog('Vamos equilibrar o plano.',`<p class="confirm-text">O planejado acumulado até o mês selecionado supera as entradas registradas até esse mês. Para cobrir a diferença, reveja os valores planejados ou registre uma entrada que ainda não está no plano.</p><button class="btn btn-blue form-submit" id="fix-add-income">Registrar uma entrada ${icon('plus')}</button>`);$('#fix-add-income').onclick=()=>transactionDialog('income');return;}
  const preview=e.target.closest('[data-preview]');if(preview){previewSelected=preview.dataset.preview;renderPreview();return;}
  if(e.target.closest('#preview-add')){const p=previews.find(c=>c.id===previewSelected);p.amount=Math.min(p.target,p.amount+10000);renderPreview();return;}
  const goal=e.target.closest('[data-goal]');if(goal){chosenGoal=goal.dataset.goal;$$('[data-goal]').forEach(b=>{const selected=b===goal;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});$('#goal-answer').textContent=goalTexts[chosenGoal];return;}
});
$('#menu-toggle').onclick=()=>{const closed=$('#mobile-menu').hidden;$('#mobile-menu').hidden=!closed;$('#menu-toggle').setAttribute('aria-expanded',String(closed));$('#menu-toggle').setAttribute('aria-label',closed?'Fechar menu':'Abrir menu');$('#menu-toggle').innerHTML=icon(closed?'close':'menu');};
$$('#mobile-menu a').forEach(a=>a.onclick=()=>{$('#mobile-menu').hidden=true;$('#menu-toggle').setAttribute('aria-expanded','false');$('#menu-toggle').setAttribute('aria-label','Abrir menu');$('#menu-toggle').innerHTML=icon('menu');});
$('#prev-month').onclick=()=>{selectedMonth=shiftMonth(selectedMonth,-1);renderAll();};
$('#next-month').onclick=()=>{selectedMonth=shiftMonth(selectedMonth,1);renderAll();};
$('#mobile-plan-month').onchange=e=>{if(validMonth(e.target.value)){selectedMonth=e.target.value;renderAll();}};
$('#today-month').onclick=$('#month-title').onclick=()=>{selectedMonth=currentMonth();renderAll();};
$('#privacy-toggle').onclick=()=>{state.hideBalances=!state.hideBalances;persist();renderAll();};
$('#transaction-search').oninput=renderTransactions;
$('#transaction-person-filter').onchange=e=>{personFilter=e.target.value;renderTransactions();};
$('#add-group').onclick=e=>quickCreate(e.currentTarget);
$('#categories-list').addEventListener('reorderstart',()=>{closeCategoryMenu(false);collapsedGroups.clear();$$('.category-items').forEach(list=>list.hidden=false);$$('[data-collapse-group]').forEach(b=>b.setAttribute('aria-expanded','true'));});
$('#close-dialog').onclick=closeDialog;
dialog.addEventListener('close',()=>{if(!dialog.open)document.body.style.overflow='';queueMicrotask(()=>historyIntro?.maybeShow());});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
$('#start-empty').onclick=$('#reset-empty').onclick=()=>replacePlan(false);
$('#load-demo').onclick=()=>replacePlan(true);
$('#export-data').onclick=exportBackup;
$('#import-trigger').onclick=()=>$('#import-file').click();
$('#import-file').onchange=e=>importBackup(e.target.files[0]);
$('#toast-undo').onclick=()=>{const action=undoAction;undoAction=null;action?.();};
const methodToggle=$('.nav-dropdown-toggle');
function closeNavDropdown(){methodToggle.setAttribute('aria-expanded','false');$('#method-popover').hidden=true;}
methodToggle.onclick=()=>{const open=$('#method-popover').hidden;methodToggle.setAttribute('aria-expanded',String(open));$('#method-popover').hidden=!open;};
document.addEventListener('click',e=>{if(!e.target.closest('.nav-dropdown')||e.target.closest('.nav-popover a'))closeNavDropdown();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#method-popover').hidden){closeNavDropdown();methodToggle.focus();}});
window.addEventListener('hashchange',route);
window.addEventListener('storage',e=>{if(e.key===(planStorage.physicalKey?.(STORAGE_KEY)||STORAGE_KEY)&&e.newValue)cloudSync.flush();});
window.addEventListener('online',()=>cloudSync.flush());
window.addEventListener('focus',()=>{if(!$('#budget-app').hidden)cloudSync.flush();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!$('#budget-app').hidden)cloudSync.flush();});
$('#sync-now').onclick=()=>cloudSync.flush();
setInterval(()=>{if(!$('#budget-app').hidden&&document.visibilityState!=='hidden'&&!dialog.open&&$('#transaction-composer').hidden)sharingUI.refresh();},10000);
$('#sync-recoveries').onclick=recoveryDialog;
renderPreview();route();if(!$('#budget-app').hidden)sharingUI.refresh();

mountInvoiceImport({getState:()=>state,getSelectedMonth:()=>selectedMonth,getPeople:()=>household.people,storage:planStorage,notify:toast,apply:next=>{cloudSync.backupCurrent();state=next;persist();renderAll();}});

categoryActivity=mountCategoryActivity({getState:()=>state,getMonth:()=>selectedMonth,getView:()=>view,getPeople:()=>household.people,onEdit:txId=>transactionDialog('expense',txId),onOptions:(categoryId,trigger)=>categoryMenu(categoryId,trigger)});

function monthlySpendingDialog(page=0){const insights=overspendingInsights(state,selectedMonth);openDialog('Onde passou do planejado?',overspendingHTML(insights,{page,hidden:state.hideBalances}),esc(monthName(selectedMonth)));}

document.addEventListener('input',e=>{if(e.target.matches('[data-spending-search]'))filterSpendingPopup($('#dialog-body'),e.target.value,state.hideBalances);});

recentActivity=mountRecentTransactions({trigger:$('#recent-transactions-trigger'),getState:()=>state,getPeople:()=>household.people,onEdit:tx=>transactionDialog(tx.type,tx.id)});

invoiceBillsUI=mountInvoiceBills({getState:()=>state,getMonth:()=>selectedMonth,openDialog,closeDialog,onChange:()=>{persist();renderAll();},notify:toast});

mountSavedCards({getState:()=>state,onChange:()=>{persist();renderAll();},notify:toast});
