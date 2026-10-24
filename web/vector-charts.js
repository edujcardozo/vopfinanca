const fallback='#7446ff';
const safeColor=color=>typeof color==='string'&&/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)?color:fallback;
const coordinate=value=>String(Math.round(value*1e6)/1e6);
const point=(radius,angle)=>`${coordinate(100+radius*Math.cos(angle))} ${coordinate(100+radius*Math.sin(angle))}`;

export function donutSegments(values,palette=[fallback]){
  const slices=values.map((value,index)=>({value,color:safeColor(palette[index%palette.length])})).filter(slice=>Number.isFinite(slice.value)&&slice.value>0);
  if(!slices.length)return [];
  const largest=Math.max(...slices.map(slice=>slice.value)),total=slices.reduce((sum,slice)=>sum+slice.value/largest,0);
  let position=0;
  return slices.map((slice,index)=>{const start=position,end=index===slices.length-1?1:position+(slice.value/largest)/total;position=end;return {color:slice.color,start,end};});
}

// SVG has no bitmap resolution ceiling. The browser draws these paths at the
// physical pixel density of the screen, including Retina and 4K displays.
export function donutSvg(values,palette=[fallback]){
  const slices=donutSegments(values,palette);
  const start='<svg class="report-donut-svg" xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" aria-hidden="true" focusable="false">';
  if(!slices.length)return start+'</svg>';
  // A solid ring behind the segments prevents transparent antialiasing seams.
  let drawing=`<circle cx="100" cy="100" r="80" fill="none" stroke="${slices[0].color}" stroke-width="40"/>`;
  if(slices.length===1)return start+drawing+'</svg>';
  for(const slice of slices){
    const from=slice.start*2*Math.PI-Math.PI/2,to=slice.end*2*Math.PI-Math.PI/2,large=slice.end-slice.start>.5?1:0;
    const path=`M${point(100,from)} A100 100 0 ${large} 1 ${point(100,to)} L${point(60,to)} A60 60 0 ${large} 0 ${point(60,from)} Z`;
    drawing+=`<path d="${path}" fill="${slice.color}"/>`;
  }
  return start+drawing+'</svg>';
}
