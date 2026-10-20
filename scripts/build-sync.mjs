import {readdir,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import path from 'node:path';
import './embed-app-icons.mjs';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.avif':'image/avif','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.webmanifest':'application/manifest+json'};
const assets={};
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await collect(file);else{const bytes=await readFile(file),name='/'+path.relative('web',file).split(path.sep).join('/');assets[name]={type:types[path.extname(file)]||'application/octet-stream',base64:bytes.toString('base64'),etag:'"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"'};}}}
await collect('web');await mkdir('worker',{recursive:true});await writeFile('worker/assets.generated.js','export default '+JSON.stringify(assets)+';\n');
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:'dist/server/index.js',minify:true});
const manifest=JSON.parse(await readFile('.openai/hosting.json','utf8'));if(manifest.static)throw new Error('Worker manifest must not declare static output.');
await writeFile('dist/.openai/hosting.json',JSON.stringify(manifest,null,2)+'\n');
const module=await import('../dist/server/index.js?build='+Date.now());if(typeof module.default?.fetch!=='function')throw new Error('Invalid Worker entrypoint.');
console.log(`Built Worker with ${Object.keys(assets).length} embedded assets; D1 binding ${manifest.d1}.`);
