// Only ordering and category membership change; financial records keep their IDs.
export function applyLayout(state,layout){
  if(!Array.isArray(layout)||layout.length!==state.groups.length)throw new Error('Os grupos mudaram. Tente novamente.');
  const groups=new Map(state.groups.map(g=>[g.id,g])),categories=new Map(state.categories.map(c=>[c.id,c])),seen=new Set(),ordered=[];
  const nextGroups=layout.map(g=>{if(!groups.has(g.id)||!Array.isArray(g.categories))throw new Error('Grupo inválido.');const group=groups.get(g.id);groups.delete(g.id);for(const id of g.categories){if(!categories.has(id)||seen.has(id))throw new Error('Categoria inválida.');seen.add(id);ordered.push({...categories.get(id),group:g.id});}return group;});
  for(const c of state.categories.filter(c=>c.hidden&&!seen.has(c.id))){seen.add(c.id);ordered.push(c);}
  if(groups.size||seen.size!==categories.size)throw new Error('As categorias mudaram. Tente novamente.');
  const changed=state.groups.some((g,i)=>g.id!==nextGroups[i].id)||state.categories.some((c,i)=>c.id!==ordered[i].id||c.group!==ordered[i].group);
  if(changed){state.groups=nextGroups;state.categories=ordered;}return changed;
}
