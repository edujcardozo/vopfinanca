const key=s=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function checkedSavedCards(input=[]){
 if(!Array.isArray(input)||input.length>200)throw Error('Lista de cartões inválida.');
 const ids=new Set(),names=new Set();return input.map(c=>{
  if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.id!=='string'||!/^[a-z0-9_-]{1,64}$/i.test(c.id)||['__proto__','constructor','prototype'].includes(c.id)||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>70||names.has(key(c.name)))throw Error('Cartão inválido ou já cadastrado.');
  ids.add(c.id);names.add(key(c.name));return {id:c.id,name:c.name.trim().replace(/\s+/g,' ')};
 });
}
export function saveCard(state,name){
 if(typeof name!=='string'||!name.trim()||name.trim().length>70)throw Error('Informe um nome para o cartão, com até 70 caracteres.');
 const existing=(state.cards||[]).find(c=>key(c.name)===key(name));if(existing)return existing;
 const card={id:globalThis.crypto?.randomUUID?.()||`card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,name:name.trim().replace(/\s+/g,' ')};state.cards=checkedSavedCards([...(state.cards||[]),card]);return state.cards.at(-1);
}
