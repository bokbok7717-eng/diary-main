const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
  const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  const cls=new Set(['layout-minihome']);let diary='usagi',couple='hachiware';
  const nodes={};
  for(const id of ['mood-chart','cp-mood-chart']){
    const image={src:null,writes:0,getAttribute(){return this.src;},setAttribute(k,v){this.src=v;this.writes++;}};
    nodes[id+'-character']={hidden:true,style:{setProperty(k,v){this[k]=v;}},querySelector(){return image;},image};
  }
  const c={document:{body:{classList:{contains:k=>cls.has(k)}},getElementById:id=>nodes[id]},getDSkin:()=>diary,getCSkin:()=>couple};
  vm.createContext(c);vm.runInContext(html.slice(html.indexOf('var MOOD_CHARACTER_GIFS='),html.indexOf('function updateUsagiTheme(){')),c);
  const arc={x:130,y:130,innerRadius:70};
  const chart={canvas:{id:'mood-chart'},ctx:{},getDatasetMeta:()=>({data:[arc]})};
  return{c,nodes,cls,arc,chart,setDiary:k=>diary=k,setCouple:k=>couple=k};
}
test('GIF follows actual hole geometry after a chart resize and leaves clearance from the ring',()=>{
 const f=fixture(),el=f.nodes['mood-chart-character'];f.c.positionMoodCharacter(f.chart);
 assert.equal(el.hidden,false);assert.equal(el.style.left,'130px');assert.equal(el.style.width,'134px');
 f.arc.x=95;f.arc.y=90;f.arc.innerRadius=49;f.c.positionMoodCharacter(f.chart);
 assert.equal(el.style.left,'95px');assert.equal(el.style.top,'90px');assert.equal(el.style.width,'92px');assert.equal(el.style.height,'92px');
});
test('diary and couple select separate GIFs and repeat draws do not restart the animation',()=>{
 const f=fixture(),d=f.nodes['mood-chart-character'],cp=f.nodes['cp-mood-chart-character'];
 f.c.positionMoodCharacter(f.chart);f.c.positionMoodCharacter(f.chart);assert.equal(d.image.writes,1);
 assert.equal(d.image.src,'assets/mood-gifs/usagi-diary.gif');
 const c={...f.chart,canvas:{id:'cp-mood-chart'}};f.c.positionMoodCharacter(c);
 assert.equal(cp.image.src,'assets/mood-gifs/hachiware-couple.gif');
 f.setDiary('chiikawa');f.c.positionMoodCharacter(f.chart);assert.equal(d.image.src,'assets/mood-gifs/chiikawa-diary.gif');assert.equal(cp.image.writes,1);
});
test('default layout, ordinary skins, destroyed charts and empty charts never cover the no-data message',()=>{
 const f=fixture(),el=f.nodes['mood-chart-character'];f.c.positionMoodCharacter(f.chart);
 f.cls.clear();f.c.positionMoodCharacter(f.chart);assert.equal(el.hidden,true);
 f.cls.add('layout-minihome');f.setDiary('sky');f.c.positionMoodCharacter(f.chart);assert.equal(el.hidden,true);
 f.setDiary('usagi');f.chart.getDatasetMeta=()=>({data:[]});f.c.positionMoodCharacter(f.chart);assert.equal(el.hidden,true);
 f.chart.ctx=null;f.c.positionMoodCharacter(f.chart);assert.equal(el.hidden,true);
});
