import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './helpers/dom.mjs';
import {mountAccountUI,mountAccountSettings} from '../standalone/account-ui.js';
import {accountUsername} from '../web/account-identity.js';

test('sidebar shows only the email username safely and links directly to account settings',()=>{
  const {document}=dom('<aside><div></div></aside>');
  const root=document.querySelector('div');
  mountAccountUI({root,name:'Larissa Bassi',email:'larissa@example.test'});
  assert.equal(root.querySelector('strong').textContent,'larissa');assert.equal(root.querySelector('.vpo-account-avatar').textContent,'L');
  assert.equal(root.querySelector('.vpo-account-identity').textContent.includes('@'),false);assert.equal(root.querySelector('a').getAttribute('href'),'#plano/ajustes');
  assert.equal(root.querySelector('strong').title,'larissa@example.test');assert.ok(root.querySelector('a').getAttribute('aria-label').includes('larissa@example.test'));
  mountAccountUI({root,name:'<img src=x onerror=alert(1)>',email:'<script>@example.test'});
  assert.equal(root.querySelector('img,script'),null);assert.equal(root.querySelector('strong').textContent,'<script>');
});
test('the mobile account card uses the same short identity and one accessible logout button',()=>{
  const {document}=dom('<article class="settings-card"></article>');
  const root=document.querySelector('article'),username='eduardo.'+'cardozo'.repeat(12);
  const button=mountAccountSettings({root,name:'Eduardo Cardozo',email:username+'@example.test'});
  assert.equal(root.querySelector('strong').textContent,username);assert.equal(root.textContent.includes('@'),false);assert.equal(root.textContent.includes('Eduardo Cardozo'),false);
  assert.equal(root.querySelectorAll('button').length,1);assert.equal(button.textContent,'Sair');assert.equal(button.getAttribute('aria-label'),'Sair da conta neste aparelho');
  mountAccountSettings({root,email:'<img src=x>+teste@example.test'});
  assert.equal(root.querySelector('img'),null);assert.equal(root.querySelector('strong').textContent,'<img src=x>+teste');
});
test('account usernames keep accents, punctuation and leading zeros without the email domain',()=>{
  assert.equal(accountUsername('  joão.silva+01@example.test  ','Outro nome'),'joão.silva+01');
  assert.equal(accountUsername('000123@example.test'),'000123');
  assert.equal(accountUsername(null,'  Minha conta  '),'Minha conta');assert.equal(accountUsername(''),'Minha conta');
});
test('sidebar and settings share one logout action, wait for sync and clear the account cache only after signing out',async()=>{
  const {document}=dom('<aside><div></div></aside><article class="settings-card"></article>');
  let release,flushes=0,signouts=0,cleared=0,stopped=0,redirects=0;const leaving=[];
  const root=document.querySelector('div'),other=mountAccountSettings({root:document.querySelector('article'),name:'Eduardo',email:'edu@example.test'});
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
