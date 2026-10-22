const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function fixture(mode='diary',pins,records){
 const data=records||{'2026-10-01':{photos:['new']},'2026-04-03':{photos:['april']},'2026-01-02':{photos:['old']}};
 const saved={diary:pins||[{ds:'2026-01-02',i:0},{ds:'2026-04-03',i:0},{custom:'data:image/png;base64,uploaded'}],couple:[{ds:'2026-10-01',i:0}]};
 const clone=v=>JSON.parse(JSON.stringify(v));
 const nodes={};for(const id of ['mh-picker-grid','mh-picker-pins','mh-picker-pin-count','mh-photo-picker'])nodes[id]={innerHTML:'',textContent:'',scrollTop:42,classList:{add(){},remove(){}}};
 let homeRenders=0,toasts=[];
 const c={currentMode:mode,pendingPins:[],PIN_KEY:{diary:'diary',couple:'couple'},document:{getElementById:id=>nodes[id]},jget:key=>clone(saved[key]),jset:(key,v)=>saved[key]=clone(v),modeEntries:()=>data,getEntry:ds=>data[ds],resolvePhotoSrc:p=>'src:'+p,esc:s=>String(s==null?'':s).replaceAll('"','&quot;'),toast:s=>toasts.push(s),mhRenderHome:()=>homeRenders++};c.window=c;vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('  function getPins(){'),html.indexOf('  window.mhRenderHome=function(){')),c);
 vm.runInContext(html.slice(html.indexOf('  /* pinned photo picker */'),html.indexOf('  /* FAVORITES */')),c);
 c.mhOpenPhotoPicker();
 return{c,nodes,saved,homeRenders:()=>homeRenders,toasts};
}
test('pinned photos appear in four top slots with dates, independently of month order',()=>{
 const f=fixture(),top=f.nodes['mh-picker-pins'].innerHTML,list=f.nodes['mh-picker-grid'].innerHTML;
 assert.match(top,/2026-01-02/);assert.match(top,/2026-04-03/);assert.match(top,/직접 업로드/);
 assert.equal((top.match(/class="mh-picker-pin(?: mh-picker-pin-empty)?"/g)||[]).length,4);
 assert.equal(f.nodes['mh-picker-pin-count'].textContent,'3 / 4');
 assert.match(list,/2026-10-01/);assert.doesNotMatch(list,/src:old|src:april/);
});
test('unpinning returns a dated photo to its month and replacement is saved only on SAVE',()=>{
 const f=fixture();f.c.mhRemovePendingPin(0);assert.match(f.nodes['mh-picker-grid'].innerHTML,/src:old/);
 f.c.mhTogglePin('2026-10-01',0);assert.doesNotMatch(f.nodes['mh-picker-grid'].innerHTML,/src:new/);
 assert.equal(f.saved.diary[0].ds,'2026-01-02');f.c.mhSavePinnedPhotos();
 assert.equal(f.saved.diary.length,3);assert.equal(f.saved.diary[2].ds,'2026-10-01');assert.equal(f.homeRenders(),1);
});
test('custom uploads can be removed even when there are no record photos',()=>{
 const f=fixture('diary',[{custom:'data:image/png;base64,uploaded'}],{});
 assert.match(f.nodes['mh-picker-pins'].innerHTML,/data:image\/png/);f.c.mhRemovePendingPin(0);f.c.mhSavePinnedPhotos();assert.equal(f.saved.diary.length,0);
});
test('closing without SAVE restores original pins on reopening; diary and couple remain separate',()=>{
 const f=fixture('couple');f.c.mhRemovePendingPin(0);f.c.mhClosePhotoPicker();f.c.mhOpenPhotoPicker();
 assert.equal(f.nodes['mh-picker-pin-count'].textContent,'1 / 4');f.c.mhRemovePendingPin(0);f.c.mhSavePinnedPhotos();
 assert.equal(f.saved.couple.length,0);assert.equal(f.saved.diary.length,3);
});
test('four-photo limit is retained and a missing photo can still be unpinned',()=>{
 const pins=[{ds:'missing',i:0},{ds:'2026-01-02',i:0},{ds:'2026-04-03',i:0},{custom:'uploaded'}];
 const f=fixture('diary',pins);assert.match(f.nodes['mh-picker-pins'].innerHTML,/사진 없음/);
 f.c.mhTogglePin('2026-10-01',0);assert.equal(f.c.pendingPins.length,4);assert.equal(f.toasts.length,1);
 f.c.mhRemovePendingPin(0);f.c.mhTogglePin('2026-10-01',0);assert.equal(f.c.pendingPins.length,4);
});
