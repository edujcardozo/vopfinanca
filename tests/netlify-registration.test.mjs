import test from 'node:test';
import assert from 'node:assert/strict';
import project from '../standalone/project.json' with {type:'json'};
import {registrationEnvironment} from '../standalone/server/environment.mjs';
import {registrationConfig} from '../standalone/server/registration.mjs';

const credentials={VPO_EMAIL_PROVIDER:'gmail',GMAIL_USER:'edujcardozo@gmail.com',GMAIL_APP_PASSWORD:'abcd efgh ijkl mnop',SUPABASE_SECRET_KEY:'sb_secret_test_server_only',VPO_SITE_URL:'https://vpofinancas.netlify.app'};
test('registration functions use the app project without requiring a duplicate private URL',()=>{
  for(const legacy of [undefined,'SUPABASE_URL=https://wrong.example.test','https://other.supabase.co']){
    const input={...credentials,...(legacy===undefined?{}:{SUPABASE_URL:legacy})};
    const config=registrationConfig(registrationEnvironment(input));
    assert.equal(config.url,project.url);assert.equal(config.secret,credentials.SUPABASE_SECRET_KEY);
    assert.equal(input.SUPABASE_URL,legacy);
  }
});
test('a public project override also applies to functions and still passes strict URL validation',()=>{
  assert.equal(registrationConfig(registrationEnvironment({...credentials,VPO_SUPABASE_URL:'https://custom.supabase.co'})).url,'https://custom.supabase.co');
  assert.throws(()=>registrationConfig(registrationEnvironment({...credentials,VPO_SUPABASE_URL:'https://user:password@other.supabase.co'})),error=>error.fields.includes('SUPABASE_URL'));
});
test('the actual Netlify endpoint reaches the sign-in check with the shared project and makes no unauthenticated email request',async()=>{
  const keys=[...Object.keys(credentials),'SUPABASE_URL','VPO_SUPABASE_URL'],saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const previousFetch=globalThis.fetch;
  try{
    Object.assign(process.env,credentials,{SUPABASE_URL:'SUPABASE_URL=old-panel-value'});delete process.env.VPO_SUPABASE_URL;
    globalThis.fetch=async()=>assert.fail('A logged-out caller cannot authenticate or send mail');
    const {default:handler}=await import('../netlify/functions/vpo-registration.mjs?shared-project-test');
    const response=await handler(new Request(credentials.VPO_SITE_URL+'/.netlify/functions/vpo-registration?action=status',{method:'POST',headers:{Origin:credentials.VPO_SITE_URL,'Content-Type':'application/json'},body:'{}'}));
    assert.equal(response.status,401);assert.match((await response.json()).error,/Entre novamente/);
  }finally{
    globalThis.fetch=previousFetch;
    for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
  }
});
