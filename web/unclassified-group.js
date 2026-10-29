import {createGroup,groupsFor} from './core.js?v=vpo-125';
const key=value=>String(value).trim().toLocaleLowerCase('pt-BR');
export function ensureUnclassifiedGroup(state){
 let group=groupsFor(state).find(g=>key(g.name)==='a classificar');
 if(!group)group=createGroup(state,'A classificar');
 if(group.hidden)group.hidden=false;
 return group;
}
// Move category references only: transactions and monthly assigned amounts stay intact.
export function organizeUnclassifiedGroup(state){
 const categories=state.categories.filter(c=>key(c.name)==='a classificar');
 if(!categories.length)return false;
 const existing=groupsFor(state).find(g=>key(g.name)==='a classificar');
 if(existing&&!existing.hidden&&categories.every(c=>c.group===existing.id&&!c.hidden))return false;
 const group=ensureUnclassifiedGroup(state);
 for(const category of categories){category.group=group.id;if(category.hidden)category.hidden=false;}
 return true;
}
