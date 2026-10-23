import {groupsFor} from './core.js?v=vpo-78';
import {isCategoryVisible,visibleGroups} from './group-actions.js?v=vpo-78';
// Only visible groups move. Hidden containers keep their slots and records.
export function applyLayout(state,layout){
  const originalGroups=groupsFor(state);
  if(!Array.isArray(layout)||layout.length!==visibleGroups(state).length)throw new Error('Os grupos mudaram. Tente novamente.');
  const groups=new Map(visibleGroups(state).map(g=>[g.id,g])),categories=new Map(state.categories.map(c=>[c.id,c])),seen=new Set(),ordered=[];
  const visibleOrder=layout.map(g=>{if(!groups.has(g.id)||!Array.isArray(g.categories))throw new Error('Grupo inválido.');const group=groups.get(g.id);groups.delete(g.id);for(const id of g.categories){if(!categories.has(id)||seen.has(id)||!isCategoryVisible(state,categories.get(id)))throw new Error('Categoria inválida.');seen.add(id);ordered.push({...categories.get(id),group:g.id});}return group;});
  let index=0;const nextGroups=originalGroups.map(group=>group.hidden?group:visibleOrder[index++]);
  for(const c of state.categories.filter(c=>!isCategoryVisible(state,c)&&!seen.has(c.id))){seen.add(c.id);ordered.push(c);}
  if(groups.size||seen.size!==categories.size)throw new Error('As categorias mudaram. Tente novamente.');
  const changed=originalGroups.some((g,i)=>g.id!==nextGroups[i].id)||state.categories.some((c,i)=>c.id!==ordered[i].id||c.group!==ordered[i].group);
  if(changed){state.groups=nextGroups;state.categories=ordered;}return changed;
}
