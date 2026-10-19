/* Shared, dependency-free sync decisions; also exercised by the Node tests. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.DiaryCloudCore=factory();
})(typeof window==='object'?window:this,function(){
  'use strict';
  const keys=[
    'diary_v2','couple_diary_v1','diary_goal_v1','diary_partner_name',
    'diary_skin_v1','couple_skin_v1','diary_font_v1','diary_font_scope_v1',
    'diary_layout_mode_v2','diary_ui_settings_v1','diary_card_style',
    'mini_home_profile_copy_diary_v1','mini_home_profile_copy_couple_v1',
    'mini_home_diary_profile_photo_v1','mh_pins_diary_v1','mh_pins_couple_v1',
    'mh_favs_diary_v1','mh_favs_couple_v1','mh_todayline_diary_v1','mh_todayline_couple_v1'
  ];
  function stable(value){
    if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
    if(value&&typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function snapshot(storage,cache){
    const values={},photos={};
    keys.forEach(k=>{const v=storage.getItem(k);if(v!==null)values[k]=v;});
    const refs=new Set();
    Object.values(values).forEach(v=>{for(const id of v.match(/ph_[0-9]+_[a-z0-9]+/g)||[])refs.add(id);});
    refs.forEach(id=>{if(typeof cache[id]!=='string')throw new Error('사진을 아직 읽지 못했어요. 새로고침한 뒤 다시 시도해주세요.');photos[id]=cache[id];});
    return {format:1,values,photos};
  }
  function validate(s){
    if(!s||s.format!==1||!s.values||typeof s.values!=='object'||Array.isArray(s.values)||!s.photos||typeof s.photos!=='object'||Array.isArray(s.photos))throw new Error('지원하지 않는 저장 형식이에요. 기존 자료는 그대로 보관돼요.');
    for(const [k,v] of Object.entries(s.values)){
      if(!keys.includes(k)||typeof v!=='string')throw new Error('저장된 자료의 형식을 확인해주세요.');
    }
    for(const [id,v] of Object.entries(s.photos)){
      if(!/^ph_[0-9]+_[a-z0-9]+$/.test(id)||typeof v!=='string'||!/^data:image\/(jpeg|png|webp|gif);base64,/.test(v))throw new Error('사진 형식을 확인해주세요.');
    }
    for(const k of ['diary_v2','couple_diary_v1'])if(s.values[k]){
      const parsed=JSON.parse(s.values[k]);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('일기 형식을 확인해주세요.');
    }
    const refs=new Set();Object.values(s.values).forEach(v=>(v.match(/ph_[0-9]+_[a-z0-9]+/g)||[]).forEach(id=>refs.add(id)));
    refs.forEach(id=>{if(!Object.prototype.hasOwnProperty.call(s.photos,id))throw new Error('저장된 자료에 사진이 빠져 있어요.');});
    return s;
  }
  function decision(user,base,localHash,remote){
    if(!base||base.user!==user)return 'choose';
    if(!remote)return 'conflict'; // Never silently recreate an unexpectedly deleted cloud row.
    if(remote.hash===localHash)return 'equal';
    if(remote.version!==base.version)return localHash===base.hash?'download':'conflict';
    return localHash!==base.hash?'upload':'equal';
  }
  return {keys,stable,snapshot,validate,decision};
});
