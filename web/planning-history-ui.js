import {HISTORY_METHODS,planningHistory,applyPlanningHistory,undoPlanningHistory} from './planning-history.js';
import {categoryIcon} from './category-icons.js?v=vpo-43';

const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const monthLabel=key=>new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric'}).format(new Date(key+'-15T12:00:00'));
const range=preview=>preview.start===preview.end?monthLabel(preview.end):monthLabel(preview.start)+' a '+monthLabel(preview.end);
export const historyIcon='<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11a9 9 0 1 1 2.7 7.4M3 5v6h6M12 7v5l3 2"/></svg>';
const arrow='<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';

export function createPlanningHistoryUI({getState,getMonth,money,openDialog,closeDialog,refreshDialog=()=>{},onChange,notify,documentObject=document}){
  const doc=documentObject,trigger=doc.querySelector('#planning-history');
  let menu=null;
  const writable=()=>!doc.querySelector('#budget-app[data-subscription-readonly]');
  function closeMenu(focus=false){if(!menu)return;menu.remove();menu=null;trigger?.setAttribute('aria-expanded','false');if(focus)trigger?.focus({preventScroll:true});}
  function options(){return HISTORY_METHODS.map(method=>{
    try{return {method,preview:planningHistory(getState(),getMonth(),method.id)};}catch(error){return {method,error:error.message};}
  });}
  function optionMarkup(items,dropdown=false){return items.map(({method,preview,error},index)=>{
    const available=!!preview?.rows.length;
    const detail=error||(!preview?.count?'Sem meses anteriores disponíveis':!available?'Sem gastos neste período':range(preview)+(method.id==='last-month'?'':` · ${preview.count} ${preview.count===1?'mês':'meses'}`));
    return `<button type="button" class="history-option" data-history-method="${method.id}" ${dropdown?'role="menuitem" tabindex="-1"':''} ${available?'':'disabled'}><span class="history-option-icon" aria-hidden="true">${['↶','6','12'][index]}</span><span><strong>${method.title}</strong><small>${esc(detail)}</small></span>${arrow}</button>`;
  }).join('');}
  function bindOptions(root,items){root.querySelectorAll('[data-history-method]').forEach(button=>button.onclick=()=>{
    const item=items.find(item=>item.method.id===button.dataset.historyMethod);closeMenu();if(item?.preview&&writable())review(item.preview);
  });}
  function position(){if(!menu||!trigger)return;const rect=trigger.getBoundingClientRect?.();if(!rect)return;
    const width=Math.min(360,window.innerWidth-24);menu.style.width=width+'px';menu.style.left=Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))+'px';
    const height=menu.getBoundingClientRect?.().height||310;menu.style.top=Math.max(12,Math.min(rect.bottom+8,window.innerHeight-height-12))+'px';
  }
  function openMenu(){
    if(!writable())return;
    if(menu){closeMenu(true);return;}
    const items=options();menu=doc.createElement('div');menu.id='planning-history-menu';menu.className='history-dropdown';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Planejar com histórico');
    menu.innerHTML=`<div class="history-menu-heading"><strong>Seu histórico ajuda a planejar</strong><span>Para ${esc(monthLabel(getMonth()))}</span></div>${optionMarkup(items,true)}<p class="history-menu-note">Revise os valores antes de aplicar.</p>`;
    doc.body.append(menu);trigger?.setAttribute('aria-expanded','true');bindOptions(menu,items);position();menu.querySelector('button:not([disabled])')?.focus({preventScroll:true});
    menu.onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();closeMenu(true);return;}
      if(event.key==='Tab'){closeMenu();return;}
      const buttons=[...menu.querySelectorAll('button:not([disabled])')],index=buttons.indexOf(doc.activeElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&buttons.length){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next].focus();}
    };
  }
  function showOptions(){
    if(!writable())return;
    closeMenu();const items=options();openDialog('Planejar com histórico',`<p class="history-intro">Escolha uma referência para o planejado de <strong>${esc(monthLabel(getMonth()))}</strong>.</p><div class="history-options">${optionMarkup(items)}</div><p class="dialog-note">Você revisa as categorias e os valores antes de aplicar.</p>`,'UM PLANO MAIS PERTO DA SUA VIDA');
    bindOptions(doc.querySelector('#dialog-body'),items);
  }
  function review(preview,message=''){
    const method=HISTORY_METHODS.find(method=>method.id===preview.method);
    const selected=new Set(preview.rows.filter(row=>row.before!==row.suggested).map(row=>row.id));
    let page=0;
    const pageSize=window.matchMedia?.('(max-height: 740px)').matches?3:5;
    const count=Math.max(1,Math.ceil(preview.rows.length/pageSize));
    openDialog('Revisar o planejado',`<div class="history-review" data-dialog-flow>
      <div class="history-review-summary"><span class="history-source">${historyIcon}${method.title}</span><strong>${esc(monthLabel(preview.target))}</strong><p>${esc(range(preview))}${preview.method==='last-month'?'':` · média de ${preview.count} ${preview.count===1?'mês':'meses'}`}</p></div>
      <p class="history-explanation">${preview.method==='last-month'?'Gastos reais por categoria.':'Total gasto dividido por '+preview.count+' '+(preview.count===1?'mês.':'meses. Meses sem gastos entram como zero.')}${preview.partial?' Usando o histórico disponível desde o primeiro gasto.':''}${preview.inProgress?' O mês em andamento inclui os gastos registrados até agora.':''}</p>
      <p class="history-alert" role="status" ${message?'':'hidden'}>${esc(message)}</p>
      <div class="history-select-all"><label><input type="checkbox" data-history-all> Selecionar alterações</label><span data-history-selection></span></div>
      <div class="history-table"><div class="history-table-heading"><span>Categoria</span><span>Atual</span><span>Sugerido</span></div><div data-history-rows></div></div>
      <div class="history-pagination" ${count>1?'':'hidden'}><button type="button" class="subtle-button" data-history-prev aria-label="Categorias anteriores">‹</button><span data-history-page aria-live="polite"></span><button type="button" class="subtle-button" data-history-next aria-label="Próximas categorias">›</button></div>
      <div class="history-review-total"><span>Total selecionado<small>Atual → novo planejado</small></span><strong data-history-total></strong></div>
      <p class="history-footnote">Substitui o planejado das categorias selecionadas. Categorias sem gastos no período mantêm o valor atual.</p>
      <div class="history-review-actions"><button type="button" class="subtle-button" data-history-back>Voltar</button><button type="button" class="btn btn-blue" data-history-apply>Aplicar ao planejado</button></div>
    </div>`,'SEU HISTÓRICO, SEU PRÓXIMO MÊS');
    const root=doc.querySelector('.history-review'),list=root.querySelector('[data-history-rows]'),all=root.querySelector('[data-history-all]'),apply=root.querySelector('[data-history-apply]');
    const changed=preview.rows.filter(row=>row.before!==row.suggested);
    function totals(){
      const chosen=preview.rows.filter(row=>selected.has(row.id));
      root.querySelector('[data-history-selection]').textContent=chosen.length+' '+(chosen.length===1?'categoria':'categorias');
      root.querySelector('[data-history-total]').textContent=money(chosen.reduce((sum,row)=>sum+row.before,0))+' → '+money(chosen.reduce((sum,row)=>sum+row.suggested,0));
      all.checked=changed.length>0&&chosen.length===changed.length;all.indeterminate=chosen.length>0&&chosen.length<changed.length;all.disabled=!changed.length;apply.disabled=!chosen.length;
    }
    function rows(){
      list.innerHTML=preview.rows.slice(page*pageSize,(page+1)*pageSize).map(row=>`<label class="history-category${row.before===row.suggested?' is-unchanged':''}"><span class="history-category-name"><input type="checkbox" data-history-category="${esc(row.id)}" ${selected.has(row.id)?'checked':''} ${row.before===row.suggested?'disabled':''}><span class="history-category-emoji" aria-hidden="true">${esc(categoryIcon(row.name))}</span><span>${esc(row.name)}${row.before===row.suggested?'<small>Já planejado</small>':''}</span></span><span>${money(row.before)}</span><strong>${money(row.suggested)}</strong></label>`).join('')||'<p class="dialog-note">Sem gastos neste período para sugerir valores.</p>';
      list.querySelectorAll('[data-history-category]').forEach(input=>input.onchange=()=>{if(input.checked)selected.add(input.dataset.historyCategory);else selected.delete(input.dataset.historyCategory);totals();});
      root.querySelector('[data-history-page]').textContent=`${page+1} de ${count}`;
      root.querySelector('[data-history-prev]').disabled=page===0;root.querySelector('[data-history-next]').disabled=page===count-1;totals();refreshDialog();
    }
    all.onchange=()=>{selected.clear();if(all.checked)changed.forEach(row=>selected.add(row.id));rows();};
    root.querySelector('[data-history-prev]').onclick=()=>{if(page>0){page--;rows();}};
    root.querySelector('[data-history-next]').onclick=()=>{if(page<count-1){page++;rows();}};
    root.querySelector('[data-history-back]').onclick=showOptions;
    apply.onclick=()=>{
      if(!writable())return;
      try{
        const receipt=applyPlanningHistory(getState(),preview,[...selected]);closeDialog();onChange();
        notify(`Planejado de ${monthLabel(preview.target)} atualizado em ${receipt.changes.length} ${receipt.changes.length===1?'categoria':'categorias'}.`,()=>{
          if(!writable())return;
          try{undoPlanningHistory(getState(),receipt);onChange();notify('Alteração no planejado desfeita.');}catch(error){notify(error.message);}
        });
      }catch(error){
        try{review(planningHistory(getState(),preview.target,preview.method),error.message);}catch(freshError){notify(freshError.message);}
      }
    };
    rows();
  }
  if(trigger){trigger.onclick=openMenu;trigger.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();if(!menu)openMenu();}};}
  doc.addEventListener('click',event=>{if(menu&&!menu.contains(event.target)&&!trigger?.contains(event.target))closeMenu();});
  doc.addEventListener('keydown',event=>{if(menu&&event.key==='Escape'){event.preventDefault();closeMenu(true);}});
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return {closeMenu,showOptions};
}
