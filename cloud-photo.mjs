/* Private, per-user photo storage for diary sync. No privileged keys. */
const PHOTO_TYPES={jpeg:'jpg',png:'png',webp:'webp',gif:'gif'};
const MAX_META_BYTES=15*1024*1024;
const textEncoder=new TextEncoder();
const PHOTO_ID=/^ph_[0-9]+_[a-z0-9]+$/;
const HASH=/^[a-f0-9]{64}$/;
function hex(bytes){return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
function typeFromPath(path){
  const ext=path.split('.').pop();
  return ext==='jpg'?'image/jpeg':ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':null;
}
function photoBytes(dataUrl){
  const match=/^data:image\/(jpeg|png|webp|gif);base64,/.exec(dataUrl);
  if(!match)throw new Error('지원하지 않는 사진 형식이에요.');
  const encoded=dataUrl.slice(match[0].length),decoded=atob(encoded);
  const bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  return {bytes,mime:'image/'+match[1],ext:PHOTO_TYPES[match[1]]};
}
function toDataUrl(bytes,mime){
  const parts=[];
  for(let i=0;i<bytes.length;i+=16384)parts.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  return 'data:'+mime+';base64,'+btoa(parts.join(''));
}
function ensurePath(userId,id,path){
  if(!PHOTO_ID.test(id)||typeof path!=='string')throw new Error('클라우드 사진 목록이 올바르지 않아요.');
  const prefix=userId+'/'+id+'/';
  if(!path.startsWith(prefix))throw new Error('사진 접근 권한을 확인해주세요.');
  const filename=path.slice(prefix.length),dot=filename.lastIndexOf('.');
  if(dot<1||!HASH.test(filename.slice(0,dot))||!typeFromPath(path))throw new Error('클라우드 사진 경로가 올바르지 않아요.');
  return filename.slice(0,dot);
}
function duplicate(error){
  return error&&(String(error.statusCode)==='409'||String(error.status)==='409'||/already exists|duplicate|resource already/i.test(error.message||''));
}
/* All cloud writes use immutable, content-addressed paths. Existing files are never overwritten. */
export function makePhotoStore(client,userId,bucket='diary-photos'){
  if(!client||typeof userId!=='string'||!userId)throw new Error('먼저 로그인해주세요.');
  const storage=client.storage.from(bucket);
  async function fingerprint(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
  async function upload(snapshot,previous,progress=()=>{}){
    const photos={},list=Object.entries(snapshot.photos||{});
    for(let i=0;i<list.length;i++){
      const [id,dataUrl]=list[i];
      if(!PHOTO_ID.test(id))throw new Error('사진 식별자를 확인해주세요.');
      const image=photoBytes(dataUrl);
      const hash=await fingerprint(image.bytes);
      const path=userId+'/'+id+'/'+hash+'.'+image.ext;
      if(previous?.format!==2||previous.photos?.[id]!==path){
        progress('☁️ 사진 업로드 '+(i+1)+'/'+list.length);
        const {error}=await storage.upload(path,new Blob([image.bytes],{type:image.mime}),{contentType:image.mime,upsert:false});
        if(error&&!duplicate(error))throw error;
      }
      photos[id]=path;
    }
    const packed={format:2,values:snapshot.values,photos};
    if(textEncoder.encode(JSON.stringify(packed)).length>MAX_META_BYTES)throw new Error('일기 글과 설정 데이터가 너무 커서 저장하지 못했어요.');
    return packed;
  }
  async function download(packed,progress=()=>{}){
    if(packed?.format===1)return packed;
    if(packed?.format!==2||!packed.values||typeof packed.values!=='object'||Array.isArray(packed.values)||!packed.photos||typeof packed.photos!=='object'||Array.isArray(packed.photos))throw new Error('지원하지 않는 클라우드 저장 형식이에요.');
    const photos={},list=Object.entries(packed.photos);
    for(let i=0;i<list.length;i++){
      const [id,path]=list[i],hash=ensurePath(userId,id,path);
      progress('☁️ 사진 불러오기 '+(i+1)+'/'+list.length);
      const {data,error}=await storage.download(path);
      if(error)throw error;
      const bytes=new Uint8Array(await data.arrayBuffer());
      if(await fingerprint(bytes)!==hash)throw new Error('사진 데이터가 손상되어 가져오기를 중단했어요.');
      photos[id]=toDataUrl(bytes,typeFromPath(path));
    }
    return {format:1,values:packed.values,photos};
  }
  return {upload,download};
}
