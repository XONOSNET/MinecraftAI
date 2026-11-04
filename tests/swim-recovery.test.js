const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),recovery=require('../controller/swim_recovery');
function fixture(){
 const b={username:'SwimTest',players:{},entity:{position:new Vec3(.5,63.1,.5),onGround:false,isInWater:true},getControlState:()=>true,blockAt(p){p=p.floored();const land=p.x>=4,name=p.y<63?'stone':p.y===63?(land?'dirt':'water'):'air';return {position:p,name,boundingBox:['air','water'].includes(name)?'empty':'block',getProperties:()=>({level:0})};}};
 return {b,n:{},options:{bounds:[-24,24,-24,24]}};
}
test('bobbing and replanning cannot hide a stationary swimmer; recovery commits to checked dry shore',()=>{
 const f=fixture();assert.equal(recovery.update(f.n,f.b,{...f.options,now:1000}),null);
 f.b.entity.position.y=63.3;f.n.best=0;f.n.progressAt=3900;
 const saved=recovery.update(f.n,f.b,{...f.options,now:4100});assert.ok(saved?.goal);assert.equal(Math.floor(saved.goal[0]),4);
 f.b.entity.position.x+=.2;assert.equal(recovery.update(f.n,f.b,{...f.options,now:4300}).goal,saved.goal);
 f.b.entity.position=new Vec3(4.5,64,.5);f.b.entity.onGround=true;f.b.entity.isInWater=false;
 assert.equal(recovery.update(f.n,f.b,{...f.options,now:4500}),null);assert.equal(f.n.swimRecovery,null);
});
test('moving swimmers and deliberate holds do not trigger shore recovery',()=>{
 const f=fixture();recovery.update(f.n,f.b,{...f.options,now:1000});f.b.entity.position.x+=.6;
 assert.equal(recovery.update(f.n,f.b,{...f.options,now:4100}),null);
 f.b.getControlState=()=>false;assert.equal(recovery.update(f.n,f.b,{...f.options,now:9000}),null);
});
test('no dry bank, an unloaded bank or a private bank never becomes an escape target',()=>{
 for(const mode of ['ocean','unloaded','private']){
  const f=fixture(),old=f.b.blockAt;f.b.blockAt=p=>mode==='ocean'&&p.y===63?{position:p.floored(),name:'water',boundingBox:'empty',getProperties:()=>({level:0})}:mode==='unloaded'&&p.x>=3?null:old(p);
  assert.equal(recovery.bank(f.b,{...f.options,forbidden:mode==='private'?q=>q[0]>=4:undefined}),null,mode);
 }
});
test('a short shore detour is not completion of the original navigation destination',()=>{
 const f=fixture(),{WorldNavigation}=require('../controller/world_navigation'),n=new WorldNavigation(),goal=[10.5,64.1,.5];
 n.swimRecovery={anchor:f.b.entity.position.clone(),progressAt:1000};
 const first=n.plan(f.b,goal,{...f.options,now:4100});assert.ok(n.status.water_recovery);assert.notDeepEqual(n.status.target,goal);assert.equal(first.arrived,false);
 f.b.entity.position=new Vec3(4.5,64,.5);f.b.entity.isInWater=false;f.b.entity.onGround=true;
 const next=n.plan(f.b,goal,{...f.options,now:4300});assert.deepEqual(n.status.target,goal);assert.equal(next.arrived,false);assert.equal(n.status.water_recovery,null);
});
