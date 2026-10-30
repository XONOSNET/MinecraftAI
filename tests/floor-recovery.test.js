const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{HutTeacher}=require('../controller/hut_teacher'),house=require('../controller/house');
function fixture(){
 const q={x:1,y:63,z:0,floor:true},map=new Map(house.blueprint({x:0,y:64,z:0}).filter(v=>v.floor).map(v=>[[v.x,v.y,v.z].join(','),'oak_planks']));map.delete('1,63,0');
 const b={username:'floor-check',players:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,velocity:new Vec3(0,0,0)},blockAt(p){p=p.floored();const name=map.get([p.x,p.y,p.z].join(','))||(p.y<63?'stone':'air');return {name,position:p,boundingBox:name==='air'?'empty':'block'};}};
 const t=new HutTeacher();t.plot={x:0,y:64,z:0};t.phase='floor';const state={world:{bounds:[-20,20,-20,20]}},motor={pause(){}};return {t,b,q,map,state,motor};
}
test('floor refusal retains the hole, moves to another stance, and resumes the same tile',async()=>{
 const {t,b,map,state,motor}=fixture();let attempts=0;const visited=[];
 t.place=async(_b,q)=>{attempts++;if(attempts===1)throw Error('Server refused to place oak_planks');map.set([q.x,q.y,q.z].join(','),'oak_planks');};
 t.walk=async(_b,_m,g)=>{visited.push(g);b.entity.position=new Vec3(...g);return true;};
 await t.buildFloor(b,motor,state);assert.equal(t.floorRecovery.refusals,1);assert.ok(t.message.includes('different safe stance'));assert.equal(map.has('1,63,0'),false);
 await t.buildFloor(b,motor,state);assert.equal(attempts,2);assert.equal(visited.length,1);assert.equal(t.floorRecovery,null);assert.equal(map.get('1,63,0'),'oak_planks');
});
test('floor retries are bounded and never claim progress from a rejected packet',async()=>{
 const {t,b,state,motor}=fixture();t.lastProgress=123;t.place=async()=>{throw Error('Server refused to place oak_planks');};t.walk=async(_b,_m,g)=>{b.entity.position=new Vec3(...g);return true;};
 await t.buildFloor(b,motor,state);await t.buildFloor(b,motor,state);
 await assert.rejects(t.buildFloor(b,motor,state),/after three checked stances/);assert.equal(t.lastProgress,123);
});
test('moving and airborne builders settle without digging or placing',async()=>{
 for(const mode of ['moving','airborne']){const {t,b,state,motor}=fixture();if(mode==='moving')b.entity.velocity.x=.1;else b.entity.onGround=false;
 t.place=async()=>assert.fail('must settle first');b.dig=async()=>assert.fail('must settle first');await t.buildFloor(b,motor,state);assert.match(t.message,/Settling/);}
});
test('floor work waits for a player occupying the target and propagates real inventory failures',async()=>{
 const {t,b,state,motor}=fixture();b.players.other={username:'other',entity:{id:2,position:new Vec3(1.5,64,.5)}};t.place=async()=>assert.fail('player is on tile');await t.buildFloor(b,motor,state);assert.match(t.message,/another player/);
 b.players={};t.place=async()=>{throw Error('No building material available.');};await assert.rejects(t.buildFloor(b,motor,state),/No building material/);assert.equal(t.floorRecovery,undefined);
});
test('floor reach accounts for the lower supporting face when standing on a raised ledge',async()=>{
 const {t,b,state,motor}=fixture();b.entity.position=new Vec3(-.5,65,2.5);let moved=false;t.place=async()=>assert.fail('must take a lower stance');t.walk=async()=>{moved=true;};await t.buildFloor(b,motor,state);assert.equal(moved,true);
});
