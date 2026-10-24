import test from 'node:test';
import assert from 'node:assert/strict';
import {donutSegments} from '../web/vector-charts.js';
import {donutRasterSize,renderDonutCanvas} from '../web/donut-renderer.js';

function fixture(size=320){
 const calls=[],attributes=new Map(),rect={width:size,left:12.25,top:8.75};
 const context={fillStyle:'',globalCompositeOperation:'source-over',beginPath(){},moveTo(){},closePath(){},fillRect(){},arc(...args){calls.push(['arc',...args]);},fill(){calls.push(['fill',this.globalCompositeOperation,this.fillStyle]);}};
 const work={width:0,height:0,getContext(){return context;}};
 const output={imageSmoothingEnabled:false,imageSmoothingQuality:'low',clearRect(){},drawImage(image,...args){calls.push(['draw',image.width,image.height,...args]);}};
 const host={getBoundingClientRect:()=>rect,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)};
 const canvas={parentElement:host,style:{},width:0,height:0,getContext:()=>output};
 return {canvas,rect,work,output,calls,attributes,createCanvas:()=>work};
}

test('high-density donut buffers supersample four times and stay bounded through Retina, zoom and 4K sizes',()=>{
 assert.deepEqual(donutRasterSize(320,1),{ratio:1,pixels:320,samples:1280});
 assert.deepEqual(donutRasterSize(320,3),{ratio:3,pixels:960,samples:3840});
 assert.deepEqual(donutRasterSize(320,1.25),{ratio:1.25,pixels:400,samples:1600});
 assert.deepEqual(donutRasterSize(960,4),{ratio:4,pixels:3840,samples:4096});
 assert.deepEqual(donutRasterSize(2000,4),{ratio:4,pixels:4096,samples:4096});
 for(const size of [0,-1,NaN,Infinity])assert.equal(donutRasterSize(size,3),null);
 assert.deepEqual(donutRasterSize(200,NaN),{ratio:1,pixels:200,samples:800});
});

test('ring edges are cropped once, downsampled with smoothing and the temporary buffer is released',()=>{
 const f=fixture(),options={pixelRatio:1,createCanvas:f.createCanvas};
 assert.equal(renderDonutCanvas(f.canvas,[50000,37973,16692,3100,1400],['#7446ff','#54ba9b'],options),true);
 assert.equal(f.canvas.width,320);assert.equal(f.canvas.height,320);assert.equal(f.attributes.get('data-smooth'),'true');
 assert.equal(f.canvas.style.width,'320px');assert.equal(f.canvas.style.left,'-0.25px');assert.equal(f.canvas.style.top,'0.25px');
 assert.deepEqual(f.calls.filter(c=>c[0]==='fill').slice(-2),[['fill','destination-in','#000'],['fill','destination-out','#000']]);
 assert.deepEqual(f.calls.find(c=>c[0]==='draw').slice(1),[1280,1280,0,0,1280,1280,0,0,320,320]);
 assert.equal(f.output.imageSmoothingEnabled,true);assert.equal(f.output.imageSmoothingQuality,'high');
 assert.equal(f.work.width,1);assert.equal(f.work.height,1);
 const count=f.calls.length;assert.equal(renderDonutCanvas(f.canvas,[50000,37973,16692,3100,1400],['#7446ff','#54ba9b'],options),true);assert.equal(f.calls.length,count);
 assert.equal(renderDonutCanvas(f.canvas,[50000,20000],['#7446ff','#54ba9b'],{...options,pixelRatio:3}),true);assert.equal(f.canvas.width,960);
 f.rect.width=220;renderDonutCanvas(f.canvas,[50000,20000],['#7446ff','#54ba9b'],{...options,pixelRatio:3});assert.equal(f.canvas.width,660);
});

test('unsupported Canvas, empty data and drawing errors leave the accessible SVG fallback available',()=>{
 const f=fixture();f.attributes.set('data-smooth','true');
 assert.equal(renderDonutCanvas(f.canvas,[],[],{pixelRatio:1,createCanvas:f.createCanvas}),false);assert.equal(f.attributes.has('data-smooth'),false);
 f.canvas.getContext=()=>null;assert.equal(renderDonutCanvas(f.canvas,[5],['#7446ff'],{createCanvas:f.createCanvas}),false);
 f.canvas.getContext=()=>{throw new Error('Canvas unavailable');};assert.equal(renderDonutCanvas(f.canvas,[5],['#7446ff'],{createCanvas:f.createCanvas}),false);
 assert.equal(renderDonutCanvas(null,[5],['#7446ff']),false);
});

test('SVG fallback and smooth rendering share the same exact sector proportions and safe colors',()=>{
 const parts=donutSegments([50000,37973,16692,3100,1400],['#7446ff','#8d7afa','#54ba9b']);
 assert.equal(parts[0].start,0);assert.equal(parts.at(-1).end,1);assert.equal(parts[0].end,50000/109165);
 for(let i=1;i<parts.length;i++)assert.equal(parts[i].start,parts[i-1].end);
 assert.deepEqual(donutSegments([0,-1,Infinity,NaN]),[]);
 assert.equal(donutSegments([Number.MAX_VALUE,Number.MAX_VALUE])[0].end,.5);
 assert.equal(donutSegments([5],['\" onload=\"alert(1)'])[0].color,'#7446ff');
});
