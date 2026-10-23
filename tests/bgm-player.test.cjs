const test=require('node:test'),assert=require('node:assert/strict');
const {createController,timeLabel}=require('../bgm-player.js');
const tracks=require('../bgm-tracks.js');
class AudioFixture{
 constructor(){this.paused=true;this.currentTime=0;this.duration=30;this.ended=false;this.listeners={};this.calls=0;this.loads=0;this.error=null;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 play(){this.calls++;if(this.error)return Promise.reject(this.error);this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}load(){this.loads++;this.currentTime=0;}removeAttribute(){this.src='';}
}
const track=(key='usagi')=>({key,audioUrl:key+'.mp3'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('metadata uses the requested title, artist and distinct covers for all themes',()=>{
 assert.equal(tracks.usagi.title,'우사기랩');assert.equal(tracks.chiikawa.artist,'파자마 파티스');assert.equal(tracks.hachiware.title,'ひとりごつ');
 assert.equal(new Set(Object.values(tracks).map(t=>t.cover)).size,3);
 for(const [skin,t] of Object.entries(tracks)){assert.equal(t.audioUrl,`assets/bgm/${skin}.mp3`);const bytes=require('node:fs').readFileSync(require('node:path').join(__dirname,'..',t.audioUrl));assert.ok(bytes.length>1000);assert.ok(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255,'provided audio has an MP3 header');}
});
test('autoplays once and keeps position while navigating or changing viewport',async()=>{
 const a=new AudioFixture(),c=createController(a,()=>{},true);c.setTrack(track(),true);await tick();a.currentTime=12;
 c.setTrack(track(),true);c.setTrack(track(),true);assert.equal(a.calls,1);assert.equal(a.currentTime,12);
});
test('blocked autoplay retries on interaction and reports actual playback',async()=>{
 const a=new AudioFixture(),c=createController(a,()=>{},true);a.error={name:'NotAllowedError'};c.setTrack(track(),true);await tick();
 assert.equal(c.snapshot().status,'blocked');assert.equal(c.snapshot().playing,false);
 a.error=null;c.retry();await tick();assert.equal(c.snapshot().status,'playing');assert.equal(a.calls,2);
});
test('explicit pause is respected across themes and layout changes',async()=>{
 const a=new AudioFixture(),preferences=[],c=createController(a,()=>{},true,v=>preferences.push(v));c.setTrack(track(),true);await tick();c.toggle();
 c.setTrack(track('chiikawa'),true);await tick();assert.equal(a.calls,1);assert.equal(a.paused,true);
 c.setTrack(track('chiikawa'),false);c.setTrack(track('chiikawa'),true);assert.equal(a.calls,1);assert.deepEqual(preferences,[false]);
 c.toggle();await tick();assert.equal(a.paused,false);
});
test('10 second controls and seek clamp to track boundaries',async()=>{
 const a=new AudioFixture(),c=createController(a,()=>{},true);c.setTrack(track(),true);await tick();a.currentTime=3;c.skip(-10);assert.equal(a.currentTime,0);
 c.skip(10);assert.equal(a.currentTime,10);c.seek(28);c.skip(10);assert.equal(a.currentTime,30);c.seek(-4);assert.equal(a.currentTime,0);
 a.duration=NaN;c.skip(10);assert.equal(a.currentTime,0);
});
test('missing sources and inactive/locked themes never start audio',()=>{
 const a=new AudioFixture(),c=createController(a,()=>{},true);c.setTrack({...track(),audioUrl:''},true);c.toggle();c.retry();assert.equal(a.calls,0);
 c.setTrack(track(),false);c.toggle();assert.equal(a.calls,0);assert.equal(a.paused,true);
});
test('a late rejection from a previous theme does not overwrite the active track',async()=>{
 const a=new AudioFixture();let reject;a.play=()=>new Promise((_,r)=>reject=r);
 const c=createController(a,()=>{},true);c.setTrack(track(),true);c.setTrack({...track('chiikawa'),audioUrl:''},true);reject({name:'NotAllowedError'});await tick();assert.equal(c.snapshot().status,'empty');
});
test('time labels are stable for loading and long tracks',()=>{assert.equal(timeLabel(NaN),'0:00');assert.equal(timeLabel(65.9),'1:05');assert.equal(timeLabel(-1),'0:00');});
test('volume persists across new players, including mute, and survives unavailable storage',()=>{
 const {createVolume}=require('../bgm-player.js');let saved=null;
 const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
 const a={},first=createVolume(a,storage);assert.equal(a.volume,.35);
 first.set(.62);assert.equal(a.volume,.62);assert.equal(createVolume({},storage).get(),.62);
 first.set(0);assert.equal(createVolume({},storage).get(),0);
 saved='broken';assert.equal(createVolume({},storage).get(),.35);
 saved='2';assert.equal(createVolume({},storage).get(),.35);
 const fallback=createVolume({},null);fallback.set(.2);assert.equal(fallback.get(),.2);
});
