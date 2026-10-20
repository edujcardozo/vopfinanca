import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Prepare tracked source for the authenticated GitHub connector. This does not
// contain or accept credentials and does not update a remote branch by itself.
const output=process.argv[2];
if(!output||!path.isAbsolute(output))throw new Error('Provide an absolute export path outside the repository.');
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw new Error('Commit the validated source before exporting.');
const relative=path.relative(root,output);
if(!relative.startsWith('..'+path.sep)&&relative!=='..')throw new Error('The export must stay outside the source repository.');
const deployment=JSON.parse(await readFile(path.join(root,'standalone/deployment.json'),'utf8'));
const entries=execFileSync('git',['ls-files','--stage','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const files=[];
for(const entry of entries){
  const tab=entry.indexOf('\t'),[mode,,stage]=entry.slice(0,tab).split(' '),name=entry.slice(tab+1);
  if(name.startsWith('.openai/'))continue;
  if(stage!=='0'||!['100644','100755'].includes(mode))throw new Error('Unsupported Git entry: '+name);
  const envTemplate=name==='.env.example'||name==='standalone/.env.example';
  if(!envTemplate&&/(^|\/)(\.env(?:\.|$)|\.netlify(?:\/|$)|node_modules(?:\/|$))/.test(name)||/\.(pem|key)$/i.test(name))throw new Error('Private or generated file cannot be exported: '+name);
  const bytes=await readFile(path.join(root,name));
  const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  let content,encoding='utf-8';
  try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{content=bytes.toString('base64');encoding='base64';}
  files.push({path:name,mode,sha,encoding,content});
}
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
await writeFile(output,JSON.stringify({repository:deployment.repository,branch:deployment.branch,sourceCommit,files}));
console.log(JSON.stringify({repository:deployment.repository,branch:deployment.branch,sourceCommit,files:files.length,output}));
