import {currentMonth,shiftMonth,validMonth} from './core.js?v=vpo-126';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=month=>new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric'}).format(new Date(month+'-15T12:00:00')).replace('.','');
const monthNames=Array.from({length:12},(_,i)=>new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date(2020,i,15)).replace('.',''));
const presets=[['month','Este mês'],['3','Últimos 3 meses'],['6','Últimos 6 meses'],['12','Últimos 12 meses'],['24','Últimos 24 meses'],['year','Neste ano'],['previous','Ano anterior'],['all','Todo o período']];
export function monthCount(start,end){return (Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5))-Number(start.slice(5))+1;}
export function validatePeriod(period){if(!period||!validMonth(period.start)||!validMonth(period.end)||period.start>period.end||monthCount(period.start,period.end)>240)throw new Error('Escolha um período válido de até 20 anos, com início antes do fim.');return {start:period.start,end:period.end};}
export function presetPeriod(key,now=currentMonth(),earliest=now,latest=now){
 const year=Number(now.slice(0,4));
 if(key==='month')return {start:now,end:now};
 if(['3','6','12','24'].includes(key))return {start:shiftMonth(now,1-Number(key)),end:now};
 if(key==='year')return {start:now.slice(0,4)+'-01',end:now};
 if(key==='previous')return {start:(year-1)+'-01',end:(year-1)+'-12'};
 if(key==='all')return {start:earliest,end:latest>now?latest:now};
 throw new Error('Escolha um atalho de período.');
}
export function createReportPeriod({root,getPeriod,onApply,getBounds=()=>({}),getNow=currentMonth}){
 let popup=null,backdrop=null,draft=null,years=null,oldOverflow='',selectedPreset='custom',calendarEndpoint='start';
 function close(restore=true){if(!popup)return;popup.remove();backdrop.remove();popup=null;backdrop=null;document.body.style.overflow=oldOverflow;root.querySelector('[data-period-toggle]')?.setAttribute('aria-expanded','false');if(restore)root.querySelector('[data-period-toggle]')?.focus({preventScroll:true});}
 function renderTrigger(){const p=getPeriod(),text=p.start===p.end?label(p.start):label(p.start)+' – '+label(p.end);return `<div class="report-period-control" role="group" aria-label="Período dos relatórios"><button type="button" data-period-shift="-1" aria-label="Período um mês antes">‹</button><button type="button" data-period-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="report-period-picker"><svg class="icon" aria-hidden="true"><use href="#i-calendar"/></svg><span>${esc(text)}</span><span aria-hidden="true">⌄</span></button><button type="button" data-period-shift="1" aria-label="Período um mês depois">›</button></div>`;}
 function grid(endpoint){const year=years[endpoint],value=draft[endpoint];return `<section class="period-month-panel" data-calendar-panel="${endpoint}"><h3>${endpoint==='start'?'De':'Até'}</h3><div class="period-year"><button type="button" data-period-year="${endpoint}" data-year-step="-1" aria-label="Ano anterior do ${endpoint==='start'?'início':'fim'}" ${year<=1900?'disabled':''}>‹</button><strong>${year}</strong><button type="button" data-period-year="${endpoint}" data-year-step="1" aria-label="Próximo ano do ${endpoint==='start'?'início':'fim'}" ${year>=2199?'disabled':''}>›</button></div><div class="period-month-grid" role="group" aria-label="Mês de ${endpoint==='start'?'início':'fim'}, ${year}">${monthNames.map((name,i)=>{const month=year+'-'+String(i+1).padStart(2,'0'),selected=month===value,inRange=month>=draft.start&&month<=draft.end;return `<button type="button" data-period-month="${month}" data-period-endpoint="${endpoint}" class="${selected?'selected':inRange?'in-range':''}" aria-pressed="${selected}" aria-label="${esc(name+' de '+year+' como '+(endpoint==='start'?'início':'fim'))}">${esc(name)}</button>`;}).join('')}</div></section>`;}
 function paint(focusSelector=null){
  popup.innerHTML=`<header class="period-picker-heading"><h2 id="period-picker-title">Selecionar período</h2><button type="button" data-period-cancel aria-label="Fechar seleção de período">×</button></header><label class="period-preset-select"><span>Período</span><select data-period-select>${presets.map(([key,name])=>`<option value="${key}" ${selectedPreset===key?'selected':''}>${name}</option>`).join('')}<option value="custom" ${selectedPreset==='custom'?'selected':''}>Escolher meses</option></select></label><div class="period-endpoint-tabs"><button type="button" data-calendar-endpoint="start" aria-pressed="${calendarEndpoint==='start'}">De: ${esc(label(draft.start))}</button><button type="button" data-calendar-endpoint="end" aria-pressed="${calendarEndpoint==='end'}">Até: ${esc(label(draft.end))}</button></div><div class="period-picker-layout"><nav class="period-presets" aria-label="Atalhos de período">${presets.map(([key,name])=>`<button type="button" data-period-preset="${key}" aria-pressed="${selectedPreset===key}">${name}</button>`).join('')}<span>Personalizado</span></nav><div class="period-calendars">${grid('start')}${grid('end')}</div></div><footer class="period-picker-footer"><span class="period-selection" aria-live="polite">${esc(label(draft.start))} – ${esc(label(draft.end))}</span><p class="period-error" role="alert" hidden></p><div><button type="button" data-period-cancel>Cancelar</button><button type="button" data-period-apply>Aplicar</button></div></footer>`;
  popup.dataset.calendarEndpoint=calendarEndpoint;
  if(focusSelector)popup.querySelector(focusSelector)?.focus({preventScroll:true});
 }
 function apply(period){try{const validated=validatePeriod(period);close(false);onApply(validated);root.querySelector('[data-period-toggle]')?.focus({preventScroll:true});}catch(error){if(popup){const el=popup.querySelector('.period-error');el.textContent=error.message;el.hidden=false;}}}
 function open(){
  if(popup){close();return;}draft={...getPeriod()};years={start:Number(draft.start.slice(0,4)),end:Number(draft.end.slice(0,4))};selectedPreset='custom';calendarEndpoint='start';
  backdrop=document.createElement('div');backdrop.className='period-picker-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.onclick=()=>close();document.body.append(backdrop);
  popup=document.createElement('div');popup.id='report-period-picker';popup.className='report-period-picker';popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-labelledby','period-picker-title');document.body.append(popup);oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  root.querySelector('[data-period-toggle]')?.setAttribute('aria-expanded','true');paint();
  const trigger=root.querySelector('[data-period-toggle]'),rect=trigger.getBoundingClientRect(),width=Math.min(740,(window.innerWidth||1024)-24);
  if((window.innerWidth||1024)>=720){popup.style.width=width+'px';popup.style.left=Math.max(12,Math.min(rect.left,(window.innerWidth||1024)-width-12))+'px';popup.style.top=Math.max(12,Math.min(rect.bottom+8,(window.innerHeight||768)-popup.getBoundingClientRect().height-12))+'px';}
  popup.querySelector(`[data-period-month="${draft.start}"][data-period-endpoint=start]`)?.focus({preventScroll:true});
  function choosePreset(key,focusSelector){const bounds=getBounds();draft=presetPeriod(key,getNow(),bounds.start||getNow(),bounds.end||getNow());selectedPreset=key;years={start:Number(draft.start.slice(0,4)),end:Number(draft.end.slice(0,4))};paint(focusSelector);}
  popup.onchange=e=>{if(e.target.matches('[data-period-select]')&&e.target.value!=='custom')choosePreset(e.target.value,'[data-period-select]');};
  popup.onclick=e=>{
   if(e.target.closest('[data-period-cancel]')){close();return;}
   if(e.target.closest('[data-period-apply]')){apply(draft);return;}
   const endpointTab=e.target.closest('button[data-calendar-endpoint]');if(endpointTab){calendarEndpoint=endpointTab.dataset.calendarEndpoint;paint(`[data-calendar-endpoint="${calendarEndpoint}"]`);return;}
   const preset=e.target.closest('[data-period-preset]');if(preset){choosePreset(preset.dataset.periodPreset,`[data-period-preset="${preset.dataset.periodPreset}"]`);return;}
   const year=e.target.closest('[data-period-year]');if(year){years[year.dataset.periodYear]+=Number(year.dataset.yearStep);paint(`[data-period-year="${year.dataset.periodYear}"][data-year-step="${year.dataset.yearStep}"]`);return;}
   const month=e.target.closest('[data-period-month]');if(month){const endpoint=month.dataset.periodEndpoint;draft[endpoint]=month.dataset.periodMonth;if(draft.start>draft.end){const other=endpoint==='start'?'end':'start';draft[other]=draft[endpoint];years[other]=Number(draft[other].slice(0,4));}selectedPreset='custom';paint(`[data-period-month="${draft[endpoint]}"][data-period-endpoint="${endpoint}"]`);}
  };
  popup.onkeydown=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
   const month=e.target.closest('[data-period-month]');if(month&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const current=month.dataset.periodMonth,endpoint=month.dataset.periodEndpoint,index=Number(current.slice(5))-1,offset=e.key==='Home'?-index:e.key==='End'?11-index:({ArrowLeft:-1,ArrowRight:1,ArrowUp:-3,ArrowDown:3})[e.key],next=shiftMonth(current,offset);years[endpoint]=Number(next.slice(0,4));paint(`[data-period-month="${next}"][data-period-endpoint="${endpoint}"]`);return;}
   if(e.key==='Tab'){const nodes=[...popup.querySelectorAll('button:not([disabled]),select')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  };
 }
 root.addEventListener('click',e=>{if(e.target.closest('[data-period-toggle]'))open();const shift=e.target.closest('[data-period-shift]');if(shift){const p=getPeriod(),offset=Number(shift.dataset.periodShift);apply({start:shiftMonth(p.start,offset),end:shiftMonth(p.end,offset)});}});
 window.addEventListener?.('resize',()=>close(false));
 return {renderTrigger,close};
}
