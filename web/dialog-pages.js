// Keep modal content in the same DOM so form values and listeners survive each step.
export function paginateHeights(heights,available){
 const pages=[];let page=[],used=0;
 for(let i=0;i<heights.length;i++){const height=Math.max(0,heights[i]);if(page.length&&used+height>available){pages.push(page);page=[];used=0;}page.push(i);used+=height;}
 if(page.length)pages.push(page);return pages;
}
export function createDialogPages(dialog,{body,heading}){
 let units=[],pages=[],current=0,frame=null,firstInvalid=false,anchor=null,stableHeight=0,stableWidth=0;
 const footer=document.createElement('nav');footer.className='dialog-pages';footer.hidden=true;footer.setAttribute('aria-label','Etapas do popup');
 footer.innerHTML='<button type="button" data-dialog-prev>‹ Anterior</button><span data-dialog-page-label role="status" aria-live="polite"></span><button type="button" data-dialog-next>Continuar ›</button>';
 dialog.append(footer);
 const previous=footer.querySelector('[data-dialog-prev]'),next=footer.querySelector('[data-dialog-next]'),label=footer.querySelector('[data-dialog-page-label]');
 const style=el=>globalThis.getComputedStyle?.(el)||window.getComputedStyle?.(el);
 const height=el=>{const css=style(el),r=el.getBoundingClientRect?.();return (r?.height||el.offsetHeight||0)+(parseFloat(css?.marginTop)||0)+(parseFloat(css?.marginBottom)||0);};
 const hidden=el=>!!el.closest('[hidden]')||style(el)?.display==='none';
 function clearLayout(){body.querySelectorAll('[data-dialog-page-hidden]').forEach(el=>el.removeAttribute('data-dialog-page-hidden'));body.querySelectorAll('.dialog-flow-container').forEach(el=>el.classList.remove('dialog-flow-container'));}
 function show(index,{focus=false}={}){
  if(!pages.length)return;current=Math.max(0,Math.min(pages.length-1,index));const visible=new Set(pages[current]);
  units.forEach((el,i)=>el.toggleAttribute('data-dialog-page-hidden',!visible.has(i)));anchor=units[pages[current][0]];
  previous.disabled=current===0;next.disabled=current===pages.length-1;label.textContent=`${current+1} de ${pages.length}`;
  footer.hidden=pages.length<2;dialog.dataset.dialogPage=String(current+1);
  if(focus){heading.tabIndex=-1;heading.focus({preventScroll:true});}
 }
 function fit(){
  frame=null;if(!dialog.open)return;
  const focused=document.activeElement,previousAnchor=units.find(el=>el.contains(focused))||anchor;
  if(dialog.classList.contains('invoice-bills-modal')){
   clearLayout();dialog.classList.remove('dialog-paged','dialog-tight');footer.hidden=true;units=[];pages=[];current=0;
   const viewport=window.visualViewport?.height||window.innerHeight||600;
   dialog.style.setProperty('--dialog-viewport-height',viewport+'px');dialog.style.setProperty('--dialog-center-y',((window.visualViewport?.offsetTop||0)+viewport/2)+'px');
   return;
  }
  if(dialog.classList.contains('transaction-dialog')&&(window.innerWidth||1000)<720){
   clearLayout();dialog.classList.remove('dialog-paged','dialog-tight');footer.hidden=true;units=[];pages=[];current=0;
   const width=window.innerWidth,visible=window.visualViewport?.height||window.innerHeight;
   if(!stableHeight||stableWidth!==width){stableHeight=Math.max(window.innerHeight||0,visible||0);stableWidth=width;}
   const keyboard=Math.max(0,stableHeight-visible-(window.visualViewport?.offsetTop||0));
   dialog.style.setProperty('--transaction-stable-height',stableHeight+'px');
   dialog.style.setProperty('--transaction-keyboard-space',keyboard>100?keyboard+'px':'0px');
   if(focused&&body.contains(focused)&&focused.matches('input,textarea,select')&&keyboard>100){
    const rect=focused.getBoundingClientRect(),bottom=visible+(window.visualViewport?.offsetTop||0)-20;
    if(rect.bottom>bottom)body.scrollTop+=rect.bottom-bottom;
   }
   return;
  }

  clearLayout();dialog.classList.remove('dialog-paged');
  const viewport=window.visualViewport?.height||window.innerHeight||0;if(!viewport)return;
  dialog.style.setProperty('--dialog-viewport-height',viewport+'px');dialog.style.setProperty('--dialog-center-y',((window.visualViewport?.offsetTop||0)+viewport/2)+'px');
  const css=style(dialog),padding=(parseFloat(css?.paddingTop)||16)+(parseFloat(css?.paddingBottom)||16),handle=dialog.querySelector('.dialog-handle');
  const fullAvailable=Math.floor(viewport-32-padding-height(dialog.querySelector('.dialog-heading'))-(handle&&!hidden(handle)?height(handle):0));
  const available=fullAvailable-60;
  dialog.classList.toggle('dialog-tight',available<300);dialog.style.setProperty('--dialog-body-height',Math.max(80,available)+'px');
  // A layout-less DOM (unit tests) deliberately leaves the regular view intact.
  const natural=body.scrollHeight||height(body);if(!natural){footer.hidden=true;return;}
  // Reserve navigation space only if the content actually needs multiple pages.
  if(natural<=fullAvailable){units=[];pages=[];current=0;footer.hidden=true;return;}
  const flatSelector='form,[data-dialog-flow],.transaction-fields,.sharing-fields,.sharing-grid,.form-row,.app-options,.hidden-category-list,.recovery-list,.sync-conflict-copies';
  units=[];
  function collect(el){
   if(hidden(el))return;
   if(el.matches(flatSelector)||(height(el)>available&&el.children.length>1&&!el.matches('button,.form-group,.couple-history-row,.payee-combobox'))){
    el.classList.add('dialog-flow-container');for(const child of el.children)collect(child);
   }else units.push(el);
  }
  for(const el of body.children)collect(el);
  dialog.classList.add('dialog-paged');
  // If a semantic group itself is too tall (for example with the phone keyboard),
  // expose its smaller children as steps while retaining the original DOM labels.
  for(let pass=0;pass<20;pass++){
   const index=units.findIndex(el=>height(el)+10>available&&el.children.length>1&&!el.matches('button,.payee-combobox,.payee-input-wrap'));
   if(index<0)break;const group=units[index];group.classList.add('dialog-flow-container');const children=[...group.children].filter(el=>!hidden(el));if(!children.length)break;units.splice(index,1,...children);
  }
  pages=paginateHeights(units.map(el=>height(el)+10),Math.max(80,available));
  let index=units.findIndex(el=>el===previousAnchor||el.contains(focused));if(index<0)index=0;
  const selected=pages.findIndex(page=>page.includes(index));show(Math.max(0,selected));
 }
 function refresh(){if(frame!==null)return;frame=window.requestAnimationFrame?.(fit)??null;if(frame===null)fit();}
 function reveal(el){
  fit();const i=units.findIndex(unit=>unit===el||unit.contains(el)),page=pages.findIndex(p=>p.includes(i));if(page>=0)show(page);
 }
 function validPage(){
  for(const i of pages[current]||[]){const unit=units[i],controls=unit.matches('input,select,textarea')?[unit]:[...unit.querySelectorAll('input,select,textarea')];
   for(const control of controls)if(!control.disabled&&control.willValidate&&control.validity&&!control.validity.valid){control.reportValidity();control.focus({preventScroll:true});return false;}
  }return true;
 }
 previous.onclick=()=>show(current-1,{focus:true});next.onclick=()=>{if(validPage())show(current+1,{focus:true});};
 dialog.addEventListener('invalid',e=>{if(firstInvalid){e.preventDefault();return;}firstInvalid=true;reveal(e.target);queueMicrotask(()=>firstInvalid=false);},true);
 dialog.addEventListener('submit',e=>{if(pages.length>1&&current<pages.length-1){e.preventDefault();e.stopImmediatePropagation();if(validPage())show(current+1,{focus:true});}},true);
 // Reflow when conditional fields, errors, expanded notes or the keyboard change space.
 ['change','toggle','input','click','focusin'].forEach(type=>body.addEventListener(type,refresh,true));
 window.addEventListener('resize',refresh);window.visualViewport?.addEventListener('resize',refresh);
 dialog.addEventListener('close',()=>{if(dialog.open){refresh();return;}window.cancelAnimationFrame?.(frame);frame=null;clearLayout();footer.hidden=true;dialog.classList.remove('dialog-paged','dialog-tight');units=[];pages=[];anchor=null;});
 return {refresh,reveal,reset(){stableHeight=window.innerHeight||window.visualViewport?.height||0;stableWidth=window.innerWidth;clearLayout();units=[];pages=[];current=0;anchor=null;footer.hidden=true;refresh();},get page(){return current;},get count(){return pages.length;},next(){if(validPage())show(current+1);},previous(){show(current-1);}};
}
