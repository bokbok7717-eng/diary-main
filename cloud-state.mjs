/* A separate database avoids duplicating diary JSON in the browser's small localStorage quota. */
export function createStateStore(indexedDB){
  let opening;
  function open(){return opening??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('diary_cloud_state_db',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('state');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });}
  async function access(mode,fn){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('state',mode);let result;const req=fn(tx.objectStore('state'));
    if(req)req.onsuccess=()=>{result=req.result;};
    tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('기기 저장 공간을 확인해주세요.'));
  });}
  return {
    load:user=>access('readonly',s=>s.get('baseline:'+user)),
    save:value=>access('readwrite',s=>s.put(value,'baseline:'+value.user)),
    recover:(user,value)=>access('readwrite',s=>s.put(value,'recovery:'+user+':'+Date.now()))
  };
}
