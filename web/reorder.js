export function createReorder({root,onCommit,onCancel,announce}){
  let drag=null,frame=0,suppressUntil=0;
  const groups=()=>[...root.querySelectorAll('[data-sort-group]')];
  const rows=g=>[...g.querySelectorAll('[data-sort-category]')];
  const layout=()=>groups().map(g=>({id:g.dataset.sortGroup,categories:rows(g).map(r=>r.dataset.sortCategory)}));
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animate(change){
    const nodes=[...root.querySelectorAll(drag?.type==='group'?'[data-sort-group]':'[data-sort-category]')],before=new Map(nodes.map(n=>[n,n.getBoundingClientRect()]));change();
    if(reduced())return;
    for(const n of nodes){if(n===drag?.node||drag?.node.contains(n))continue;const a=before.get(n),b=n.getBoundingClientRect();if(Math.abs(a.top-b.top)>1){n.getAnimations().forEach(a=>a.cancel());n.animate([{transform:`translateY(${a.top-b.top}px)`},{transform:'translateY(0)'}],{duration:150,easing:'cubic-bezier(.2,.7,.2,1)'});}}
  }
  function insert(node,parent,before){if(node.parentElement===parent&&node.nextElementSibling===before)return;animate(()=>parent.insertBefore(node,before));}
  function position(){
    if(!drag?.active)return;const {node,type,y}=drag;
    if(type==='group'){
      const others=groups().filter(g=>g!==node),before=others.find(g=>{const r=g.getBoundingClientRect();return y<r.top+r.height/2;})||null;insert(node,root,before||root.querySelector('[data-hidden-groups],[data-hidden-categories]'));
    }else{
      const gs=groups(),target=gs.reduce((best,g)=>{const r=g.getBoundingClientRect(),distance=Math.max(r.top-y,y-r.bottom,0);return !best||distance<best.distance?{node:g,distance}:best;},null)?.node;if(!target)return;
      const list=target.querySelector('.category-items'),others=rows(target).filter(r=>r!==node),before=others.find(r=>{const b=r.getBoundingClientRect();return y<b.top+b.height/2;})||null;
      insert(node,list,before);
      root.querySelectorAll('.drop-group').forEach(g=>g.classList.remove('drop-group'));target.classList.add('drop-group');
    }
  }
  function tick(){
    if(!drag?.active)return;const height=window.visualViewport?.height||innerHeight,top=60,bottom=height-(innerWidth<720?100:35),edge=64;let speed=0;
    if(drag.y<top+edge)speed=-Math.min(18,(top+edge-drag.y)*.25);else if(drag.y>bottom-edge)speed=Math.min(18,(drag.y-bottom+edge)*.25);
    if(speed)window.scrollBy({top:speed,behavior:'instant'});position();frame=requestAnimationFrame(tick);
  }
  function activate(){
    const d=drag;d.active=true;root.setPointerCapture(d.pointer);root.dispatchEvent(new window.CustomEvent('reorderstart',{bubbles:true}));const rect=d.node.getBoundingClientRect();d.offset=d.startY-rect.top;d.ghost=d.node.cloneNode(true);d.ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));d.ghost.removeAttribute('id');d.ghost.setAttribute('aria-hidden','true');d.ghost.inert=true;d.ghost.classList.add('sort-ghost');Object.assign(d.ghost.style,{width:rect.width+'px',left:rect.left+'px',top:(d.y-d.offset)+'px'});document.body.append(d.ghost);d.node.classList.add('sort-placeholder');document.body.classList.add('is-sorting');d.handle.setAttribute('aria-pressed','true');announce('Arrastando '+d.handle.dataset.sortLabel+'. Solte na posição desejada.');frame=requestAnimationFrame(tick);
  }
  function clean(){
    if(!drag)return;cancelAnimationFrame(frame);const d=drag;drag=null;d.ghost?.remove();d.node.classList.remove('sort-placeholder');d.handle.setAttribute('aria-pressed','false');root.querySelectorAll('.drop-group').forEach(g=>g.classList.remove('drop-group'));document.body.classList.remove('is-sorting');try{root.releasePointerCapture(d.pointer);}catch{}return d;
  }
  function cancel(){const d=clean();if(d?.active){announce('Movimento cancelado.');return true;}return false;}
  root.addEventListener('pointerdown',e=>{
    if(e.button!==0||!e.isPrimary||drag)return;
    suppressUntil=0;
    const explicit=e.target.closest('[data-sort-handle]');
    const category=e.target.closest('[data-sort-category]'),header=e.target.closest('.group-header');
    const directCategory=category&&e.target.closest('.category-info');
    const directGroup=header&&!e.target.closest('.group-header-actions');
    if(!explicit&&!directCategory&&!directGroup)return;
    const type=explicit?.dataset.sortHandle||(directCategory?'category':'group');
    const node=(explicit||e.target).closest(type==='group'?'[data-sort-group]':'[data-sort-category]');
    const handle=explicit||node.querySelector(`[data-sort-handle="${type}"]`);if(!handle)return;
    drag={handle,node,type,pointer:e.pointerId,startY:e.clientY,startX:e.clientX,y:e.clientY,active:false};
    if(explicit){root.setPointerCapture(e.pointerId);handle.focus({preventScroll:true});e.preventDefault();}
  });
  root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;drag.y=e.clientY;if(!drag.active&&Math.hypot(e.clientY-drag.startY,e.clientX-drag.startX)>5)activate();if(drag.active){drag.ghost.style.top=(drag.y-drag.offset)+'px';e.preventDefault();}});
  root.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;if(drag.active)position();const result=layout(),d=clean();if(d.active){suppressUntil=Date.now()+500;onCommit(result,d.handle.dataset.sortLabel,{type:d.type,id:d.node.dataset[d.type==='group'?'sortGroup':'sortCategory']});}});
  root.addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId&&cancel())onCancel();});
  root.addEventListener('lostpointercapture',e=>{if(e.target===root&&drag?.pointer===e.pointerId&&cancel())onCancel();});
  root.addEventListener('click',e=>{if(suppressUntil>Date.now()||e.target.closest('[data-sort-handle]')){e.preventDefault();e.stopPropagation();}},true);
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&drag){e.preventDefault();if(cancel())onCancel();return;}
    const h=e.target.closest('[data-sort-handle]');if(!h||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();
    const gs=groups(),group=h.closest('[data-sort-group]'),gi=gs.indexOf(group),dir=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;
    if(h.dataset.sortHandle==='group'){const other=gs[gi+dir];if(other)root.insertBefore(group,dir<0?other:other.nextElementSibling||root.querySelector('[data-hidden-groups],[data-hidden-categories]'));}
    else{const row=h.closest('[data-sort-category]'),list=row.parentElement,rs=rows(group),ri=rs.indexOf(row),other=rs[ri+dir];if(!['ArrowLeft','ArrowRight'].includes(e.key)&&other)list.insertBefore(row,dir<0?other:other.nextElementSibling);else{const next=gs[gi+dir]?.querySelector('.category-items');if(next)next.insertBefore(row,dir<0?null:next.firstElementChild);}}
    const focus={type:h.dataset.sortHandle,id:h.closest(h.dataset.sortHandle==='group'?'[data-sort-group]':'[data-sort-category]').dataset[h.dataset.sortHandle==='group'?'sortGroup':'sortCategory']};
    onCommit(layout(),h.dataset.sortLabel,focus);
  });
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();if(cancel())onCancel();}});
  window.addEventListener('pointerup',e=>{if(drag&&!drag.active&&drag.pointer===e.pointerId)clean();});
  window.addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId&&cancel())onCancel();});
  window.addEventListener('blur',()=>{if(cancel())onCancel();});
  return {cancel};
}
