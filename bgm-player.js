(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DiaryBgm=factory();
})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
function timeLabel(value){
  value=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
  return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
}
function createController(audio,notify,enabled,onPreference){
  let track=null,active=false,generation=0,status='empty',want=enabled!==false;
  const snapshot=()=>({track,active,enabled:want,status,current:Number.isFinite(audio.currentTime)?audio.currentTime:0,duration:Number.isFinite(audio.duration)?audio.duration:0,playing:!audio.paused&&!audio.ended});
  const emit=()=>notify(snapshot());
  async function play(){
    if(!active||!track||!track.audioUrl)return;
    const token=generation;status='loading';emit();
    try{await audio.play();if(token===generation){status='playing';emit();}}
    catch(e){if(token!==generation)return;status=e.name==='NotAllowedError'?'blocked':e.name==='AbortError'?'paused':'error';emit();}
  }
  function setTrack(next,isActive){
    const changed=(!track!==!next)||(track&&next&&(track.key!==next.key||track.audioUrl!==next.audioUrl));
    active=!!isActive;
    if(changed){generation++;audio.pause();track=next;
      audio.removeAttribute('src');audio.load();
      if(track&&track.audioUrl){audio.src=track.audioUrl;audio.load();status='paused';}
      else status='empty';
    }
    if(!active){generation++;audio.pause();if(track&&track.audioUrl)status='paused';emit();return;}
    if(want&&track&&track.audioUrl&&(changed||status==='paused'))play();else emit();
  }
  function toggle(){
    if(!active||!track||!track.audioUrl)return;
    want=audio.paused;
    if(onPreference)onPreference(want);
    if(want)play();else{generation++;audio.pause();status='paused';emit();}
  }
  function seek(value){
    if(!active||!track||!track.audioUrl||!Number.isFinite(audio.duration)||audio.duration<=0)return;
    audio.currentTime=Math.max(0,Math.min(audio.duration,value));emit();
  }
  for(const event of ['loadedmetadata','durationchange','timeupdate','playing','pause','ended','error'])audio.addEventListener(event,()=>{
    if(event==='error'&&track&&track.audioUrl)status='error';
    else if(event==='playing')status='playing';
    else if(event==='pause'&&status!=='empty')status='paused';
    emit();
  });
  return {setTrack,toggle,seek,skip:seconds=>seek(audio.currentTime+seconds),snapshot,
    retry(){if(want&&status==='blocked')play();}};
}
function mount(){
  const el=document.getElementById('mh-bgm');if(!el)return;
  const audio=document.createElement('audio');audio.id='diary-bgm-audio';audio.preload='metadata';audio.loop=true;audio.volume=.35;document.body.appendChild(audio);
  const cover=el.querySelector('.bgm-cover'),copy=el.querySelector('.bgm-copy'),title=el.querySelector('.bgm-title'),artist=el.querySelector('.bgm-artist'),toggle=el.querySelector('.bgm-toggle'),seek=el.querySelector('.bgm-seek'),note=el.querySelector('.bgm-status');
  let enabled=true;try{enabled=localStorage.getItem('diary_bgm_enabled_v1')!=='false';}catch(_){}
  const controller=createController(audio,render,enabled,value=>{try{localStorage.setItem('diary_bgm_enabled_v1',String(value));}catch(_){}});
  let oldKey='',resizePending=false;
  function marquee(){
    const text=el.querySelector('.bgm-copy-text');
    const overflow=Math.max(0,text.scrollWidth-copy.clientWidth);
    copy.style.setProperty('--bgm-overflow',overflow+'px');copy.classList.toggle('is-long',overflow>2);
  }
  function render(state){
    const track=state.track;if(!track)return;
    if(oldKey!==track.key){oldKey=track.key;cover.src=track.cover;cover.alt=track.title+' 앨범커버';title.textContent=track.title;artist.textContent=track.artist;copy.title=track.title+' · '+track.artist;requestAnimationFrame(marquee);}
    const ready=!!track.audioUrl,seekable=ready&&state.duration>0;
    el.dataset.status=state.status;
    toggle.disabled=!ready;toggle.setAttribute('aria-label',state.playing?'일시정지':'재생');toggle.setAttribute('aria-pressed',String(state.playing));
    toggle.querySelector('.bgm-play-icon').hidden=state.playing;toggle.querySelector('.bgm-pause-icon').hidden=!state.playing;
    el.querySelectorAll('.bgm-skip').forEach(b=>b.disabled=!seekable);
    seek.disabled=!seekable;seek.max=String(state.duration||1);seek.value=String(Math.min(state.current,state.duration||0));
    seek.style.setProperty('--bgm-progress',(state.duration?state.current/state.duration*100:0)+'%');
    seek.setAttribute('aria-valuetext',timeLabel(state.current)+' / '+timeLabel(state.duration));
    el.querySelector('.bgm-current').textContent=timeLabel(state.current);el.querySelector('.bgm-duration').textContent=timeLabel(state.duration);
    note.textContent=!ready?'':state.status==='blocked'?'한 번 누르면 음악이 시작돼요':state.status==='error'?'음원을 재생할 수 없어요':state.status==='loading'?'음악을 준비하고 있어요':'';
  }
  function refresh(){
    const mobile=window.matchMedia('(max-width:899px)').matches;
    const host=document.getElementById(mobile?'mh-bgm-mobile-slot':'mh-bgm-desktop-slot');
    if(host&&el.parentNode!==host)host.appendChild(el);
    const body=document.body,skin=body.classList.contains('mode-couple')?getCSkin():getDSkin();
    const track=window.DiaryBgmTracks&&window.DiaryBgmTracks[skin];
    const visible=body.classList.contains('layout-minihome')&&!!track;
    el.hidden=!visible;
    const unlocked=!document.documentElement.classList.contains('diary-private-locked');
    controller.setTrack(track?Object.assign({key:skin},track):null,visible&&unlocked);
    requestAnimationFrame(marquee);
  }
  toggle.addEventListener('click',()=>controller.toggle());
  el.querySelector('[data-skip="-10"]').addEventListener('click',()=>controller.skip(-10));
  el.querySelector('[data-skip="10"]').addEventListener('click',()=>controller.skip(10));
  seek.addEventListener('input',()=>controller.seek(Number(seek.value)));
  document.addEventListener('pointerdown',event=>{if(!el.contains(event.target))controller.retry();});
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!el.contains(event.target))controller.retry();});
  window.addEventListener('resize',()=>{if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;refresh();});});
  new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['class']});
  api.refresh=refresh;refresh();
}
const api={timeLabel,createController,refresh:function(){}};
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}
return api;
});
