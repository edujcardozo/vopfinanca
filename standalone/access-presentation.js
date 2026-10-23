export function remainingTrialDays(info){
  return Number.isInteger(info?.trialDaysRemaining)?Math.max(0,Math.min(15,info.trialDaysRemaining)):null;
}
export function accessLabel(info){
  if(!info)return '';
  if(info.phase==='revoked')return 'Acesso removido';
  if(info.isOwner===false)return info.phase==='trialing'&&remainingTrialDays(info)!==null?`Compartilhado · ${remainingTrialDays(info)} dias de teste`:'Plano compartilhado';
  if(info.phase==='permanent')return 'Acesso permanente';
  if(info.phase==='trialing'){
    const days=remainingTrialDays(info);return days===null?'Teste grátis':`Teste grátis · ${days===1?'1 dia':days+' dias'}`;
  }
  if(info.phase==='active')return info.paymentSource==='manual_pix'?'Pix confirmado':info.canceledAt?'Acesso até o fim do período':'Assinatura ativa';
  if(info.phase==='payment_required')return info.paymentSource==='manual_pix'?'Renovar acesso':'Teste encerrado';
  if(info.phase==='canceled')return 'Assinatura cancelada';
  if(info.phase==='awaiting_payment')return 'Aguardando pagamento';
  return '';
}
export function accessTone(info){
  return info?.phase==='permanent'||info?.phase==='active'?'success':
    ['payment_required','canceled','awaiting_payment','revoked'].includes(info?.phase)?'attention':'trial';
}
