const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {smoothCue}=require('../controller/route_smoothing');
const {WorldNavigation}=require('../controller/world_navigation');
function fixture(change=()=>null){
 return {username:'Test',players:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},blockAt(p){
  const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z),name=change(x,y,z)||(y<64?'stone':'air');
  if(name==='unloaded')return null;
  return {name,boundingBox:['air','water'].includes(name)||name.endsWith('_door')?'empty':'block',getProperties:()=>({open:true}),position:new Vec3(x,y,z)};
 }};
}
const zigzag=()=>[[.5,64.1,1.5],[1.5,64.1,1.5],[1.5,64.1,2.5],[2.5,64.1,2.5]];
test('flat open zigzags become one diagonal leg and passed corners are removed',()=>{
 const b=fixture(),path=zigzag();assert.equal(smoothCue(b,b.entity.position,path),path[3]);
 const nav=new WorldNavigation();nav.path=path;nav.destination='2.5,64.1,2.5';nav.lastPlan=100;nav.progressAt=100;nav.anchor=[.5,64,.5];
 const result=nav.plan(b,[2.5,64.1,2.5],{now:101});
 assert.equal(result.path.length,1);assert.deepEqual(result.cue,[2.5,64.1,2.5]);assert.equal(nav.status.smoothed_waypoints,3);
 b.entity.position=new Vec3(1.5,64,1.5);
 assert.deepEqual(nav.plan(b,[2.5,64.1,2.5],{now:201}).cue,[2.5,64.1,2.5]);
});
test('shortcut checks body width so its center ray cannot clip an unsupported jagged edge',()=>{
 const b=fixture((x,y,z)=>x===1&&z===0&&y===63?'air':null),path=zigzag().slice(0,2);
 assert.equal(smoothCue(b,b.entity.position,path),path[0]);
});
test('walls, unloaded cells, private plots, and players prevent a grid-corner shortcut',()=>{
 const path=zigzag().slice(0,2);
 for(const name of ['stone','unloaded']){
  const b=fixture((x,y,z)=>x===1&&z===0&&y===64?name:null);
  assert.equal(smoothCue(b,b.entity.position,path),path[0]);
 }
 const b=fixture();assert.equal(smoothCue(b,b.entity.position,path,{forbidden:q=>q[0]===1&&q[2]===0}),path[0]);
 b.players.Other={username:'Other',entity:{id:2,position:new Vec3(2.2,64,.5)}};
 assert.equal(smoothCue(b,b.entity.position,path),path[0]);
});
test('doors, vertical transitions, and precise landing centers remain explicit waypoints',()=>{
 const path=zigzag(),b=fixture((x,y,z)=>x===1&&z===1&&y===64?'oak_door':null);
 assert.equal(smoothCue(b,b.entity.position,path),path[0]);
 const flat=fixture();path[1].centering=true;assert.equal(smoothCue(flat,flat.entity.position,path),path[0]);
 const steps=zigzag();steps[1][1]=65.1;assert.equal(smoothCue(flat,flat.entity.position,steps),steps[0]);
 flat.entity.onGround=false;assert.equal(smoothCue(flat,flat.entity.position,zigzag())[0],.5);
});
