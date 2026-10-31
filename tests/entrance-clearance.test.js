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
