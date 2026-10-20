// Storage keeps the two existing budget-relative slots for compatibility.
// They mean plan owner and accepted collaborator, never global user names.
export const inactiveHousehold=()=>({enabled:false,people:{edu:'Você',larissa:'Pessoa convidada'},current:null,scopeId:null});
export function householdForSharing(info){
  const empty=inactiveHousehold(),scope=info?.scope;
  if(!scope?.id||scope.revoked)return empty;
  let participants=info.participants;
  // Compatibility with the original Sites API, which returns emails only.
  if(!Array.isArray(participants))participants=[{id:scope.id,name:scope.ownerEmail,role:'owner'},...(scope.role==='owner'?(info.members||[]).map(m=>({...m,name:m.email,role:'editor'})):[{id:info.user?.id,name:info.user?.email,role:'editor'}])];
  const owner=participants.find(p=>p.id===scope.id&&p.role==='owner'),guest=participants.find(p=>p.role==='editor'&&p.id&&p.id!==scope.id);
  const name=p=>String(p?.name||p?.email||'').trim().slice(0,100);
  if(!owner||!guest||!name(owner)||!name(guest)||!participants.some(p=>p.id===info.user?.id))return {...empty,scopeId:scope.id};
  return {enabled:true,scopeId:scope.id,people:{edu:name(owner),larissa:name(guest)},current:info.user.id===owner.id?'edu':'larissa'};
}
