/* Personal multi-device sync. Only a publishable key belongs in this file. */
(function(){
'use strict';
const URL='https://ylououtwifistyuwlqht.supabase.co';
const KEY='sb_publishable_viaFToYOJ9NYcrfkF79FRA_-radbnkH';
const META='diary_cloud_baseline_v1';
const PRIVACY_GATE='diary_logout_privacy_gate_v1';
const Core=window.DiaryCloudCore;
let makePhotoStore=null;
let syncFailed=false; // Keep errors visible until an explicit retry.
let client,user=null,base=null,remote=null,busy=false,ready=false,epoch=0,status='로그인해서 휴대폰과 PC를 연결하세요.',lastClean='',saveTimer;
const $=id=>document.getElementById(id);
function signedOutOwner(){try{const saved=JSON.parse(localStorage.getItem(PRIVACY_GATE));return typeof saved?.user==='string'?saved.user:null;}catch{return null;}}
const privacyStyle=document.createElement('style');
privacyStyle.textContent=`
html.diary-private-locked body{overflow:hidden!important;background:#f6f8f4!important}
html.diary-private-locked body > :not(#diary-private-gate):not(#cloud-dialog){visibility:hidden!important}
#diary-private-gate{display:none;position:fixed;inset:0;z-index:2147483640;background:#f6f8f4;color:#263a2c;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;text-align:center;font-family:system-ui,-apple-system,sans-serif}
html.diary-private-locked #diary-private-gate{display:flex!important;visibility:visible!important}
#diary-private-gate h2{font-size:23px;margin:0}#diary-private-gate p{font-size:15px;line-height:1.7;margin:0;max-width:310px}
#diary-private-login{background:#4e805c;color:#fff;border:0;border-radius:10px;padding:14px 25px;font-size:16px;font-weight:600;cursor:pointer}
html.diary-private-locked #cloud-dialog[open]{visibility:visible!important}
`;
document.head.appendChild(privacyStyle);
// Fail closed on every page load until an authenticated session is confirmed.
document.documentElement.classList.add('diary-private-locked');
const privacyGate=document.createElement('section');
privacyGate.id='diary-private-gate';
privacyGate.setAttribute('role','region');
privacyGate.setAttribute('aria-label','로그아웃 잠금');
privacyGate.innerHTML='<div style="font-size:46px" aria-hidden="true">🔒</div><h2>로그아웃했어요</h2><p id="diary-private-copy">일기와 사진을 보려면 이전에 사용하던 계정으로 다시 로그인해 주세요.<br>기존 일기와 클라우드 백업은 삭제되지 않았어요.</p><button type="button" id="diary-private-login">로그인해서 열기</button>';
document.body.appendChild(privacyGate);
function showPrivacyGate(owner){
  localStorage.setItem(PRIVACY_GATE,JSON.stringify({user:owner}));
  document.documentElement.classList.add('diary-private-locked');
}
function clearPrivacyGateFor(userId){
  if(signedOutOwner()!==userId)return false;
  localStorage.removeItem(PRIVACY_GATE);
  document.documentElement.classList.remove('diary-private-locked');
  return true;
}
function refreshPrivacyGate(){
  const owner=signedOutOwner(),baseline=readBase()?.user;
  // Legacy logout did not write a gate. A missing session must still lock
  // any diary already saved in this browser, including after a reload.
  if(owner||!user||(baseline&&baseline!==user.id)){
    document.documentElement.classList.add('diary-private-locked');
  }else{
    document.documentElement.classList.remove('diary-private-locked');
  }
}
window.addEventListener('storage',event=>{
  if(event.key===PRIVACY_GATE)refreshPrivacyGate();
});
const modal=document.createElement('dialog');modal.id='cloud-dialog';
modal.setAttribute('aria-labelledby','cloud-heading');
modal.innerHTML=`<button class="cloud-close" id="cloud-close" aria-label="닫기">✕</button>
<h2 id="cloud-heading">☁️ 기기 연동</h2>
<p id="cloud-account">휴대폰과 PC에서 같은 이메일로 로그인하세요.</p>
<p id="cloud-message" role="status" aria-live="polite"></p>
<form id="cloud-auth"><label for="cloud-email">이메일</label><input id="cloud-email" type="email" autocomplete="username" required>
<label for="cloud-password">비밀번호</label><input id="cloud-password" type="password" autocomplete="current-password" minlength="8" required>
<div class="cloud-actions"><button class="cloud-primary" type="submit">로그인</button><button id="cloud-signup" type="button">처음 이용해요</button></div>
<p class="cloud-note">다이어리용 계정을 만드는 버튼이에요. Supabase 홈페이지 계정과는 별개입니다. 가입 확인 메일을 누른 뒤 이 화면에서 로그인하세요.</p></form>
<section id="cloud-signed" hidden><p id="cloud-guide"></p>
<div class="cloud-actions"><button id="cloud-check" class="cloud-primary">지금 동기화</button><button id="cloud-download">저장된 내용 불러오기</button><button id="cloud-upload">이 기기 자료 업로드</button></div>
<div class="cloud-actions"><button id="cloud-backup">이 기기 백업 받기</button><button id="cloud-logout">로그아웃</button></div>
<p class="cloud-note">저장한 일기·커플 기록·사진·꾸미기 설정을 연동해요. 작성 중인 초안과 잠금 비밀번호는 이 기기에만 남아요. 사진은 계정별 비공개 저장소에 따로 보관해요. 글과 사진은 같은 계정의 다른 기기에서 자동으로 동기화돼요.</p>
<p class="cloud-note" id="cloud-build">업로드 수정판 v2.1 · 업로드할 때 백업 파일을 자동으로 열지 않아요.</p></section>`;
document.body.appendChild(modal);
const open=document.createElement('button');open.id='cloud-open';open.className='backup-btn';open.textContent='☁️';open.title='기기 연동';open.setAttribute('aria-label','기기 연동');
document.querySelector('.top-bar').insertBefore(open,document.querySelector('.mode-switch'));
open.onclick=()=>{modal.showModal();render();if(user)void check();};
$('cloud-close').onclick=()=>modal.close();
$('diary-private-login').onclick=async()=>{
  const owner=signedOutOwner()||readBase()?.user;
  if(user&&owner&&user.id!==owner){
    const {error}=await client.auth.signOut({scope:'local'});
    if(error){$('diary-private-copy').textContent='계정을 변경하는 중 오류가 발생했어요. 페이지를 새로고침한 뒤 다시 시도해주세요.';return;}
  }
  if(!modal.open)modal.showModal();
  render();
};
function render(){
  $('cloud-message').textContent=status;
  $('cloud-auth').hidden=!!user;$('cloud-signed').hidden=!user;
  $('cloud-account').textContent=user?user.email:'휴대폰과 PC에서 같은 이메일로 로그인하세요.';
  $('cloud-guide').textContent=base&&base.user===user?.id?'저장한 변경은 자동으로 전송해요. 다른 기기의 변경은 이 기기에서 편집 중이 아닐 때 자동으로 반영해요.':'처음 연결하는 기기예요. 이 기기 자료를 올릴지, 기존 클라우드 자료를 불러올지 선택하세요.';
  modal.querySelectorAll('button:not(.cloud-close)').forEach(b=>b.disabled=busy||!ready);
  $('cloud-download').disabled=busy||!ready||!remote;
  $('cloud-upload').hidden=!!base&&base.user===user?.id;
  open.dataset.alert=String(/다른 기기|충돌|실패|확인해주세요/.test(status));
  open.title='기기 연동 · '+status;
}
function message(s){status=s;render();}
function readBase(){try{return JSON.parse(localStorage.getItem(META));}catch{return null;}}
function saveBase(version,hash){base={user:user.id,version,hash};localStorage.setItem(META,JSON.stringify(base));}
async function digest(s){const bytes=new TextEncoder().encode(Core.stable(s));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function capture(){return Core.snapshot(localStorage,window.photoCache||{});}
function failure(e){
  syncFailed=true;
  const code=String(e.code||e.statusCode||e.status||'network').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48);
  console.warn('Diary sync:',code);
  const detail=String(e.message||'');
  if(/row.level.security|unauthorized|permission denied/i.test(detail)){
    message('사진 또는 일기 저장 권한을 확인해야 해요. 업로드가 완료되지 않았어요. ('+code+')');return;
  }
  if(/bucket.*not found/i.test(detail)){
    message('diary-photos 사진 저장소를 찾지 못했어요. 업로드가 완료되지 않았어요. ('+code+')');return;
  }
  message(/어요|주세요|습니다/.test(detail)?detail:'동기화에 실패했어요. 기존 자료는 이 기기에 남아 있어요. “지금 동기화” 또는 “이 기기 자료 업로드”로 다시 시도해주세요. ('+code+')');
}
async function readRemote(uid,token){
  const {data,error}=await client.from('diary_sync').select('data,version').eq('user_id',uid).maybeSingle();
  current(token);
  if(error)throw error;
  if(!data)return null;
  if(remote?.user===uid&&remote.version===data.version)return remote;
  const snapshot=await makePhotoStore(client,uid).download(data.data,message,remote?.user===uid?remote:null);
  current(token);
  Core.validate(snapshot);
  return {user:uid,data:snapshot,manifest:data.data,version:data.version,hash:await digest(snapshot)};
}
async function run(fn){if(busy||!ready||!user)return;busy=true;render();const token=epoch;
  try{await fn(token);}catch(e){if(token===epoch)failure(e);}finally{busy=false;render();}}
function current(token){if(token!==epoch)throw new Error('로그인이 변경됐어요. 다시 연결해주세요.');}
async function write(snapshot,expected,token){
  Core.validate(snapshot);
  const uid=user.id;const hash=await digest(snapshot);current(token);
  const manifest=await makePhotoStore(client,uid).upload(snapshot,remote?.user===uid?remote.manifest:null,message);
  current(token);
  message('☁️ 일기·설정 저장 중…');
  let query=expected===null?client.from('diary_sync').insert({user_id:uid,data:manifest,version:1}):client.from('diary_sync').update({data:manifest,version:expected+1}).eq('user_id',uid).eq('version',expected);
  const {data,error}=await query.select('version');current(token);
  if(error?.code==='23505'||(!error&&(!Array.isArray(data)||data.length!==1)))throw new Error('다른 기기에서도 수정했어요. 자동 저장을 멈췄어요. 백업 후 저장된 내용을 불러와주세요.');
  if(error)throw error;
  message('☁️ 계정에 저장된 자료 확인 중…');
  const {data:verified,error:verifyError}=await client.from('diary_sync').select('data,version').eq('user_id',uid).maybeSingle();
  current(token);
  if(verifyError)throw verifyError;
  if(!verified||verified.version!==data[0].version||Core.stable(verified.data)!==Core.stable(manifest)){
    throw new Error('계정의 최신 저장 상태를 다시 확인해야 해요. 원본은 이 기기에 남아 있어요.');
  }
  syncFailed=false;
  saveBase(data[0].version,hash);lastClean=Core.stable(snapshot);remote={user:uid,data:snapshot,manifest,version:data[0].version,hash};
  message('☁️ 저장 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));
}
async function check(){if(syncFailed)return;return run(async token=>{
  base=readBase();const snapshot=capture(),hash=await digest(snapshot);remote=await readRemote(user.id,token);current(token);
  // Keep the baseline captured with this snapshot; later tabs must not rebase stale data.
  const action=Core.decision(user.id,base,hash,remote);
  if(action==='choose'){message(remote?'저장된 자료가 있어요. 아래에서 이 기기에 불러올 수 있어요.':'클라우드가 비어 있어요. “이 기기 자료 업로드”를 눌러 시작하세요.');return;}
  if(action==='equal'){saveBase(remote.version,hash);lastClean=Core.stable(snapshot);message('☁️ 저장된 내용이 같아요.');return;}
  if(action==='upload'){await write(snapshot,base.version,token);return;}
  if(action==='download'){
    const active=document.activeElement;
    const typing=!!active?.matches?.('input,textarea,[contenteditable="true"]');
    const openEditor=Array.from(document.querySelectorAll('.entry-modal')).some(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');
    if(typing||openEditor){message('다른 기기 변경이 있어요. 편집을 닫으면 자동으로 반영할게요.');return;}
    message('☁️ 다른 기기의 변경을 반영하고 있어요.');
    const unchanged=Core.stable(snapshot);
    await applySnapshot(remote.data,()=>{
      current(token);
      if(Core.stable(capture())!==unchanged){
        throw new Error('불러오는 동안 이 기기에서 새로 저장했어요. 덮어쓰지 않고 멈췄어요.');
      }
    });current(token);
    saveBase(remote.version,remote.hash);
    location.reload();return;
  }
  message('두 기기의 변경이 겹쳤어요. 자동 저장을 멈췄어요. 이 기기 백업을 받은 뒤 저장된 내용을 불러와주세요.');
});}
function backup(s){
  const a=document.createElement('a');a.href=window.URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'}));a.download='diary-cloud-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>window.URL.revokeObjectURL(a.href),1000);
}
// Keep original backup compatibility, including extra settings for recovery.
function backupCurrent(){const s=capture();backup({app:'diary_and_couple',exportedAt:new Date().toISOString(),diary:{data:JSON.parse(s.values.diary_v2||'{}'),photos:s.photos},couple:{data:JSON.parse(s.values.couple_diary_v1||'{}'),photos:s.photos},cloudSnapshot:s});}
async function applySnapshot(s,guard=null){
  if(guard)guard();
  Core.validate(s);
  if(!window.photoDB)throw new Error('사진 저장 공간을 열지 못했어요. 브라우저 설정을 확인해주세요.');
  // Photos commit before their IDs are installed in localStorage. Existing photos are retained.
  await new Promise((resolve,reject)=>{const tx=photoDB.transaction(PHOTO_STORE,'readwrite');for(const [id,data]of Object.entries(s.photos))tx.objectStore(PHOTO_STORE).put(data,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  if(guard)guard();
  const old={};Core.keys.forEach(k=>old[k]=localStorage.getItem(k));
  try{Core.keys.forEach(k=>{if(Object.hasOwn(s.values,k))localStorage.setItem(k,s.values[k]);else localStorage.removeItem(k);});}
  catch(e){Core.keys.forEach(k=>{try{if(old[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,old[k]);}catch{}});throw new Error('기기 저장 공간이 부족해 불러오지 못했어요. 백업을 보관하고 공간을 확보해주세요.');}
}
$('cloud-download').onclick=()=>run(async token=>{
  const latest=await readRemote(user.id,token);current(token);if(!latest)throw new Error('아직 저장된 자료가 없어요.');
  if(!confirm('현재 기기의 내용을 백업 파일로 받은 뒤, 클라우드의 일기·사진·설정으로 바꿀까요? 작성 중인 초안은 이 기기에 남습니다.'))return;
  backupCurrent();await applySnapshot(latest.data);current(token);saveBase(latest.version,latest.hash);location.reload();
});
$('cloud-upload').onclick=()=>run(async token=>{
  syncFailed=false;
  message('☁️ 계정의 기존 자료 확인 중…');
  const latest=await readRemote(user.id,token);current(token);remote=latest;
  const snapshot=capture();
  Core.validate(snapshot);
  if(latest){
    const hash=await digest(snapshot);current(token);
    if(hash===latest.hash){
      saveBase(latest.version,hash);lastClean=Core.stable(snapshot);
      message('☁️ 저장 완료 · 이 기기의 자료가 계정에 저장되어 있어요.');return;
    }
    message('계정에 다른 자료가 있어요. 덮어쓰지 않았어요. 기존 자료를 먼저 확인해주세요.');return;
  }
  if(!confirm('이 기기의 일기·사진·설정을 로그인한 계정에 업로드할까요? 원본은 이 기기에 그대로 남고, 백업 파일은 자동 다운로드하지 않아요.')){
    message('업로드를 취소했어요. 이 기기의 자료는 그대로예요.');return;
  }
  // Do not open a blob/download URL here: it can navigate the mobile webview away.
  // Upload is non-destructive. File export remains a separate, explicit button.
  message('☁️ 업로드 준비 중… 이 화면을 열어 두세요.');
  await write(snapshot,null,token);
});
$('cloud-check').onclick=()=>{syncFailed=false;return check();};
$('cloud-backup').onclick=()=>{try{backupCurrent();message('백업 파일을 내려받았어요.');}catch(e){failure(e);}};
$('cloud-logout').onclick=()=>run(async()=>{
  const owner=user.id;
  if(!confirm('로그아웃하면 일기와 사진 화면이 잠겨요. 이 기기의 기록과 클라우드 자료는 삭제되지 않으며, 같은 계정으로 다시 로그인하면 열 수 있어요.'))return;
  showPrivacyGate(owner);
  const {error}=await client.auth.signOut({scope:'local'});
  if(error){
    clearPrivacyGateFor(owner);
    throw error;
  }
  if(modal.open)modal.close();
  message('로그아웃했어요. 일기와 사진 화면이 잠겼어요.');
});
async function authenticate(signup){
  if(busy||!ready||!$('cloud-auth').reportValidity())return;
  busy=true;render();
  try{const credentials={email:$('cloud-email').value.trim(),password:$('cloud-password').value};
    const {error,data}=signup?await client.auth.signUp({...credentials,options:{emailRedirectTo:location.origin+location.pathname}}):await client.auth.signInWithPassword(credentials);
    if(error){message(error.message.includes('Invalid login')?'이메일 또는 비밀번호가 맞지 않아요. 처음이라면 “처음 이용해요”를 눌러주세요.':error.message.includes('Email not confirmed')?'가입 확인 메일을 먼저 눌러주세요.':error.message.includes('rate limit')?'메일 요청이 많아요. 잠시 기다렸다가 다시 시도해주세요.':'로그인 요청을 확인해주세요: '+error.message);return;}
    $('cloud-password').value='';
    if(signup&&!data.session)message('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 이 다이어리로 돌아와 로그인하세요.');
  }catch(e){failure(e);}finally{busy=false;render();if(user)void check();}
}
$('cloud-auth').onsubmit=e=>{e.preventDefault();void authenticate(false);};
$('cloud-signup').onclick=()=>authenticate(true);
async function start(){
  try{
    await window.diaryReady;
    if(!window.supabase)throw new Error('로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인해주세요.');
    makePhotoStore=(await import('./cloud-photo.mjs')).makePhotoStore;
    client=window.supabase.createClient(URL,KEY);
    client.auth.onAuthStateChange((_event,session)=>{
      const next=session?.user||null;
      if(next?.id!==user?.id){
        const previousUser=user?.id;
        epoch++;syncFailed=false;user=next;base=readBase();remote=null;
        if(!user&&previousUser&&!signedOutOwner())showPrivacyGate(previousUser);
        if(user&&signedOutOwner())clearPrivacyGateFor(user.id);
        refreshPrivacyGate();
        status=user?'저장된 자료를 확인하고 있어요.':'로그인해서 휴대폰과 PC를 연결하세요.';
        render();if(user&&!document.documentElement.classList.contains('diary-private-locked'))setTimeout(()=>void check(),0);
      }
    });
    ready=true;render();
    const {data,error}=await client.auth.getSession();if(error)throw error;
    user=data.session?.user||null;base=readBase();
    if(user&&signedOutOwner())clearPrivacyGateFor(user.id);
    refreshPrivacyGate();
    render();if(user&&!document.documentElement.classList.contains('diary-private-locked'))void check();
    setInterval(()=>{if(user&&document.visibilityState==='visible')void check();},12000);
    document.addEventListener('visibilitychange',()=>{if(user&&document.visibilityState==='visible')void check();});
    window.addEventListener('online',()=>{if(user)void check();});
    window.addEventListener('diary-saved',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>void check(),1200);});
    window.addEventListener('beforeunload',e=>{if(!user)return;if(busy){e.preventDefault();e.returnValue='';return;}if(base?.user!==user.id)return;let dirty=true;try{dirty=Core.stable(capture())!==lastClean;}catch{}if(busy||dirty){e.preventDefault();e.returnValue='';}});
  }catch(e){failure(e);}
}
void start();
})();
