import {donutSegments} from './vector-charts.js?v=vpo-80';

const rendered=new WeakMap();
const tau=2*Math.PI;

export function donutRasterSize(cssSize,pixelRatio=1){
  if(!Number.isFinite(cssSize)||cssSize<=0)return null;
  const ratio=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
  const pixels=Math.min(4096,Math.max(1,Math.round(cssSize*ratio)));
  return {ratio,pixels,samples:Math.min(4096,pixels*4)};
}

// Smooth the ring at 4x the device pixel density, then downsample once. Text
// stays in the DOM; the SVG remains available for print and Canvas fallback.
export function renderDonutCanvas(canvas,values,palette,{pixelRatio=globalThis.devicePixelRatio||1,createCanvas}={}){
  if(!canvas)return false;
  const host=canvas.parentElement;
  const fallback=()=>{host?.removeAttribute('data-smooth');rendered.delete(canvas);return false;};
  let work;
  try{
    const rect=host?.getBoundingClientRect(),size=donutRasterSize(rect?.width,pixelRatio),parts=donutSegments(values,palette);
    if(!size||!parts.length||typeof canvas.getContext!=='function')return fallback();
    const {ratio,pixels,samples}=size;
    // Align the final bitmap with physical pixels, including fractional zoom.
    canvas.style.width=canvas.style.height=pixels/ratio+'px';
    canvas.style.left=Math.round(rect.left*ratio)/ratio-rect.left+'px';
    canvas.style.top=Math.round(rect.top*ratio)/ratio-rect.top+'px';
    const key=pixels+':'+JSON.stringify(parts);
    if(rendered.get(canvas)===key)return true;
    const target=canvas.getContext('2d');
    if(!target)return fallback();
    work=createCanvas?createCanvas():canvas.ownerDocument.createElement('canvas');
    if(!work||work===canvas)return fallback();
    work.width=work.height=samples;
    const context=work.getContext('2d');
    if(!context)return fallback();
    const center=samples/2;
    context.fillStyle=parts[0].color;context.fillRect(0,0,samples,samples);
    for(const part of parts.slice(1)){
      context.beginPath();context.moveTo(center,center);
      context.arc(center,center,samples*.75,part.start*tau-Math.PI/2,part.end*tau-Math.PI/2);
      context.closePath();context.fillStyle=part.color;context.fill();
    }
    // Crop each circular edge once, avoiding several antialiased arcs painted
    // over the same boundary and the colored fringe that can produce.
    context.fillStyle='#000';context.globalCompositeOperation='destination-in';context.beginPath();
    context.arc(center,center,center,0,tau);context.fill();
    context.globalCompositeOperation='destination-out';context.beginPath();
    context.arc(center,center,center*.6,0,tau);context.fill();
    canvas.width=canvas.height=pixels;
    target.imageSmoothingEnabled=true;
    if('imageSmoothingQuality' in target)target.imageSmoothingQuality='high';
    target.clearRect(0,0,pixels,pixels);target.drawImage(work,0,0,samples,samples,0,0,pixels,pixels);
    rendered.set(canvas,key);host?.setAttribute('data-smooth','true');return true;
  }catch{return fallback();}
  finally{if(work&&work!==canvas){work.width=1;work.height=1;}}
}
