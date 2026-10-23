import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {buildPixPayload,crc16,pixQRCodeSVG,proofWhatsAppURL} from '../standalone/pix.js';
import {pixPaymentHTML,bindPixPayment} from '../standalone/pix-ui.js';
import {createBillingUI,billingSummary} from '../standalone/billing-ui.js';
import {mountRegistrationAdmin} from '../standalone/user-admin.js';
import {dom} from './helpers/dom.mjs';
const pix={ready:true,key:'11144477735',keyType:'cpf',merchantName:'VPO FINANCAS',merchantCity:'NAO INFORMADO',amountCents:1290,whatsapp:'5511999990000',accountEmail:'client+pix@example.test'};
const access={accessEnforced:true,enabled:false,isOwner:true,phase:'payment_required',canUse:false,monthlyCents:1290,checkoutReady:false,manualPix:pix};
const waitFor=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Action did not finish');};
function fields(text){const out={};for(let i=0;i<text.length;){const tag=text.slice(i,i+2),length=Number(text.slice(i+2,i+4));assert.ok(length>0);out[tag]=text.slice(i+4,i+4+length);i+=4+length;}return out;}
test('Pix payload matches the Banco Central CRC vector and preserves exact key and cents',()=>{
  const example='00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.equal(crc16(example),'1D3D');
  const payload=buildPixPayload(pix),data=fields(payload);
  assert.deepEqual(fields(data['26']),{'00':'br.gov.bcb.pix','01':pix.key});
  assert.equal(data['54'],'12.90');assert.equal(data['53'],'986');assert.equal(data['58'],'BR');assert.equal(data['63'],crc16(payload.slice(0,-4)));
  for(const change of [{key:'11144477734'},{amountCents:12.9},{amountCents:0},{txid:'bad txid'},{merchantName:'<>'}])assert.throws(()=>buildPixPayload({...pix,...change}));
});
test('the actual SVG QR decodes to the exact Pix copia e cola using an independent decoder',()=>{
  const payload=buildPixPayload(pix),svg=pixQRCodeSVG(payload),size=Number(svg.match(/viewBox="0 0 (\d+)/)[1]),scale=5,width=size*scale;
  const pixels=new Uint8ClampedArray(width*width*4).fill(255);
  for(const match of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)){
    const [x,y,run]=match.slice(1).map(Number);
    for(let yy=y*scale;yy<(y+1)*scale;yy++)for(let xx=x*scale;xx<(x+run)*scale;xx++){const i=(yy*width+xx)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}
  }
  assert.equal(jsQR(pixels,width,width)?.data,payload);
  assert.ok(!svg.includes('http://')||svg.includes('http://www.w3.org/2000/svg'));
});
test('WhatsApp receives the exact configured phone and a draft identifying the customer',()=>{
  const url=new URL(proofWhatsAppURL(pix.whatsapp,pix.accountEmail,1290));
  assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/'+pix.whatsapp);
  assert.ok(url.searchParams.get('text').includes(pix.accountEmail));assert.ok(url.searchParams.get('text').includes('12,90'));
  assert.throws(()=>proofWhatsAppURL('javascript:alert(1)',pix.accountEmail,1290));
});
test('copying Pix and opening proof do not mark a payment confirmed; clipboard refusal exposes a selectable code',async()=>{
  const {document}=dom(pixPaymentHTML(access)),dialog=document.querySelector('.vpo-pix-payment');let copied='',refreshed=0;
  const bind=clipboard=>bindPixPayment({dialog,info:access,back(){},refresh(){refreshed++;},notify(){},clipboard});
  bind({writeText:async value=>{copied=value;}});
  await dialog.querySelector('[data-pix-copy]').onclick({currentTarget:dialog.querySelector('[data-pix-copy]')});
  assert.equal(copied,buildPixPayload(pix));assert.equal(refreshed,0);assert.equal(access.canUse,false);
  const proof=dialog.querySelector('a');assert.equal(proof.getAttribute('target'),'_blank');assert.equal(proof.getAttribute('rel'),'noopener noreferrer');
  bind({writeText:async()=>{throw new Error('denied');}});await dialog.querySelector('[data-pix-copy]').onclick({currentTarget:dialog.querySelector('[data-pix-copy]')});
  assert.equal(dialog.querySelector('.vpo-pix-code').hidden,false);assert.equal(dialog.querySelector('textarea').value,buildPixPayload(pix));
});
test('the billing card opens Pix and refreshes server access without calling checkout or payment mutation',async()=>{
  const {document,event}=dom('<article></article><dialog></dialog>'),root=document.querySelector('article'),dialog=document.querySelector('dialog'),calls=[];
  const ui=createBillingUI({root,notify(){},fetcher:async(path,options)=>{calls.push([path,options]);return new Response(JSON.stringify(access));},openDialog:(_,html)=>dialog.innerHTML=html,checkout:()=>assert.fail('No provider checkout for manual Pix')});
  await ui.refresh();event(root.querySelector('[data-billing-pix]'),'click');assert.ok(dialog.querySelector('svg[role=img]'));
  await dialog.querySelector('[data-pix-refresh]').onclick();assert.ok(calls.every(([path,opt])=>path==='/api/billing'&&opt.method==='GET'));
  assert.equal(ui.info.canUse,false);assert.equal(pixPaymentHTML({...access,isOwner:false}), '');
  assert.match(billingSummary({...access,phase:'active',canUse:true,paymentSource:'manual_pix',paidUntil:'2026-11-23T15:00:00Z'}).description,/Pix confirmado/);
});
test('admin Pix confirmation is explicit, stable across retry, and carries no client-chosen amount or deadline',async()=>{
  const {document,event}=dom('<article></article>'),root=document.querySelector('article'),calls=[];
  mountRegistrationAdmin({root,notifier:async()=>({configured:true}),api:async(path,body)=>{calls.push([path,body]);if(path==='/pix')throw new Error('Temporariamente indisponível');return {items:body.status==='approved'?[{id:'customer',name:'Cliente',status:'approved',accessMode:'subscription',access:{monthlyCents:1290,manualPixAvailable:true,manualPaymentVersion:'version-1',nextManualPeriodEnd:'2026-11-23T15:00:00Z'}}]:[],total:1};}});
  await waitFor(()=>calls.length);event(root.querySelector('[data-admin-filter=approved]'),'click');await waitFor(()=>root.querySelector('[data-user-options]'));
  event(root.querySelector('[data-user-options]'),'click');event(root.querySelector('[data-user-action=confirm_pix]'),'click');
  assert.match(root.textContent,/Confira no seu banco/);assert.equal(calls.some(x=>x[0]==='/pix'),false);
  event(root.querySelector('[data-user-confirm]'),'click');await waitFor(()=>root.textContent.includes('Temporariamente indisponível'));
  const first=calls.find(x=>x[0]==='/pix')[1];assert.equal(first.confirm,true);assert.equal(first.paymentVersion,'version-1');assert.match(first.requestId,/^[0-9a-f-]{36}$/);
  assert.equal('amountCents' in first,false);assert.equal('paidUntil' in first,false);
  event(root.querySelector('[data-user-confirm]'),'click');await waitFor(()=>calls.filter(x=>x[0]==='/pix').length===2);assert.equal(calls.at(-1)[1].requestId,first.requestId);
});
