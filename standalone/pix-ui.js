import {buildPixPayload,pixQRCodeSVG,proofWhatsAppURL} from './pix.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
const copyIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
const chatIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.8A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M8 8c0 4 4 7 7 7l1-2-3-1-1 1-2-2 1-1-1-3-2 1Z"/></svg>';
export function pixPaymentHTML(info){
  const pix=info?.manualPix;
  if(!pix?.ready||(info.isOwner===false&&!pix.preview))return '';
  const payload=buildPixPayload(pix),url=proofWhatsAppURL(pix.whatsapp,pix.accountEmail,pix.amountCents);
  return `<div class="vpo-pix-payment">${pix.preview?'<p class="vpo-pix-preview">Prévia · seu acesso é permanente.</p>':''}<div class="vpo-pix-price"><div><strong>${esc(money(pix.amountCents))}</strong><span>por 1 mês de VPO</span></div><span class="vpo-pix-tag">Pix</span></div><div class="vpo-pix-grid"><figure class="vpo-pix-qr">${pixQRCodeSVG(payload)}<figcaption>Escaneie no app do banco</figcaption></figure><div class="vpo-pix-actions"><p>Pague no seu banco e envie o comprovante para liberar o acesso.</p><button type="button" class="btn btn-blue" data-pix-copy>${copyIcon}<span>Copiar Pix</span></button><a class="btn vpo-pix-whatsapp" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${chatIcon}<span>Enviar comprovante</span></a><small>Anexe o comprovante na conversa do WhatsApp.</small></div></div><p class="vpo-pix-note">Liberação após conferência do pagamento. Sem débito automático.${info.phase==='trialing'?' O mês pago começa após seu teste grátis.':''}</p><label class="vpo-pix-code" hidden><span>Copie este código e cole no seu banco:</span><textarea readonly aria-label="Pix copia e cola">${esc(payload)}</textarea></label><div class="vpo-pix-footer"><button class="text-link" type="button" data-pix-back>← Voltar</button>${pix.preview?'':'<button class="text-link" type="button" data-pix-refresh>Conferir meu acesso ↻</button>'}</div><p class="form-error" role="alert" hidden></p></div>`;
}
export function bindPixPayment({dialog,info,back,refresh,notify,clipboard=globalThis.navigator?.clipboard}){
  if(!dialog)return;
  const payload=buildPixPayload(info.manualPix);
  dialog.querySelector('[data-pix-back]').onclick=back;
  const check=dialog.querySelector('[data-pix-refresh]');
  if(check)check.onclick=async()=>{check.disabled=true;try{await refresh();}finally{check.disabled=false;}};
  dialog.querySelector('[data-pix-copy]').onclick=async e=>{
    const button=e.currentTarget;button.disabled=true;
    try{
      if(!clipboard?.writeText)throw new Error('clipboard unavailable');
      await clipboard.writeText(payload);button.querySelector('span').textContent='Pix copiado ✓';notify('Pix copiado. Abra seu banco e escolha Pix copia e cola.');
    }catch{
      const code=dialog.querySelector('.vpo-pix-code');code.hidden=false;code.querySelector('textarea').focus();code.querySelector('textarea').select?.();notify('Selecione e copie o código Pix abaixo.');
    }finally{button.disabled=false;}
  };
}
