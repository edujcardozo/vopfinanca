// Every signed-in account gets a separate cache, outbox and recovery area.
// No data from the former ChatGPT identity is automatically adopted.
export function accountStorage(storage,project,userId){
  if(!/^[a-z0-9.-]+$/i.test(project)||!/^[a-f0-9-]{36}$/i.test(userId))throw new Error('Conta inválida.');
  const prefix=`vpo-independent-v1:${project}:${userId}:`;
  const keys=()=>Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>k?.startsWith(prefix));
  return {
    physicalKey:key=>prefix+key,
    getItem:key=>storage.getItem(prefix+key),
    setItem:(key,value)=>storage.setItem(prefix+key,value),
    removeItem:key=>storage.removeItem(prefix+key),
    key:index=>keys()[index]?.slice(prefix.length)??null,
    get length(){return keys().length;},
    clear(){for(const key of keys())storage.removeItem(key);}
  };
}
