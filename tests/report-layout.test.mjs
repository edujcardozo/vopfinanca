import test from 'node:test';
import assert from 'node:assert/strict';
import {reportChartHeight,incomeMonthWindow} from '../web/report-layout.js';
import {chartSvg} from '../web/reports-ui.js';
import {createState,saveTransaction} from '../web/core.js';
import {buildReports} from '../web/reports-core.js';

test('chart sizing reserves labels and summary space while adapting to short screens',()=>{
  assert.equal(reportChartHeight({viewportHeight:600,top:300,after:120}),180);
  assert.equal(reportChartHeight({viewportHeight:1080,top:300,after:120}),256);
  assert.equal(reportChartHeight({viewportHeight:390,top:250,after:140}),112);
  assert.equal(reportChartHeight({compact:true}),232);
  const state=createState(false,'2026-10');saveTransaction(state,{id:'expense',type:'expense',amount:20000,date:'2026-10-01',categoryId:'mercado',description:'Mercado'});
  const reports=buildReports(state,'2026-10',12,'all',{startMonth:'2025-11'}),svg=chartSvg(reports.series,{kind:'spending',dimensions:reports.dimensions,width:288,height:150,compact:true});
  assert.ok(svg.includes('viewBox="0 0 288 150"'));assert.equal(svg.includes('min-width:'),false);
  assert.equal((svg.match(/data-report-month=/g)||[]).length,12);assert.equal(svg.includes('NaN'),false);
  assert.ok(svg.includes('font-size="11"'),'height changes preserve legible month labels');
});

test('month windows keep all months reachable without changing the selected period',()=>{
  for(const width of [280,390,560,720,1100,1920]){
    const seen=new Set();let current=incomeMonthWindow(12,width,0);
    while(true){for(let i=current.start;i<current.end;i++)seen.add(i);if(current.end===12)break;current=incomeMonthWindow(12,width,current.start+current.count);}
    assert.equal(seen.size,12);assert.ok(current.end-current.start<=current.count);
    assert.equal(incomeMonthWindow(12,width).end,12);
  }
  assert.deepEqual(incomeMonthWindow(12,390),{start:11,end:12,count:1});
  assert.deepEqual(incomeMonthWindow(12,780,0),{start:0,end:4,count:4});
  assert.deepEqual(incomeMonthWindow(2,1920,999),{start:0,end:2,count:2});
});
