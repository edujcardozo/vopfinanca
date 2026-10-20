import {readFile,writeFile} from 'node:fs/promises';
// The iOS icon fetcher may not have the Site's login cookie. Inline images keep
// installation artwork independent of that additional authenticated request.
const dataURL=async(file,type)=>`data:${type};base64,${(await readFile(new URL('../web/assets/'+file,import.meta.url))).toString('base64')}`;
const [touch,large,favicon,vector]=await Promise.all([
  dataURL('vpo-dollar-180.png','image/png'),dataURL('vpo-dollar-512.png','image/png'),
  dataURL('vpo-favicon-48.png','image/png'),dataURL('icon.svg','image/svg+xml')
]);
const htmlFile=new URL('../web/index.html',import.meta.url),html=await readFile(htmlFile,'utf8');
const pattern=/<!-- app-icons:start -->[\s\S]*?<!-- app-icons:end -->/;
if(!pattern.test(html))throw new Error('Missing app icon markers.');
const links=`<!-- app-icons:start -->
  <link rel="icon" type="image/x-icon" href="/favicon.ico?v=embedded-icon-36">
  <link rel="icon" type="image/png" sizes="48x48" href="${favicon}">
  <link rel="icon" type="image/svg+xml" sizes="any" href="${vector}">
  <link rel="apple-touch-icon" sizes="512x512" href="${large}">
  <link rel="apple-touch-icon" sizes="180x180" href="${touch}">
  <!-- app-icons:end -->`;
await writeFile(htmlFile,html.replace(pattern,links));
const manifestFile=new URL('../web/manifest.webmanifest',import.meta.url),manifest=JSON.parse(await readFile(manifestFile,'utf8'));
manifest.icons=await Promise.all([[192,'any'],[512,'any'],[512,'maskable'],[1024,'any']].map(async([size,purpose])=>({src:await dataURL(`vpo-dollar-${size}.png`,'image/png'),sizes:`${size}x${size}`,type:'image/png',purpose})));
await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
