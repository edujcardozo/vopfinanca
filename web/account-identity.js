// Display labels only; account identifiers and stored records stay unchanged.
export function participantDisplayName(value){
  const label=String(value||'').trim();
  const username=label.split('@',1)[0];
  return /^larissa(?:[ ._-]*bassi(?:[ ._-]*borges)?)?$/iu.test(username)?'Larissa':label;
}
export function accountUsername(email,name){
  return participantDisplayName(String(email||'').trim().split('@',1)[0]||String(name||'').trim()||'Minha conta');
}
