import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {donutSvg,donutSegments} from '../web/vector-charts.js';
import {chartSvg} from '../web/reports-ui.js';
import {buildReports} from '../web/reports-core.js';
import {createState,saveTransaction} from '../web/core.js';

test('donut charts use scalable arcs and handle empty, single, partial and invalid values safely',()=>{
 const documentFor=markup=>parseHTML('<html><body>'+markup+'</body></html>').document;
 const empty=documentFor(donutSvg([0,-1,NaN,Infinity]));assert.equal(empty.querySelectorAll('path,circle').length,0);
 const single=documentFor(donutSvg([12000],['#54ba9b']));assert.equal(single.querySelectorAll('path').length,0);assert.equal(single.querySelector('g>rect').getAttribute('fill'),'#54ba9b');
 const halves=documentFor(donutSvg([50,50],['#7446ff','#54ba9b']));assert.equal(halves.querySelectorAll('path').length,1);
 assert.equal(halves.querySelector('path').getAttribute('d'),'M100 100 L100 250 A150 150 0 0 1 100 -50 Z');
 for(const values of [[109165],[50000,37973,16692,3100,1400],[Number.MAX_VALUE,Number.MAX_VALUE],[1e12,1,1]]){
  const markup=donutSvg(values,['#7446ff','#8d7afa','#54ba9b']);assert.doesNotMatch(markup,/NaN|Infinity|<image|<canvas|data:image|<filter/);
  const svg=documentFor(markup).querySelector('svg');assert.equal(svg.getAttribute('viewBox'),'0 0 200 200');assert.equal(svg.getAttribute('shape-rendering'),'geometricPrecision');
 }
 assert.doesNotMatch(donutSvg([1,2],['" onload="alert(1)']),/onload|alert/);
});

test('one alpha mask smooths both circular edges without blurring or rasterizing sector colors',()=>{
 const {document}=parseHTML('<html><body>'+donutSvg([50,30,20],['#7446ff','#54ba9b','#dbac59'])+'</body></html>');
 const svg=document.querySelector('svg'),mask=svg.querySelector('mask'),gradient=svg.querySelector('[id$="-edge"]');
 assert.equal(svg.querySelectorAll('mask').length,1);assert.equal(mask.getAttribute('mask-type'),'alpha');
 assert.equal(mask.getAttribute('maskUnits'),'userSpaceOnUse');assert.equal(mask.getAttribute('width'),'200');
 const stops=[...gradient.querySelectorAll('stop')].map(el=>[parseFloat(el.getAttribute('offset')),Number(el.getAttribute('stop-opacity'))]);
 assert.deepEqual(stops,[[0,0],[59.5,0],[60.5,1],[99,1],[100,0]]);
 assert.equal(svg.querySelector('g').getAttribute('mask'),`url(#${mask.id})`);
 assert.equal(mask.querySelector('rect').getAttribute('fill'),`url(#${gradient.id})`);
 assert.deepEqual([...svg.querySelectorAll('g>rect,g>path')].map(el=>el.getAttribute('fill')),['#7446ff','#54ba9b','#dbac59']);
 assert.equal(svg.querySelector('g').querySelectorAll('path').length,2);assert.doesNotMatch(svg.outerHTML,/<canvas|<image|<filter|blur|data:image/);
});

test('multiple donuts keep isolated mask references, including single slices and very small slices',()=>{
 const values=[1e12,1,1],{document}=parseHTML('<html><body>'+donutSvg(values)+donutSvg([1])+donutSvg([])+'</body></html>');
 const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length);
 for(const el of document.querySelectorAll('[mask],[fill]'))for(const attribute of ['mask','fill']){
  const reference=el.getAttribute(attribute)?.match(/^url\(#(.+)\)$/)?.[1];if(reference)assert.ok(document.getElementById(reference));
 }
 assert.doesNotMatch(document.body.innerHTML,/NaN|Infinity/);
});

test('vector sectors preserve exact report proportions and sanitize invalid values and colors',()=>{
 const parts=donutSegments([50000,37973,16692,3100,1400],['#7446ff','#8d7afa','#54ba9b']);
 assert.equal(parts[0].start,0);assert.equal(parts.at(-1).end,1);assert.equal(parts[0].end,50000/109165);
 for(let i=1;i<parts.length;i++)assert.equal(parts[i].start,parts[i-1].end);
 assert.deepEqual(donutSegments([0,-1,Infinity,NaN]),[]);
 assert.equal(donutSegments([Number.MAX_VALUE,Number.MAX_VALUE])[0].end,.5);
 assert.equal(donutSegments([5],['\" onload=\"alert(1)'])[0].color,'#7446ff');
});

test('4K line and bar charts preserve drawing detail, labels and interactive months without raster images',()=>{
 const state=createState(false,'2026-10');saveTransaction(state,{id:'expense',type:'expense',amount:109165,date:'2026-10-01',categoryId:'mercado',description:'Mercado'});
 state.wealth['2026-10']={otherAssets:100000,debt:20000};const data=buildReports(state,'2026-10',1);
 for(const kind of ['income','spending','wealth','age']){
  const options={kind,dimensions:data.dimensions,selected:'2026-10'};
  const normal=chartSvg(data.series,{...options,width:620}),ultra=chartSvg(data.series,{...options,width:3840});
  assert.ok(ultra.includes('viewBox="0 0 3840 256"'));assert.ok(ultra.includes('shape-rendering="geometricPrecision"'));assert.ok(ultra.includes('text-rendering="optimizeLegibility"'));
  assert.deepEqual([...normal.matchAll(/font-size="([\d.]+)"/g)].map(x=>x[1]),[...ultra.matchAll(/font-size="([\d.]+)"/g)].map(x=>x[1]));
  assert.ok(ultra.includes('data-report-month="2026-10"'));assert.doesNotMatch(ultra,/<image|<canvas|data:image|NaN/);
 }
});
