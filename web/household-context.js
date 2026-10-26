import {participantDisplayName} from './account-identity.js?v=vpo-93';
// Storage keeps the two existing budget-relative slots for compatibility.
// They mean plan owner and accepted collaborator, never global user names.
const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/gu,' ').slice(0,100);
export const inactiveHousehold=()=>({enabled:false,people:{edu:'Você',larissa:'Pessoa convidada'},current:null,scopeId:null});
export function householdForSharing(info,previous=null){
  const empty=inactiveHousehold(),scope=info?.scope;
  if(!scope?.id||scope.revoked)return empty;
  let participants=info.participants;
  // Older Sites responses have no participant names. Keep identity separate
  // from the display label, and never show the email domain in the card.
  if(!Array.isArray(participants))participants=[{id:scope.id,name:scope.ownerName,email:scope.ownerEmail,role:'owner'},...(scope.role==='owner'?(info.members||[]).map(m=>({...m,role:'editor'})):[{...info.user,role:'editor'}])];
  const owner=participants.find(p=>p?.id===scope.id&&p.role==='owner'),guest=participants.find(p=>p?.role==='editor'&&p.id&&p.id!==scope.id);
  const name=(p,key)=>{
    const self=p?.id===info.user?.id?info.user:null;
    const registered=[p?.name,p?.fullName,self?.name,self?.fullName].map(clean).find(value=>value&&!value.includes('@'));
    if(registered)return registered;
    // A refresh may omit names; retain a resolved label only for that same
    // participant in that same plan, never for a reused owner/guest slot.
    if(previous?.scopeId===scope.id&&previous.participantIds?.[key]===p?.id&&previous.people?.[key])return previous.people[key];
    return clean(p?.email||p?.name||self?.email).split('@',1)[0];
  };
  if(!owner||!guest||!name(owner,'edu')||!name(guest,'larissa')||!participants.some(p=>p?.id===info.user?.id))return {...empty,scopeId:scope.id};
  return {enabled:true,scopeId:scope.id,participantIds:{edu:owner.id,larissa:guest.id},people:{edu:participantDisplayName(name(owner,'edu')),larissa:participantDisplayName(name(guest,'larissa'))},current:info.user.id===owner.id?'edu':'larissa'};
}
