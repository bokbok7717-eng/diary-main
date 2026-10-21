/* Browser adapter: auth, metadata reconciliation and background photos have independent lifecycles. */
(function(){
'use strict';
const URL='https://ylououtwifistyuwlqht.supabase.co';
const KEY='sb_publishable_viaFToYOJ9NYcrfkF79FRA_-radbnkH';
const META='diary_cloud_baseline_v1',PRIVACY_GATE='diary_logout_privacy_gate_v1';
const Core=window.DiaryCloudCore,$=id=>document.getElementById(id);
let client,user=null,authPhase='checking',engine=null,photoStore=null,store=null,merge=null,watcher=null;
let currentManifest=null,legacy=null,epoch=0,authBusy=false,phase='starting',status='일기 연결을 준비하고 있어요.';
let connectingEpoch=null;
let saveTimer,retryTimer,retryDelay=1500,photoRetry,photoJob=0,photoSignature='',photoText='',refreshTimer;
const readJSON=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const owner=()=>readJSON(PRIVACY_GATE)?.user||readJSON(META)?.user||null;
const gate=document.createElement('section');gate.id='diary-private-gate';gate.setAttribute('aria-label','일기 접근 상태');
gate.innerHTML='<div aria-hidden="true" style="font-size:38px">📔</div><h2 id="diary-private-heading">일기를 열고 있어요</h2><p id="diary-private-copy">로그인 상태를 확인하고 있어요.</p><button id="diary-private-login" type="button" hidden>로그인해서 열기</button>';
document.body.appendChild(gate);
const modal=document.createElement('dialog');modal.id='cloud-dialog';modal.setAttribute('aria-labelledby','cloud-heading');
modal.innerHTML=`<button class="cloud-close" id="cloud-close" aria-label="닫기">✕</button><h2 id="cloud-heading">☁️ 기기 연동</h2>
<p id="cloud-account">로그인 상태를 확인하고 있어요.</p><p id="cloud-message" role="status" aria-live="polite"></p><p id="cloud-photos" role="status" aria-live="polite" hidden></p>
<form id="cloud-auth" hidden><label for="cloud-email">이메일</label><input id="cloud-email" type="email" autocomplete="username" required>
<label for="cloud-password">비밀번호</label><input id="cloud-password" type="password" autocomplete="current-password" minlength="8" required>
<div class="cloud-actions"><button class="cloud-primary" type="submit">로그인</button><button id="cloud-signup" type="button">처음 이용해요</button></div>
<p class="cloud-note">다이어리용 계정으로 로그인하세요. 처음 가입하면 확인 메일을 누른 뒤 돌아와 로그인하세요.</p></form>
<section id="cloud-signed" hidden><p>글은 자동으로 연동하고, 사진은 뒤에서 이어서 받아요. 다른 날짜의 기록은 함께 보관해요.</p>
<div class="cloud-actions"><button id="cloud-check" class="cloud-primary">지금 동기화</button><button id="cloud-download">저장된 내용 불러오기</button><button id="cloud-upload">이 기기 자료 업로드</button></div>
<section id="cloud-conflicts" hidden><p id="cloud-conflict-copy"></p><div class="cloud-actions"><button id="cloud-keep-local">겹친 부분은 이 기기 내용 사용</button><button id="cloud-keep-remote">겹친 부분은 클라우드 내용 사용</button></div><p class="cloud-note">선택 전 양쪽 자료를 이 기기에 복구본으로 보관해요. 겹치지 않은 기록은 모두 유지합니다.</p></section>
<div class="cloud-actions"><button id="cloud-backup">이 기기 백업 받기</button><button id="cloud-logout">로그아웃</button></div>
<p class="cloud-note">초안과 잠금 비밀번호는 이 기기에 남아요. 사진은 계정별 비공개 저장소에 보관합니다.</p><p class="cloud-note">연동 수정판 v3 · 2026-10-21</p></section>`;
document.body.appendChild(modal);
const open=document.createElement('button');open.id='cloud-open';open.className='backup-btn';open.textContent='☁️';open.setAttribute('aria-label','기기 연동');
document.querySelector('.top-bar').insertBefore(open,document.querySelector('.mode-switch'));
function privacy(){
  const wrong=user&&owner()&&owner()!==user.id;
  const locked=authPhase!=='signed-in'||wrong;
  document.documentElement.classList.toggle('diary-private-locked',!!locked);
  document.documentElement.classList.toggle('diary-auth-checking',authPhase==='checking');
  $('diary-private-login').hidden=authPhase==='checking';
  if(authPhase==='checking'){$('diary-private-heading').textContent='일기를 열고 있어요';$('diary-private-copy').textContent='로그인 상태를 확인하고 있어요.';}
  else if(authPhase==='error'){$('diary-private-heading').textContent='연결을 확인해주세요';$('diary-private-copy').textContent='로그인 상태를 확인하지 못했어요. 인터넷에 연결한 뒤 다시 확인해주세요.';$('diary-private-login').textContent='다시 확인';}
  else if(wrong){$('diary-private-heading').textContent='사용하던 계정으로 로그인해주세요';$('diary-private-copy').textContent='이 기기 기록의 계정과 로그인한 계정이 달라요. 기존 자료는 보관되어 있어요.';$('diary-private-login').textContent='계정 변경';}
  else if(authPhase==='signed-out'){$('diary-private-heading').textContent=readJSON(PRIVACY_GATE)?'로그아웃했어요':'로그인이 필요해요';$('diary-private-copy').textContent='일기와 사진을 보려면 사용하던 계정으로 로그인해주세요.';$('diary-private-login').textContent='로그인해서 열기';}
  return !locked;
}
function render(){
  $('cloud-account').textContent=authPhase==='checking'?'로그인 상태를 확인하고 있어요.':user?.email||'휴대폰과 PC에서 같은 이메일로 로그인하세요.';
  $('cloud-message').textContent=status;$('cloud-photos').textContent=photoText;$('cloud-photos').hidden=!photoText;
  $('cloud-auth').hidden=authPhase!=='signed-out';$('cloud-signed').hidden=!user||!privacy();
  const busy=authBusy||engine?.busy;
  modal.querySelectorAll('button:not(.cloud-close)').forEach(b=>b.disabled=!!busy);
  $('cloud-upload').hidden=phase!=='unlinked';
  $('cloud-conflicts').hidden=phase!=='conflict';
  open.dataset.alert=String(['error','conflict','editing'].includes(phase));
  open.title='기기 연동 · '+status+(photoText?' · '+photoText:'');
}
function message(text){status=text;render();}
function errorMessage(error){
  const text=String(error.message||'');
  if(/row.level.security|permission denied|unauthorized/i.test(text))return '일기 또는 사진 저장 권한을 확인해야 해요. 원본은 기기에 보관되어 있어요.';
  if(/bucket.*not found/i.test(text))return 'diary-photos 사진 저장소를 확인해야 해요.';
  return /어요|주세요|습니다/.test(text)?text:'연결을 확인하고 있어요. 인터넷이 연결되면 자동으로 다시 시도해요.';
}
function onState(state){
  phase=state.phase;
  if(state.phase==='syncing')status='☁️ 일기 변경을 확인하고 있어요.';
  if(state.phase==='synced'){retryDelay=1500;clearTimeout(retryTimer);status='☁️ 일기 연동 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});}
  if(state.phase==='unlinked')status='클라우드가 비어 있어요. “이 기기 자료 업로드”로 연결을 시작하세요.';
  if(state.phase==='editing')status='다른 기기 변경을 받아뒀어요. 작성 중인 내용을 저장하거나 편집을 닫으면 반영해요.';
  if(state.phase==='pending'){status='다른 기기의 변경과 함께 저장하고 있어요.';scheduleRetry();}
  if(state.phase==='error'){status=errorMessage(state.error);scheduleRetry();}
  if(state.phase==='conflict'){
    status=state.reason==='missing-cloud'?'클라우드 기록이 없어졌어요. 이 기기 자료를 백업하고 저장 상태를 확인해주세요.':'같은 기록의 같은 부분을 양쪽에서 수정했어요. 겹치지 않은 기록은 보관하고 있어요.';
    $('cloud-conflict-copy').textContent=(state.conflicts||[]).filter(p=>!p.endsWith('/updatedAt')).slice(0,6).join('\n');
  }
  render();
}
function scheduleRetry(){clearTimeout(retryTimer);const e=epoch;retryTimer=setTimeout(()=>{if(e===epoch&&document.visibilityState==='visible')void check();},retryDelay);retryDelay=Math.min(retryDelay*2,30000);}
function canApply(){return !(window.diaryHasUnsavedEdits?.());}
function local(){
  const values={};Core.keys.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)values[k]=v;});
  const photos={};for(const id of merge.references(values)){
    const source=window.photoCache?.[id]??currentManifest?.photos?.[id];if(source)photos[id]=source;
  }
  return {format:2,values,photos};
}
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(Core.stable(s))))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function validManifest(data){
  const filtered={};for(const [k,v]of Object.entries(data?.values||{})){if(!Core.keys.includes(k)||typeof v!=='string')throw new Error('클라우드 자료의 형식을 확인해주세요.');filtered[k]=v;}
  for(const k of ['diary_v2','couple_diary_v1'])if(filtered[k]){const v=JSON.parse(filtered[k]);if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('일기 형식을 확인해주세요.');}
  return photoStore.validate(data);
}
function refreshPhotos(){
  clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{
    if(!user||!privacy())return;
    window.diaryRefreshCloudPhotos?.();
  },120);
}
function hydrate(manifest){
  if(!user||!photoStore)return;
  const signature=merge.stable(manifest.photos);
  if(signature===photoSignature)return;
  photoSignature=signature;const job=++photoJob,e=epoch,service=photoStore;
  clearTimeout(photoRetry);
  const current=()=>job===photoJob&&e===epoch&&!!user;
  photoText='';render(); // No loading label for photos already saved on this device.
  void service.hydrate(manifest,{
    cache:window.photoCache,
    current,
    progress:text=>{if(current()){photoText=text;render();}},
    save:async(id,data)=>{
      if(!current())return;
      await new Promise((resolve,reject)=>{const tx=photoDB.transaction(PHOTO_STORE,'readwrite');tx.objectStore(PHOTO_STORE).put(data,id);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
      if(current()){photoCache[id]=data;refreshPhotos();}
    }
  }).then(errors=>{
    if(!current())return;
    photoText=errors.length?'일기는 연동됐어요. 사진 '+errors.length+'장은 자동으로 다시 받아요.':'';render();refreshPhotos();
    if(errors.length){photoRetry=setTimeout(()=>{if(current()){photoSignature='';hydrate(manifest);}},10000);}
  }).catch(error=>{if(current()){photoText=errorMessage(error);photoSignature='';render();}});
}
function apply(data,guard){
  guard();const before={};Core.keys.forEach(k=>before[k]=localStorage.getItem(k));
  try{Core.keys.forEach(k=>{if(Object.hasOwn(data.values,k))localStorage.setItem(k,data.values[k]);else localStorage.removeItem(k);});}
  catch(error){Core.keys.forEach(k=>{try{if(before[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,before[k]);}catch{}});throw new Error('기기 저장 공간이 부족해요. 기존 자료를 보관하고 동기화를 멈췄어요.');}
  currentManifest=data;
  window.diaryApplyCloudValues?.();
}
async function fetchWithTimeout(input,options={}){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),25000);
  const onAbort=()=>abort.abort();options.signal?.addEventListener('abort',onAbort,{once:true});
  try{return await fetch(input,{...options,signal:abort.signal});}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',onAbort);}
}
const modules=Promise.all([
  import('./cloud-engine.mjs?v=20261021-1'),import('./cloud-photo.mjs?v=20261021-1'),
  import('./cloud-state.mjs?v=20261021-1'),import('./cloud-merge.mjs?v=20261021-1')
]);
async function connect(e){
  if(connectingEpoch===e)return;connectingEpoch=e;
  try{
    const [{createSyncEngine},{makePhotoStore},{createStateStore},mergeModule]=await modules;
    await window.diaryReady;if(e!==epoch||!user||!privacy())return;
    merge=mergeModule;store??=createStateStore(indexedDB);const uid=user.id;legacy=readJSON(META);
    const isCurrent=()=>e===epoch&&user?.id===uid;
    photoStore=makePhotoStore(client,uid);
    const service=photoStore;
    const instance=createSyncEngine({userId:uid,
      local,canApply,settled:()=>{if(isCurrent())render();},schedule:(fn,ms)=>setTimeout(()=>{if(isCurrent())fn();},ms),
      state:state=>{if(isCurrent())onState(state);},
      loadBaseline:async()=>{const b=await store.load(uid);if(!isCurrent())return null;if(b?.user===uid){currentManifest=b.manifest;return b;}return null;},
      legacyBase:async(snapshot,remote)=>{
        if(legacy?.user!==uid||!remote)return null;
        if(legacy.version===remote.version)return remote.data.values;
        if(legacy.hash){try{if(await digest(Core.snapshot(localStorage,photoCache))===legacy.hash)return snapshot.values;}catch{}}
        return null;
      },
      read:async()=>{
        const {data,error}=await client.from('diary_sync').select('data,version').eq('user_id',uid).maybeSingle();if(error)throw error;if(!data)return null;
        if(!isCurrent())throw Object.assign(new Error('계정이 변경됐어요.'),{cancelled:true});
        validManifest(data.data);return data;
      },
      pack:(snapshot,previous)=>service.upload(snapshot,previous,text=>{if(isCurrent())message(text);},isCurrent),
      write:async(data,expected)=>{
        if(!isCurrent())throw Object.assign(new Error('계정이 변경됐어요.'),{cancelled:true});
        const query=expected===null?client.from('diary_sync').insert({user_id:uid,data,version:1}):client.from('diary_sync').update({data,version:expected+1}).eq('user_id',uid).eq('version',expected);
        const {data:rows,error}=await query.select('version');
        if(error?.code==='23505')return null;if(error)throw error;
        if(!Array.isArray(rows)||rows.length!==1)return null;return rows[0];
      },
      apply:(data,guard)=>{if(!isCurrent())throw Object.assign(new Error('계정이 변경됐어요.'),{cancelled:true});return apply(data,guard);},
      saveBaseline:async b=>{await store.save(b);if(!isCurrent())return;currentManifest=b.manifest;localStorage.setItem(META,JSON.stringify({user:uid,version:b.version,protocol:3}));},
      recover:value=>store.recover(uid,value),
      hydrate:data=>{if(isCurrent()){currentManifest=data;hydrate(data);}}
    });
    if(!isCurrent()){instance.stop();return;}engine=instance;await check();
  }catch(error){if(e===epoch)onState({phase:'error',error});}
  finally{if(connectingEpoch===e)connectingEpoch=null;}
}
async function check(options={}){
  if(!user||!privacy())return;
  if(!engine){void connect(epoch);return;}
  const target=engine,e=epoch;const run=()=>e===epoch?target.sync(options):undefined;
  if(navigator.locks)return navigator.locks.request('diary-cloud-sync',{mode:'exclusive'},run);
  return run();
}
function receiveAuth(state){
  const previous=user?.id;authPhase=state.phase;user=state.user;
  if(user&&readJSON(PRIVACY_GATE)?.user===user.id)localStorage.removeItem(PRIVACY_GATE);
  if(authPhase==='signed-out'&&previous&&!readJSON(PRIVACY_GATE))localStorage.setItem(PRIVACY_GATE,JSON.stringify({user:previous}));
  if(previous!==user?.id){epoch++;engine?.stop();engine=null;currentManifest=null;photoStore=null;photoSignature='';photoJob++;photoText='';clearTimeout(retryTimer);clearTimeout(photoRetry);}
  if(state.phase==='error')status=errorMessage(state.error);
  else if(state.phase==='checking')status='로그인 상태를 확인하고 있어요.';
  else if(!user)status='로그인하면 저장된 기록을 이어서 볼 수 있어요.';
  const allowed=privacy();render();
  if(user&&allowed&&!engine&&connectingEpoch!==epoch){const e=epoch;setTimeout(()=>void connect(e),0);}
}
function startAuth(){
  if(!client)return;
  watcher?.stop();
  void import('./cloud-auth.mjs?v=20261021-1').then(({watchAuth})=>{watcher=watchAuth(client.auth,receiveAuth);});
}
open.onclick=()=>{modal.showModal();render();void check();};$('cloud-close').onclick=()=>modal.close();
$('diary-private-login').onclick=async()=>{
  if(authPhase==='error'){startAuth();return;}
  if(user&&owner()&&owner()!==user.id){const {error}=await client.auth.signOut({scope:'local'});if(error){message(errorMessage(error));return;}}
  if(!modal.open)modal.showModal();render();
};
$('cloud-check').onclick=()=>check();$('cloud-download').onclick=()=>check();
$('cloud-upload').onclick=()=>{if(confirm('이 기기의 일기·사진을 로그인한 계정에 올리고 연동을 시작할까요?'))void check({initialize:true});};
for(const [id,resolve]of [['cloud-keep-local','local'],['cloud-keep-remote','remote']])$(id).onclick=()=>{
  if(confirm('양쪽 자료를 이 기기에 복구본으로 보관한 뒤, 겹친 부분은 '+(resolve==='local'?'이 기기':'클라우드')+' 내용으로 사용할까요?'))void check({resolve});
};
$('cloud-backup').onclick=()=>{
  try{
    const snapshot=Core.snapshot(localStorage,photoCache);
    const data={app:'diary_and_couple',exportedAt:new Date().toISOString(),diary:{data:JSON.parse(snapshot.values.diary_v2||'{}'),photos:snapshot.photos},couple:{data:JSON.parse(snapshot.values.couple_diary_v1||'{}'),photos:snapshot.photos},cloudSnapshot:snapshot};
    const a=document.createElement('a'),url=window.URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='diary-backup-'+Date.now()+'.json';a.click();setTimeout(()=>window.URL.revokeObjectURL(url),1000);message('백업 파일을 내려받았어요.');
  }catch(error){message(errorMessage(error));}
};
$('cloud-logout').onclick=async()=>{
  if(!user||!confirm('로그아웃하면 일기 화면이 잠겨요. 기존 기록은 기기와 클라우드에 남습니다. 로그아웃할까요?'))return;
  const uid=user.id;localStorage.setItem(PRIVACY_GATE,JSON.stringify({user:uid}));privacy();authBusy=true;render();
  try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;if(modal.open)modal.close();}
  catch(error){localStorage.removeItem(PRIVACY_GATE);privacy();message(errorMessage(error));}
  finally{authBusy=false;render();}
};
async function authenticate(signup){
  if(authBusy||!client||!$('cloud-auth').reportValidity())return;
  authBusy=true;render();
  try{
    const credentials={email:$('cloud-email').value.trim(),password:$('cloud-password').value};
    const {data,error}=signup?await client.auth.signUp({...credentials,options:{emailRedirectTo:location.origin+location.pathname}}):await client.auth.signInWithPassword(credentials);
    if(error){message(/Invalid login/i.test(error.message)?'이메일 또는 비밀번호를 확인해주세요.':/Email not confirmed/i.test(error.message)?'가입 확인 메일을 먼저 눌러주세요.':/rate limit/i.test(error.message)?'요청이 많아요. 잠시 뒤 다시 시도해주세요.':errorMessage(error));return;}
    $('cloud-password').value='';if(data.session){receiveAuth({phase:'signed-in',user:data.session.user});if(modal.open)modal.close();}
    else message('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 돌아와 로그인하세요.');
  }catch(error){message(errorMessage(error));}finally{authBusy=false;render();}
}
$('cloud-auth').onsubmit=e=>{e.preventDefault();void authenticate(false);};$('cloud-signup').onclick=()=>authenticate(true);
window.addEventListener('diary-saved',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>void check(),500);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check();});
window.addEventListener('focus',()=>void check());window.addEventListener('online',()=>{retryDelay=1500;photoSignature='';if(currentManifest)hydrate(currentManifest);void check();});
window.addEventListener('storage',e=>{if(e.key===PRIVACY_GATE){privacy();render();}else if(Core.keys.includes(e.key)){void window.diaryReady.then(()=>loadAllPhotosToCache()).then(()=>{if(canApply())window.diaryApplyCloudValues?.();void check();});}});
window.addEventListener('beforeunload',e=>{if(user&&engine&&(engine.busy||engine.dirty())){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(document.visibilityState==='visible')void check();},5000);
privacy();render();
if(window.supabase){client=window.supabase.createClient(URL,KEY,{global:{fetch:fetchWithTimeout}});startAuth();}
else{authPhase='error';status='로그인 기능을 불러오지 못했어요. 새로고침해 주세요.';privacy();render();}
})();
