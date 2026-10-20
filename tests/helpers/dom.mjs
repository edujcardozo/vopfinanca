import {parseHTML} from 'linkedom';
export function dom(html){
 const {window,document}=parseHTML(html);let focused=document.body;
 Object.defineProperty(document,'activeElement',{get:()=>focused,configurable:true});
 window.HTMLElement.prototype.focus=function(){focused=this;this.dispatchEvent(new window.Event('focus'));};
 window.HTMLElement.prototype.scrollIntoView=function(){};
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,matchMedia:()=>({matches:true})});
 const event=(node,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);node.dispatchEvent(e);return e;};
 return {window,document,event};
}
