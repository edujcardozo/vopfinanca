import {handleAPI} from '../server/api.js';
import assets from './assets.generated.js';
// iOS probes these root URLs in addition to the explicit page icon.
const iconAliases={
  '/apple-touch-icon.png':'/assets/vpo-dollar-512.png',
  '/apple-touch-icon-precomposed.png':'/assets/vpo-dollar-512.png',
  '/apple-touch-icon-180x180.png':'/assets/vpo-dollar-180.png',
  '/apple-touch-icon-vpo-35.png':'/assets/vpo-dollar-180.png',
  '/favicon.ico':'/assets/vpo-favicon.ico'
};
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return handleAPI(request,env,ctx);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad request',{status:400});}
    const asset=assets[path==='/'?'/index.html':iconAliases[path]||path];if(!asset)return new Response('Not found',{status:404});
    const headers={'Content-Type':asset.type,'Cache-Control':asset.type.startsWith('text/html')?'no-store':'no-cache','ETag':asset.etag,'X-Content-Type-Options':'nosniff'};
    if(request.headers.get('If-None-Match')===asset.etag&&!asset.type.startsWith('text/html'))return new Response(null,{status:304,headers});
    const bytes=Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));
    return new Response(request.method==='HEAD'?null:bytes,{headers});
  }
};
