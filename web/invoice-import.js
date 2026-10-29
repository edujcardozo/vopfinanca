import {savedCardField,selectedCard} from './saved-cards-ui.js?v=vpo-126';
import {saveInvoiceBill} from './invoice-bills-data.js?v=vpo-126';
import {ensureUnclassifiedGroup,organizeUnclassifiedGroup} from './unclassified-group.js?v=vpo-123';
import {validDate,validMonth,currentMonth,groupsFor,parseMoney,saveTransaction,validateState,id,formatMoney} from './core.js?v=vpo-126';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parseInvoice(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw Error('CSV com aspas incompletas.');row.push(field);if(row.some(v=>v.trim()))rows.push(row);
 const header=rows.shift()?.map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase());if(header?.join(',')!=='date,title,amount')throw Error('Selecione o CSV da fatura Nubank com colunas date, title e amount.');
 if(rows.length>3000)throw Error('Importe até 3.000 linhas por vez.');
 let excluded=0;const purchases=rows.flatMap((r,i)=>{if(r.length!==3)throw Error('Colunas inválidas na linha '+(i+2));if(r[1].trim().toLowerCase()==='pagamento recebido'){excluded++;return [];}
 if(r[2].includes('-'))throw Error('Estorno na linha '+(i+2)+'. Retire-o do CSV e registre-o separadamente.');const amount=parseMoney(r[2].replace(/\s/g,''));if(!validDate(r[0])||!Number.isSafeInteger(amount)||amount<=0||!r[1].trim())throw Error('Revise a linha '+(i+2)+': data, descrição ou valor não suportado. Estornos devem ser lançados separadamente.');return [{date:r[0],payee:r[1].trim(),amount}];});return {purchases,excluded};
}
// Deterministic non-secret row identity; works in both secure hosting and local previews.
function fingerprint(text){const bytes=new TextEncoder().encode(text),mask=(1n<<64n)-1n;return [14695981039346656037n,7809847782465536322n].map(seed=>{let h=seed;for(const b of bytes)h=((h^BigInt(b))*1099511628211n)&mask;return h.toString(16).padStart(16,'0');}).join('');}
const merchant=s=>s.replace(/ - Parcela \d+\/\d+$/i,'').trim().toLocaleLowerCase('pt-BR');
const key=t=>[t.date,merchant(t.payee),t.amount].join('|');
export async function prepareInvoice(text,state){
 const result=parseInvoice(text),seen=new Map(),existing=Object.values(state.months).flatMap(m=>m.transactions),counts=new Map();
 for(const t of existing)if(t.type==='expense')counts.set(key({...t,payee:t.payee||t.description}),(counts.get(key({...t,payee:t.payee||t.description}))||0)+1);
 result.rows=await Promise.all(result.purchases.map(async p=>{const k=key(p),occurrence=(seen.get(k)||0)+1;seen.set(k,occurrence);const digest=fingerprint(k);const txId='nb-'+digest+'-'+occurrence;
 const exact=existing.some(t=>t.id===txId),possible=occurrence<=(counts.get(k)||0);const match=[...existing].reverse().find(t=>t.type==='expense'&&merchant(t.payee||t.description)===merchant(p.payee)&&state.categories.some(c=>c.id===t.categoryId));
 const named=name=>state.categories.find(c=>c.name.toLowerCase().includes(name))?.id||'';
 const categoryId=match?.categoryId||(/^(uber|99\*)/i.test(p.payee)?named('uber')||named('transporte'):/zaffari|minimercado/i.test(p.payee)?named('supermercado'):'');
 return {...p,id:txId,categoryId,selected:!exact&&!possible,exact,possible,paidBy:'larissa',eduPercent:50};}));return result;
}
export function invoicePostingDate(date,month=''){
 if(!validDate(date))throw Error('Revise a data da compra.');
 if(!month)return date;
 if(!validMonth(month))throw Error('Escolha um mês válido para os lançamentos.');
 const [year,number]=month.split('-').map(Number),lastDay=new Date(Date.UTC(year,number,0)).getUTCDate();
 return month+'-'+String(Math.min(Number(date.slice(8)),lastDay)).padStart(2,'0');
}
export function commitInvoice(state,rows,batch,month='',billing=null){
 if(month&&!validMonth(month))throw Error('Escolha um mês válido para os lançamentos.');
 const next=structuredClone(state),selected=rows.filter(r=>r.selected&&!r.exact);if(!selected.length)throw Error('Selecione ao menos uma compra.');
 let fallback=next.categories.find(c=>c.name==='A classificar');if(selected.some(r=>!r.categoryId)&&!fallback){const group=ensureUnclassifiedGroup(next);fallback={id:id(),name:'A classificar',group:group.id,icon:'🏷️',target:0};next.categories.push(fallback);}
 for(const r of selected){if(Object.values(next.months).some(m=>m.transactions.some(t=>t.id===r.id)))throw Error('Uma destas compras já foi importada. Reabra o CSV.');saveTransaction(next,{id:r.id,type:'expense',...(billing?.cardId?{cardId:billing.cardId}:{}),date:invoicePostingDate(r.date,month),payee:r.payee,description:r.payee,amount:r.amount,categoryId:r.categoryId||fallback.id,memo:'Importação Nubank [lote:'+batch+']'+(invoicePostingDate(r.date,month)!==r.date?' · Data original do CSV: '+r.date.split('-').reverse().join('/'):''),sharing:{paidBy:r.paidBy,eduPercent:Number(r.eduPercent)}});}
 if(billing?.dueDate)saveInvoiceBill(next,{id:batch,...(billing.cardId?{cardId:billing.cardId}:{}),month:month||selected[0].date.slice(0,7),dueDate:billing.dueDate,card:billing.card||'',paidDate:null,transactionIds:selected.map(r=>r.id)});
 organizeUnclassifiedGroup(next);validateState(next);return next;
}
export function mountInvoiceImport({getState,apply,getPeople,getSelectedMonth,storage,notify}){
 const tools=document.querySelector('.transaction-tools'),button=document.createElement('button');button.type='button';button.className='subtle-button invoice-import-trigger';button.setAttribute('aria-label','Importar fatura CSV');button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m-4 4 4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></svg><span>Importar fatura</span><small>CSV</small>';const headerActions=document.querySelector('.app-header-actions'),newTransaction=headerActions?.querySelector('.desktop-add');if(headerActions)headerActions.insertBefore(button,newTransaction||null);else tools.append(button);
 const panel=document.createElement('section');panel.className='invoice-import';panel.hidden=true;tools.after(panel);let draft=null,page=0,planId=null,fileName='',postingMonth='',dueDate='',cardName='',cardId='';
 const prefs=()=>{try{return JSON.parse(storage.getItem('vpo-invoice-'+getState().planId)||'{}');}catch{return {};}};
 const batches=()=>[...new Set(Object.values(getState().months).flatMap(m=>m.transactions).map(t=>t.memo?.match(/\[lote:([\w-]+)\]/)?.[1]).filter(Boolean))].reverse();
 const people=()=>getPeople()||{edu:'Titular',larissa:'Pessoa convidada'};
 const options=(items,value)=>items.map(([v,label])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(label)}</option>`).join('');
 function categoryOptions(value){
  const state=getState();
  return options([['','A classificar']],value)+groupsFor(state).map(group=>{
   const categories=state.categories.filter(c=>c.group===group.id);
   return categories.length?`<optgroup label="${esc(group.name)}">${options(categories.map(c=>[c.id,c.name]),value)}</optgroup>`:'';
  }).join('');
 }
 function categoryGroup(value){
  const state=getState(),category=state.categories.find(c=>c.id===value),group=groupsFor(state).find(g=>g.id===category?.group);
  return group?`<span class="invoice-category-group-label">Grupo</span><span>${esc(group.name)}</span>`:'<span class="invoice-category-group-label">Grupo</span><span>Definido ao classificar</span>';
 }
 function render(){
  const selected=draft?.rows.filter(r=>r.selected&&!r.exact)||[],count=draft?.rows.length||0;
  panel.innerHTML=`<header><div><h2>${draft?'Revise sua fatura':'Importar fatura'}</h2><p>${draft?esc(fileName)+' · '+count+' compras · '+draft.excluded+' pagamentos ignorados':'Selecione o CSV do Nubank. Seu orçamento atual será preservado.'}</p></div><button type="button" data-close aria-label="Fechar importação">×</button></header><p role="alert" class="invoice-error"></p>${draft?`<div class="invoice-period"><label>Lançar os gastos em<input type="month" data-posting-month value="${esc(postingMonth)}" aria-describedby="invoice-period-help"></label><label>Vencimento da fatura · opcional<input type="date" data-invoice-due value="${esc(dueDate)}"></label>${savedCardField(getState(),{cardId,name:cardName})}<button type="button" data-original-months ${!postingMonth?'disabled':''}>Manter meses do CSV</button><p id="invoice-period-help">${postingMonth?'Os gastos ficam neste mês; o vencimento indica quando pagar. O dia é mantido quando possível e a data original fica na observação.':'Cada compra será lançada no mês da sua data no CSV.'}</p></div><div class="invoice-defaults"><label>Quem pagou<select data-default="paidBy">${options(Object.entries(people()),draft.rows[0]?.paidBy)}</select></label><label>Sua parte (%)<input data-default="eduPercent" type="number" min="0" max="100" value="${draft.rows[0]?.eduPercent??50}"></label><span>Aplica a todas as compras desta revisão.</span></div><p class="invoice-summary" aria-live="polite">${selected.length} selecionadas · <strong>${formatMoney(selected.reduce((n,r)=>n+r.amount,0))}</strong></p><p>Edite os campos abaixo. Compras possivelmente existentes vêm desmarcadas; compras iguais dentro do arquivo são preservadas.</p><div class="invoice-rows">${draft.rows.slice(page*4,page*4+4).map((r,j)=>`<fieldset data-row="${page*4+j}" ${r.exact?'disabled':''}><legend><label><input type="checkbox" data-field="selected" ${r.selected?'checked':''}> ${r.exact?'Já importada':r.possible?'Possível lançamento existente':'Compra '+(page*4+j+1)}</label></legend><label>Data da compra<input data-field="date" type="date" value="${esc(r.date)}" required><small data-posting-preview>${validDate(r.date)?'Lançamento: '+invoicePostingDate(r.date,postingMonth).split('-').reverse().join('/'):'Revise a data'}</small></label><label>Estabelecimento<input data-field="payee" value="${esc(r.payee)}" maxlength="100" required></label><label>Valor (R$)<input data-field="amount" inputmode="decimal" value="${(r.amount/100).toFixed(2).replace('.',',')}" required></label><label class="invoice-category-field">Categoria<select data-field="categoryId" aria-describedby="invoice-category-group-${page*4+j}">${categoryOptions(r.categoryId)}</select><span class="invoice-category-group" id="invoice-category-group-${page*4+j}" data-category-group aria-live="polite">${categoryGroup(r.categoryId)}</span></label><label>Quem pagou<select data-field="paidBy">${options(Object.entries(people()),r.paidBy)}</select></label><label>Sua parte (%)<input data-field="eduPercent" type="number" min="0" max="100" value="${r.eduPercent}" required></label></fieldset>`).join('')}</div><footer><button type="button" data-page="-1" ${!page?'disabled':''}>Anterior</button><span>${page+1} / ${Math.max(1,Math.ceil(count/4))}</span><button type="button" data-page="1" ${(page+1)*4>=count?'disabled':''}>Próxima</button><button type="button" data-commit class="btn btn-blue">Concluir importação (${selected.length})</button></footer>`:`<label class="invoice-file">Arquivo CSV<input type="file" accept=".csv,text/csv" data-file></label>${batches().length?`<details><summary>Desfazer uma importação</summary>${batches().map(b=>{const txs=Object.values(getState().months).flatMap(m=>m.transactions).filter(t=>t.memo?.includes('[lote:'+b+']'));return `<button type="button" data-undo="${esc(b)}">Desfazer lote · ${txs.length} compras · ${formatMoney(txs.reduce((n,t)=>n+t.amount,0))}</button>`;}).join('')}</details>`:''}`}`;
 }
 function error(e){panel.querySelector('.invoice-error').textContent=e.message||String(e);}
 button.onclick=()=>{draft=null;page=0;postingMonth=getSelectedMonth?.()||currentMonth();dueDate='';cardName='';cardId='';planId=getState().planId;panel.hidden=true;render();panel.querySelector('[data-file]').click();};
 panel.addEventListener('change',async e=>{
  if(e.target.matches('[data-file]')){try{const f=e.target.files[0];if(!f)return;panel.hidden=false;panel.scrollIntoView({block:'start',behavior:'smooth'});if(f.size>2e6)throw Error('Selecione um CSV de até 2 MB.');draft=await prepareInvoice(await f.text(),getState());fileName=f.name;const p=prefs();for(const r of draft.rows){r.paidBy=['edu','larissa'].includes(p.paidBy)?p.paidBy:'larissa';r.eduPercent=Number.isInteger(p.eduPercent)?p.eduPercent:50;}render();}catch(err){error(err);}return;}
  if(e.target.matches('[data-invoice-due]')){dueDate=e.target.value;return;}
  if(e.target.matches('[data-card-select]')){const card=selectedCard(getState(),panel);cardName=card.name;cardId=card.cardId;return;}
  if(e.target.matches('[data-posting-month]')){const month=e.target.value;if(!validMonth(month))return error(Error('Escolha um mês válido ou use Manter meses do CSV.'));postingMonth=month;render();return;}
  const field=e.target.dataset.field,container=e.target.closest('[data-row]');if(field&&container){const r=draft.rows[Number(container.dataset.row)];r[field]=field==='selected'?e.target.checked:field==='amount'?parseMoney(e.target.value):field==='eduPercent'?Number(e.target.value):e.target.value;const selected=draft.rows.filter(r=>r.selected&&!r.exact);panel.querySelector('.invoice-summary').textContent=selected.length+' selecionadas · '+formatMoney(selected.reduce((n,r)=>n+(Number.isFinite(r.amount)?r.amount:0),0));panel.querySelector('[data-commit]').textContent='Concluir importação ('+selected.length+')';}
  if(field==='categoryId'&&container)container.querySelector('[data-category-group]').innerHTML=categoryGroup(draft.rows[Number(container.dataset.row)].categoryId);
  if(field==='date'&&container){const r=draft.rows[Number(container.dataset.row)];container.querySelector('[data-posting-preview]').textContent=validDate(r.date)?'Lançamento: '+invoicePostingDate(r.date,postingMonth).split('-').reverse().join('/'):'Revise a data';}
  if(e.target.dataset.default){const field=e.target.dataset.default,value=field==='eduPercent'?Number(e.target.value):e.target.value;if(field==='eduPercent'&&(!Number.isInteger(value)||value<0||value>100))return error(Error('Informe uma porcentagem de 0 a 100.'));draft.rows.forEach(r=>r[field]=value);render();}
 });
 panel.addEventListener('click',e=>{try{
  if(e.target.closest('[data-close]')){panel.hidden=true;draft=null;return;}
  if(getState().planId!==planId)throw Error('O orçamento mudou. Feche e reabra a importação.');
  if(e.target.closest('[data-original-months]')){postingMonth='';render();return;}
  const nav=e.target.closest('[data-page]');if(nav){page+=Number(nav.dataset.page);render();return;}
  if(e.target.closest('[data-commit]')){const next=commitInvoice(getState(),draft.rows,id(),postingMonth,{dueDate:panel.querySelector('[data-invoice-due]').value,card:selectedCard(getState(),panel).name,cardId:selectedCard(getState(),panel).cardId});const chosen=draft.rows.find(r=>r.selected&&!r.exact);try{storage.setItem('vpo-invoice-'+planId,JSON.stringify({paidBy:chosen.paidBy,eduPercent:chosen.eduPercent}));}catch{}apply(next);panel.hidden=true;draft=null;notify('Fatura importada. As categorias incertas estão em A classificar.');}
  const undo=e.target.closest('[data-undo]');if(undo){if(undo.dataset.confirm!=='yes'){undo.dataset.confirm='yes';undo.textContent='Confirmar remoção somente das compras deste lote';return;}const next=structuredClone(getState());for(const month of Object.values(next.months))month.transactions=month.transactions.filter(t=>!t.memo?.includes('[lote:'+undo.dataset.undo+']'));apply(next);render();notify('Compras do lote removidas. Demais lançamentos preservados.');}
 }catch(err){error(err);}});
}
