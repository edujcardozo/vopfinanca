export const HISTORY_INTRO_KEY='vpo-planning-history-tip-v1';

// The hint is a small, nonmodal note anchored to the actual history button.
export function createPlanningHistoryIntro({storage,canShow,getAccount=()=>'',documentObject=document,windowObject=window}){
  const doc=documentObject,win=windowObject,anchor=doc.querySelector('#planning-history');
  let shown=false,tip=null,previousDescription=null;
  function bounds(){
    const rect=anchor?.getBoundingClientRect?.();
    return rect?.width>0&&rect.height>0&&rect.bottom>0&&rect.top<(win.innerHeight||900)?rect:null;
  }
  function close(focus=false){
    if(!tip)return;
    tip.remove();tip=null;
    if(previousDescription===null)anchor?.removeAttribute('aria-describedby');else anchor?.setAttribute('aria-describedby',previousDescription);
    if(focus)anchor?.focus({preventScroll:true});
  }
  function position(){
    const rect=bounds();if(!tip||!rect)return false;
    const viewportWidth=win.innerWidth||1024,viewportHeight=win.innerHeight||900,width=Math.min(286,viewportWidth-24);
    tip.style.width=width+'px';
    const height=tip.getBoundingClientRect?.().height||166,left=Math.max(12,Math.min(rect.right-width,viewportWidth-width-12));
    const above=rect.top>=height+24;
    tip.dataset.side=above?'above':'below';
    tip.style.left=left+'px';tip.style.top=Math.max(12,Math.min(above?rect.top-height-12:rect.bottom+12,viewportHeight-height-12))+'px';
    tip.style.setProperty('--history-tip-arrow',Math.max(20,Math.min(width-20,rect.left+rect.width/2-left))+'px');
    return true;
  }
  function maybeShow(){
    if(tip||shown||!canShow()||!bounds())return false;
    const account=getAccount(),key=HISTORY_INTRO_KEY+(account?':'+account:'');
    try{if(storage.getItem(key)==='seen'){shown=true;return false;}}catch{/* The note still works without browser storage. */}
    tip=doc.createElement('aside');tip.id='planning-history-tip';tip.className='history-tip';tip.setAttribute('role','note');tip.setAttribute('aria-labelledby','history-tip-title');
    tip.innerHTML='<button type="button" class="history-tip-close" data-history-intro-dismiss aria-label="Fechar dica"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button><strong id="history-tip-title">Planeje com seu histórico</strong><p id="history-tip-description">Use os gastos do mês passado ou as médias de 6 meses e do ano como base para o planejado. Você revisa antes de aplicar.</p><button type="button" class="history-tip-done" data-history-tip-done>Entendi <span aria-hidden="true">✓</span></button>';
    doc.body.append(tip);position();
    previousDescription=anchor.getAttribute('aria-describedby');anchor.setAttribute('aria-describedby',[previousDescription,'history-tip-description'].filter(Boolean).join(' '));
    shown=true;
    try{storage.setItem(key,'seen');}catch{/* Do not repeat the note during this visit if storage is blocked. */}
    tip.querySelector('[data-history-intro-dismiss]').onclick=()=>close(true);
    tip.querySelector('[data-history-tip-done]').onclick=()=>close(true);
    return true;
  }
  function refresh(){if(tip){if(!canShow()||!position())close();}else maybeShow();}
  doc.addEventListener('click',event=>{if(tip&&!tip.contains(event.target)&&!anchor?.contains(event.target))close();});
  anchor?.addEventListener('click',()=>close());
  doc.addEventListener('keydown',event=>{if(tip&&event.key==='Escape'){event.preventDefault();close(true);}});
  win.addEventListener('resize',refresh);win.addEventListener('scroll',refresh,true);
  return {maybeShow,refresh,close};
}
