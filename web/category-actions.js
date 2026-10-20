export function categoryHasActivity(state,id){return Object.values(state.months).some(m=>(m.assigned[id]||0)!==0||m.transactions.some(t=>t.categoryId===id));}
export function deleteCategory(state,id,destinationId){
  if(!state.categories.some(c=>c.id===id))throw new Error('Categoria não encontrada.');
  if(state.categories.length===1)throw new Error('Mantenha pelo menos uma categoria no seu plano.');
  const activity=categoryHasActivity(state,id);
  if(activity&&(!state.categories.some(c=>c.id===destinationId)||destinationId===id))throw new Error('Escolha uma categoria para receber o histórico e os valores.');
  for(const m of Object.values(state.months)){const value=(m.assigned[destinationId]||0)+(m.assigned[id]||0);if(activity&&(!Number.isSafeInteger(value)||value>1e12))throw new Error('Os valores combinados excedem o limite da categoria.');}
  for(const m of Object.values(state.months)){
    if(activity&&m.assigned[id])m.assigned[destinationId]=(m.assigned[destinationId]||0)+m.assigned[id];
    delete m.assigned[id];for(const t of m.transactions)if(t.categoryId===id)t.categoryId=destinationId;
  }
  state.categories=state.categories.filter(c=>c.id!==id);
}
