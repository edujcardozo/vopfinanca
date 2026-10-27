let dismiss=null;
export function openQuickCreate({trigger,title,placeholder,onCreate}){
 dismiss?.();const pop=document.createElement('section');pop.className='quick-create-popover';pop.id='quick-create-popover';pop.setAttribute('role','dialog');pop.setAttribute('aria-label',title);
 pop.innerHTML='<form id="quick-create-form"><label><span></span><input name="name" maxlength="70" autocomplete="off" autocapitalize="sentences" required></label><p role="alert" hidden></p><div><button type="button" id="quick-create-cancel">Cancelar</button><button type="submit">OK</button></div></form>';
 pop.querySelector('label span').textContent=title;const input=pop.querySelector('input');input.placeholder=placeholder;document.body.append(pop);trigger.setAttribute('aria-expanded','true');
 function position(){const r=trigger.getBoundingClientRect(),v=window.visualViewport,w=v?.width||window.innerWidth,h=v?.height||window.innerHeight,offset=v?.offsetTop||0;const width=Math.min(290,w-24),height=pop.getBoundingClientRect().height||150;pop.style.width=width+'px';pop.style.left=Math.max(12,Math.min(r.left,w-width-12))+'px';pop.style.top=Math.max(offset+12,Math.min(r.bottom+9,offset+h-height-12))+'px';}
 function close(focus=false){pop.remove();trigger.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keydown,true);window.removeEventListener('resize',position);window.visualViewport?.removeEventListener('resize',position);if(dismiss===close)dismiss=null;if(focus&&trigger.isConnected)trigger.focus({preventScroll:true});}
 function outside(e){if(!pop.contains(e.target)&&!trigger.contains(e.target))close();}
 function keydown(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}}
 pop.querySelector('#quick-create-cancel').onclick=()=>close(true);
 pop.querySelector('form').onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name){input.focus();return;}try{onCreate(name);close();}catch(error){const message=pop.querySelector('p');message.textContent=error.message;message.hidden=false;position();input.focus();}};
 document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keydown,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);dismiss=close;position();input.focus({preventScroll:true});return {close};
}
