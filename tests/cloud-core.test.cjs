const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../cloud-core.js');
const base={user:'alice',version:4,hash:'old'};
test('new device and different account must explicitly choose data',()=>{
 assert.equal(C.decision('alice',null,'mine',null),'choose');
 assert.equal(C.decision('bob',base,'mine',{version:4,hash:'old'}),'choose');
});
test('saved local changes can upload only against unchanged remote version',()=>{
 assert.equal(C.decision('alice',base,'mine',{version:4,hash:'old'}),'upload');
 assert.equal(C.decision('alice',base,'mine',{version:5,hash:'theirs'}),'conflict');
});
test('remote edits with clean local copy request download, never overwrite',()=>{
 assert.equal(C.decision('alice',base,'old',{version:5,hash:'theirs'}),'download');
});
test('retry after lost network response recognizes already committed data',()=>{
 assert.equal(C.decision('alice',base,'mine',{version:5,hash:'mine'}),'equal');
});
test('deleted cloud row is not silently resurrected',()=>{
 assert.equal(C.decision('alice',base,'mine',null),'conflict');
});
test('snapshot includes referenced photos, excludes credentials and orphan photos',()=>{
 const vals={diary_v2:JSON.stringify({'2026-10-19':{photos:['ph_123_abc'],body:'test'}}),diary_lock_v1:'1234','sb-auth-token':'secret'};
 const s=C.snapshot({getItem:k=>vals[k]??null},{ph_123_abc:'data:image/jpeg;base64,YQ==',ph_124_def:'data:image/jpeg;base64,Yg=='});
 assert.deepEqual(Object.keys(s.values),['diary_v2']);assert.deepEqual(Object.keys(s.photos),['ph_123_abc']);assert.equal(C.validate(s),s);
});
test('missing photo aborts upload instead of silently dropping it',()=>{
 assert.throws(()=>C.snapshot({getItem:k=>k==='diary_v2'?'"ph_123_abc"':null},{}));
});
test('malformed cloud snapshots cannot import arbitrary keys or photo schemes',()=>{
 assert.throws(()=>C.validate({format:1,values:{'sb-auth-token':'x'},photos:{}}));
 assert.throws(()=>C.validate({format:1,values:{diary_v2:'[]'},photos:{}}));
 assert.throws(()=>C.validate({format:1,values:{},photos:{ph_123_abc:'javascript:bad'}}));
 assert.throws(()=>C.validate({format:1,values:{diary_v2:'{"photos":["ph_123_abc"]}'},photos:{}}));
});
test('key ordering does not cause unnecessary conflicts',()=>{
 assert.equal(C.stable({b:2,a:{z:1,y:3}}),C.stable({a:{y:3,z:1},b:2}));
});
