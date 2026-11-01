const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),defense=require('../controller/survival_defense'),night=require('../controller/first_night');
function fixture(){
 const enemy={id:2,name:'zombie',isValid:true,position:new Vec3(.5,64,-1.5)},axe={name:'wooden_axe',count:1};let hits=0;
 const b={username:'LabAI0',health:20,food:20,entity:{position:new Vec3(.5,64,.5),onGround:true,yaw:0},entities:{enemy},heldItem:axe,inventory:{items:()=>[axe],slots:[]},world:{raycast:()=>null},deactivateItem(){},lookAt:async()=>{},setControlState(){},attack(e){assert.equal(e.id,enemy.id);hits++;},equip:async item=>{b.heldItem=item;}};
 b.inventory.slots[5]={name:'leather_helmet'};
 const t={phase:'gather',milestones:[],wilderness:{},lastProgress:123},state={run:'unit-only',world:{bounds:[-20,20,-20,20],first_night:{hostiles:true}}},commands=[],motor={pause(){},command(...args){commands.push(args);}},scan=()=>({pooled:Array(32).fill(0),hits:[],proximity:{rearSafe:false}});
 return {b,t,state,motor,scan,enemy,commands,hits:()=>hits};
}
test('pre-shelter hostile encounters use the combat specialist and normal attack cooldown',async()=>{
 const f=fixture(),calls=[],api=async(path,data)=>{calls.push(data);assert.equal(path,'/step');return {action:data.teacher};};
 assert.equal(await defense.tick(f.t,f.b,f.motor,f.state,api,f.scan),true);assert.equal(f.hits(),1);assert.equal(calls[0].world_skill,'combat');assert.equal(calls[0].teacher,6);assert.equal(f.t.phase,'gather');assert.match(f.t.message,/Defending against zombie/);
 await defense.tick(f.t,f.b,f.motor,f.state,api,f.scan);assert.equal(f.hits(),1,'cooldown prevents another hit');assert.equal(calls[1].teacher,4);
});
test('candidate combat decisions are respected rather than replaced by teacher attacks',async()=>{
 const f=fixture();await defense.tick(f.t,f.b,f.motor,f.state,async()=>({action:4}),f.scan);assert.equal(f.hits(),0);assert.equal(f.t.lastProgress,123);
});
test('defensive spacing requires an explicit safe rear-ground probe',async()=>{
 const f=fixture();
 await defense.tick(f.t,f.b,f.motor,f.state,async()=>({action:3}),f.scan);assert.equal(f.commands.at(-1)[2].rearSafe,false);
 f.scan=()=>({pooled:Array(32).fill(0),hits:[],proximity:{canWalk:(yaw,distance)=>Math.abs(yaw-Math.PI)<.001&&distance===.7}});
 await defense.tick(f.t,f.b,f.motor,f.state,async()=>({action:3}),f.scan);assert.equal(f.commands.at(-1)[2].rearSafe,true);
});
test('defense refuses fists and can equip a carried axe when armor is worn',async()=>{
 const f=fixture();f.b.heldItem=null;f.b.inventory.items=()=>[];assert.equal(await defense.tick(f.t,f.b,f.motor,f.state,async(_p,d)=>({action:d.teacher}),f.scan),false);assert.equal(f.hits(),0);
 const g=fixture();g.b.heldItem={name:'oak_log'};await defense.tick(g.t,g.b,g.motor,g.state,async(_p,d)=>({action:d.teacher}),g.scan);assert.equal(g.b.heldItem.name,'wooden_axe');assert.equal(g.hits(),0,'equipping does not count as a hit');
});
test('defense ignores protected levels, safe shelters, animals, neutral mobs, distant and occluded targets',()=>{
 for(const mode of ['protected','sheltered','sleeping','animal','neutral','distant','wall','outside']){
  const f=fixture();if(mode==='protected')f.state.world.first_night.hostiles=false;if(mode==='sheltered')f.t.milestones.push('hut');if(mode==='sleeping')f.b.isSleeping=true;
  if(mode==='animal')f.enemy.name='sheep';if(mode==='neutral')f.enemy.name='enderman';if(mode==='distant')f.enemy.position.z=-8;if(mode==='outside')f.state.world.bounds=[0,10,0,10];
  if(mode==='wall')f.b.world.raycast=()=>({intersect:new Vec3(.5,65,-.5)});
  assert.equal(defense.target(f.t,f.b,f.state.world),null,mode);
 }
});
test('First Night interrupts gathering to defend before a hut exists',async()=>{
 const f=fixture();night.init(f.t,{});await night.interrupt(f.t,f.b,f.motor,f.state,async(_p,d)=>({action:d.teacher}),f.scan);assert.equal(f.hits(),1);assert.equal(f.t.wilderness.priority,'Defending');
});
