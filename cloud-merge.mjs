/* Three-way metadata reconciliation. Photos are immutable references, never a prerequisite for merging text. */
const missing=Symbol('missing');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const record=v=>v&&typeof v==='object'&&!Array.isArray(v)&&v!==missing;
export function stable(v){
  if(v===missing||v===undefined)return 'undefined';
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  if(record(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
const equal=(a,b)=>stable(a)===stable(b);
function decode(v){if(v===missing)return v;try{return JSON.parse(v);}catch{return v;}}
export function valuesEqual(a,b){
  const decodeAll=o=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k,decode(v)]));
  return equal(decodeAll(a),decodeAll(b));
}
export function references(values){
  const ids=new Set();
  // IDs must occupy an entire stored value. Text that merely mentions an ID is not a photo reference.
  const visit=v=>{if(typeof v==='string'&&/^ph_[0-9]+_[a-z0-9]+$/.test(v))ids.add(v);else if(Array.isArray(v))v.forEach(visit);else if(record(v))Object.values(v).forEach(visit);};
  Object.values(values).forEach(v=>visit(decode(v)));return ids;
}
export function mergeValues(base,local,remote,resolve=null){
  const known=!!base,conflicts=[];
  function merge(b,l,r,path){
    if(equal(l,r))return l;
    if(known&&equal(l,b))return r;
    if(known&&equal(r,b))return l;
    if(!known&&(l===missing||r===missing))return l===missing?r:l;
    if(!known&&path[0]==='couple_diary_v1'&&path.length===2&&!['entries','bucket','anniversaries','promises'].includes(path[1]))return r;
    if(path.at(-1)==='updatedAt'&&typeof l==='number'&&typeof r==='number')return Math.max(l,r);
    if(record(l)&&record(r)&&(record(b)||b===missing)){
      const result=Object.create(null);
      for(const k of new Set([...Object.keys(b===missing?{}:b),...Object.keys(l),...Object.keys(r)])){
        const v=merge(b!==missing&&own(b,k)?b[k]:missing,own(l,k)?l[k]:missing,own(r,k)?r[k]:missing,[...path,k]);
        if(v!==missing)result[k]=v;
      }
      return result;
    }
    const identified=a=>Array.isArray(a)&&a.length>0&&a.every(x=>record(x)&&['string','number'].includes(typeof x.id));
    if(identified(l)&&identified(r)&&(Array.isArray(b)||b===missing)){
      const byId=a=>Object.fromEntries((a===missing?[]:a).map(v=>[String(v.id),v]));
      const merged=merge(b===missing?missing:byId(b),byId(l),byId(r),path);
      return Object.values(merged);
    }
    conflicts.push(path.join('/'));
    return resolve==='remote'?r:l;
  }
  const values={};
  for(const k of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){
    const b=own(base||{},k)?decode(base[k]):missing;
    const l=own(local,k)?decode(local[k]):missing,r=own(remote,k)?decode(remote[k]):missing;
    // Existing installations did not persist their baseline. Prefer cloud display preferences on migration;
    // keep local-only records and require a decision for divergent diary text.
    const isRecords=k==='diary_v2'||k==='couple_diary_v1';
    const result=!known&&!isRecords?(r!==missing?r:l):merge(b,l,r,[k]);
    if(result!==missing)values[k]=typeof result==='string'?result:JSON.stringify(result);
  }
  return {values,conflicts};
}
export function hasRecords(values){
  try{if(Object.keys(JSON.parse(values.diary_v2||'{}')).length)return true;}catch{return true;}
  try{const c=JSON.parse(values.couple_diary_v1||'{}');return !!(Object.keys(c.entries||{}).length||c.bucket?.length||c.anniversaries?.length||Object.keys(c.promises||{}).length||c.startDate||c.profilePhoto);}catch{return true;}
}
export function combinePhotos(values,local,remote){
  const photos={};for(const id of references(values)){
    const src=local.photos?.[id]??remote?.photos?.[id];
    if(typeof src!=='string')throw new Error('사진 원본이 아직 기기에 저장되지 않았어요. 사진을 다시 선택한 뒤 저장해주세요.');
    photos[id]=src;
  }
  return photos;
}
