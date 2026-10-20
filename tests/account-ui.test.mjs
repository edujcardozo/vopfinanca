import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {mountAccountUI} from '../standalone/account-ui.js';

test('sidebar shows the signed-in identity safely, initials and a direct link to account settings',()=>{
  const {document}=dom('<aside><div></div></aside>');
  const root=document.querySelector('div');
  mountAccountUI({root,name:'Larissa Bassi',email:'larissa@example.test'});
  assert.equal(root.querySelector('strong').textContent,'Larissa Bassi');assert.equal(root.querySelector('.vpo-account-avatar').textContent,'LB');
  assert.equal(root.querySelector('.vpo-account-identity>span').textContent,'larissa@example.test');assert.equal(root.querySelector('a').getAttribute('href'),'#plano/ajustes');
  mountAccountUI({root,name:'<img src=x onerror=alert(1)>',email:'<script>@example.test'});
  assert.equal(root.querySelector('img,script'),null);assert.equal(root.querySelector('strong').textContent,'<img src=x onerror=alert(1)>');
});
test('sidebar and settings share one logout action, wait for sync and clear the account cache only after signing out',async()=>{
  const {document}=dom('<aside><div></div></aside><button id="settings">Sair</button>');
  let release,flushes=0,signouts=0,cleared=0,stopped=0,redirects=0;const leaving=[];
  const root=document.querySelector('div'),other=document.querySelector('#settings');
  const ui=mountAccountUI({root,name:'Eduardo',email:'edu@example.test',otherButtons:[other],sync:{status:{initialized:true,dirty:false,conflict:false},flush:async()=>{flushes++;await new Promise(resolve=>release=resolve);},stop:()=>stopped++},auth:{signOut:async options=>{assert.deepEqual(options,{scope:'local'});signouts++;return {error:null};}},storage:{clear:()=>cleared++},onLeaving:value=>leaving.push(value),onSignedOut:()=>redirects++});
  const pending=ui.signOut();assert.equal(ui.busy,true);assert.equal(other.disabled,true);assert.equal(root.querySelector('button').disabled,true);
  await other.onclick();assert.equal(flushes,1);assert.equal(signouts,0);assert.equal(cleared,0);
  release();await pending;assert.equal(signouts,1);assert.equal(cleared,1);assert.equal(stopped,1);assert.equal(redirects,1);assert.deepEqual(leaving,[true]);
  await ui.signOut();assert.equal(signouts,1);
});
test('pending writes or an authentication failure keep the budget and allow a new logout attempt',async()=>{
  for(const failure of ['pending','auth','network']){
    const {document}=dom('<div></div><button>Sair</button>');let clear=0,redirect=0,stopped=0;const messages=[],leaving=[];
    const root=document.querySelector('div'),other=document.querySelector('button');
    const ui=mountAccountUI({root,name:'Cliente',email:'cliente@example.test',otherButtons:[other],sync:{status:{initialized:true,dirty:failure==='pending',conflict:false},flush:async()=>{},stop:()=>stopped++},auth:{signOut:async()=>{if(failure==='pending')assert.fail('Must wait for changes');if(failure==='network')throw new Error('offline');return {error:{message:'unavailable'}};}},storage:{clear:()=>clear++},onLeaving:value=>leaving.push(value),onSignedOut:()=>redirect++,notify:message=>messages.push(message)});
    await ui.signOut();assert.equal(clear,0);assert.equal(redirect,0);assert.equal(stopped,0);assert.equal(ui.busy,false);assert.equal(root.querySelector('button').disabled,false);assert.equal(other.disabled,false);assert.equal(messages.length,1);assert.equal(leaving.at(-1),false);
  }
});
