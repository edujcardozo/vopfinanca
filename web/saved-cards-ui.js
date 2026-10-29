import {saveCard} from './saved-cards-data.js?v=vpo-126';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cardIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></svg>';
function options(state,cardId='',name=''){
 const cards=state.cards||[],selected=cards.find(c=>c.id===cardId)||cards.find(c=>c.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
 return `<option value="">Sem cartão</option>${!selected&&name?`<option value="legacy" selected>${esc(name)}</option>`:''}${cards.map(c=>`<option value="${esc(c.id)}" ${selected?.id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}`;
}
export function savedCardField(state,{cardId='',name='',attribute='',label='Cartão · opcional'}={}){
 return `<div class="saved-card-field form-group" data-card-picker data-card-legacy="${esc(name)}"><label><span>${label}</span><span class="saved-card-controls"><select ${attribute} data-card-select aria-label="Selecionar cartão">${options(state,cardId,name)}</select><button type="button" data-card-create aria-label="Cadastrar cartão" title="Cadastrar cartão">${cardIcon}<span>+ Novo</span></button></span></label></div>`;
}
export function selectedCard(state,root){const select=root.querySelector('[data-card-select]'),card=state.cards?.find(c=>c.id===select?.value);return card?{name:card.name,cardId:card.id}:{name:select?.value==='legacy'?root.querySelector('[data-card-picker]')?.dataset.cardLegacy||root.dataset.cardLegacy||'':'',cardId:''};}
export function mountSavedCards({getState,onChange,notify=()=>{}}){
 let modal=null,trigger=null,origin=null;
 function close(){if(!modal)return;modal.close?.();modal.remove();modal=null;if(trigger?.isConnected)trigger.focus({preventScroll:true});}
 function open(button){if(modal)return;trigger=button;origin=button.closest('[data-card-picker]');const planId=getState().planId;modal=document.createElement('dialog');modal.className='saved-card-dialog';modal.setAttribute('aria-labelledby','saved-card-title');
 modal.innerHTML=`<header><span class="saved-card-symbol">${cardIcon}</span><button type="button" data-card-close aria-label="Fechar cadastro">×</button></header><p class="saved-card-eyebrow">SEUS CARTÕES</p><h2 id="saved-card-title">Cadastrar cartão</h2><p>Dê um nome fácil de reconhecer e reutilize nos seus lançamentos e faturas.</p><form id="saved-card-form"><label><span>Nome do cartão</span><input name="cardName" required maxlength="70" autocomplete="off" placeholder="Ex.: Nubank · Larissa" value="${esc(origin?.dataset.cardLegacy||'')}"></label><small>Somente um apelido. Não informe número, senha ou código de segurança.</small><p class="saved-card-error" role="alert" hidden></p><button type="submit">Salvar cartão</button></form>`;
 document.body.append(modal);modal.querySelector('[data-card-close]').onclick=close;modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.addEventListener('click',e=>{if(e.target===modal)close();});
 modal.querySelector('form').onsubmit=e=>{e.preventDefault();try{if(planId!==getState().planId)throw Error('O orçamento mudou. Reabra o cadastro.');const card=saveCard(getState(),modal.querySelector('input').value);onChange();document.querySelectorAll('[data-card-picker]').forEach(picker=>{const previous=picker.querySelector('[data-card-select]').value;picker.querySelector('[data-card-select]').innerHTML=options(getState(),picker===origin?card.id:previous,picker.dataset.cardLegacy||'');});if(origin?.isConnected)origin.querySelector('[data-card-select]').dispatchEvent(new (origin.ownerDocument.defaultView.Event)('change',{bubbles:true}));close();notify('Cartão salvo e selecionado.');}catch(error){const el=modal.querySelector('[role=alert]');el.hidden=false;el.textContent=error.message;}};
 modal.showModal();modal.querySelector('input').focus({preventScroll:true});
 }
 document.addEventListener('click',e=>{if(e.defaultPrevented)return;const button=e.target.closest?.('[data-card-create]');if(button)open(button);});return {close};
}
