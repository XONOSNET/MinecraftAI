const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const escape=require('../controller/mine_cover_exit');
function fixture(){
 const path=[[0,64,0],[1,63,0],[2,62,0]],cells=new Map();
 for(const [x,y,z] of path)cells.set([x,y-1,z].join(','),'stone');
 const b={username:'MineCover',entity:{position:new Vec3(2.5,62,.5),onGround:true},players:{},inventory:{items:()=>[{name:'cobblestone',count:3}]},blockAt(p){const name=cells.get(p.floored().toArray().join(','))||'air';return {position:p.floored(),name,boundingBox:name==='air'?'empty':'block'};}};
 const m={entry:path[0],path,supports:[...path],resource:'stone',stage:'dig',steps:2,target_y:48};
 const t={run:'mine-cover',phase:'night_stone',plot:{x:20,y:64,z:20},wilderness:{mine:m},navigator:{lastPlan:0},milestones:[],walks:[],async walk(_b,_motor,goal){this.walks.push(goal);b.entity.position=new Vec3(goal[0],Math.round(goal[1]),goal[2]);return true;}};
 return {t,b,m,motor:{pause(){}},state:{world:{bounds:[-30,40,-30,40]}}};
}
test('night shelter interruption exits recorded stairs then leaves the original mining task resumable',async()=>{
 const f=fixture();assert.equal(await escape.tick(f.t,f.b,f.motor,f.state,null,null,null,'seek cover'),true);
 assert.equal(f.m.stage,'exit');assert.equal(f.t.phase,'night_seek_cover');assert.equal(f.t.wilderness.coverResume,'night_stone');
 // Keep the exit cursor even if daylight removes the original cover request.
 for(let i=0;i<5&&f.m.stage!=='done';i++)await escape.tick(f.t,f.b,f.motor,f.state,null,null,null,'resume');
 assert.equal(f.m.stage,'done');assert.equal(f.b.entity.position.y,64);
 assert.deepEqual(f.t.walks,[[2.5,62.1,.5],[1.5,63.1,.5],[.5,64.1,.5]]);
 assert.deepEqual(f.t.milestones,[]);assert.equal(f.b.inventory.items()[0].count,3);
 assert.equal(await escape.tick(f.t,f.b,f.motor,f.state,null,null,null,'seek cover'),false);
});
test('ordinary mining and surface cover requests do not acquire a mine exit',async()=>{
 const f=fixture();assert.equal(await escape.tick(f.t,f.b,f.motor,f.state,null,null,null,'night_stone'),false);
 f.b.entity.position.y=64;assert.equal(await escape.tick(f.t,f.b,f.motor,f.state,null,null,null,'seek cover'),false);
 assert.equal(f.m.stage,'dig');assert.equal(f.t.wilderness.coverResume,undefined);
});
test('an airborne committed jump is preserved while the mine exit waits to land',async()=>{
 const f=fixture();f.b.entity.onGround=false;let pauses=0;f.motor={pause(){pauses++;},committedJump:()=>true};
 await escape.tick(f.t,f.b,f.motor,f.state,null,null,null,'seek cover');
 assert.equal(pauses,0);assert.equal(f.m.exitIndex,2);assert.equal(f.t.walks.length,0);
});
