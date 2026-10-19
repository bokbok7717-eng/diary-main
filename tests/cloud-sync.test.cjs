const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const C=require('../cloud-core.js');
const source=fs.readFileSync(require.resolve('../cloud-sync.js'),'utf8');
const hash=s=>require('node:crypto').createHash('sha256').update(C.stable(s)).digest('hex');
const snapshot=body=>({format:1,values:{diary_v2:JSON.stringify({'2026-10-19':{body,photos:[]}})},photos:{}});
async function harness({local,remote,base,race=false}){
 const values=new Map(Object.entries(local.values));if(base)values.set('diary_cloud_baseline_v1',JSON.stringify(base));
 const elements=new Map();function element(id){if(!elements.has(id))elements.set(id,{textContent:'',value:'',hidden:false,disabled:false,dataset:{},setAttribute(){},querySelectorAll(){return[]},insertBefore(){},showModal(){},close(){},reportValidity(){return true}});return elements.get(id);}
 let writes=0,filters=[];const timers=[];
 const client={auth:{onAuthStateChange(){},async getSession(){return{data:{session:{user:{id:'alice',email:'a@example.test'}}}}}},from(table){assert.equal(table,'diary_sync');let payload=null,operation=null;const q={select(){return payload?Promise.resolve().then(()=>{writes++;if(race)return{data:[],error:null};return{data:[{version:payload.version}],error:null}}):q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){return{data:remote?{data:remote.data,version:remote.version}:null,error:null}},update(p){payload=p;operation='update';return q},insert(p){payload=p;operation='insert';return q}};return q;}};
 const context={console,TextEncoder,Uint8Array,Blob,URL,crypto:webcrypto,confirm:()=>true,location:{origin:'http://localhost',pathname:'/'},localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},document:{body:{appendChild(){}},createElement:()=>element('modal'),getElementById:element,querySelector:element,visibilityState:'visible'},setTimeout:f=>{timers.push(f)},clearTimeout(){},setInterval(){},DiaryCloudCore:C,supabase:{createClient:()=>client},photoCache:{},diaryReady:Promise.resolve(),addEventListener(){}};
 context.window=context;vm.runInNewContext(source,context);
 for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,5));if(/저장 완료|자동 저장을 멈췄|클라우드가 비어|같아요|겹쳤/.test(element('cloud-message').textContent))break;}
 return{elements,values,get writes(){return writes},filters};
}
test('controller updates using both user and expected revision filters',async()=>{
 const old=snapshot('old'),local=snapshot('new');const h=await harness({local,remote:{data:old,version:4},base:{user:'alice',version:4,hash:hash(old)}});
 assert.equal(h.writes,1);assert.ok(h.filters.some(([k,v])=>k==='user_id'&&v==='alice'));assert.ok(h.filters.some(([k,v])=>k==='version'&&v===4));
 assert.equal(JSON.parse(h.values.get('diary_cloud_baseline_v1')).version,5);
});
test('controller preserves baseline when another device wins the atomic update',async()=>{
 const old=snapshot('old'),local=snapshot('new');const h=await harness({local,remote:{data:old,version:4},base:{user:'alice',version:4,hash:hash(old)},race:true});
 assert.equal(h.writes,1);assert.equal(JSON.parse(h.values.get('diary_cloud_baseline_v1')).version,4);
 assert.match(h.elements.get('cloud-message').textContent,/다른 기기/);
 assert.equal(h.values.get('diary_v2'),local.values.diary_v2);
});
test('first login does not upload local records without the user choosing',async()=>{
 const h=await harness({local:snapshot('private local'),remote:null,base:null});assert.equal(h.writes,0);assert.match(h.elements.get('cloud-message').textContent,/연결/);
});
