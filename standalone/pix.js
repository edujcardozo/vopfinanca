import qrcode from 'qrcode-generator';

// Banco Central, Manual de Padrões para Iniciação do Pix 2.10.0,
// sections 2.5.1 and 2.6.3. No payment data is sent to a QR image service.
export function crc16(value){
  let crc=0xffff;
  for(const byte of new TextEncoder().encode(value)){
    crc^=byte<<8;
    for(let bit=0;bit<8;bit++)crc=((crc<<1)^((crc&0x8000)?0x1021:0))&0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
const field=(id,value)=>{
  const length=new TextEncoder().encode(value).length;
  if(length<1||length>99)throw new Error('Campo Pix inválido.');
  return id+String(length).padStart(2,'0')+value;
};
const merchantText=(value,max)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 .-]/g,'').trim().slice(0,max);
export function validCPF(value){
  if(!/^\d{11}$/.test(value)||/^(\d)\1{10}$/.test(value))return false;
  for(let size=9;size<11;size++){
    let sum=0;for(let i=0;i<size;i++)sum+=Number(value[i])*(size+1-i);
    if((sum*10)%11%10!==Number(value[size]))return false;
  }
  return true;
}
export function buildPixPayload({key,keyType='cpf',amountCents,merchantName,merchantCity,txid='***'}){
  if(typeof key!=='string'||!key||key.length>77||/[^\x21-\x7e]/.test(key)||(keyType==='cpf'&&!validCPF(key)))throw new Error('Chave Pix inválida.');
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>99999999999)throw new Error('Valor Pix inválido.');
  if(txid!=='***'&&!/^[A-Za-z0-9]{1,25}$/.test(txid))throw new Error('Identificador Pix inválido.');
  const name=merchantText(merchantName,25),city=merchantText(merchantCity,15);
  if(!name||!city)throw new Error('Recebedor Pix incompleto.');
  const content=field('00','01')+field('26',field('00','br.gov.bcb.pix')+field('01',key))+field('52','0000')+field('53','986')+field('54',(amountCents/100).toFixed(2))+field('58','BR')+field('59',name)+field('60',city)+field('62',field('05',txid))+'6304';
  return content+crc16(content);
}
export function pixQRCodeSVG(payload){
  const code=qrcode(0,'M');code.addData(payload,'Byte');code.make();
  const count=code.getModuleCount(),size=count+8;let path='';
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(code.isDark(y,x)){
    const start=x;while(x+1<count&&code.isDark(y,x+1))x++;
    const run=x-start+1;path+=`M${start+4} ${y+4}h${run}v1h-${run}z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR Code para pagar a mensalidade do VPO com Pix"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
export function proofWhatsAppURL(phone,email,amountCents){
  if(!/^55[1-9]\d{9,10}$/.test(phone||''))throw new Error('WhatsApp indisponível.');
  const price=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amountCents/100);
  const message=`Olá! Quero enviar o comprovante do Pix de ${price} referente a 1 mês do VPO.${email?'\nMinha conta VPO: '+String(email).slice(0,254):''}\nVou anexar o comprovante nesta conversa.`;
  return 'https://wa.me/'+phone+'?text='+encodeURIComponent(message);
}
