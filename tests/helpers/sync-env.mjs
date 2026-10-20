import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAPI} from '../../server/api.js';
export class MemoryStorage{
  map=new Map();get length(){return this.map.size;}key(i){return [...this.map.keys()][i]??null;}getItem(key){return this.map.get(key)??null;}setItem(key,value){this.map.set(key,String(value));}removeItem(key){this.map.delete(key);}
}
export function database(){
  const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8'));
  function prepare(sql,args=[]){return {sql,args,bind(...values){return prepare(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const result=sqlite.prepare(sql).run(...args);return {results:[],meta:{changes:Number(result.changes)}};}};}
  const db={prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>/^\s*SELECT/i.test(s.sql)?{results:sqlite.prepare(s.sql).all(...s.args)}:{results:[],meta:{changes:Number(sqlite.prepare(s.sql).run(...s.args).changes)}});sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {db,sqlite};
}
export function server(env=database()){
  const calls=[];
  async function request(path,options={},userId='owner'){
    const pending=[],headers=new Headers(options.headers||{});
    if(userId){headers.set('oai-authenticated-user-id',userId);headers.set('oai-authenticated-user-email',userId+'@example.test');}
    if(options.body){headers.set('Content-Type',headers.get('Content-Type')||'application/json');if(!headers.has('Origin'))headers.set('Origin','https://plan.test');}
    const req=new Request('https://plan.test'+path,{...options,headers});calls.push({method:req.method,path,userId});
    const response=await handleAPI(req,{DB:env.db},{waitUntil:p=>pending.push(p)});await Promise.all(pending);return response;
  }
  return {...env,request,calls,fetcher:(userId='owner')=>(path,options)=>request(path,options,userId)};
}
