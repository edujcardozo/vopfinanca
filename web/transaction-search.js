// Amounts are stored in cents. Numeric searches compare the whole amount,
// rather than matching digits in unrelated amounts (31 must not match 131).
export function searchAmountCents(query){
  const value=String(query).trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  let normalized;
  if(/^\d+(?:[,.]\d{1,2})?$/.test(value))normalized=value.replace(',','.');
  else if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value))normalized=value.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value))normalized=value.replace(/,/g,'');
  else return null;
  const cents=Math.round(Number(normalized)*100);
  return Number.isSafeInteger(cents)?cents:null;
}

export function matchesTransactionSearch(transaction,category,query){
  const search=String(query).trim().toLocaleLowerCase('pt-BR');
  if(!search)return true;
  const text=`${transaction.payee||''} ${transaction.memo||''} ${transaction.description||''} ${category?.name||'Entrada'}`.toLocaleLowerCase('pt-BR');
  return text.includes(search)||searchAmountCents(search)===transaction.amount;
}
