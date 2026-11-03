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

test('floor builder replaces supported beach sand with a verified wooden floor',async()=>{
 for(const material of ['sand','red_sand','gravel','podzol']){
  const {t,b,map,state,motor}=fixture();map.set('1,63,0',material);let dug=0,placed=0;
  b.dig=async block=>{dug++;assert.equal(block.name,material);map.delete('1,63,0');};
  t.place=async(_b,q)=>{placed++;assert.equal(map.has('1,63,0'),false);map.set([q.x,q.y,q.z].join(','),'oak_planks');};
  await t.buildFloor(b,motor,state);assert.equal(dug,1);assert.equal(placed,1);assert.equal(map.get('1,63,0'),'oak_planks');
 }
});

test('floor digging rejects water, unsupported ground, falling columns and player construction',()=>{
 const {safeFoundation}=require('../controller/floor_builder');
 for(const hazard of ['water','lava','unloaded','unsupported','falling','construction']){
  const {b,map}=fixture();map.set('1,63,0',hazard==='construction'?'chest':'sand');
  if(['water','lava','unloaded'].includes(hazard)){
   const original=b.blockAt;b.blockAt=p=>p.equals(new Vec3(2,63,0))?(hazard==='unloaded'?null:{name:hazard,position:p,boundingBox:'empty'}):original(p);
  }
  if(hazard==='unsupported'){const original=b.blockAt;b.blockAt=p=>p.equals(new Vec3(1,62,0))?{name:'air',position:p,boundingBox:'empty'}:original(p);}
  if(hazard==='falling')map.set('1,64,0','sand');
  assert.equal(safeFoundation(b,b.blockAt(new Vec3(1,63,0))),false,hazard);
 }
});
test('floor work waits for a player occupying the target and propagates real inventory failures',async()=>{
 const {t,b,state,motor}=fixture();b.players.other={username:'other',entity:{id:2,position:new Vec3(1.5,64,.5)}};t.place=async()=>assert.fail('player is on tile');await t.buildFloor(b,motor,state);assert.match(t.message,/another player/);
 b.players={};t.place=async()=>{throw Error('No building material available.');};await assert.rejects(t.buildFloor(b,motor,state),/No building material/);assert.equal(t.floorRecovery,undefined);
});
test('floor reach accounts for the lower supporting face when standing on a raised ledge',async()=>{
 const {t,b,state,motor}=fixture();b.entity.position=new Vec3(-.5,65,2.5);let moved=false;t.place=async()=>assert.fail('must take a lower stance');t.walk=async()=>{moved=true;};await t.buildFloor(b,motor,state);assert.equal(moved,true);
});


test('floor builders return from distant wood gathering before applying local stance limits',async()=>{
 for(const [distance,height] of [[19,64],[39,67],[74,65]]){
  const {t,b,state,motor}=fixture();state.world.bounds=[-100,100,-100,100];b.entity.position=new Vec3(distance+.5,height,.5);
  const original=b.blockAt;b.blockAt=p=>p.x<5?null:original(p); // home may not yet be loaded
  let walked;t.walk=async(_b,_m,goal)=>{walked=goal;};t.place=async()=>assert.fail('not at the house');
  await t.buildFloor(b,motor,state);assert.deepEqual(walked,[.5,64.1,-4.5]);assert.match(t.message,/Returning to the house/);assert.equal(t.floorRecovery,undefined);
 }
});

test('returning to the exterior transitions into real local floor work after arrival',async()=>{
 const {t,b,map,state,motor}=fixture();state.world.bounds=[-100,100,-100,100];b.entity.position=new Vec3(40.5,64,.5);let moves=0,placed=0;
 t.walk=async(_b,_m,g)=>{moves++;b.entity.position=new Vec3(...g);return true;};
 t.place=async(_b,q)=>{placed++;map.set([q.x,q.y,q.z].join(','),'oak_planks');};
 for(let i=0;i<8&&t.phase==='floor';i++)await t.buildFloor(b,motor,state);
 assert.ok(moves>=1);assert.equal(placed,1);assert.equal(t.phase,'table');
});

test('a genuinely blocked home return stops with a return-route diagnosis instead of a floor-stance error',async()=>{
 const {t,b,state,motor}=fixture();b.entity.position.x=40;t.walk=async()=>false;
 await assert.rejects(t.buildFloor(b,motor,state),/return route/);
});

test('floor return waits through an airborne descent before deciding the home route failed',async()=>{
 const {t,b,state,motor}=fixture();b.entity.position=new Vec3(.5,62.5,-5.5);b.entity.onGround=false;t.lastProgress=123;
 t.walk=async()=>assert.fail('do not plan from an unsupported airborne cell');
 await t.buildFloor(b,motor,state);assert.match(t.message,/land/);assert.equal(t.phase,'floor');assert.equal(t.lastProgress,123);
 b.entity.onGround=true;b.entity.position=new Vec3(.5,62,-5.5);t.walk=async()=>false;
 await assert.rejects(t.buildFloor(b,motor,state),/return route/,'a real blocked landing must still fail');
});

test('plot clearing also waits for dry airborne footing before its return route search',async()=>{
 const {t,b,state,motor}=fixture();t.phase='clear_plot';b.entity.position=new Vec3(.5,62.5,-5.5);b.entity.onGround=false;t.lastProgress=123;
 t.walk=async()=>assert.fail('do not route from a falling cell');
 assert.equal(await require('../controller/plot_clearance').tick(t,b,motor,state),false);assert.match(t.message,/land/);assert.equal(t.lastProgress,123);
});

test('swimming home remains allowed instead of waiting for dry-ground onGround',async()=>{
 for(const phase of ['floor','clear_plot']){
  const {t,b,state,motor}=fixture();t.phase=phase;b.entity.position=new Vec3(40.5,64,.5);b.entity.onGround=false;b.entity.isInWater=true;
  const original=b.blockAt;b.blockAt=p=>p.x<5?null:original(p);let walked=false;t.walk=async()=>{walked=true;};
  if(phase==='floor')await t.buildFloor(b,motor,state);else await require('../controller/plot_clearance').tick(t,b,motor,state);
  assert.equal(walked,true,phase+' must allow checked swimming return');assert.doesNotMatch(t.message,/Waiting to land/);
 }
});
