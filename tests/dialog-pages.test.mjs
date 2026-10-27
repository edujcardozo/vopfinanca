import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {paginateHeights,createDialogPages} from '../web/dialog-pages.js';
function setup(body,naturalHeight=1000){
 const f=dom(`<html><body><dialog open><header class="dialog-heading"><h2 id="title">Editar</h2></header><div id="dialog-body">${body}</div></dialog></body></html>`),{window,document}=f,dialog=document.querySelector('dialog'),root=document.querySelector('#dialog-body');dialog.open=true;window.innerHeight=500;
 window.getComputedStyle=el=>({display:el.hidden?'none':'block',marginTop:'0',marginBottom:'0',paddingTop:'16',paddingBottom:'16'});
 Object.defineProperty(root,'scrollHeight',{get:()=>naturalHeight});document.querySelector('.dialog-heading').getBoundingClientRect=()=>({height:40});
 document.querySelectorAll('[data-height]').forEach(el=>el.getBoundingClientRect=()=>({height:Number(el.dataset.height)}));
 const pager=createDialogPages(dialog,{body:root,heading:document.querySelector('#title')});return {...f,dialog,root,pager};
}
test('pagination includes every item exactly once and bounds each normal-sized page',()=>{
 const heights=Array.from({length:500},(_,i)=>30+i%90),pages=paginateHeights(heights,300);assert.deepEqual(pages.flat(),heights.map((_,i)=>i));for(const page of pages)assert.ok(page.reduce((s,i)=>s+heights[i],0)<=300);
 assert.deepEqual(paginateHeights([],300),[]);assert.deepEqual(paginateHeights([400,40],300),[[0],[1]]);
});
test('a complete form that fits the viewport never reserves space for unnecessary Continue navigation',()=>{
 const {document,pager,dialog}=setup('<form><label data-height="260">Nome<input name="name"></label><button data-height="100" type="submit">Criar categoria</button></form>',380);
 pager.refresh();assert.equal(pager.count,0);assert.equal(document.querySelector('.dialog-pages').hidden,true);assert.equal(dialog.classList.contains('dialog-paged'),false);assert.equal(document.querySelector('[data-dialog-page-hidden]'),null);
});
test('a hidden mobile handle contributes no margins to the available space',()=>{
 const {document,window,pager,dialog}=setup('<form><label data-height="260">Nome<input name="name"></label><button data-height="100" type="submit">Criar categoria</button></form>',380);
 const handle=document.createElement('div');handle.className='dialog-handle';handle.hidden=true;dialog.prepend(handle);
 const computed=window.getComputedStyle;window.getComputedStyle=el=>el===handle?{...computed(el),marginTop:'12',marginBottom:'23'}:computed(el);
 pager.refresh();assert.equal(pager.count,0);assert.equal(document.querySelector('.dialog-pages').hidden,true);
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
test('a queued close from the previous popup preserves the reopened popup reflow',()=>{
 const {window,dialog,pager,event}=setup('<button data-height="40">Novo objetivo</button>',40);
 let pending=null,cancelled=false;window.requestAnimationFrame=fn=>{pending=fn;return 17;};window.cancelAnimationFrame=()=>{cancelled=true;};
 pager.reset();window.innerHeight=390;event(dialog,'close');assert.equal(cancelled,false);assert.equal(typeof pending,'function');
 pending();assert.equal(dialog.style.getPropertyValue('--dialog-center-y'),'195px');assert.equal(dialog.style.getPropertyValue('--dialog-viewport-height'),'390px');
 dialog.open=false;event(dialog,'close');assert.equal(cancelled,true);
});
test('mobile transaction keeps one stable sheet when keyboard reduces the visual viewport',()=>{
 const {window,document,dialog,root,pager,event}=setup('<form><label data-height="300">Valor<input value="123"></label><label data-height="300">Categoria<input></label><button>Salvar</button></form>',900);
 window.innerWidth=390;window.innerHeight=844;window.visualViewport={height:844,offsetTop:0,addEventListener(){}};dialog.classList.add('transaction-dialog');pager.reset();
 const before=dialog.style.getPropertyValue('--transaction-stable-height');window.visualViewport.height=420;window.innerHeight=420;event(window,'resize');
 assert.equal(dialog.style.getPropertyValue('--transaction-stable-height'),before);assert.equal(pager.count,0);assert.equal(document.querySelector('.dialog-pages').hidden,true);assert.equal(root.querySelector('[data-dialog-page-hidden]'),null);assert.equal(root.querySelector('input').value,'123');
});
