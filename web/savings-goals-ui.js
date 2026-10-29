import {savingsGoalIcon} from './savings-goal-icons.js?v=vpo-124';
import {saveSavingsGoal,savingsProgress} from './savings-goals.js';
import {formatMoney,parseMoney} from './core.js?v=vpo-126';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pencil='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16l-1 4Z"/></svg>';
export function createSavingsGoalsUI({root,getState,openDialog,closeDialog,onChange,notify=()=>{},documentObject=document,windowObject=window}){
  let listPage=0,viewingList=false;
  const goals=()=>getState().savingsGoals||[];
  const amount=n=>getState().hideBalances?'••••':formatMoney(n);
  function progress(goal){
    const p=savingsProgress(goal),hidden=getState().hideBalances;
    return `<span class="savings-progress" ${hidden?'role="img" aria-label="Valores ocultos"':`role="progressbar" aria-label="Progresso de ${esc(goal.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}"`}><i style="width:${hidden?0:p.percent}%"></i></span>`;
  }
  function fit(){
    const sidebar=root.closest('.app-sidebar');if(!sidebar)return;
    const nav=sidebar.querySelector('nav'),footer=sidebar.querySelector('.sidebar-bottom');
    if(!sidebar.clientHeight){root.hidden=true;return;}
    const css=globalThis.getComputedStyle?.(sidebar),bottom=parseFloat(css?.paddingBottom)||24;
    const available=sidebar.clientHeight-bottom-(footer?.getBoundingClientRect().height||0)-(nav.getBoundingClientRect().bottom-sidebar.getBoundingClientRect().top)-20;
    root.hidden=available<34;
    let visible=Math.min(3,goals().length);
    for(;visible>0;visible--){const cost=34+8+visible*46+(visible-1)*12+(goals().length>visible?36:0);if(cost<=available)break;}
    root.querySelectorAll('[data-savings-edit]').forEach((row,i)=>row.hidden=i>=visible);
    const more=root.querySelector('[data-savings-all]');if(more)more.hidden=goals().length<=visible||available<70;
    const empty=root.querySelector('.sidebar-goals-empty');if(empty)empty.hidden=available<80;
    root.dataset.visibleGoals=String(visible);
  }
  function render(){
    const list=goals();
    root.innerHTML=`<div class="sidebar-goals-heading"><button type="button" data-savings-open aria-label="Ver todos os objetivos">Objetivos${list.length?` <span>${list.length}</span>`:''}</button><button class="sidebar-goal-add" type="button" data-savings-add aria-label="Adicionar objetivo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><div class="sidebar-goals-list">${list.slice(0,3).map(goal=>{const p=savingsProgress(goal);return `<button type="button" class="sidebar-goal" data-savings-edit="${esc(goal.id)}"><span class="sidebar-goal-name">${savingsGoalIcon(goal.name)}<span>${esc(goal.name)}</span></span><span class="sidebar-goal-values"><span>${esc(amount(goal.savedAmount))}</span><small>${getState().hideBalances?'':p.percent+'%'}</small></span>${progress(goal)}</button>`;}).join('')}</div>${!list.length?'<button type="button" class="sidebar-goals-empty" data-savings-add>Comece com um objetivo <span aria-hidden="true">↗</span></button>':''}<button type="button" class="sidebar-goals-more" data-savings-all ${list.length<=3?'hidden':''}>Ver todos os objetivos <span aria-hidden="true">→</span></button>`;
    fit();
  }
  function perPage(){return (windowObject.innerHeight||800)<570?1:windowObject.matchMedia?.('(min-width:720px)').matches?4:3;}
  function showAll(page=0){
    viewingList=true;const list=goals(),size=perPage(),pages=Math.max(1,Math.ceil(list.length/size));listPage=Math.min(Math.max(0,page),pages-1);
    const slice=list.slice(listPage*size,(listPage+1)*size);
    openDialog('Seus objetivos.',`<div class="savings-dialog-content"><div class="savings-list-toolbar"><span>${list.length} ${list.length===1?'objetivo':'objetivos'}</span><button type="button" class="subtle-button" data-savings-add>+ Novo objetivo</button></div>${slice.length?`<div class="savings-cards">${slice.map(goal=>{const p=savingsProgress(goal);return `<button type="button" class="savings-card" data-savings-edit="${esc(goal.id)}"><span class="savings-card-heading"><strong>${savingsGoalIcon(goal.name)}<span>${esc(goal.name)}</span></strong>${pencil}</span><span class="savings-card-amount"><strong>${esc(amount(goal.savedAmount))}</strong><span>de ${esc(amount(goal.targetAmount))}</span></span>${progress(goal)}<span class="savings-card-caption">${getState().hideBalances?'Valores ocultos':p.complete?'Objetivo alcançado ✓':`${p.percent}% guardado · faltam ${esc(amount(p.remaining))}`}</span></button>`;}).join('')}</div>`:'<div class="savings-empty"><span aria-hidden="true">✦</span><h3>Seu próximo plano começa aqui.</h3><p>Crie um objetivo e acompanhe quanto já guardou.</p></div>'}${pages>1?`<div class="savings-pagination"><button type="button" class="text-link" data-savings-page="${listPage-1}" ${listPage===0?'disabled':''}>← Anterior</button><span>${listPage+1} de ${pages}</span><button type="button" class="text-link" data-savings-page="${listPage+1}" ${listPage===pages-1?'disabled':''}>Próxima →</button></div>`:''}</div>`,'UM POUCO A CADA VEZ','savings-dialog');
  }
  function edit(goalId=null){
    viewingList=false;const goal=goalId?goals().find(g=>g.id===goalId):null;
    if(goalId&&!goal){notify('Este objetivo não está mais disponível.');return;}
    const planId=getState().planId;
    openDialog(goal?'Editar objetivo.':'Um novo objetivo.',`<form id="savings-goal-form"><label class="form-group"><span>Nome do objetivo</span><input name="goalName" required maxlength="70" autocomplete="off" placeholder="Ex.: viagem, carro, reserva" value="${esc(goal?.name||'')}"></label><div class="savings-form-values"><label class="form-group"><span>Valor desejado</span><input name="targetAmount" required inputmode="decimal" maxlength="20" placeholder="0,00" value="${goal?(goal.targetAmount/100).toFixed(2).replace('.',','):''}"></label><label class="form-group"><span>Já guardado</span><input name="savedAmount" inputmode="decimal" maxlength="20" placeholder="0,00" value="${goal?(goal.savedAmount/100).toFixed(2).replace('.',','):'0,00'}"></label></div><p class="savings-form-note">Atualize o valor que já separou para este objetivo. Seus lançamentos e o planejado permanecem iguais.</p><p class="form-error" id="savings-error" role="alert" hidden></p><button class="btn btn-blue savings-save" type="submit">${goal?'Salvar objetivo':'Criar objetivo'} <span aria-hidden="true">✓</span></button><div class="savings-form-footer"><button class="text-link" type="button" data-savings-open>← Ver objetivos</button>${goal?`<button class="text-link savings-delete" type="button" data-savings-remove="${esc(goal.id)}">Excluir objetivo</button>`:''}</div></form>`,'SEUS PLANOS','savings-form-dialog');
    documentObject.querySelector('#savings-goal-form').onsubmit=e=>{
      e.preventDefault();const form=e.currentTarget,values=new FormData(form),targetAmount=parseMoney(values.get('targetAmount')),savedAmount=parseMoney(values.get('savedAmount')||'0');
      try{
        if(getState().planId!==planId)throw new Error('O orçamento mudou. Abra o objetivo novamente.');
        if(targetAmount===null||targetAmount===0)throw new Error('Informe um valor desejado maior que zero.');
        if(savedAmount===null)throw new Error('Informe quanto já guardou, sem valor negativo.');
        saveSavingsGoal(getState(),{name:values.get('goalName'),targetAmount,savedAmount},goalId);onChange();closeDialog();notify(goal?'Objetivo atualizado.':'Objetivo criado.');
      }catch(error){const el=form.querySelector('#savings-error');el.textContent=error.message;el.hidden=false;}
    };
  }
  function remove(goalId){
    const goal=goals().find(g=>g.id===goalId);if(!goal)return;
    const planId=getState().planId;
    openDialog('Excluir este objetivo?',`<p class="confirm-text">O acompanhamento de <strong>${esc(goal.name)}</strong> será removido. Os lançamentos e os valores do orçamento permanecem iguais.</p><div class="confirm-actions"><button type="button" class="subtle-button" data-savings-edit="${esc(goal.id)}">Voltar</button><button type="button" class="btn btn-blue" data-savings-confirm-remove="${esc(goal.id)}">Excluir objetivo</button></div>`,'SEUS OBJETIVOS');
    documentObject.querySelector('[data-savings-confirm-remove]').onclick=()=>{if(getState().planId!==planId)return;getState().savingsGoals=goals().filter(g=>g.id!==goalId);onChange();showAll(listPage);notify('Objetivo excluído.');};
  }
  documentObject.addEventListener('click',e=>{
    if(e.defaultPrevented)return;
    const button=e.target.closest?.('button');if(!button)return;
    if(button.hasAttribute('data-savings-add'))edit();
    else if(button.dataset.savingsEdit)edit(button.dataset.savingsEdit);
    else if(button.hasAttribute('data-savings-open')||button.hasAttribute('data-savings-all'))showAll(listPage);
    else if(button.dataset.savingsPage!==undefined)showAll(Number(button.dataset.savingsPage));
    else if(button.dataset.savingsRemove)remove(button.dataset.savingsRemove);
  });
  windowObject.addEventListener('resize',()=>{fit();if(viewingList&&documentObject.querySelector('.savings-dialog-content'))showAll(listPage);});
  const Resize=windowObject.ResizeObserver||globalThis.ResizeObserver;
  if(Resize){const observer=new Resize(fit);observer.observe(root.closest('.app-sidebar'));observer.observe(root.closest('.app-sidebar').querySelector('.sidebar-bottom'));}
  render();return {render,showAll,add:()=>edit(),fit};
}
