const fallback='#7446ff';
const safeColor=color=>typeof color==='string'&&/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)?color:fallback;
const coordinate=value=>String(Math.round(value*1e6)/1e6);
const point=(radius,angle)=>`${coordinate(100+radius*Math.cos(angle))} ${coordinate(100+radius*Math.sin(angle))}`;
let donutId=0;

export function donutSegments(values,palette=[fallback]){
  const slices=values.map((value,index)=>({value,color:safeColor(palette[index%palette.length])})).filter(slice=>Number.isFinite(slice.value)&&slice.value>0);
  if(!slices.length)return [];
  const largest=Math.max(...slices.map(slice=>slice.value)),total=slices.reduce((sum,slice)=>sum+slice.value/largest,0);
  let position=0;
  return slices.map((slice,index)=>{const start=position,end=index===slices.length-1?1:position+(slice.value/largest)/total;position=end;return {color:slice.color,start,end};});
}

// Keep the ring vector-based through zoom and Retina rendering. A single alpha
// mask feathers both circular contours, so segment edges never overpaint the
// same antialiasing pixels. The center text remains native HTML.
export function donutSvg(values,palette=[fallback]){
  const slices=donutSegments(values,palette);
  const start='<svg class="report-donut-svg" xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" aria-hidden="true" focusable="false">';
  if(!slices.length)return start+'</svg>';
  const id='vpo-donut-'+(++donutId),edge=id+'-edge';
  let drawing=`<defs><radialGradient id="${edge}" gradientUnits="userSpaceOnUse" cx="100" cy="100" r="100"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="59.5%" stop-color="#fff" stop-opacity="0"/><stop offset="60.5%" stop-color="#fff" stop-opacity="1"/><stop offset="99%" stop-color="#fff" stop-opacity="1"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="${id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="200" height="200" mask-type="alpha"><rect width="200" height="200" fill="url(#${edge})"/></mask></defs><g mask="url(#${id})"><rect width="200" height="200" fill="${slices[0].color}"/>`;
  // Sectors extend beyond the circular mask; only the shared mask draws the
  // inner and outer curves. A solid first sector prevents translucent seams.
  for(const slice of slices.slice(1)){
    const from=slice.start*2*Math.PI-Math.PI/2,to=slice.end*2*Math.PI-Math.PI/2,large=slice.end-slice.start>.5?1:0;
    const path=`M100 100 L${point(150,from)} A150 150 0 ${large} 1 ${point(150,to)} Z`;
    drawing+=`<path d="${path}" fill="${slice.color}"/>`;
  }
  return start+drawing+'</g></svg>';
}
