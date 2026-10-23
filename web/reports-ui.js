import {donutSvg} from './vector-charts.js?v=vpo-75';
import {createReportPeriod} from './report-period.js?v=vpo-34';
import {categoryBudgetDetails} from './budget-progress.js?v=vpo-34';
import {categoryIcon} from './category-icons.js?v=vpo-43';
import {formatMoney,groupsFor,monthlyCategoryTotals} from './core.js?v=vpo-73';
import {reportChartHeight,incomeMonthWindow} from './report-layout.js?v=vpo-74';
import {buildReports} from './reports-core.js?v=vpo-73';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const colors=['#7446ff','#8d7afa','#54ba9b','#dbac59','#bca2ef','#dc779d','#58a8c9','#a9c66c'];
const dateLabel=m=>new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric'}).format(new Date(m+'-15T12:00:00'));
const fullMonth=m=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(m+'-15T12:00:00'));
const axisMoney=n=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(n/100);

export function chartSvg(series,{kind='income',dimensions=[],selected,format=formatMoney,hidden=false,compact=false,width=compact?320:620,height=compact?232:256}={}){
  const display=value=>hidden?'••••':format(value);
  // Match the drawing coordinates to CSS pixels, so a wide screen adds space
  // between months instead of enlarging the typography and the bars.
  const n=series.length,w=Math.max(200,Math.round(width)),h=Math.max(112,Math.round(height)),left=compact?43:52,right=16,top=14,bottom=h-48,slot=(w-left-right)/Math.max(n,1);
  const values=series.flatMap(r=>kind==='income'?[r.income,r.expense]:kind==='spending'?[r.filteredExpense]:kind==='wealth'?[r.wealth.assets,r.wealth.debt,r.wealth.netWorth]:[r.age.days]).filter(v=>v!==null&&Number.isFinite(v));
  const min=Math.min(0,...values),max=Math.max(kind==='age'?10:100,...values),rough=(max-min)/4,magnitude=10**Math.floor(Math.log10(rough)),fraction=rough/magnitude;
  const nice=([1,2,2.5,5,10].find(value=>value>=fraction)||10)*magnitude;
  const step=kind==='age'?Math.max(1,Math.ceil(nice)):Math.max(.01,nice),lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step;
  const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top),zero=y(0),x=i=>left+slot*(i+.5),lineValue=r=>kind==='wealth'?r.wealth.netWorth:r.age.days;
  const label=v=>hidden?'•••':kind==='age'?String(Math.round(v)):axisMoney(v);
  let svg=`<svg class="report-svg" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility" role="group" aria-label="${{income:'Receitas e despesas por mês',spending:'Evolução dos gastos',wealth:'Ativos, dívidas e patrimônio líquido',age:'Estimativa da idade do dinheiro'}[kind]}. Selecione um mês para ver os valores." style="max-width:100%">`;
  for(let k=0;k<=Math.round((hi-lo)/step);k++){const value=lo+step*k,yy=y(value);svg+=`<line x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}" stroke="#eeedf4"/><text x="${left-9}" y="${yy+3.5}" text-anchor="end" font-size="10.5" fill="#87899c" font-family="inherit">${label(value)}</text>`;}
  svg+=`<line x1="${left}" x2="${w-right}" y1="${zero}" y2="${zero}" stroke="#c9cbdc" stroke-width="1"/>`;
  for(const [i,r] of series.entries()){
    const xx=x(i),bw=Math.min(32,slot*.24),isSelected=r.month===selected,highlight=Math.min(100,slot*.82);
    if(isSelected)svg+=`<rect x="${xx-highlight/2}" y="${top}" width="${highlight}" height="${bottom-top}" fill="#f7f6fc" rx="7"/>`;
    if(kind==='income'||kind==='wealth'){
      const pairs=kind==='income'?[[r.income,'#41b98d'],[r.expense,'#545bfe']]:[[r.wealth.assets,'#7446ff'],[r.wealth.debt,'#d85c6a']];
      for(const [j,[value,color]] of pairs.entries())if(value!==null&&value>0)svg+=`<rect x="${xx+(j===0?-bw-2:2)}" y="${y(value)}" width="${bw}" height="${Math.max(0,zero-y(value))}" rx="3" fill="${color}"/>`;
    }else if(kind==='spending'){
      const barWidth=Math.min(52,slot*.55);let running=0;for(const [j,d] of dimensions.entries()){const value=r.stacks[d.id]||0;if(value)svg+=`<rect x="${xx-barWidth/2}" y="${y(running+value)}" width="${barWidth}" height="${y(running)-y(running+value)}" fill="${colors[j%colors.length]}"/>`;running+=value;}
    }
    const showLabel=i%Math.max(1,Math.ceil(n/Math.max(1,(w-left-right)/42)))===0||i===n-1;
    if(showLabel)svg+=`<text x="${xx}" y="${bottom+23}" text-anchor="middle" font-size="11" fill="${isSelected?'#6456c6':'#78798e'}" font-weight="${isSelected?'600':'450'}" font-family="inherit">${esc(new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date(r.month+'-15T12:00:00')).replace('.',''))}</text><text x="${xx}" y="${bottom+38}" text-anchor="middle" font-size="9" fill="#a0a0b0" font-family="inherit">${r.month.slice(0,4)}</text>`;
  }
  if(kind==='wealth'||kind==='age'){
    let path='';let connected=false;
    for(const [i,r] of series.entries()){const value=lineValue(r);if(value===null){connected=false;continue;}path+=`${connected?'L':'M'}${x(i)},${y(value)} `;connected=true;}
    svg+=`<path d="${path}" stroke="#545bfe" stroke-width="2.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    for(const [i,r] of series.entries())if(lineValue(r)!==null)svg+=`<circle cx="${x(i)}" cy="${y(lineValue(r))}" r="${r.month===selected?5:3.5}" fill="#545bfe" stroke="white" stroke-width="2"/>`;
  }
  for(const [i,r] of series.entries()){
    const detail=kind==='income'?`Receitas ${display(r.income)}, despesas ${display(r.expense)}`:kind==='spending'?`Gastos ${display(r.filteredExpense)}`:kind==='wealth'?r.wealth.known?`Patrimônio ${display(r.wealth.netWorth)}`:'Patrimônio não informado':r.age.days===null?'Histórico insuficiente':`Idade estimada ${hidden?'oculta':r.age.days} dias`;
    svg+=`<g role="button" tabindex="0" data-report-month="${r.month}" aria-label="${esc(fullMonth(r.month)+': '+detail)}" aria-pressed="${r.month===selected}"><rect x="${x(i)-slot*.45}" y="${top}" width="${slot*.9}" height="${bottom-top+44}" fill="transparent"/><title>${esc(fullMonth(r.month)+': '+detail)}</title></g>`;
  }
  return svg+'</svg>';
}

export function createReportsUI({root,getState,getEndMonth,onEditWealth,onTogglePrivacy=()=>{},notify}){
  const tabs=[['breakdown','Distribuição dos gastos'],['spending','Evolução dos gastos'],['wealth','Patrimônio'],['income','Receitas × despesas'],['age','Idade do dinheiro']];
  let period={start:getEndMonth(),end:getEndMonth()},group='all',tab='breakdown',picked=null,categoryDetail=null,lastData=null,breakdownMode='categories',categoryFilter='all',incomeDetail=null,mobileDetail=false,filtersOpen=false,incomeStart=null,layoutFrame=null;
  const Resize=window.ResizeObserver||globalThis.ResizeObserver;
  const chartObserver=typeof Resize==='function'?new Resize(entries=>{for(const entry of entries)fitChart(entry.target,entry.contentRect.width);}):null;
  const compactView=()=>window.matchMedia('(max-width:719px)').matches;
  const contentWidth=()=>root.clientWidth||(compactView()?390:1200);
  const viewportHeight=()=>window.visualViewport?.height||window.innerHeight||0;
  const boxHeight=el=>{if(!el)return 0;const style=globalThis.getComputedStyle?.(el);return (el.getBoundingClientRect?.().height||0)+(parseFloat(style?.marginTop)||0)+(parseFloat(style?.marginBottom)||0);};
  function spaceAfter(container){
    const card=container.closest('article'),panels=root.querySelector('.report-panels');let after=compactView()?100:20;
    for(let next=container.nextElementSibling;next;next=next.nextElementSibling)after+=boxHeight(next);
    after+=parseFloat(globalThis.getComputedStyle?.(card)?.paddingBottom)||16;
    if(card?.parentElement===panels)for(const extra of panels.children)if(extra!==card)after+=boxHeight(extra)+10;
    return after;
  }
  function fitChart(container,width=container.clientWidth){
    if(!lastData||!width)return;
    const kind=container.dataset.chartKind,compact=compactView(),top=container.getBoundingClientRect?.().top||0;
    const height=reportChartHeight({viewportHeight:viewportHeight(),top,after:spaceAfter(container),compact});
    if(Math.abs(Number(container.dataset.chartWidth||0)-width)<1&&Number(container.dataset.chartHeight)===height)return;
    container.dataset.chartWidth=String(width);container.dataset.chartHeight=String(height);
    const series=kind==='income'?lastData.series.map(row=>({...row,expense:row.filteredExpense,net:row.income-row.filteredExpense})):lastData.series;
    const focus=container.contains(document.activeElement)?document.activeElement.dataset.reportMonth:null;
    container.innerHTML=chartSvg(series,{kind,dimensions:lastData.dimensions,selected:picked,format:m,hidden:getState().hideBalances,compact,width,height});
    if(focus)container.querySelector(`[data-report-month="${focus}"]`)?.focus({preventScroll:true});
  }
  function fitTables(){
    for(const container of root.querySelectorAll?.('.report-table-scroll')||[]){
      const headers=[...container.querySelectorAll('thead th')].map(th=>th.textContent);
      for(const row of container.querySelectorAll('tbody tr,tfoot tr'))for(const [i,cell] of [...row.children].entries())if(cell.tagName==='TD')cell.dataset.label=headers[i]||'';
      if(viewportHeight()&&container.getBoundingClientRect){const remaining=viewportHeight()-Math.max(0,container.getBoundingClientRect().top)-spaceAfter(container);container.style.setProperty('--report-table-height',Math.max(140,Math.floor(remaining))+'px');}
    }
  }
  function fitBreakdown(){
    const card=root.querySelector('.breakdown-chart'),donut=card?.querySelector('.donut');if(!card?.clientWidth||!donut)return;
    const head=boxHeight(card.querySelector('.report-chart-heading')),padding=36;
    const after=(compactView()?100:20)+boxHeight(root.querySelector('.report-planned'))+10;
    const available=viewportHeight()?viewportHeight()-Math.max(0,card.getBoundingClientRect().top)-head-padding-after:320;
    const size=Math.floor(Math.max(120,Math.min(320,card.clientWidth-padding,available)));
    root.style.setProperty('--report-donut-size',size+'px');root.style.setProperty('--report-ranking-height',Math.max(112,size+head-80)+'px');
  }
  function fitCharts(){
    chartObserver?.disconnect();
    for(const container of root.querySelectorAll?.('[data-chart-kind]')||[]){fitChart(container);chartObserver?.observe(container);}
    fitBreakdown();fitTables();
  }
  function queueLayout(){
    if(layoutFrame!==null)return;
    const fit=()=>{layoutFrame=null;const matrix=root.querySelector('.income-matrix');if(tab==='income'&&matrix&&lastData){const next=incomeMonthWindow(lastData.series.length,contentWidth(),incomeStart);if(Number(matrix.dataset.monthColumns)!==next.count){render();return;}}fitCharts();};
    if(window.requestAnimationFrame)layoutFrame=window.requestAnimationFrame(fit);else fit();
  }
  const periodPicker=createReportPeriod({root,getPeriod:()=>period,onApply:next=>{period=next;picked=null;incomeDetail=null;incomeStart=null;render();},getBounds:()=>{const s=getState(),months=Object.values(s.months).flatMap(m=>m.transactions.map(t=>t.date.slice(0,7))).concat(Object.keys(s.wealth||{})).sort();return {start:months[0]||period.end,end:months.at(-1)||period.end};}});
  const m=n=>getState().hideBalances?'••••':formatMoney(n);
  const pct=n=>getState().hideBalances?'••':n===null?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n)+'%';
  const filterIds=()=>categoryFilter==='all'?null:[categoryFilter];
  const filteredTabs=()=>['breakdown','spending','income'].includes(tab);
  const transactions=data=>Object.values(getState().months).flatMap(month=>month.transactions).filter(t=>t.date.slice(0,7)>=data.start&&t.date.slice(0,7)<=data.end);
  const metric=(label,value,extra='')=>`<div class="report-stat"><span>${label}</span><strong>${value}</strong>${extra?`<small>${extra}</small>`:''}</div>`;
  const empty=(title,text,button='')=>`<div class="report-empty">${icon('chart')}<h3>${title}</h3><p>${text}</p>${button}</div>`;
  function transactionList(txs,label){return `<section class="report-transactions" aria-label="Lançamentos detalhados"><h3>${esc(label)}</h3><p>${txs.length} lançamento${txs.length===1?'':'s'} no período</p>${txs.length?txs.sort((a,b)=>b.date.localeCompare(a.date)).map(t=>`<button data-edit-tx="${esc(t.id)}"><span><strong>${esc(t.payee||t.description)}</strong><small>${t.date.split('-').reverse().join('/')}${t.memo?' · '+esc(t.memo):''}</small></span><strong>${m(t.amount)}</strong>${icon('chevron')}</button>`).join(''):'<p class="report-note">Nenhum lançamento neste recorte.</p>'}</section>`;}
  function legend(entries){return `<div class="report-legend">${entries.map(([label,color,id])=>id?`<button type="button" data-report-group="${esc(id)}"><i style="background:${color}"></i>${esc(label)}</button>`:`<span><i style="background:${color}"></i>${esc(label)}</span>`).join('')}</div>`;}
  function graph(data,kind){
    const compact=window.matchMedia('(max-width:719px)').matches,row=data.series.find(r=>r.month===picked)||data.series.at(-1);
    const svg=chartSvg(data.series,{kind,dimensions:data.dimensions,selected:row.month,format:m,hidden:getState().hideBalances,compact});
    const point=kind==='income'?`<span>Receitas <strong class="positive">${m(row.income)}</strong></span><span>Despesas <strong>${m(row.filteredExpense)}</strong></span><span>Resultado <strong>${m(row.income-row.filteredExpense)}</strong></span>`:kind==='spending'?`<span>Gastos <strong>${m(row.filteredExpense)}</strong></span>`:kind==='wealth'?row.wealth.known?`<span>Ativos <strong>${m(row.wealth.assets)}</strong></span><span>Dívidas <strong>${m(row.wealth.debt)}</strong></span><span>Líquido <strong>${m(row.wealth.netWorth)}</strong></span>`:'<span>Patrimônio não informado neste mês.</span>':`<span>${row.age.days===null?'Histórico insuficiente':`Idade estimada <strong>${getState().hideBalances?'••':row.age.days} dias</strong>`}</span>`;
    const entries=kind==='income'?[['Receitas','#41b98d'],['Despesas','#7446ff']]:kind==='wealth'?[['Ativos','#7446ff'],['Dívidas','#d85c6a'],['Patrimônio líquido','#545bfe']]:kind==='spending'?data.dimensions.map((d,i)=>[d.name,colors[i%colors.length],group==='all'?d.id:null]):[['Dias estimados','#7446ff']];
    return `${legend(entries)}<div class="report-chart-scroll" data-chart-kind="${kind}">${svg}</div><div class="report-point ${kind==='wealth'&&row.month===data.end?'is-latest-wealth':''}"><strong>${esc(fullMonth(row.month))}</strong><div>${point}</div></div>`;
  }
  function plannedSpending(){
    const s=getState(),month=period.end,cats=s.categories.filter(c=>{const t=monthlyCategoryTotals(s,month,c.id);return (group==='all'||c.group===group)&&(categoryFilter==='all'||c.id===categoryFilter)&&(t.assigned||t.spent);});
    return `<details class="report-planned"><summary>Consumo do planejado</summary><p class="report-note">${esc(fullMonth(month))}: planejado, gasto e restante das categorias, somente deste mês.</p>${cats.length?cats.map(c=>`<div class="planned-spending-row"><strong>${esc(categoryIcon(c.name))} ${esc(c.name)}</strong>${categoryBudgetDetails(c,monthlyCategoryTotals(s,month,c.id),s.hideBalances)}</div>`).join(''):empty('Nenhum valor neste mês.','Defina o planejado nas categorias para acompanhar o consumo.')}</details>`;
  }
  function breakdown(data){
    const entries=breakdownMode==='groups'?data.groupSpending:data.spending;
    const selected=data.spending.find(c=>c.id===categoryDetail);
    return `<div class="report-breakdown-grid"><article class="overview-card report-card breakdown-chart"><header class="report-chart-heading">${metric('Gastos no período',m(data.filteredExpense))}<div class="report-segmented" role="group" aria-label="Agrupar distribuição"><button data-breakdown-mode="categories" aria-pressed="${breakdownMode==='categories'}">Categorias</button><button data-breakdown-mode="groups" aria-pressed="${breakdownMode==='groups'}">Grupos</button></div></header>${entries.length?`<div class="donut" role="img" aria-label="Gastos no período ${m(data.filteredExpense)}; detalhamento ao lado" >${donutSvg(entries.map(c=>c.spent),colors)}<div class="donut-center"><span>Total de gastos</span><strong>${m(data.filteredExpense)}</strong></div></div>`:empty('Nenhuma despesa neste filtro.','Escolha outro período, grupo ou categoria.')}</article><article class="overview-card report-card breakdown-ranking"><header><h3>${breakdownMode==='groups'?'Grupos':'Categorias'}</h3><span>Total gasto</span></header><div class="spending-legend">${entries.map((c,i)=>`<button class="report-ranking-row ${categoryDetail===c.id?'selected':''}" ${breakdownMode==='groups'?`data-report-group="${esc(c.id)}"`:`data-report-category="${esc(c.id)}" aria-expanded="${categoryDetail===c.id}"`}><span><i style="background:${colors[i%colors.length]}"></i>${esc(c.name)}</span><strong>${m(c.spent)}</strong><span class="report-rank-track"><i style="width:${c.spent/data.filteredExpense*100}%;background:${colors[i%colors.length]}"></i></span><small>${pct(c.spent/data.filteredExpense*100)}</small></button>`).join('')||'<p class="report-note">Sem gastos no período.</p>'}</div><p class="report-note">${breakdownMode==='groups'?'Selecione um grupo para ver suas categorias.':'Selecione uma categoria para ver e editar os lançamentos.'}</p>${selected?transactionList(transactions(data).filter(t=>t.type==='expense'&&t.categoryId===selected.id),selected.name):''}</article></div>${plannedSpending()}`;
  }
  function spending(data){
    const average=data.filteredExpense/data.series.length;
    return `<article class="overview-card report-card"><div class="report-stat-row">${metric('Média mensal de gastos',m(average))}${metric('Total gasto',m(data.filteredExpense))}</div>${data.filteredExpense?graph(data,'spending'):empty('Ainda não há gastos para comparar.','Os lançamentos do período aparecerão aqui.')}</article><details class="report-extra report-table-details"><summary>Ver gastos por mês</summary><article class="overview-card report-card report-table-card"><div class="report-table-scroll" role="region" tabindex="0" aria-label="Gastos por mês"><table><caption>Evolução dos gastos no período selecionado</caption><thead><tr><th>Mês</th><th>Total gasto</th><th>Comparação com a média</th></tr></thead><tbody>${data.series.map(r=>`<tr><th><button data-report-month="${r.month}">${esc(fullMonth(r.month))}</button></th><td>${m(r.filteredExpense)}</td><td>${m(r.filteredExpense-average)} <small>(${pct(average?(r.filteredExpense-average)/average*100:null)})</small></td></tr>`).join('')}</tbody><tfoot><tr><th>Total / média</th><td>${m(data.filteredExpense)}</td><td>${m(average)} por mês</td></tr></tfoot></table></div></article></details>`;
  }
  function wealth(data){
    const known=data.series.filter(r=>r.wealth.known),first=known[0]?.wealth,latest=data.wealth,change=latest.known&&first?latest.netWorth-first.netWorth:null,percent=first?.netWorth?change/Math.abs(first.netWorth)*100:null;
    return `<article class="overview-card report-card"><header class="report-chart-heading">${metric('Patrimônio líquido',latest.known?m(latest.netWorth):'Não informado',change===null?'':`Variação: ${m(change)} · ${pct(percent)}`)}<button class="subtle-button" data-report-wealth aria-label="Informar valores">${icon('edit')}<span>Informar valores</span></button></header>${known.length?`<div class="report-stat-row wealth-stats">${metric('Ativos',m(latest.assets))}${metric('Dívidas',m(latest.debt))}</div>${graph(data,'wealth')}`:empty('Complete seu patrimônio.','Informe os ativos fora do plano e suas dívidas para acompanhar a evolução. O dinheiro do plano será incluído uma única vez.',`<button class="btn btn-blue" data-report-wealth>Informar ativos e dívidas ${icon('plus')}</button>`)}</article>${known.length?`<details class="report-extra report-table-details"><summary>Ver detalhes do patrimônio</summary><p class="report-note">O saldo do plano já está incluído. Bens, investimentos e dívidas externos usam os valores informados, mantidos até sua próxima atualização.</p><article class="overview-card report-card report-table-card"><div class="report-table-scroll" role="region" tabindex="0" aria-label="Patrimônio por mês"><table><caption>Patrimônio e variação mensal</caption><thead><tr><th>Mês</th><th>Ativos</th><th>Dívidas</th><th>Patrimônio</th><th>Variação mensal</th></tr></thead><tbody>${data.series.map((r,i)=>{const previous=data.series[i-1]?.wealth;return `<tr><th>${esc(fullMonth(r.month))}</th><td>${r.wealth.known?m(r.wealth.assets):'Não informado'}</td><td>${r.wealth.known?m(r.wealth.debt):'—'}</td><td>${r.wealth.known?m(r.wealth.netWorth):'—'}</td><td>${r.wealth.known&&previous?.known?m(r.wealth.netWorth-previous.netWorth):'—'}</td></tr>`;}).join('')}</tbody></table></div></article></details>`:''}`;
  }
  function income(data){
    const n=data.series.length,expense=data.filteredExpense,net=data.income-expense;
    const monthWindow=incomeMonthWindow(n,contentWidth(),incomeStart);incomeStart=monthWindow.start;
    const months=data.series.slice(monthWindow.start,monthWindow.end),visible=values=>values.slice(monthWindow.start,monthWindow.end);
    const navigation=n>monthWindow.count?`<div class="income-month-navigation"><button type="button" data-income-month-page="-1" aria-label="Ver meses anteriores" ${monthWindow.start===0?'disabled':''}>‹</button><span>${esc(dateLabel(months[0].month))}${months.length>1?' a '+esc(dateLabel(months.at(-1).month)):''} · ${n} meses no período</span><button type="button" data-income-month-page="1" aria-label="Ver meses seguintes" ${monthWindow.end===n?'disabled':''}>›</button></div>`:'';
    const cells=(values,kind,key,sign=1)=>visible(values).map((v,i)=>`<td><button data-income-detail="${kind}" data-income-key="${esc(key)}" data-income-month="${months[i].month}">${m(v*sign)}</button></td>`).join('')+`<td>${m(values.reduce((a,v)=>a+v,0)/n*sign)}</td><td>${m(values.reduce((a,v)=>a+v,0)*sign)}</td>`;
    const totalCells=(values,sign=1)=>visible(values).map(v=>`<td>${m(v*sign)}</td>`).join('')+`<td>${m(values.reduce((a,v)=>a+v,0)/n*sign)}</td><td>${m(values.reduce((a,v)=>a+v,0)*sign)}</td>`;
    const count=months.length+3;
    let detail='';if(incomeDetail){const txs=transactions(data).filter(t=>(!incomeDetail.month||t.date.slice(0,7)===incomeDetail.month)&&(incomeDetail.kind==='income'?t.type==='income'&&(t.payee||t.description)===incomeDetail.key:t.type==='expense'&&t.categoryId===incomeDetail.key));detail=transactionList(txs,incomeDetail.kind==='income'?incomeDetail.key:getState().categories.find(c=>c.id===incomeDetail.key)?.name||'Lançamentos');}
    return `<article class="overview-card report-card income-table-card"><div class="report-stat-row">${metric('Receitas do período',m(data.income))}${metric('Despesas do período',m(expense))}${metric('Resultado do período',m(net))}</div>${navigation}<div class="report-table-scroll" role="region" tabindex="0" aria-label="Receitas e despesas por origem, categoria e mês"><table class="income-matrix" data-month-columns="${monthWindow.count}"><caption>Receitas e despesas: meses, média mensal e total</caption><thead><tr><th>Origem / categoria</th>${months.map(r=>`<th>${esc(dateLabel(r.month))}</th>`).join('')}<th>Média</th><th>Total</th></tr></thead><tbody><tr class="report-section-row income-section"><th colspan="${count}">Receitas</th></tr>${data.incomeRows.map(r=>`<tr><th scope="row">${esc(r.name)}</th>${cells(r.values,'income',r.name)}</tr>`).join('')}<tr class="report-subtotal"><th>Total de receitas</th>${totalCells(data.series.map(r=>r.income))}</tr><tr class="report-section-row expense-section"><th colspan="${count}">Despesas</th></tr>${data.expenseGroups.map(g=>`<tr class="report-group-row"><th colspan="${count}"><button data-income-collapse="${esc(g.id)}" aria-expanded="true">⌄ ${esc(g.name)}</button></th></tr>${g.rows.map(c=>`<tr data-income-group="${esc(g.id)}"><th scope="row">${esc(categoryIcon(c.name))} ${esc(c.name)}</th>${cells(c.values,'expense',c.id,-1)}</tr>`).join('')}<tr class="report-subtotal"><th>Total ${esc(g.name)}</th>${totalCells(data.series.map((_,i)=>g.rows.reduce((a,c)=>a+c.values[i],0)),-1)}</tr>`).join('')}<tr class="report-subtotal"><th>Total de despesas</th>${totalCells(data.series.map(r=>r.filteredExpense),-1)}</tr></tbody><tfoot><tr><th>Resultado líquido</th>${months.map(r=>`<td class="${r.income-r.filteredExpense<0?'negative':'positive'}">${m(r.income-r.filteredExpense)}</td>`).join('')}<td>${m(net/n)}</td><td class="${net<0?'negative':'positive'}">${m(net)}</td></tr></tfoot></table></div><p class="report-note">Clique em um valor para ver os lançamentos. A média considera ${n===1?'o mês selecionado':`os ${n} meses do período`}, incluindo meses sem movimentação.</p>${detail}</article><details class="report-extra"><summary>Ver gráfico de receitas e despesas</summary><article class="overview-card report-card">${graph({...data,series:data.series.map(r=>({...r,expense:r.filteredExpense,net:r.income-r.filteredExpense}))},'income')}</article></details>`;
  }
  function age(data){
    const available=data.series.some(r=>r.age.days!==null),a=data.age;
    return `<article class="overview-card report-card"><header class="report-chart-heading">${metric('Idade do dinheiro',a.days===null?'Histórico em formação':(getState().hideBalances?'••':a.days)+' dias')}<span class="report-estimate">Estimativa</span></header>${available?graph(data,'age'):empty('Seu histórico está em formação.','São necessárias 10 saídas com origem do dinheiro identificada. Continue registrando normalmente; não é preciso gastar mais para preencher o gráfico.')}<div class="report-age-status ${a.days!==null?'is-known':''}"><strong>${a.days===null?'—':getState().hideBalances?'••':a.days}</strong><span>${a.days===null?`${Math.min(a.outflowCount,10)} de 10 saídas registradas`:'dias estimados'}</span></div></article><details class="report-extra"><summary>Entenda a idade do dinheiro</summary><p class="report-note">Mostra o tempo médio entre receber e gastar, usando as 10 últimas saídas com dinheiro de origem identificada.</p><details class="report-data"><summary>Como calculamos esta estimativa</summary><p class="report-note">As entradas mais antigas financiam as próximas saídas. A idade de cada saída é ponderada pelos valores usados de cada entrada; o indicador é a média das 10 últimas saídas. Se faltar uma entrada que explique a origem do dinheiro, o resultado não é exibido.</p><p class="report-note">Este app ainda trata os lançamentos como dinheiro à vista, sem distinguir contas de crédito, transferências ou saldos iniciais. Por isso, esta estimativa pode diferir do indicador oficial do YNAB.</p></details></details>`;
  }
  function mobileSummary(data){
    const rows=data.series.slice(-6),max=Math.max(1,...rows.flatMap(r=>[r.income,r.expense]));
    const statement=data.income===0&&data.expense===0?'Seu histórico começa com o próximo lançamento.':data.expense>data.income?'Você gastou mais do que recebeu neste período.':data.expense===data.income?'Entradas e saídas ficaram em equilíbrio.':'Você recebeu mais do que gastou neste período.';
    let running=0;let segments=data.spending.slice(0,5).map((c,i)=>{const start=running;running+=c.spent/data.filteredExpense*100;return `<i style="width:${running-start}%;background:${colors[i%colors.length]}"></i>`;}).join('');if(running<100&&data.filteredExpense)segments+=`<i style="width:${100-running}%;background:#d8d1f4" title="Outras categorias"></i>`;
    return `<section class="mobile-reflect"><header><h1>Visão geral</h1><button class="icon-button" data-report-privacy aria-label="${getState().hideBalances?'Mostrar valores':'Ocultar valores'}">${icon(getState().hideBalances?'eye-off':'eye')}</button></header><article class="mobile-reflect-card"><button type="button" class="mobile-reflect-title" data-mobile-report="breakdown">${icon('chart')} Distribuição dos gastos ${icon('chevron')}</button><p class="mobile-reflect-period">${esc(fullMonth(data.end))}</p><strong class="mobile-reflect-value">${m(data.filteredExpense)}</strong><div class="mobile-spending-strip" role="img" aria-label="Distribuição dos gastos por categoria">${segments}</div><div class="mobile-reflect-list"><div><span>Principais categorias</span><span>Gasto</span></div>${data.spending.slice(0,3).map((c,i)=>`<button type="button" data-mobile-report="breakdown"><span><i style="background:${colors[i%colors.length]}"></i>${esc(categoryIcon(c.name))} ${esc(c.name)}</span><strong>${m(c.spent)}</strong></button>`).join('')||'<p>Ainda não há gastos neste período.</p>'}</div></article><article class="mobile-reflect-card"><button type="button" class="mobile-reflect-title" data-mobile-report="income">${icon('nav-bars')} Entradas × saídas ${icon('chevron')}</button><h2>${statement}</h2><div class="mobile-mini-bars" role="img" aria-label="Receitas e despesas nos meses do período">${rows.map(r=>`<div><span class="mini-bar-pair"><i class="mini-income" style="height:${r.income/max*100}%"></i><i class="mini-expense" style="height:${r.expense/max*100}%"></i></span><small>${esc(dateLabel(r.month))}</small></div>`).join('')}</div><div class="mobile-mini-legend"><span><i></i>Entradas ${m(data.income)}</span><span><i></i>Saídas ${m(data.expense)}</span></div></article><article class="mobile-reflect-card"><button type="button" class="mobile-reflect-title" data-mobile-report="wealth">${icon('wallet')} Patrimônio ${icon('chevron')}</button><strong class="mobile-reflect-value">${data.wealth.known?m(data.wealth.netWorth):'Completar informações'}</strong><p>Ativos menos dívidas, incluindo o saldo do plano.</p></article><article class="mobile-reflect-card"><button type="button" class="mobile-reflect-title" data-mobile-report="age">${icon('calendar')} Idade do dinheiro ${icon('chevron')}</button><strong class="mobile-reflect-value">${data.age.days===null?'Histórico em formação':getState().hideBalances?'••':data.age.days+' dias'}</strong><p>Estimativa do tempo entre receber e gastar.</p></article></section>`;
  }
  function render(){
    periodPicker.close(false);
    const state=getState();if(group!=='all'&&!groupsFor(state).some(g=>g.id===group))group='all';if(categoryFilter!=='all'&&!state.categories.some(c=>c.id===categoryFilter&&(group==='all'||c.group===group)))categoryFilter='all';
    const data=buildReports(state,period.end,1,filteredTabs()?group:'all',{startMonth:period.start,categoryIds:filteredTabs()?filterIds():null});lastData=data;
    if(!data.series.some(r=>r.month===picked))picked=data.end;if(!data.spending.some(c=>c.id===categoryDetail))categoryDetail=null;
    const title=tabs.find(([key])=>key===tab)?.[1]||tabs[0][1];
    const compact=window.matchMedia('(max-width:719px)').matches;
    const summaryData=compact&&!mobileDetail?buildReports(state,period.end,1,'all',{startMonth:period.start}):null;
    root.innerHTML=`${summaryData?mobileSummary(summaryData):''}<div class="report-detail ${mobileDetail?'mobile-detail-open':''}"><button type="button" class="mobile-report-back" data-mobile-report-back>‹ Visão geral</button><div class="report-tabs" role="tablist" aria-label="Relatórios financeiros">${tabs.map(([key,label])=>`<button type="button" id="report-tab-${key}" role="tab" aria-selected="${tab===key}" aria-controls="report-panel" tabindex="${tab===key?'0':'-1'}" data-report-tab="${key}" class="${tab===key?'active':''}">${label}</button>`).join('')}</div><label class="report-tab-select"><select id="report-view-select" aria-label="Relatório">${tabs.map(([key,label])=>`<option value="${key}" ${tab===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="report-page-heading"><h2>${title}</h2><div class="report-heading-actions"><button type="button" class="icon-button" data-report-privacy aria-label="${state.hideBalances?'Mostrar valores':'Ocultar valores'}">${icon(state.hideBalances?'eye-off':'eye')}</button><button class="text-link" data-report-export>${icon('download')} Exportar</button></div></div><div class="reports-toolbar">${periodPicker.renderTrigger()}${filteredTabs()?`<button type="button" class="report-filter-toggle" data-report-filters aria-expanded="${filtersOpen}" aria-controls="report-filter-fields">Filtros${group!=='all'||categoryFilter!=='all'?' · ativos':''}</button><div id="report-filter-fields" class="report-filter-fields ${filtersOpen?'is-open':''}"><label><span>Grupo</span><select id="report-group"><option value="all">Todos os grupos</option>${groupsFor(state).map(g=>`<option value="${esc(g.id)}" ${group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><label><span>Categoria</span><select id="report-category-filter"><option value="all">Todas as categorias</option>${state.categories.filter(c=>group==='all'||c.group===group).map(c=>`<option value="${esc(c.id)}" ${categoryFilter===c.id?'selected':''}>${esc(c.name)}${c.hidden?' (oculta)':''}</option>`).join('')}</select></label><button type="button" class="report-filter-done" data-report-filters>Concluir filtros ✓</button></div>`:''}</div><div class="report-period-note"><span>${esc(fullMonth(data.start))}${data.start===data.end?'':' a '+esc(fullMonth(data.end))}</span><small>${icon('lock')} Dados do seu plano</small></div>${filteredTabs()&&(group!=='all'||categoryFilter!=='all')?'<p class="report-scope">Filtro aplicado às despesas. As receitas consideram todas as origens do plano.</p>':''}<div id="report-panel" class="report-panels" role="tabpanel" aria-labelledby="report-tab-${tab}">${tab==='breakdown'?breakdown(data):tab==='spending'?spending(data):tab==='wealth'?wealth(data):tab==='income'?income(data):age(data)}</div></div>`;
    fitCharts();queueLayout();
  }
  function selectTab(key,focus=true){if(!tabs.some(([id])=>id===key))return;tab=key;mobileDetail=true;incomeDetail=null;render();const button=root.querySelector(`#report-tab-${tab}`);if(focus)button?.focus({preventScroll:true});button?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'smooth'});}
  function exportData(){
    const d=lastData;if(!d)return;const number=n=>n===null?'':(n/100).toFixed(2).replace('.',',');let rows;
    if(tab==='income')rows=[['Origem / categoria',...d.series.map(r=>r.month),'Média mensal','Total'],...d.incomeRows.map(r=>[r.name,...r.values.map(number),number(r.total/d.series.length),number(r.total)]),...d.expenseGroups.flatMap(g=>g.rows.map(c=>[g.name+' / '+c.name,...c.values.map(v=>number(-v)),number(-c.total/d.series.length),number(-c.total)])),['Resultado líquido',...d.series.map(r=>number(r.income-r.filteredExpense)),number((d.income-d.filteredExpense)/d.series.length),number(d.income-d.filteredExpense)]];
    else if(tab==='breakdown')rows=[['Grupo','Categoria','Gasto','Participação (%)'],...d.spending.map(c=>[groupsFor(getState()).find(g=>g.id===c.group)?.name||'',c.name,number(c.spent),(c.spent/d.filteredExpense*100).toFixed(2).replace('.',',')])];
    else if(tab==='wealth')rows=[['Mês','Ativos','Dívidas','Patrimônio líquido'],...d.series.map(r=>[r.month,number(r.wealth.assets),number(r.wealth.debt),number(r.wealth.netWorth)])];
    else if(tab==='age')rows=[['Mês','Idade estimada (dias)','Saídas registradas'],...d.series.map(r=>[r.month,r.age.days??'',r.age.outflowCount])];
    else rows=[['Mês','Gastos','Média mensal','Diferença da média'],...d.series.map(r=>[r.month,number(r.filteredExpense),number(d.filteredExpense/d.series.length),number(r.filteredExpense-d.filteredExpense/d.series.length)])];
    const safe=v=>{const s=String(v);return /^[=+@\t\r]/.test(s)||/^-\D/.test(s)?"'"+s:s;};
    const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+safe(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`${tab}-${d.start}-a-${d.end}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Relatório desta aba preparado para download.');
  }
  root.addEventListener('change',e=>{
    if(e.target.id==='report-view-select'){selectTab(e.target.value,false);root.querySelector('#report-view-select')?.focus({preventScroll:true});return;}
    if(e.target.id==='report-group'){group=e.target.value;categoryFilter='all';categoryDetail=null;incomeDetail=null;render();root.querySelector('#report-group')?.focus({preventScroll:true});}
    if(e.target.id==='report-category-filter'){categoryFilter=e.target.value;categoryDetail=null;incomeDetail=null;render();root.querySelector('#report-category-filter')?.focus({preventScroll:true});}
  });
  root.addEventListener('click',e=>{
    if(e.target.closest('[data-report-filters]')){filtersOpen=!filtersOpen;render();root.querySelector('[data-report-filters]')?.focus({preventScroll:true});return;}
    const page=e.target.closest('[data-income-month-page]');if(page){const size=incomeMonthWindow(lastData.series.length,contentWidth(),incomeStart).count;incomeStart=Math.max(0,(incomeStart||0)+Number(page.dataset.incomeMonthPage)*size);render();return;}
    if(e.target.closest('[data-mobile-report-back]')){mobileDetail=false;render();root.querySelector('.mobile-reflect h1')?.scrollIntoView?.({block:'start'});return;}
    const mobileTab=e.target.closest('[data-mobile-report]');if(mobileTab){selectTab(mobileTab.dataset.mobileReport);return;}
    const nav=e.target.closest('[data-report-tab]');if(nav){selectTab(nav.dataset.reportTab);return;}
    const mode=e.target.closest('[data-breakdown-mode]');if(mode){breakdownMode=mode.dataset.breakdownMode;categoryDetail=null;render();root.querySelector(`[data-breakdown-mode="${breakdownMode}"]`)?.focus({preventScroll:true});return;}
    const groupButton=e.target.closest('[data-report-group]');if(groupButton){group=groupButton.dataset.reportGroup;categoryFilter='all';breakdownMode='categories';categoryDetail=null;render();return;}
    const month=e.target.closest('[data-report-month]');if(month){picked=month.dataset.reportMonth;render();return;}
    const category=e.target.closest('[data-report-category]');if(category){categoryDetail=categoryDetail===category.dataset.reportCategory?null:category.dataset.reportCategory;render();root.querySelector(`[data-report-category="${category.dataset.reportCategory}"]`)?.focus({preventScroll:true});return;}
    const cell=e.target.closest('[data-income-detail]');if(cell){incomeDetail={kind:cell.dataset.incomeDetail,key:cell.dataset.incomeKey,month:cell.dataset.incomeMonth};render();root.querySelector('.report-transactions')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});return;}
    const collapse=e.target.closest('[data-income-collapse]');if(collapse){const show=collapse.getAttribute('aria-expanded')!=='true';collapse.setAttribute('aria-expanded',String(show));collapse.textContent=(show?'⌄ ':'› ')+collapse.textContent.replace(/^[⌄›]\s*/,'');root.querySelectorAll('[data-income-group]').forEach(row=>{if(row.dataset.incomeGroup===collapse.dataset.incomeCollapse)row.hidden=!show;});return;}
    if(e.target.closest('[data-report-privacy]'))onTogglePrivacy();
    if(e.target.closest('[data-report-wealth]'))onEditWealth(period.end);if(e.target.closest('[data-report-export]'))exportData();
  });
  root.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const point=e.target.closest('[data-report-month]');if(point&&point.dataset.reportMonth!==picked){picked=point.dataset.reportMonth;render();}});
  root.addEventListener('keydown',e=>{
    const tabButton=e.target.closest('[role=tab]');if(tabButton&&['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const i=tabs.findIndex(([id])=>id===tab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectTab(tabs[next][0]);return;}
    const point=e.target.closest('[data-report-month]');if(point&&['Enter',' '].includes(e.key)){e.preventDefault();picked=point.dataset.reportMonth;render();root.querySelector(`[data-report-month="${picked}"]`)?.focus({preventScroll:true});}
  });
  root.addEventListener('toggle',queueLayout,true);
  window.addEventListener?.('resize',queueLayout);window.visualViewport?.addEventListener('resize',queueLayout);
  const media=window.matchMedia('(max-width:719px)');media.addEventListener?.('change',()=>render());
  return {render,resetMobile(){mobileDetail=false;}};
}
