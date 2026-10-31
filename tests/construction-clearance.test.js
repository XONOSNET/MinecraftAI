const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const clearance=require('../controller/construction_clearance'),access=require('../controller/resource_access');
function fixture(entries={}){
 const blocks=new Map(Object.entries(entries)),dug=[];
 const b={username:'Builder',players:{},inventory:{items:()=>[]},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},blockAt(p){p=p.floored();const name=blocks.get(p.toString())||(p.y<64?'stone':'air');return {name,position:p,boundingBox:['air','poppy','short_grass','oak_door'].includes(name)?'empty':'block'};}};
 const t={plot:{x:0,y:64,z:0},campPlots:[],phase:'build'};
 return {t,b,blocks,dug};
}
async function digging(f,work){
 const original=access.dig;
 access.dig=async(b,block,{validate})=>{assert.ok(validate(block));f.dug.push(block.name);f.blocks.set(block.position.toString(),'air');return true;};
 try{await work();}finally{access.dig=original;}
}
test('clears flowers, leaves, dirt and logs at actual wall and ceiling cells before placement',async()=>{
 for(const name of ['poppy','oak_leaves','dirt','birch_log']){
  const f=fixture({'(3, 64, 0)':name});
  await digging(f,()=>clearance.prepare(f.t,f.b,{x:3,y:64,z:0},null));
  assert.deepEqual(f.dug,[name]);assert.ok(f.t.lastProgress);assert.equal(f.t.constructionCleared,1);
 }
 const f=fixture({'(2, 67, 0)':'birch_leaves'});
 await digging(f,()=>clearance.prepare(f.t,f.b,{x:2,y:67,z:0},null));assert.deepEqual(f.dug,['birch_leaves']);
});
test('clears obstructing sightline leaves first and handles both halves of door space',async()=>{
 const f=fixture({'(1, 65, 0)':'oak_leaves','(3, 65, 0)':'poppy','(3, 64, 0)':'short_grass'});
 await digging(f,()=>clearance.prepare(f.t,f.b,{x:3,y:64,z:0},'oak_door'));
 assert.equal(f.dug[0],'oak_leaves');assert.ok(f.dug.includes('poppy'));assert.ok(f.dug.includes('short_grass'));
});
test('preserves finished walls, furniture, neighbors and support under the builder',async()=>{
 for(const name of ['oak_planks','chest','furnace','white_bed']){
  const f=fixture({'(3, 64, 0)':name});await assert.rejects(clearance.prepare(f.t,f.b,{x:3,y:64,z:0}),{code:'BUILD_OBSTRUCTED'});assert.equal(f.blocks.get('(3, 64, 0)'),name);
 }
 const f=fixture({'(3, 64, 0)':'dirt'}),block=f.b.blockAt(new Vec3(3,64,0));
 f.t.campPlots=[{x:6,y:64,z:0}];assert.equal(clearance.safe(f.t,f.b,block),false);
 f.t.campPlots=[];f.b.entity.position=new Vec3(3.5,65,.5);assert.equal(clearance.safe(f.t,f.b,block),false);
 assert.equal(clearance.safe(f.t,f.b,{name:'dirt',position:new Vec3(4,65,0)}),false);
});
test('does not open water or falling-block hazards and does not count unconfirmed digging',async()=>{
 for(const hazard of ['water','sand','gravel']){
  const f=fixture({'(3, 64, 0)':'dirt','(3, 65, 0)':hazard});
  await assert.rejects(clearance.prepare(f.t,f.b,{x:3,y:64,z:0}),{code:'BUILD_OBSTRUCTED'});assert.equal(f.t.constructionCleared,undefined);
 }
 const f=fixture({'(3, 64, 0)':'oak_leaves'}),original=access.dig;access.dig=async()=>false;
 try{await assert.rejects(clearance.prepare(f.t,f.b,{x:3,y:64,z:0}),{code:'BUILD_OBSTRUCTED'});assert.equal(f.t.lastProgress,undefined);}finally{access.dig=original;}
});

test('floor placement never excavates adjacent support ground crossed by its center ray',async()=>{
 const f=fixture({'(-2, 63, 0)':'air'});f.b.entity.position=new Vec3(2,64,.5);
 const q={x:-2,y:63,z:0,floor:true},hit=clearance.firstObstruction(f.b,new Vec3(q.x,q.y,q.z));
 assert.ok(hit&&hit.position.y===63,'reproduce a ray through adjacent foundation');
 await digging(f,()=>clearance.prepare(f.t,f.b,q));assert.deepEqual(f.dug,[]);
});

test('plants outside the house are preserved instead of failing placement inside it',async()=>{
 const f=fixture({'(4, 65, 0)':'large_fern'});f.b.entity.position=new Vec3(5.5,64,.5);
 const q={x:3,y:64,z:0};assert.equal(clearance.firstObstruction(f.b,new Vec3(3,64,0))?.name,'large_fern');
 await digging(f,()=>clearance.prepare(f.t,f.b,q));assert.deepEqual(f.dug,[]);assert.equal(f.blocks.get('(4, 65, 0)'),'large_fern');
});
