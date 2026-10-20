// A combobox that keeps input focus while mouse/touch and keyboard choose suggestions.
export function mountPayeeAutocomplete({input,panel,list,getOptions,onSelect,onCreate=()=>{},normalize,minLetters=3,optionPrefix='payee-option',optionSymbol=p=>p.name.slice(0,1).toLocaleUpperCase('pt-BR'),emptyMessage=''}){
  let options=[],active=-1,composing=false;
  const status=panel.querySelector('[data-payee-status]');
  function close(){panel.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function setActive(index){active=index;[...list.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));if(index>=0){input.setAttribute('aria-activedescendant',list.children[index].id);list.children[index].scrollIntoView?.({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  function render(){
    const query=input.value.trim();
    if((query.match(/\p{L}/gu)||[]).length<minLetters){options=[];list.replaceChildren();status.textContent='';close();return;}
    const matches=getOptions(query);options=matches.map(p=>({...p,create:false}));
    if(!matches.length){list.replaceChildren();close();status.textContent=emptyMessage;if(emptyMessage){panel.hidden=false;input.setAttribute('aria-expanded','true');}return;}
    list.replaceChildren();active=-1;input.removeAttribute('aria-activedescendant');
    for(const [index,option] of options.entries()){
      const row=document.createElement('div');row.id=optionPrefix+'-'+index;row.setAttribute('role','option');row.setAttribute('aria-selected','false');row.dataset.payeeIndex=String(index);row.className='payee-option';
      const symbol=document.createElement('span');symbol.className='payee-option-symbol';symbol.textContent=option.create?'+':optionSymbol(option);symbol.setAttribute('aria-hidden','true');
      const copy=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=option.create?'Usar “'+option.name+'”':option.name;detail.textContent=option.create?'Será guardado ao salvar o lançamento':option.categoryName||'Estabelecimento salvo';copy.append(name,detail);row.append(symbol,copy);list.append(row);
    }
    status.textContent=matches.length?matches.length+(matches.length===1?' sugestão':' sugestões')+' · ↑ ↓ para escolher':query?'Novo estabelecimento':'Seus estabelecimentos aparecerão aqui após o primeiro lançamento.';
    panel.hidden=false;input.setAttribute('aria-expanded','true');
  }
  function choose(index){const option=options[index];if(!option)return;input.value=option.name;input.focus({preventScroll:true});close();if(option.create)onCreate(option.name);else onSelect(option);}
  input.addEventListener('focus',render);input.addEventListener('input',()=>{if(!composing)render();});input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>{composing=false;render();});
  input.addEventListener('keydown',e=>{
    if(e.isComposing||composing)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(panel.hidden)render();if(options.length)setActive(active<0?(e.key==='ArrowDown'?0:options.length-1):(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);}
    else if(e.key==='Enter'&&!panel.hidden&&active>=0){e.preventDefault();choose(active);}
    else if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='Tab')close();
  });
  // Mouse selection must not blur the input before the click reaches the option.
  list.addEventListener('mousedown',e=>{if(e.target.closest('[role=option]'))e.preventDefault();});
  list.addEventListener('click',e=>{const row=e.target.closest('[data-payee-index]');if(row)choose(Number(row.dataset.payeeIndex));});
  list.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const row=e.target.closest('[data-payee-index]');if(row)setActive(Number(row.dataset.payeeIndex));});
  const wrapper=input.closest('.payee-combobox');wrapper.addEventListener('focusout',()=>{setTimeout(()=>{if(!wrapper.contains(document.activeElement))close();},0);});
  // All listeners are scoped to this form and disappear when its DOM is replaced.
  input.form?.addEventListener('pointerdown',e=>{if(!wrapper.contains(e.target))close();});
  return {close,open:render,refresh:()=>{if(document.activeElement===input)render();},choose};
}
