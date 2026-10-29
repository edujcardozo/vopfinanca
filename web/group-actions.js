import {groupsFor} from './core.js?v=vpo-125';

export const visibleGroups=state=>groupsFor(state).filter(group=>!group.hidden);
export const isCategoryVisible=(state,category)=>!category.hidden&&groupsFor(state).some(group=>group.id===category.group&&!group.hidden);

export function setGroupHidden(state,groupId,hidden){
 if(typeof hidden!=='boolean')throw new Error('Escolha uma visibilidade válida.');
 const groups=groupsFor(state),group=groups.find(item=>item.id===groupId);
 if(!group)throw new Error('Este grupo não está mais disponível.');
 state.groups??=groups;
 if(hidden)group.hidden=true;else delete group.hidden;
 return group;
}

// Removing a container never deletes categories, assignments or transactions.
export function deleteGroup(state,groupId,destinationId){
 const groups=groupsFor(state),group=groups.find(item=>item.id===groupId);
 if(!group)throw new Error('Este grupo não está mais disponível.');
 if(groups.length===1)throw new Error('Mantenha pelo menos um grupo no seu plano.');
 const categories=state.categories.filter(category=>category.group===groupId);
 if(categories.length&&(!groups.some(item=>item.id===destinationId)||destinationId===groupId))throw new Error('Escolha outro grupo para receber as categorias.');
 for(const category of categories)category.group=destinationId;
 state.groups=groups.filter(item=>item.id!==groupId);
 return group;
}
