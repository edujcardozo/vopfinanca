export function accountUsername(email,name){
  return String(email||'').trim().split('@',1)[0]||String(name||'').trim()||'Minha conta';
}
