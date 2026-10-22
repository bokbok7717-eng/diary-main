const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gif=require('../mood-gif.js');
const cases=[['usagi','diary',13,.5],['usagi','couple',18,.48],['hachiware','diary',8,.5],['hachiware','couple',12,.42],['chiikawa','diary',13,.42],['chiikawa','couple',10,.45]];
test('tracks the main character rather than source margins or detached decorations',()=>{
 const w=100,h=100,p=new Uint8ClampedArray(w*h*4);
 for(let y=20;y<80;y++)for(let x=10;x<40;x++)p[(y*w+x)*4+3]=255;
 for(let y=0;y<5;y++)for(let x=80;x<85;x++)p[(y*w+x)*4+3]=255;
 const a=gif.subject(p,w,h,.5);assert.equal(a.x,24.5);assert.equal(a.y,50);assert.equal(a.width,30);
});
for(const [skin,mode,count,focus] of cases)test(`${skin} ${mode}: every animated frame keeps the upper body centered at all chart sizes`,()=>{
 const a=gif.decode(fs.readFileSync(path.join(__dirname,`../assets/mood-gifs/${skin}-${mode}.gif`)),focus);
 assert.equal(a.frames.length,count);assert.ok(a.total>500);
 let elapsed=0;
 for(let i=0;i<count;i++){
  const f=a.frames[i];assert.equal(gif.frameAt(a,elapsed),i);elapsed+=f.duration;
  assert.ok(f.anchor.width>50);
  for(const size of [75,100,134,260]){
   const p=gif.placement(a,f,size);
   assert.ok(Math.abs(p.x+f.anchor.x*p.scale-size/2)<1e-10);
   assert.ok(Math.abs(p.y+f.anchor.y*p.scale-size/2)<1e-10);
   assert.ok(f.anchor.width*p.scale<=size*.9+1e-10);
  }
 }
 assert.equal(gif.frameAt(a,a.total),0);
 if(skin==='hachiware'&&mode==='couple')assert.ok(a.frames.every(f=>f.anchor.x<a.width/2-25));
});
