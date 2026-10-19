/* Personal multi-device sync. Only a publishable key belongs in this file. */
(function(){
'use strict';
const URL='https://ylououtwifistyuwlqht.supabase.co';
const KEY='sb_publishable_viaFToYOJ9NYcrfkF79FRA_-radbnkH';
const META='diary_cloud_baseline_v1';
const Core=window.DiaryCloudCore;
let makePhotoStore=null;
let client,user=null,base=null,remote=null,busy=false,ready=false,epoch=0,status='로그인해서 휴대폰과 PC를 연결하세요.',lastClean='',saveTimer;
const $=id=>document.getElementById(id);
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
<div class="cloud-actions"><button id="cloud-check" class="cloud-primary">지금 동기화</button><button id="cloud-download">저장된 내용 불러오기</button><button id="cloud-upload">이 기기 내용으로 연결</button></div>
<div class="cloud-actions"><button id="cloud-backup">이 기기 백업 받기</button><button id="cloud-logout">로그아웃</button></div>
<p class="cloud-note">저장한 일기·커플 기록·사진·꾸미기 설정을 연동해요. 작성 중인 초안과 잠금 비밀번호는 이 기기에만 남아요. 사진은 계정별 비공개 저장소에 따로 보관해요. 글과 사진은 같은 계정의 다른 기기에서 자동으로 동기화돼요.</p></section>`;
document.body.appendChild(modal);
const open=document.createElement('button');open.id='cloud-open';open.className='backup-btn';open.textContent='☁️';open.title='기기 연동';open.setAttribute('aria-label','기기 연동');
document.querySelector('.top-bar').insertBefore(open,document.querySelector('.mode-switch'));
open.onclick=()=>{modal.showModal();render();if(user)void check();};
$('cloud-close').onclick=()=>modal.close();
function render(){
  $('cloud-message').textContent=status;
  $('cloud-auth').hidden=!!user;$('cloud-signed').hidden=!user;
  $('cloud-account').textContent=user?user.email:'휴대폰과 PC에서 같은 이메일로 로그인하세요.';
  $('cloud-guide').textContent=base&&base.user===user?.id?'저장한 변경은 자동으로 전송해요. 다른 기기의 변경은 알림이 뜨면 불러와주세요.':'처음 연결하는 기기예요. 이 기기 자료를 올릴지, 기존 클라우드 자료를 불러올지 선택하세요.';
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
function failure(e){console.warn('Diary sync:',e.code||e.name||'error');message(e.message&&/어요|주세요|습니다/.test(e.message)?e.message:'연결에 실패했어요. 인터넷과 로그인 상태를 확인하고 다시 시도해주세요. ('+(e.code||'network')+')');}
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
  const uid=user.id;const hash=await digest(snapshot);current(token);
  const manifest=await makePhotoStore(client,uid).upload(snapshot,remote?.user===uid?remote.manifest:null,message);
  current(token);
  let query=expected===null?client.from('diary_sync').insert({user_id:uid,data:manifest,version:1}):client.from('diary_sync').update({data:manifest,version:expected+1}).eq('user_id',uid).eq('version',expected);
  const {data,error}=await query.select('version');current(token);
  if(error?.code==='23505'||(!error&&data.length!==1))throw new Error('다른 기기에서도 수정했어요. 자동 저장을 멈췄어요. 백업 후 저장된 내용을 불러와주세요.');
  if(error)throw error;
  saveBase(data[0].version,hash);lastClean=Core.stable(snapshot);remote={user:uid,data:snapshot,manifest,version:data[0].version,hash};
  message('☁️ 저장 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));
}
async function check(){return run(async token=>{
  base=readBase();const snapshot=capture(),hash=await digest(snapshot);remote=await readRemote(user.id,token);current(token);
  // Keep the baseline captured with this snapshot; later tabs must not rebase stale data.
  const action=Core.decision(user.id,base,hash,remote);
  if(action==='choose'){message(remote?'저장된 자료가 있어요. 아래에서 이 기기에 불러올 수 있어요.':'클라우드가 비어 있어요. “이 기기 내용으로 연결”을 눌러 시작하세요.');return;}
  if(action==='equal'){saveBase(remote.version,hash);lastClean=Core.stable(snapshot);message('☁️ 저장된 내용이 같아요.');return;}
  if(action==='upload'){await write(snapshot,base.version,token);return;}
  if(action==='download'){
    const active=document.activeElement;
    const typing=!!active?.matches?.('input,textarea,[contenteditable="true"]');
    const openEditor=Array.from(document.querySelectorAll('.entry-modal')).some(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');
    if(typing||openEditor){message('다른 기기 변경이 있어요. 편집을 닫으면 자동으로 반영할게요.');return;}
    message('☁️ 다른 기기의 변경을 반영하고 있어요.');
    await applySnapshot(remote.data);current(token);
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
async function applySnapshot(s){
  Core.validate(s);
  if(!window.photoDB)throw new Error('사진 저장 공간을 열지 못했어요. 브라우저 설정을 확인해주세요.');
  // Photos commit before their IDs are installed in localStorage. Existing photos are retained.
  await new Promise((resolve,reject)=>{const tx=photoDB.transaction(PHOTO_STORE,'readwrite');for(const [id,data]of Object.entries(s.photos))tx.objectStore(PHOTO_STORE).put(data,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
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
  const latest=await readRemote(user.id,token);current(token);remote=latest;
  if(latest){message('이미 클라우드에 자료가 있어요. 이 기기 백업을 받은 뒤 “저장된 내용 불러오기”로 연결해주세요. 서로 다른 자료를 자동으로 덮어쓰지 않아요.');return;}
  if(!confirm('이 기기의 일기·사진·설정을 내 Supabase 계정에 올리고 자동 동기화를 시작할까요?'))return;
  backupCurrent();await write(capture(),null,token);
});
$('cloud-check').onclick=check;
$('cloud-backup').onclick=()=>{try{backupCurrent();message('백업 파일을 내려받았어요.');}catch(e){failure(e);}};
$('cloud-logout').onclick=()=>run(async()=>{
  const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
  message('로그아웃했어요. 이 기기에 저장된 일기와 사진은 남아 있어요.');
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
      if(next?.id!==user?.id){epoch++;user=next;base=readBase();remote=null;status=user?'저장된 자료를 확인하고 있어요.':'로그인해서 휴대폰과 PC를 연결하세요.';render();if(user)setTimeout(()=>void check(),0);}
    });
    ready=true;render();
    const {data,error}=await client.auth.getSession();if(error)throw error;
    user=data.session?.user||null;base=readBase();render();if(user)void check();
    setInterval(()=>{if(user&&document.visibilityState==='visible')void check();},12000);
    document.addEventListener('visibilitychange',()=>{if(user&&document.visibilityState==='visible')void check();});
    window.addEventListener('online',()=>{if(user)void check();});
    window.addEventListener('diary-saved',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>void check(),1200);});
    window.addEventListener('beforeunload',e=>{if(!user||base?.user!==user.id)return;let dirty=true;try{dirty=Core.stable(capture())!==lastClean;}catch{}if(busy||dirty){e.preventDefault();e.returnValue='';}});
  }catch(e){failure(e);}
}
void start();
})();
