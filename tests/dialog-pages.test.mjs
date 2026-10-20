import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {paginateHeights,createDialogPages} from '../web/dialog-pages.js';
function setup(body){
 const f=dom(`<html><body><dialog open><header class="dialog-heading"><h2 id="title">Editar</h2></header><div id="dialog-body">${body}</div></dialog></body></html>`),{window,document}=f,dialog=document.querySelector('dialog'),root=document.querySelector('#dialog-body');dialog.open=true;window.innerHeight=500;
 window.getComputedStyle=el=>({display:el.hidden?'none':'block',marginTop:'0',marginBottom:'0',paddingTop:'16',paddingBottom:'16'});
 Object.defineProperty(root,'scrollHeight',{get:()=>1000});document.querySelector('.dialog-heading').getBoundingClientRect=()=>({height:40});
 document.querySelectorAll('[data-height]').forEach(el=>el.getBoundingClientRect=()=>({height:Number(el.dataset.height)}));
 const pager=createDialogPages(dialog,{body:root,heading:document.querySelector('#title')});return {...f,dialog,root,pager};
}
test('pagination includes every item exactly once and bounds each normal-sized page',()=>{
 const heights=Array.from({length:500},(_,i)=>30+i%90),pages=paginateHeights(heights,300);assert.deepEqual(pages.flat(),heights.map((_,i)=>i));for(const page of pages)assert.ok(page.reduce((s,i)=>s+heights[i],0)<=300);
 assert.deepEqual(paginateHeights([],300),[]);assert.deepEqual(paginateHeights([400,40],300),[[0],[1]]);
});
test('modal steps preserve form values, reveal invalid fields and adapt when screen height changes',()=>{
 const f=setup(`<form id="example">${[1,2,3,4].map(i=>`<label data-height="100"><span>Campo ${i}</span><input id="field-${i}" name="field-${i}"></label>`).join('')}<button data-height="40" type="submit">Salvar</button></form>`),{document,pager,event,window}=f;
 const first=document.querySelector('#field-1'),last=document.querySelector('#field-4');first.value='Preservar este valor';last.value='Também preservado';pager.refresh();assert.equal(pager.count,2);assert.equal(last.closest('label').hasAttribute('data-dialog-page-hidden'),true);
 pager.next();assert.equal(pager.page,1);assert.equal(last.closest('label').hasAttribute('data-dialog-page-hidden'),false);pager.previous();assert.equal(pager.page,0);assert.equal(document.querySelector('#field-1'),first);assert.equal(first.value,'Preservar este valor');assert.equal(last.disabled||false,false);
 event(last,'invalid');assert.equal(pager.page,1);assert.equal(last.closest('label').hasAttribute('data-dialog-page-hidden'),false);
 window.innerHeight=360;event(window,'resize');assert.ok(pager.count>=4);assert.equal(last.value,'Também preservado');assert.equal(last.closest('label').hasAttribute('data-dialog-page-hidden'),false);
});
test('long lists use bounded pages and keep hidden business fields out of the flow',()=>{
 const f=setup(`<div data-dialog-flow><button hidden data-height="1000">Não mostrar</button>${Array.from({length:45},(_,i)=>`<button data-height="70" data-item="${i}">Despesa ${i}</button>`).join('')}</div>`),{document,pager}=f;
 pager.refresh();assert.ok(pager.count>1);const seen=new Set();for(let i=0;i<pager.count;i++){const visible=[...document.querySelectorAll('[data-item]')].filter(el=>!el.hasAttribute('data-dialog-page-hidden'));assert.ok(visible.length<=4);for(const el of visible)seen.add(el.dataset.item);pager.next();}assert.equal(seen.size,45);assert.equal(document.querySelector('[hidden]').hidden,true);
});
