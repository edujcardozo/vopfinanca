// Local development only. Production APIs are provided by the Worker or Netlify.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('web');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.avif':'image/avif','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/__preview/mobile'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VPO · revisão mobile</title><body style="margin:0;background:#e5e7ed;display:flex;justify-content:center;align-items:center;min-height:100dvh"><iframe title="VPO no celular" src="/#plano/planejar" style="border:0;width:min(390px,100vw);height:min(844px,100dvh);background:white"></iframe></body></html>');return;
    }
    if(pathname.startsWith('/api/')||pathname.startsWith('/signin-')){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Servidor de desenvolvimento sem conexão com contas."}');return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end();}
}).listen(Number(process.env.PORT)||4173,'0.0.0.0',()=>console.log('VPO development preview ready.'));
