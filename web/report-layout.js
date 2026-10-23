// Keep SVG coordinates in CSS pixels: labels retain their size as the window changes.
export function reportChartHeight({viewportHeight,top=0,after=0,compact=false}={}){
  const preferred=compact?232:256;
  if(!Number.isFinite(viewportHeight)||viewportHeight<=0)return preferred;
  const available=Math.floor(viewportHeight-Math.max(0,top)-Math.max(0,after));
  return Math.max(112,Math.min(preferred,available));
}
export function incomeMonthWindow(total,width,start=null){
  const count=Math.max(1,Math.min(total||1,Math.floor((Math.max(0,width||1200)-340)/110)));
  const first=Math.max(0,Math.min(Number.isInteger(start)?start:total-count,Math.max(0,total-count)));
  return {start:first,end:Math.min(total,first+count),count};
}
