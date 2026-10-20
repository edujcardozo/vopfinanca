import {groupsFor,searchPayeeKey} from './core.js?v=vpo-34';
import {categoryIcon} from './category-icons.js?v=vpo-34';
export function matchingCategories(state,query,limit=50){
  const q=searchPayeeKey(query),words=q.split(' ').filter(Boolean);
  return groupsFor(state).flatMap(group=>state.categories.filter(c=>!c.hidden&&c.group===group.id).map(c=>({id:c.id,name:c.name,categoryName:group.name,icon:categoryIcon(c.name),key:searchPayeeKey(c.name),search:searchPayeeKey(c.name+' '+group.name)}))).filter(c=>words.every(w=>c.search.includes(w))).map((c,index)=>({...c,index})).sort((a,b)=>(a.key===q?0:a.key.startsWith(q)?1:2)-(b.key===q?0:b.key.startsWith(q)?1:2)||a.index-b.index).slice(0,limit).map(({id,name,categoryName,icon})=>({id,name,categoryName,icon}));
}
