import {saveCard} from './saved-cards-data.js?v=vpo-126';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
let sequence=0;
function options(state){return (state.cards||[]).map(c=>`<option value="${esc(c.name)}"></option>`).join('');}
export function savedCardField(state,{cardId='',name='',attribute='',label='Cartão · opcional'}={}){
 const card=(state.cards||[]).find(c=>c.id===cardId),list='saved-card-options-'+(++sequence);
 return `<div class="saved-card-field form-group" data-card-picker data-card-plan="${esc(state.planId)}"><label><span>${label}</span><input type="text" ${attribute} data-card-select list="${list}" value="${esc(card?.name||name)}" maxlength="70" placeholder="Digite ou escolha um cartão" autocomplete="off" aria-label="Nome do cartão" aria-autocomplete="list"></label><datalist id="${list}">${options(state)}</datalist><small data-card-error role="alert" hidden></small></div>`;
}
export function selectedCard(state,root){const name=root.querySelector('[data-card-select]')?.value.trim()||'',card=state.cards?.find(c=>key(c.name)===key(name));return card?{name:card.name,cardId:card.id}:{name,cardId:''};}
export function mountSavedCards({getState,onChange,notify=()=>{}}){
 function save(input){
  const picker=input.closest('[data-card-picker]');if(!picker||input.disabled||input.closest('[hidden]'))return;
  const error=picker.querySelector('[data-card-error]');error.hidden=true;
  if(!input.value.trim()){input.value='';return;}
  try{
   if(picker.dataset.cardPlan!==getState().planId)throw Error('O orçamento mudou. Reabra este formulário.');
   const before=(getState().cards||[]).length,card=saveCard(getState(),input.value);input.value=card.name;
   document.querySelectorAll('[data-card-picker] datalist').forEach(list=>list.innerHTML=options(getState()));
   // Native change already reaches the import's listener. Enter/focusout also
   // dispatch change so its draft retains the new name across review pages.
   if((getState().cards||[]).length!==before){onChange();notify('Cartão salvo. Ele já está disponível nos próximos lançamentos.');}
  }catch(e){error.textContent=e.message;error.hidden=false;}
 }
 const changed=e=>{if(e.target.matches?.('[data-card-select]'))save(e.target);};
 document.addEventListener('change',changed);document.addEventListener('focusout',e=>{if(e.target.matches?.('[data-card-select]')){save(e.target);e.target.dispatchEvent(new (e.target.ownerDocument.defaultView.Event)('change',{bubbles:true}));}});
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('[data-card-select]')){e.preventDefault();save(e.target);e.target.dispatchEvent(new (e.target.ownerDocument.defaultView.Event)('change',{bubbles:true}));}});
 return {save};
}
