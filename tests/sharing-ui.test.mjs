import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {server} from './helpers/sync-env.mjs';
import {createState,id} from '../web/core.js';
import {createSharingUI,invitationToken} from '../web/sharing-ui.js';
const waitFor=async condition=>{for(let i=0;i<200;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('A ação não terminou.');};
test('settings creates/copies/cancels invitations and the invited account explicitly accepts on phone and desktop',async()=>{
  for(const width of [390,1440]){
    const api=server(),original=createState(false,'2026-10');
    await api.request('/api/plan',{method:'PUT',body:JSON.stringify({revision:0,mutationId:id(),state:original})});
    const {document,event}=dom('<article id="sharing"></article><dialog id="dialog"></dialog>');
    globalThis.location={href:'https://plan.test/#plano/ajustes',hash:'#plano/ajustes',pathname:'/',reload(){}};
    globalThis.history={replaceState:(_a,_b,hash)=>location.hash=hash};
    let copied=null,reloads=0,backups=0;
    Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async text=>copied=text}},configurable:true});
    const root=document.querySelector('#sharing'),dialog=document.querySelector('dialog');
    root.style.width=width+'px';
    const options={root,sync:{flush:async()=>{},status:{initialized:true,dirty:false,conflict:false},backupCurrent:()=>backups++,stop(){}},openDialog:(_title,html)=>{dialog.innerHTML=html;dialog.open=true;},closeDialog:()=>dialog.open=false,notify:()=>{},reload:()=>reloads++};
    const owner=createSharingUI({...options,fetcher:api.fetcher('owner')});await owner.refresh();assert.ok(root.textContent.includes('Só você'));
    event(root.querySelector('[data-create-invite]'),'click');await waitFor(()=>!root.hasAttribute('aria-busy'));const link=dialog.querySelector('#sharing-invite-link').value;assert.ok(invitationToken(link));assert.equal(root.querySelector('[data-cancel-invite]').textContent,'Cancelar');
    event(dialog.querySelector('#copy-sharing-link'),'click');await waitFor(()=>copied!==null);assert.equal(copied,link);assert.ok(dialog.querySelector('#sharing-link-result').textContent.includes('copiado'));assert.equal(backups,1);
    event(root.querySelector('[data-cancel-invite]'),'click');await waitFor(()=>!root.hasAttribute('aria-busy'));assert.equal(root.querySelector('[data-cancel-invite]'),null);
    event(root.querySelector('[data-create-invite]'),'click');await waitFor(()=>!root.hasAttribute('aria-busy'));const token=invitationToken(dialog.querySelector('#sharing-invite-link').value);
    const wife=createSharingUI({...options,fetcher:api.fetcher('wife')});await wife.preview(token);assert.ok(dialog.textContent.includes('Seu plano pessoal continua guardado'));
    assert.equal((await(await api.request('/api/plan',{},'wife')).json()).exists,false);
    event(dialog.querySelector('#accept-plan-invite'),'click');await waitFor(()=>reloads===1||!dialog.querySelector('#sharing-accept-error').hidden);assert.equal(reloads,1,dialog.querySelector('#sharing-accept-error')?.textContent);assert.equal((await(await api.request('/api/plan',{},'wife')).json()).state.planId,original.planId);
    await owner.refresh();assert.ok(root.textContent.includes('wife@example.test'));assert.ok(root.querySelector('[data-remove-member]'));assert.equal(root.querySelector('[data-create-invite]'),null);
    await wife.refresh();assert.ok(root.querySelector('#sharing-plan'));assert.equal(root.querySelector('[data-remove-member]'),null);assert.equal(root.querySelector('[data-create-invite]'),null);
  }
});
test('invitation parser rejects malformed links and returns the opaque token only',()=>{
  const token='a'.repeat(64);assert.equal(invitationToken('https://plan.test/#plano/convite/'+token),token);assert.equal(invitationToken(token),token);
  for(const value of ['https://plan.test/#plano/convite/short','#plano/convite/'+token+'extra','javascript:alert(1)',''])assert.equal(invitationToken(value),null);
});
test('an unsynchronized personal edit prevents switching or accepting an invite',async()=>{
  const api=server(),original=createState(false,'2026-10');await api.request('/api/plan',{method:'PUT',body:JSON.stringify({revision:0,mutationId:id(),state:original})});
  const response=await api.request('/api/sharing/invites',{method:'POST',body:'{}'}),invite=await response.json();
  const {document,event}=dom('<article id="sharing"></article><dialog></dialog>');globalThis.location={href:'https://plan.test/#plano/ajustes',hash:'#plano/ajustes',pathname:'/'};
  let reloaded=false;const dialog=document.querySelector('dialog'),ui=createSharingUI({root:document.querySelector('article'),sync:{flush:async()=>{},status:{initialized:true,dirty:true},backupCurrent(){throw new Error('Must not switch');}},openDialog:(_title,body)=>dialog.innerHTML=body,closeDialog(){},notify(){},reload:()=>reloaded=true,fetcher:api.fetcher('wife')});
  await ui.preview(invite.token);event(dialog.querySelector('#accept-plan-invite'),'click');await waitFor(()=>!dialog.querySelector('#sharing-accept-error').hidden);assert.equal(reloaded,false);assert.equal(dialog.querySelector('#sharing-accept-error').hidden,false);assert.equal((await(await api.request('/api/plan',{},'wife')).json()).exists,false);
});
