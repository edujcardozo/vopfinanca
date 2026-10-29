const safeId=s=>typeof s==='string'&&/^[a-z0-9_-]{1,64}$/i.test(s)&&!['__proto__','constructor','prototype'].includes(s);
const month=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&+s.slice(0,4)>=1900&&+s.slice(0,4)<=2199;
const date=s=>typeof s==='string'&&month(s.slice(0,7))&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export function checkedInvoiceBills(input=[]){
 if(!Array.isArray(input)||input.length>3000)throw Error('Lista de faturas inválida.');
 const seen=new Set(),transactions=new Set();
 return input.map(b=>{
  if(!b||typeof b!=='object'||!safeId(b.id)||seen.has(b.id)||!month(b.month)||!date(b.dueDate)||typeof b.card!=='string'||b.card.length>70||b.paidDate!==null&&!date(b.paidDate)||!Array.isArray(b.transactionIds)||!b.transactionIds.length||b.transactionIds.length>3000)throw Error('Dados da fatura inválidos.');
  if(b.cardId!==undefined&&!safeId(b.cardId))throw Error('Cartão da fatura inválido.');
  seen.add(b.id);for(const id of b.transactionIds){if(!safeId(id)||transactions.has(id))throw Error('Compra vinculada a mais de uma fatura.');transactions.add(id);}
  return {...(b.cardId?{cardId:b.cardId}:{}),id:b.id,month:b.month,dueDate:b.dueDate,card:b.card.trim(),paidDate:b.paidDate,transactionIds:[...b.transactionIds]};
 });
}
export function invoiceBillTransactions(state,bill){const ids=new Set(bill.transactionIds);return Object.values(state.months).flatMap(m=>m.transactions).filter(t=>t.type==='expense'&&ids.has(t.id));}
export function invoiceBillTotal(state,bill){return invoiceBillTransactions(state,bill).reduce((n,t)=>n+t.amount,0);}
export function saveInvoiceBill(state,bill){const next=[...(state.invoiceBills||[])],index=next.findIndex(b=>b.id===bill.id);if(index<0)next.push(bill);else next[index]=bill;state.invoiceBills=checkedInvoiceBills(next);return state.invoiceBills.find(b=>b.id===bill.id);}

// Older imports created through the backup flow predate batch markers.
// Recognize only their explicit Nubank origin; never infer imports from a payee.
export function unlinkedInvoiceImports(state){
 const bills=state.invoiceBills||[],linked=new Set(bills.flatMap(b=>b.transactionIds)),groups=new Map();
 for(const m of Object.values(state.months))for(const tx of m.transactions){
  if(tx.type!=='expense'||linked.has(tx.id))continue;
  const marker=tx.memo?.match(/\[lote:([\w-]+)\]/)?.[1];
  const legacy=/^Importado do Nubank(?:\s*·|$)/i.test(tx.memo||'');
  const source=(tx.memo?.match(/^Importado do Nubank\s*·\s*([^·]+)\s*·/i)?.[1]||'importado').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,30);
  const batch=marker||(legacy?`legacy-nb-${tx.date.slice(0,7)}-${source}`:null);
  if(!batch||bills.some(b=>b.id===batch))continue;
  if(!groups.has(batch))groups.set(batch,[]);groups.get(batch).push(tx);
 }
 return [...groups].sort((a,b)=>b[1][0].date.localeCompare(a[1][0].date)||a[0].localeCompare(b[0]));
}
