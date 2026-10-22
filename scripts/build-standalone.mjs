import {cp,readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {publicConfig} from '../standalone/config.js';
import './embed-app-icons.mjs';
const project=JSON.parse(await readFile('standalone/project.json','utf8'));
const config=publicConfig({VPO_SUPABASE_URL:project.url,VPO_SUPABASE_PUBLISHABLE_KEY:project.publishableKey,...process.env}),output='dist-independent';
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await cp('web/assets',`${output}/assets`,{recursive:true});
// Include new stylesheets automatically so source and Netlify stay consistent.
for(const file of await readdir('web',{withFileTypes:true}))if(file.isFile()&&file.name.endsWith('.css'))await cp('web/'+file.name,output+'/'+file.name);
await cp('web/manifest.webmanifest',output+'/manifest.webmanifest');
await cp('standalone/auth.css',output+'/auth.css');
await cp('standalone/billing.css',output+'/billing.css');
const result=await build({entryPoints:['web/app.js'],bundle:true,format:'esm',platform:'browser',target:['es2022','safari16'],minify:true,write:false,define:{__VPO_CONFIG__:JSON.stringify(config)},plugins:[{name:'independent-identity',setup(build){build.onResolve({filter:/^\.\/platform\.js$/},()=>({path:path.resolve('standalone/platform.js')}));}}]});
const js=result.outputFiles[0].contents,hash=createHash('sha256').update(js).digest('hex').slice(0,12),bundle=`app-${hash}.js`;
await writeFile(`${output}/${bundle}`,js);
let html=await readFile('web/index.html','utf8');
html=html.replace('<html lang="pt-BR">','<html lang="pt-BR" data-auth-required>')
  .replace(/<!-- app-icons:start -->[\s\S]*?<!-- app-icons:end -->/,'<!-- app-icons:start -->\n  <link rel="icon" href="/favicon.ico">\n  <link rel="icon" type="image/png" sizes="48x48" href="assets/vpo-favicon-48.png">\n  <link rel="icon" type="image/svg+xml" href="assets/vpo-dollar.svg">\n  <link rel="apple-touch-icon" sizes="180x180" href="assets/vpo-dollar-180.png">\n  <link rel="apple-touch-icon" sizes="512x512" href="assets/vpo-dollar-512.png">\n  <!-- app-icons:end -->')
  .replace(/<script type="module" src="app\.js[^\"]*"><\/script>/,`<link rel="stylesheet" href="auth.css"><link rel="stylesheet" href="billing.css"><script type="module" src="${bundle}"></script>`)
  .replace(/<body([^>]*)>/,'<body$1><section id="vpo-access" aria-label="Acesso ao VPO"><p class="vpo-access-loading" role="status">Abrindo seu VPO…</p><noscript>Ative o JavaScript para entrar no VPO.</noscript></section>')
  .replaceAll('com a mesma conta do ChatGPT','com o mesmo e-mail no VPO')
  .replaceAll('A mesma conta do ChatGPT em todos os aparelhos.','Sua conta VPO em todos os aparelhos.')
  .replaceAll('Use sua conta do ChatGPT nos seus aparelhos e convide sua esposa para editar o mesmo plano pela conta dela.','Use seu e-mail nos seus aparelhos e convide outra pessoa para editar o mesmo plano pela conta dela no VPO.')
  .replaceAll('Você pode experimentar o exemplo ou começar um plano vazio, sem informar dados bancários e sem criar uma conta.','Você cria sua conta por e-mail e começa com um plano vazio, sem informar dados bancários.')
  .replaceAll('O planejador é gratuito, não tem assinatura e não está conectado ao serviço oficial.','O VPO terá uma assinatura própria, com teste de 15 dias. O valor e a data da primeira cobrança serão informados antes da autorização. Ele não está conectado ao serviço oficial.')
  .replace(/href="\/signin-with-chatgpt\?return_to=[^\"]*"/g,'href="?entrar=1#plano"');
await writeFile(output+'/index.html',html);
const manifest=JSON.parse(await readFile(output+'/manifest.webmanifest','utf8'));
manifest.id='/';manifest.start_url='/#plano';manifest.scope='/';
// Public icon endpoints are available before login on the independent host.
manifest.icons=manifest.icons.map(icon=>({...icon,src:`assets/vpo-dollar-${icon.sizes.split('x')[0]}.png`}));
await writeFile(output+'/manifest.webmanifest',JSON.stringify(manifest,null,2)+'\n');
await cp('web/assets/vpo-dollar-180.png',output+'/apple-touch-icon.png');
await cp('web/assets/vpo-dollar-180.png',output+'/apple-touch-icon-precomposed.png');
await cp('web/assets/vpo-favicon.ico',output+'/favicon.ico');
await writeFile(output+'/_redirects','/* /index.html 200\n');
await writeFile(output+'/_headers',`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${config.url}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'\n  Cache-Control: no-cache\n/${bundle}\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=86400\n`);
console.log(`VPO independente gerado em ${output}; JS ${Math.round(js.byteLength/1024)} KiB; somente chave pública.`);
