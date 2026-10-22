/* Decode the original GIF and center the main character in every frame.
   Assets stay unchanged. omggif 1.0.10 is bundled under its MIT license. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./vendor/omggif-1.0.10.js').GifReader);
  else root.DiaryMoodGif=factory(root.GifReader);
})(typeof window==='undefined'?globalThis:window,function(GifReader){
'use strict';
function subject(pixels,w,h,focus){
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let best=[];
  for(let start=0;start<seen.length;start++){
    if(seen[start]||pixels[start*4+3]<96) continue;
    let head=0,tail=1;queue[0]=start;seen[start]=1;
    while(head<tail){
      const p=queue[head++],x=p%w;
      const next=[x?p-1:-1,x<w-1?p+1:-1,p>=w?p-w:-1,p<w*(h-1)?p+w:-1];
      for(const n of next) if(n>=0&&!seen[n]&&pixels[n*4+3]>=96){seen[n]=1;queue[tail++]=n;}
    }
    if(tail>best.length) best=queue.slice(0,tail);
  }
  if(!best.length) return {x:w/2,y:h/2,width:w};
  let top=h,bottom=0;
  for(const p of best){const y=Math.floor(p/w);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const height=bottom-top+1,y=top+height*focus,band=height*.18;
  let left=w,right=0;
  for(const p of best){const py=Math.floor(p/w);if(Math.abs(py-y)<=band){left=Math.min(left,p%w);right=Math.max(right,p%w);}}
  if(right<left) return {x:w/2,y,width:w};
  return {x:(left+right)/2,y,width:right-left+1};
}
function decode(bytes,focus){
  const reader=new GifReader(bytes),w=reader.width,h=reader.height;
  if(w*h>1024*1024||reader.numFrames()>300) throw Error('GIF exceeds the character animation limit');
  let pixels=new Uint8ClampedArray(w*h*4),last=null,restore=null,total=0,subjectWidth=1;
  const frames=[];
  for(let i=0;i<reader.numFrames();i++){
    if(last&&last.disposal===2){
      for(let y=last.y;y<last.y+last.height;y++) pixels.fill(0,(y*w+last.x)*4,(y*w+last.x+last.width)*4);
    }else if(last&&last.disposal===3&&restore) pixels=restore.slice();
    const info=reader.frameInfo(i);restore=info.disposal===3?pixels.slice():null;
    reader.decodeAndBlitFrameRGBA(i,pixels);
    const anchor=subject(pixels,w,h,focus),duration=Math.max(20,(info.delay||10)*10);
    total+=duration;subjectWidth=Math.max(subjectWidth,anchor.width);
    frames.push({pixels:pixels.slice(),anchor,end:total,duration});last=info;
  }
  return {width:w,height:h,frames,total,subjectWidth,loops:reader.loopCount()};
}
function placement(asset,frame,size){
  const scale=size*.9/asset.subjectWidth;
  return {x:size/2-frame.anchor.x*scale,y:size/2-frame.anchor.y*scale,width:asset.width*scale,height:asset.height*scale,scale};
}
function frameAt(asset,elapsed){
  const t=Math.max(0,elapsed)%asset.total;
  return asset.frames.findIndex(f=>t<f.end);
}
const cache=new Map(),states=new Map();let raf=null;
function load(src,focus){
  const key=src+'|'+focus;
  if(!cache.has(key)) cache.set(key,fetch(src).then(r=>{if(!r.ok)throw Error('GIF '+r.status);return r.arrayBuffer();}).then(b=>decode(new Uint8Array(b),focus)).catch(e=>{cache.delete(key);throw e;}));
  return cache.get(key);
}
function draw(s,now){
  const size=s.el.clientWidth;if(!size) return;
  const dpr=Math.min(2,window.devicePixelRatio||1),side=Math.max(1,Math.round(size*dpr));
  let resized=s.canvas.width!==side||s.canvas.height!==side;
  if(resized){s.canvas.width=side;s.canvas.height=side;}
  const index=frameAt(s.asset,now-s.started);
  if(index===s.index&&!resized) return;
  const frame=s.asset.frames[index],ctx=s.canvas.getContext('2d'),p=placement(s.asset,frame,size);
  s.source.getContext('2d').putImageData(new ImageData(frame.pixels,s.asset.width,s.asset.height),0,0);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
  ctx.save();ctx.beginPath();ctx.arc(size/2,size/2,size/2,0,Math.PI*2);ctx.clip();
  ctx.drawImage(s.source,p.x,p.y,p.width,p.height);ctx.restore();
  s.index=index;s.el.dataset.gifFrame=String(index);
}
function tick(now){
  raf=null;let active=false;
  for(const [el,s] of states){
    if(!el.isConnected){states.delete(el);continue;}
    if(!s.asset||el.hidden||document.visibilityState==='hidden'||!el.getClientRects().length) continue;
    active=true;draw(s,now);
  }
  if(active) raf=requestAnimationFrame(tick);
}
function wake(){if(raf===null&&typeof requestAnimationFrame==='function')raf=requestAnimationFrame(tick);}
function attach(el,src,options){
  let s=states.get(el);const focus=options.focus;
  if(s&&s.src===src&&s.focus===focus){wake();return;}
  const canvas=el.querySelector('.mood-gif-canvas')||document.createElement('canvas');
  canvas.className='mood-gif-canvas';canvas.setAttribute('aria-hidden','true');
  if(!canvas.parentNode)el.appendChild(canvas);
  s={el,src,focus,canvas,index:-1,asset:null};states.set(el,s);el.dataset.gifState='loading';
  load(src,focus).then(asset=>{
    if(states.get(el)!==s)return;
    s.asset=asset;s.started=performance.now();s.source=document.createElement('canvas');
    s.source.width=asset.width;s.source.height=asset.height;
    el.dataset.gifState='ready';draw(s,s.started);wake();
  }).catch(()=>{if(states.get(el)===s)el.dataset.gifState='error';});
}
if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange',wake);
  window.addEventListener('resize',()=>{for(const s of states.values())s.index=-1;wake();});
}
return {subject,decode,placement,frameAt,attach};
});
