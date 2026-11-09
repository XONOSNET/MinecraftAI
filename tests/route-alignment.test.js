const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {alignmentCue}=require('../controller/route_alignment'),{proximity}=require('../controller/perception');
function fixture(change=()=>null){return {username:'Test',players:{},entity:{id:1,position:new Vec3(.586,64,.048),yaw:-2,onGround:true},blockAt(p){
 const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z),name=change(x,y,z)||(y<(x===1&&z===-1?63:64)?'dirt':'air');
 if(name==='unloaded')return null;
 return {name,position:new Vec3(x,y,z),boundingBox:['air','water','lava'].includes(name)?'empty':'block',getProperties:()=>({})};
}};}
test('off-center bank departure recenters then continues the original safe route',()=>{
 const b=fixture(),goal=[1.5,64.1,.5],heading=Math.atan2(-(goal[0]-b.entity.position.x),-(goal[2]-b.entity.position.z));
 assert.equal(proximity(b).canWalk(heading,.75),false);
 const cue=alignmentCue(b,goal);assert.deepEqual(cue.slice(),[.5,64.1,.5]);assert.equal(cue.centering,true);
 const toCenter=Math.atan2(-(cue[0]-b.entity.position.x),-(cue[2]-b.entity.position.z));assert.equal(proximity(b).canWalk(toCenter,.46),true);
 b.entity.position=new Vec3(.5,64,.5);assert.equal(alignmentCue(b,goal),null);assert.equal(proximity(b).canWalk(-Math.PI/2,.75),true);
});
test('alignment refuses fluid, unknown, blocked, occupied and airborne centers',()=>{
 for(const name of ['water','lava','unloaded','stone']){
  const b=fixture((x,y,z)=>x===0&&z===0&&y===64?name:null);assert.equal(alignmentCue(b,[1.5,64.1,.5]),null,name);
 }
 const b=fixture();b.entity.onGround=false;assert.equal(alignmentCue(b,[1.5,64.1,.5]),null);
 b.entity.onGround=true;b.players.Other={username:'Other',entity:{id:2,position:new Vec3(.5,64,.5)}};assert.equal(alignmentCue(b,[1.5,64.1,.5]),null);
});
test('deep drops and already centered departures do not receive alignment cues',()=>{
 const b=fixture();assert.equal(alignmentCue(b,[1.5,61.1,.5]),null);b.entity.position=new Vec3(.5,64,.5);assert.equal(alignmentCue(b,[1.5,64.1,.5]),null);
});

test('navigation alignment preserves the destination and resumes its route after centering',()=>{
 const b=fixture(),{WorldNavigation}=require('../controller/world_navigation'),nav=new WorldNavigation(),goal=[1.5,64.1,.5];
 nav.path=[goal];nav.destination=goal.join(',');nav.lastPlan=100;nav.progressAt=100;nav.anchor=[b.entity.position.x,64,b.entity.position.z];
 const first=nav.plan(b,goal,{now:101});assert.equal(nav.status.footing_alignment,true);assert.equal(first.path[0],goal);assert.deepEqual(first.cue.slice(),[.5,64.1,.5]);
 b.entity.position=new Vec3(.5,64,.5);const next=nav.plan(b,goal,{now:201});assert.equal(nav.status.footing_alignment,false);assert.equal(next.cue,goal);
});
