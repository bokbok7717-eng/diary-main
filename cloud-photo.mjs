/* Private immutable photos. Metadata synchronizes independently of this bounded background queue. */
import {references} from './cloud-merge.mjs?v=20261021-1';
const TYPES={jpeg:'jpg',png:'png',webp:'webp',gif:'gif'};
const ID=/^ph_[0-9]+_[a-z0-9]+$/,HASH=/^[a-f0-9]{64}$/;
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const fingerprint=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
function decode(url){
  const m=/^data:image\/(jpeg|png|webp|gif);base64,/.exec(url);
  if(!m)throw new Error('지원하지 않는 사진 형식이에요.');
  const raw=atob(url.slice(m[0].length));return{bytes:Uint8Array.from(raw,c=>c.charCodeAt(0)),mime:'image/'+m[1],ext:TYPES[m[1]]};
}
function encode(bytes,mime){const chunks=[];for(let i=0;i<bytes.length;i+=16384)chunks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));return 'data:'+mime+';base64,'+btoa(chunks.join(''));}
function info(user,id,path){
  if(!ID.test(id)||typeof path!=='string'||!path.startsWith(user+'/'+id+'/'))throw new Error('사진 접근 권한을 확인해주세요.');
  const name=path.slice((user+'/'+id+'/').length),dot=name.lastIndexOf('.'),ext=name.slice(dot+1);
  if(!HASH.test(name.slice(0,dot))||!Object.values(TYPES).includes(ext))throw new Error('클라우드 사진 경로를 확인해주세요.');
  return{hash:name.slice(0,dot),mime:'image/'+(ext==='jpg'?'jpeg':ext)};
}
export async function pool(items,worker,limit=4){
  let index=0;const result=new Array(items.length);
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await worker(items[i],i);}}));return result;
}
const duplicate=e=>e&&(String(e.statusCode||e.status)==='409'||/already exists|duplicate|resource already/i.test(e.message||''));
export function makePhotoStore(client,user,bucket='diary-photos'){
  if(!user)throw new Error('먼저 로그인해주세요.');
  const store=client.storage.from(bucket),verified=new Map();
  function validate(packed){
    if(![1,2].includes(packed?.format)||!packed.values||Array.isArray(packed.values)||typeof packed.values!=='object'||!packed.photos||Array.isArray(packed.photos)||typeof packed.photos!=='object')throw new Error('지원하지 않는 클라우드 저장 형식이에요.');
    for(const id of references(packed.values)){
      const src=packed.photos[id];if(!ID.test(id)||typeof src!=='string')throw new Error('클라우드의 사진 목록이 올바르지 않아요.');
      if(packed.format===2)info(user,id,src);else decode(src);
    }
    return packed;
  }
  async function upload(snapshot,previous,progress=()=>{},current=()=>true){
    const photos={},jobs=[];
    // Decide what really needs a network transfer before showing a counter.
    await pool([...references(snapshot.values)],async id=>{
      if(!current())throw Object.assign(new Error('사진 전송을 취소했어요.'),{cancelled:true});
      const src=snapshot.photos[id];
      if(typeof src!=='string')throw new Error('사진 원본을 읽지 못했어요. 원본 사진이 있는 기기에서 다시 저장해주세요.');
      if(!src.startsWith('data:')){info(user,id,src);photos[id]=src;return;}
      const image=decode(src),hash=await fingerprint(image.bytes),path=user+'/'+id+'/'+hash+'.'+image.ext;
      photos[id]=path;
      if(previous?.format!==2||previous.photos[id]!==path)jobs.push({path,image});
    });
    let completed=0;
    if(jobs.length&&current())progress('☁️ 새 사진 업로드 0/'+jobs.length);
    await pool(jobs,async({path,image})=>{
      if(!current())throw Object.assign(new Error('사진 전송을 취소했어요.'),{cancelled:true});
      const {error}=await store.upload(path,new Blob([image.bytes],{type:image.mime}),{contentType:image.mime,upsert:false});
      if(error&&!duplicate(error))throw error;
      if(current())progress('☁️ 새 사진 업로드 '+(++completed)+'/'+jobs.length);
    });
    const packed={format:2,values:snapshot.values,photos};
    if(new TextEncoder().encode(JSON.stringify(packed)).length>15*1024*1024)throw new Error('일기 글과 설정 데이터가 너무 커서 저장하지 못했어요.');
    return packed;
  }
  async function hydrate(packed,{cache={},save=async()=>{},progress=()=>{},current=()=>true}={}){
    validate(packed);const errors=[],jobs=[];
    await pool([...references(packed.values)],async id=>{
      try{
        if(!current())return;
        const src=packed.photos[id];
        if(packed.format===1){if(cache[id]!==src)await save(id,src);return;}
        const expected=info(user,id,src);
        if(verified.get(src)===cache[id]&&cache[id])return;
        // Cache validation is local work, not photo downloading. Do not label it n/all-photos.
        if(cache[id]){
          try{if(await fingerprint(decode(cache[id]).bytes)===expected.hash){verified.set(src,cache[id]);return;}}catch{}
        }
        jobs.push({id,src,expected});
      }catch(error){errors.push({id,error});}
    });
    let completed=0;
    if(jobs.length&&current())progress('☁️ 새 사진 받기 0/'+jobs.length);
    await pool(jobs,async({id,src,expected})=>{
      try{
        if(!current())return;
        const {data,error}=await store.download(src);if(error)throw error;
        const bytes=new Uint8Array(await data.arrayBuffer());
        if(await fingerprint(bytes)!==expected.hash)throw new Error('사진 데이터가 손상되어 다시 확인해야 해요.');
        if(!current())return;
        const url=encode(bytes,expected.mime);await save(id,url);
        if(current())verified.set(src,url);
      }catch(error){errors.push({id,error});}
      finally{if(current())progress('☁️ 새 사진 받기 '+(++completed)+'/'+jobs.length);}
    });
    return errors;
  }
  // Compatibility for callers that explicitly need a complete export.
  async function download(packed,progress=()=>{},cached=null){
    const photos={...(cached?.data?.photos||{})};const errors=await hydrate(packed,{cache:photos,save:async(id,url)=>{photos[id]=url;},progress});
    if(errors.length)throw errors[0].error;return{format:1,values:packed.values,photos};
  }
  return {validate,upload,hydrate,download};
}
