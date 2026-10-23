import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {donutSvg} from '../web/vector-charts.js';
import {chartSvg} from '../web/reports-ui.js';
import {buildReports} from '../web/reports-core.js';
import {createState,saveTransaction} from '../web/core.js';

test('donut charts use scalable arcs and handle empty, single, partial and invalid values safely',()=>{
 const documentFor=markup=>parseHTML('<html><body>'+markup+'</body></html>').document;
 const empty=documentFor(donutSvg([0,-1,NaN,Infinity]));assert.equal(empty.querySelectorAll('path,circle').length,0);
 const single=documentFor(donutSvg([12000],['#54ba9b']));assert.equal(single.querySelectorAll('path').length,0);assert.equal(single.querySelector('circle').getAttribute('stroke'),'#54ba9b');
 const halves=documentFor(donutSvg([50,50],['#7446ff','#54ba9b']));assert.equal(halves.querySelectorAll('path').length,2);
 assert.match(halves.querySelector('path').getAttribute('d'),/^M100 0 A100 100 0 0 1 100 200 L100 160 A60 60 0 0 0 100 40 Z$/);
 for(const values of [[109165],[50000,37973,16692,3100,1400],[Number.MAX_VALUE,Number.MAX_VALUE],[1e12,1,1]]){
  const markup=donutSvg(values,['#7446ff','#8d7afa','#54ba9b']);assert.doesNotMatch(markup,/NaN|Infinity|<image|<canvas|data:image|<filter/);
  const svg=documentFor(markup).querySelector('svg');assert.equal(svg.getAttribute('viewBox'),'0 0 200 200');assert.equal(svg.getAttribute('shape-rendering'),'geometricPrecision');
 }
 assert.doesNotMatch(donutSvg([1,2],['" onload="alert(1)']),/onload|alert/);
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
