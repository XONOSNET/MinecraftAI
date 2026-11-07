const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const entrance=require('../controller/entrance_clearance'),access=require('../controller/resource_access'),{route}=require('../controller/field_navigation');
function fixture(){
 const cells=new Map(),t={plot:{x:0,y:65,z:0},campPlots:[],navigator:{lastPlan:0},phase:'leave_hut'},state={world:{bounds:[-20,20,-20,20]}},b={username:'Builder',players:{},entity:{position:new Vec3(.5,65,1.5),onGround:true},canDigBlock:()=>true};
 for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){cells.set(new Vec3(x,68,z).toString(),'oak_planks');for(let y=65;y<68;y++)if((Math.abs(x)===3||Math.abs(z)===3)&&!(x===0&&z===-3&&y<67))cells.set(new Vec3(x,y,z).toString(),'oak_planks');}
 b.blockAt=p=>{p=p.floored();let name=cells.get(p.toString());if(!name)name=p.y<64||p.y===64&&Math.abs(p.x)<=3&&Math.abs(p.z)<=3?'grass_block':'air';return {name,position:p,boundingBox:name==='air'?'empty':'block'};};
 b.world={raycast:(eye,d,length)=>b.blockAt(eye.plus(d.scaled(length-.05)))};
 const motor={pause(){},lockLook(){}},walk=async()=>true;return {cells,t,state,b,motor,walk};
}
test('entrance leaf cap explains a blocked reversible step while normal descent is reachable',()=>{
 const {cells,b}=fixture();for(let x=-3;x<=3;x++)for(let z=-4;z>=-8;z--)cells.set(new Vec3(x,66,z).toString(),'spruce_leaves');
 assert.equal(route(b,[.5,64.1,-4.5],16,1024,false,{reversible:true}).reached,false);
 assert.equal(route(b,[.5,64.1,-4.5],16,1024).reached,true);
 cells.set(new Vec3(0,66,-4).toString(),'air');
 assert.equal(route(b,[.5,64.1,-4.5],16,1024,false,{reversible:true}).reached,true);
});
test('scan targets only leaves in the bounded front strip, preserving ground and construction',()=>{
 const {cells,t,b}=fixture();for(const [x,y,z,name] of [[0,66,-4,'spruce_leaves'],[0,66,-7,'oak_leaves'],[2,66,-4,'oak_leaves'],[0,64,-5,'oak_planks'],[0,64,-6,'dirt']])cells.set(new Vec3(x,y,z).toString(),name);
 assert.deepEqual(entrance.scan(t,b).map(v=>v.position.toArray()),[[0,66,-4]]);
});
test('moves to a safe indoor work stance rather than giving up at a blocked exterior',async()=>{
 const {cells,t,b,motor,state}=fixture();cells.set(new Vec3(0,66,-4).toString(),'spruce_leaves');let stance;
 const result=await entrance.tick(t,b,motor,[.5,64.1,-4.5],state,async goal=>{stance=goal;return true;});
 assert.equal(result,true);assert.deepEqual(stance,[.5,65.1,-1.5]);
});

test('multi-tick entrance approaches persist until arrival without reselecting the blocked original route',async()=>{
 const {cells,t,b,motor,state}=fixture();cells.set(new Vec3(0,66,-4).toString(),'spruce_leaves');
 const goal=[.5,64.1,-4.5],calls=[];
 await entrance.tick(t,b,motor,goal,state,async g=>{calls.push(g);return undefined;});
 assert.deepEqual(t.entranceApproach.stance,[.5,65.1,-1.5]);
 for(let i=0;i<3;i++){
  const resumed=await entrance.resume(t,goal,async g=>{calls.push(g);return undefined;});assert.ok(resumed);assert.ok(t.entranceApproach);
 }
 assert.ok(calls.every(g=>g[2]===-1.5),'only the committed work stance is requested');
 assert.deepEqual(await entrance.resume(t,goal,async()=>true),{moved:true});assert.equal(t.entranceApproach,null);
});

test('entrance detours cancel on a changed goal, lesson or failed route',async()=>{
 const {t}=fixture(),goal=[.5,64.1,-4.5],work={goal,stance:[.5,65.1,-1.5],phase:t.phase};
 t.entranceApproach=work;assert.equal(await entrance.resume(t,[10,64,10],async()=>assert.fail('stale goal')),null);assert.equal(t.entranceApproach,null);
 t.entranceApproach=work;t.phase='night_retreat';assert.equal(await entrance.resume(t,goal,async()=>assert.fail('stale phase')),null);
 t.phase=work.phase;t.entranceApproach=work;assert.deepEqual(await entrance.resume(t,goal,async()=>false),{moved:false});assert.equal(t.entranceApproach,null);
});
test('real leaf removal restores planning and records actual work without placing resources',async ctx=>{
 const {cells,t,b,motor,state,walk}=fixture();b.entity.position.z=-1.5;const p=new Vec3(0,66,-4);cells.set(p.toString(),'spruce_leaves');
 ctx.mock.method(access,'dig',async(bot,block,{validate})=>{assert.ok(validate(block));cells.set(block.position.toString(),'air');return true;});
 assert.equal(await entrance.tick(t,b,motor,[.5,64.1,-4.5],state,walk),true);
 assert.equal(t.entranceCleared,1);assert.equal(t.navigator.lastPlan,-Infinity);assert.equal(b.blockAt(p).name,'air');assert.equal(b.blockAt(new Vec3(0,63,-4)).name,'grass_block');
});
test('neighbor plots, fluid-adjacent leaves, unrelated destinations and blocked work stances stay protected',async ctx=>{
 const {cells,t,b,motor,state,walk}=fixture();const p=new Vec3(0,66,-4);cells.set(p.toString(),'spruce_leaves');ctx.mock.method(access,'dig',()=>assert.fail('Unsafe digging'));
 t.campPlots=[{x:0,y:65,z:-8}];assert.equal(await entrance.tick(t,b,motor,[.5,64.1,-4.5],state,walk),false);
 t.campPlots=[];cells.set(p.offset(0,1,0).toString(),'water');assert.equal(await entrance.tick(t,b,motor,[.5,64.1,-4.5],state,walk),false);
 cells.delete(p.offset(0,1,0).toString());assert.equal(await entrance.tick(t,b,motor,[15.5,64.1,15.5],state,walk),false);
 cells.set(new Vec3(0,65,-2).toString(),'stone');cells.set(new Vec3(0,65,-1).toString(),'stone');
 // A refused approach remains a navigation failure, never a fabricated clear.
 assert.equal(await entrance.tick(t,b,motor,[.5,64.1,-4.5],state,async()=>false),false);
});


test('outdoor lighting clears its bounded entrance canopy before placing and verifying the torch',async ctx=>{
 const f=fixture(),canopy=require('../controller/lighting_canopy'),lighting=require('../controller/house_lighting'),house=require('../controller/house');
 f.t.phase='light_place';f.b.entity.position=new Vec3(.5,64,-3.5);f.b.entity.velocity=new Vec3(0,0,0);f.t.walk=f.walk;
 const mount=house.torchMount(f.t.plot,'outdoor');
 f.cells.set(mount.position.toString(),'spruce_leaves');f.cells.set(new Vec3(0,66,-4).toString(),'spruce_leaves');
 const outside=new Vec3(2,66,-4),wood=new Vec3(1,65,-6);f.cells.set(outside.toString(),'spruce_leaves');f.cells.set(wood.toString(),'oak_planks');
 ctx.mock.method(access,'dig',async(_b,block,{validate})=>{assert.equal(validate(block),true);assert.equal(block.name,'spruce_leaves');f.cells.set(block.position.toString(),'air');return true;});
 for(let i=0;i<2;i++)assert.equal(await canopy.tick(f.t,f.b,f.motor,f.state),true);
 assert.equal(await canopy.tick(f.t,f.b,f.motor,f.state),false);
 assert.equal(f.cells.get(outside.toString()),'spruce_leaves');assert.equal(f.cells.get(wood.toString()),'oak_planks');assert.equal(f.t.phase,'light_place');
 const inv=require('../controller/inventory_sync');ctx.mock.method(inv,'sync',async()=>{});ctx.mock.method(inv,'equip',async(_b,name)=>assert.equal(name,'torch'));
 const original=f.b.blockAt;f.b.blockAt=p=>{const block=original(p);return {...block,getProperties:()=>({facing:'north'})};};
 f.b.placeBlock=async(support,face)=>{assert.deepEqual(support.position,mount.support);assert.deepEqual(face,mount.face);f.cells.set(mount.position.toString(),'wall_torch');};
 await lighting.place(f.b,f.t.plot,'outdoor',f.t);assert.equal(lighting.installed(f.b,f.t.plot,'outdoor'),true);
 assert.equal(await canopy.tick(f.t,f.b,f.motor,f.state),false);
 f.t.phase='night_burrow';assert.equal(await canopy.tick(f.t,f.b,f.motor,f.state),false);
});
