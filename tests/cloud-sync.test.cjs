const {test}=require('node:test');const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');global.crypto??=webcrypto;
const clone=structuredClone;
const record=(body,photos=[])=>({title:'',body,photos,mood:'',weather:'',tags:[]});
const snapshot=entries=>({format:2,values:{diary_v2:JSON.stringify(entries)},photos:{}});
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
const modules=Promise.all([import('../cloud-engine.mjs'),import('../cloud-photo.mjs'),import('../cloud-merge.mjs'),import('../cloud-auth.mjs')]);
function backend(initial=null){
 const db={row:clone(initial),files:new Map(),reads:0,writes:0,downloads:0,uploads:0,failReads:0,failPhotos:0,photoGate:null,packGate:null};
 db.client={storage:{from:()=>({
  async upload(path,blob){db.uploads++;if(db.files.has(path))return{error:{status:409}};db.files.set(path,new Uint8Array(await blob.arrayBuffer()));return{error:null};},
  async download(path){db.downloads++;if(db.photoGate)await db.photoGate.promise;if(db.failPhotos-->0)return{error:new Error('offline')};const bytes=db.files.get(path);return bytes?{data:new Blob([bytes]),error:null}:{error:new Error('missing photo')};}
 })}};return db;
}
async function device(db,entries={},options={}){
 const [{createSyncEngine},{makePhotoStore},M]=await modules;
 const d={values:clone(options.values||snapshot(entries).values),cache:{...(options.cache||{})},manifest:options.baseline?.manifest||null,stored:options.baseline||null,states:[],jobs:[],backups:[],editing:false,scheduled:[]};
 const photos=makePhotoStore(db.client,'alice');
 d.engine=createSyncEngine({userId:'alice',
  local:()=>({format:2,values:clone(d.values),photos:Object.fromEntries([...M.references(d.values)].map(id=>[id,d.cache[id]??d.manifest?.photos[id]]).filter(([,v])=>v))}),
  canApply:()=>!d.editing,
  loadBaseline:async()=>clone(d.stored),
  saveBaseline:async b=>{d.stored=clone(b);d.manifest=b.manifest;},
  read:async()=>{db.reads++;if(db.failReads-->0)throw new Error('offline');return clone(db.row);},
  write:async(data,expected)=>{if((db.row?.version??null)!==expected)return null;db.writes++;db.row={version:(expected??0)+1,data:clone(data)};return{version:db.row.version};},
  pack:async(s,old)=>{if(db.packGate)await db.packGate.promise;return photos.upload(s,old);},
  apply:async(s,guard)=>{guard();d.values=clone(s.values);d.manifest=s;},
  recover:async r=>d.backups.push(clone(r)),
  state:s=>d.states.push(s),schedule:fn=>d.scheduled.push(fn),
  hydrate:s=>d.jobs.push(photos.hydrate(s,{cache:d.cache,save:async(id,data)=>{d.cache[id]=data;}}))
 });
 d.set=(date,body,ids=[])=>{const v=JSON.parse(d.values.diary_v2||'{}');v[date]=record(body,ids);d.values.diary_v2=JSON.stringify(v);};
 d.entries=()=>JSON.parse(d.values.diary_v2||'{}');d.phase=()=>d.states.at(-1)?.phase;
 return d;
}
test('phone → PC → phone, then PC edit → phone without manual overwrite',async()=>{
 const db=backend();const phone=await device(db,{'2026-10-19':record('phone')});
 await phone.engine.sync({initialize:true});const pc=await device(db);await pc.engine.sync();
 assert.equal(pc.entries()['2026-10-19'].body,'phone');
 pc.set('2026-10-20','PC');await pc.engine.sync();await phone.engine.sync();
 assert.equal(phone.entries()['2026-10-20'].body,'PC');
 phone.set('2026-10-21','phone again');await phone.engine.sync();await pc.engine.sync();
 assert.equal(Object.keys(pc.entries()).length,3);assert.equal(pc.phase(),'synced');
});
test('offline, non-overlapping device edits merge automatically in both directions',async()=>{
 const db=backend();const a=await device(db,{'2026-10-19':record('shared')});await a.engine.sync({initialize:true});
 const b=await device(db);await b.engine.sync();a.set('2026-10-20','from phone');b.set('2026-10-21','from PC');
 await Promise.all([a.engine.sync(),b.engine.sync()]);await a.engine.sync();await b.engine.sync();
 assert.deepEqual(a.entries(),b.entries());assert.equal(Object.keys(b.entries()).length,3);
});
test('same-date edits to different fields merge; competing body edits require a decision',async()=>{
 const db=backend();const a=await device(db,{'2026-10-19':record('original')});await a.engine.sync({initialize:true});
 const b=await device(db);await b.engine.sync();a.set('2026-10-19','phone edit');b.set('2026-10-19','PC edit');
 await a.engine.sync();await b.engine.sync();assert.equal(b.phase(),'conflict');
 assert.equal(b.entries()['2026-10-19'].body,'PC edit');assert.equal(JSON.parse(db.row.data.values.diary_v2)['2026-10-19'].body,'phone edit');
 await b.engine.sync({resolve:'local'});assert.equal(b.backups.length,1);assert.equal(b.phase(),'synced');
 await a.engine.sync();assert.equal(a.entries()['2026-10-19'].body,'PC edit');
});
test('217 photos do not block text import or a new PC upload',async()=>{
 const db=backend();const a=await device(db);const ids=Array.from({length:217},(_,i)=>'ph_'+(1000+i)+'_abc');
 ids.forEach(id=>a.cache[id]='data:image/png;base64,YQ==');a.set('2026-10-19','217 photos',ids);await a.engine.sync({initialize:true});
 db.photoGate=deferred();const b=await device(db);await b.engine.sync();
 assert.equal(b.entries()['2026-10-19'].body,'217 photos');assert.equal(b.phase(),'synced');await tick();assert.equal(db.downloads,4);
 b.set('2026-10-20','PC while photos pending');await b.engine.sync();
 assert.equal(JSON.parse(db.row.data.values.diary_v2)['2026-10-20'].body,'PC while photos pending');
 db.photoGate.resolve();await Promise.all(b.jobs);assert.equal(Object.keys(b.cache).length,217);
});
test('reopening a page reuses persisted baseline and cached photos',async()=>{
 const db=backend();const a=await device(db);a.cache.ph_123_abc='data:image/png;base64,YQ==';a.set('2026-10-19','photo',['ph_123_abc']);await a.engine.sync({initialize:true});
 const b=await device(db);await b.engine.sync();await Promise.all(b.jobs);const count=db.downloads;
 const reopened=await device(db,{}, {values:b.values,cache:b.cache,baseline:b.stored});await reopened.engine.sync();await Promise.all(reopened.jobs);
 assert.equal(db.downloads,count);assert.equal(reopened.phase(),'synced');
});
test('temporary failures are retryable without a permanent syncFailed latch',async()=>{
 const db=backend();const a=await device(db,{'2026-10-19':record('local')});db.failReads=1;
 await a.engine.sync({initialize:true});assert.equal(a.phase(),'error');assert.equal(a.entries()['2026-10-19'].body,'local');
 await a.engine.sync({initialize:true});assert.equal(a.phase(),'synced');assert.ok(db.row);
});
test('photo failure leaves text available and permits subsequent PC writes',async()=>{
 const db=backend();const a=await device(db);a.cache.ph_123_abc='data:image/png;base64,YQ==';a.set('2026-10-19','text',['ph_123_abc']);await a.engine.sync({initialize:true});
 const b=await device(db);db.failPhotos=1;await b.engine.sync();const [errors]=await Promise.all(b.jobs);assert.equal(errors.length,1);
 b.set('2026-10-20','saved despite photo failure');await b.engine.sync();assert.equal(b.phase(),'synced');
});
test('draft/editor guard defers remote application until saving or closing',async()=>{
 const db=backend();const a=await device(db,{'2026-10-19':record('shared')});await a.engine.sync({initialize:true});
 const b=await device(db);await b.engine.sync();a.set('2026-10-20','new remote');await a.engine.sync();b.editing=true;
 await b.engine.sync();assert.equal(b.phase(),'editing');assert.equal(b.entries()['2026-10-20'],undefined);
 b.editing=false;await b.engine.sync();assert.equal(b.entries()['2026-10-20'].body,'new remote');
});
test('local edits made during an upload are re-read before publishing',async()=>{
 const db=backend();const a=await device(db,{'2026-10-19':record('old')});await a.engine.sync({initialize:true});
 a.set('2026-10-20','v1');db.packGate=deferred();const syncing=a.engine.sync();await tick();a.set('2026-10-20','v2');db.packGate.resolve();await syncing;
 assert.equal(JSON.parse(db.row.data.values.diary_v2)['2026-10-20'].body,'v2');
});
test('stopping during an in-flight read never applies another account data',async()=>{
 const [{createSyncEngine}]=await modules;const gate=deferred();let applied=false,written=false;
 const e=createSyncEngine({userId:'alice',local:()=>({values:{},photos:{}}),state(){},loadBaseline:async()=>null,read:()=>gate.promise,apply:()=>applied=true,write:()=>written=true,schedule(){}});
 const running=e.sync();await tick();e.stop();gate.resolve({version:1,data:snapshot({'2026-10-19':record('private')})});await running;
 assert.equal(applied,false);assert.equal(written,false);
});
test('restored auth session stays checking and then signed-in; never displays signed-out',async()=>{
 const [,,,{watchAuth}]=await modules;const gate=deferred(),states=[];
 const watcher=watchAuth({onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},getSession:()=>gate.promise},s=>states.push(s.phase));
 assert.deepEqual(states,['checking']);gate.resolve({data:{session:{user:{id:'alice'}}},error:null});await watcher.ready;
 assert.deepEqual(states,['checking','signed-in']);watcher.stop();
});
test('an initial null getSession result cannot overwrite a newer successful login event',async()=>{
 const [,,,{watchAuth}]=await modules;const gate=deferred(),states=[];let callback;
 const w=watchAuth({onAuthStateChange(fn){callback=fn;return{data:{subscription:{unsubscribe(){}}}}},getSession:()=>gate.promise},s=>states.push(s.phase));
 callback('SIGNED_IN',{user:{id:'alice'}});gate.resolve({data:{session:null},error:null});await w.ready;
 assert.deepEqual(states,['checking','signed-in']);callback('SIGNED_OUT',null);assert.equal(states.at(-1),'signed-out');w.stop();
});
test('auth transport error has its own state, not a false logout',async()=>{
 const [,,,{watchAuth}]=await modules;const states=[];const w=watchAuth({onAuthStateChange(){return{data:{}}},async getSession(){return{error:new Error('offline')}}},s=>states.push(s.phase));await w.ready;
 assert.deepEqual(states,['checking','error']);
});
test('three-way merge propagates deletions and independently added bucket IDs',async()=>{
 const [,,M]=await modules;
 const v=x=>({diary_v2:JSON.stringify(x)});
 assert.deepEqual(JSON.parse(M.mergeValues(v({a:record('A'),b:record('B')}),v({a:record('A')}),v({a:record('A'),b:record('B'),c:record('C')})).values.diary_v2),{a:record('A'),c:record('C')});
 const c=x=>({couple_diary_v1:JSON.stringify({bucket:x})});
 const r=M.mergeValues(c([{id:1,text:'base'}]),c([{id:1,text:'base'},{id:2,text:'phone'}]),c([{id:1,text:'base'},{id:3,text:'PC'}]));
 assert.equal(r.conflicts.length,0);assert.equal(JSON.parse(r.values.couple_diary_v1).bucket.length,3);
});
test('different fields in the same dated entry do not conflict',async()=>{
 const [,,M]=await modules;const base=snapshot({'2026-10-19':record('body')}).values;
 const local=snapshot({'2026-10-19':{...record('body'),title:'phone title'}}).values;
 const remote=snapshot({'2026-10-19':{...record('PC body'),title:''}}).values;
 const result=M.mergeValues(base,local,remote);assert.deepEqual(result.conflicts,[]);
 assert.equal(JSON.parse(result.values.diary_v2)['2026-10-19'].title,'phone title');
 assert.equal(JSON.parse(result.values.diary_v2)['2026-10-19'].body,'PC body');
});
test('a newer cloud edit requires a fresh conflict decision',async()=>{
 const db=backend();const a=await device(db,{'2026-10-19':record('base')});await a.engine.sync({initialize:true});
 const b=await device(db);await b.engine.sync();a.set('2026-10-19','phone first');b.set('2026-10-19','PC edit');
 await a.engine.sync();await b.engine.sync();a.set('2026-10-19','phone second');await a.engine.sync();
 await b.engine.sync({resolve:'local'});assert.equal(b.phase(),'conflict');assert.equal(JSON.parse(db.row.data.values.diary_v2)['2026-10-19'].body,'phone second');
});
test('settled callback re-enables controls after both successful and failed sync',async()=>{
 const [{createSyncEngine}]=await modules;let engine;const states=[];
 engine=createSyncEngine({userId:'alice',loadBaseline:async()=>null,local:()=>({values:{},photos:{}}),read:async()=>null,state(){},schedule(){},settled:()=>states.push(engine.busy)});
 await engine.sync();assert.deepEqual(states,[false]);
});
test('private photo paths reject another account before making a request',async()=>{
 const [,{makePhotoStore}]=await modules;const db=backend();const service=makePhotoStore(db.client,'alice');
 assert.throws(()=>service.validate({format:2,values:{diary_v2:JSON.stringify({d:record('x',['ph_123_abc'])})},photos:{ph_123_abc:'bob/ph_123_abc/'+'a'.repeat(64)+'.png'}}));
 assert.equal(db.downloads,0);
});
test('legacy devices keep both dated records without a persisted three-way baseline',async()=>{
 const [,,M]=await modules;
 const base=record('shared');
 const result=M.mergeValues(null,
  {diary_v2:JSON.stringify({old:base,pc:record('PC unsent')}),couple_diary_v1:JSON.stringify({startDate:null,entries:{}})},
  {diary_v2:JSON.stringify({old:base,phone:record('phone')}),couple_diary_v1:JSON.stringify({startDate:'2026-01-01',entries:{}})});
 assert.equal(result.conflicts.length,0);assert.equal(Object.keys(JSON.parse(result.values.diary_v2)).length,3);
});
test('network response lost after a commit converges without a second overwrite',async()=>{
 const [{createSyncEngine}]=await modules;const db=backend();const a=await device(db,{'2026-10-19':record('shared')});await a.engine.sync({initialize:true});
 const b=await device(db);await b.engine.sync();b.set('2026-10-20','new');
 // A committed remote row matching local contents is enough to acknowledge the next sync.
 db.row={version:db.row.version+1,data:{format:2,values:clone(b.values),photos:{}}};
 const before=db.writes;await b.engine.sync();assert.equal(b.phase(),'synced');assert.equal(db.writes,before);
});
test('216 cached photos on a new page show no loading counter and make no download requests',async()=>{
 const [,{makePhotoStore}]=await modules,db=backend();
 const ids=Array.from({length:216},(_,i)=>'ph_'+(5000+i)+'_abc');
 const cache=Object.fromEntries(ids.map(id=>[id,'data:image/png;base64,YQ==']));
 const data={format:1,values:snapshot({d:record('cached',ids)}).values,photos:cache};
 const packed=await makePhotoStore(db.client,'alice').upload(data,null);
 const progress=[];const reopened=makePhotoStore(db.client,'alice');
 const errors=await reopened.hydrate(packed,{cache,save:async()=>assert.fail('cached photos should not be saved again'),progress:s=>progress.push(s)});
 assert.equal(errors.length,0);assert.equal(db.downloads,0);assert.deepEqual(progress,[]);
 const uploadProgress=[];await reopened.upload(data,packed,s=>uploadProgress.push(s));assert.deepEqual(uploadProgress,[]);
});
test('with 216 cached photos and 2 new photos the loading counter is n/2, never n/218',async()=>{
 const [,{makePhotoStore}]=await modules,db=backend();
 const ids=Array.from({length:218},(_,i)=>'ph_'+(6000+i)+'_abc');
 const photos=Object.fromEntries(ids.map(id=>[id,'data:image/png;base64,YQ==']));
 const packed=await makePhotoStore(db.client,'alice').upload({format:1,values:snapshot({d:record('new',ids)}).values,photos},null);
 const cache=Object.fromEntries(ids.slice(0,216).map(id=>[id,photos[id]])),progress=[];
 const errors=await makePhotoStore(db.client,'alice').hydrate(packed,{cache,save:async(id,data)=>cache[id]=data,progress:s=>progress.push(s)});
 assert.equal(errors.length,0);assert.equal(db.downloads,2);assert.deepEqual(progress,['☁️ 새 사진 받기 0/2','☁️ 새 사진 받기 1/2','☁️ 새 사진 받기 2/2']);
});
