const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const station=require('../controller/station_placement'),{reference}=require('../controller/placement_reference');
function fixture(){
 const cells=new Map(),q=new Vec3(2,64,0),bot={username:'Fixture',players:{},entity:{position:new Vec3(-1.52,64,-2.52),onGround:true,velocity:new Vec3(0,0,0)},blockAt(p){p=p.floored();const name=cells.get(p.toString())||(p.y===63?'stone':'air');return {name,position:p,boundingBox:name==='air'?'empty':'block'};}};
 const moves=[],t={plot:{x:0,y:64,z:0},phase:'furnace',buildAttempts:new Map(),async walk(b,m,g){moves.push(g);b.entity.position=new Vec3(...g);return true;},async place(b,p,name){assert.ok(reference(b,p),'reachable support before native interaction');cells.set(p.toString(),name);}};
 return {q,bot,t,cells,moves,motor:{pause(){}},state:{world:{bounds:[-10,10,-10,10]}}};
}
test('returning from mining repositions to support then resumes furnace placement without losing the task',async()=>{
 const f=fixture(),{q,bot,t,motor,state}=f;assert.equal(reference(bot,q),null);
 assert.equal(await station.place(t,bot,motor,q,'furnace',state),false);assert.ok(t.stationApproach);assert.equal(t.phase,'furnace');
 assert.equal(await station.place(t,bot,motor,q,'furnace',state),true);assert.equal(f.moves.length,1);assert.equal(bot.blockAt(q).name,'furnace');assert.equal(t.buildApproach,null);
 assert.notDeepEqual([Math.floor(bot.entity.position.x),Math.floor(bot.entity.position.z)],[q.x,q.z],'stance cannot occupy station');
});
test('refused furnace placement chooses another bounded stance and verifies actual block',async()=>{
 const f=fixture(),{q,bot,t,motor,state,cells}=f;bot.entity.position=new Vec3(.5,64,.5);let calls=0;
 t.place=async()=>{if(++calls===1)throw Object.assign(Error('refused'),{code:'BUILD_OBSTRUCTED'});cells.set(q.toString(),'furnace');};
 assert.equal(await station.place(t,bot,motor,q,'furnace',state),false);assert.equal(await station.place(t,bot,motor,q,'furnace',state),true);assert.equal(calls,2);
});
test('unverified station cannot advance and moving footing settles first',async()=>{
 const f=fixture(),{q,bot,t,motor,state}=f;bot.entity.position=new Vec3(.5,64,.5);let calls=0;t.place=async()=>{calls++;};bot.entity.velocity.x=.1;
 assert.equal(await station.place(t,bot,motor,q,'furnace',state),false);assert.equal(calls,0);
 bot.entity.velocity.x=0;assert.equal(await station.place(t,bot,motor,q,'furnace',state),false);assert.equal(t.phase,'furnace');
});
test('missing terrain support remains a bounded failure rather than repeated fake progress',async()=>{
 const f=fixture();f.bot.blockAt=p=>({name:'air',boundingBox:'empty',position:p.floored()});
 await assert.rejects(station.place(f.t,f.bot,f.motor,f.q,'furnace',f.state),{code:'BUILD_OBSTRUCTED'});assert.equal(f.t.lastProgress,undefined);
});
