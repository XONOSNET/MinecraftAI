const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const plot=require('../controller/plot_clearance'),clearance=require('../controller/construction_clearance');
function fixture(entries={}){
 const cells=new Map(Object.entries(entries)),b={username:'Builder',players:{},inventory:{items:()=>[]},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},canDigBlock:()=>true};
 b.blockAt=p=>{p=p.floored();const name=cells.get(p.toString())||(p.y<64?'grass_block':'air');return {name,position:p,boundingBox:['air','poppy','large_fern'].includes(name)?'empty':'block'};};
 b.world={raycast:(eye,d,range)=>b.blockAt(eye.plus(d.scaled(range-.05)))};
 const t={plot:{x:0,y:64,z:0},campPlots:[],afterPlotClear:'floor',phase:'clear_plot'};
 const motor={pause(){},lockLook(){}},state={world:{bounds:[-20,20,-20,20]}};return {t,b,cells,motor,state};
}
test('whole-plot scan includes interior, walls, roof and overhead space while preserving the foundation',()=>{
 const f=fixture({'(3, 67, 3)':'oak_leaves','(-3, 68, 0)':'spruce_leaves','(0, 64, 0)':'large_fern','(0, 63, 0)':'dirt','(4, 67, 0)':'birch_leaves','(2, 64, 0)':'crafting_table'});
 const result=plot.scan(f.t,f.b);assert.equal(result.pending.length,3);assert.equal(result.unloaded,false);
 assert.ok(result.pending.every(q=>q.position.y>=64&&Math.abs(q.position.x)<=3));
});
test('clearing must finish every natural obstruction before declaring the plot ready',async()=>{
 const f=fixture({'(1, 65, 0)':'oak_leaves','(-1, 65, 0)':'large_fern'}),original=clearance.clear;
 clearance.clear=async(t,b,q)=>{f.cells.set(q.position.toString(),'air');t.constructionCleared=(t.constructionCleared||0)+1;return true;};
 try{
  assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),false);
  assert.equal(plot.scan(f.t,f.b).pending.length,1);
  assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),false);
  assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),true);assert.equal(f.t.constructionCleared,2);
  assert.equal(f.b.blockAt(new Vec3(0,63,0)).name,'grass_block');
 }finally{clearance.clear=original;}
});
test('a refused digging angle defers the block without immediately stopping the bot',async()=>{
 const f=fixture({'(1, 65, 0)':'spruce_leaves'}),original=clearance.clear;
 clearance.clear=async()=>{throw Object.assign(Error('angle'),{code:'BUILD_OBSTRUCTED'});};
 try{assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),false);assert.equal(f.t.plotClearing.deferred.size,1);assert.match(f.t.message,/1 left/);}finally{clearance.clear=original;}
});
test('airborne or still-moving bots wait before plot digging',async()=>{
 const f=fixture({'(1, 65, 0)':'oak_leaves'});f.b.entity.onGround=false;
 assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),false);assert.match(f.t.message,/Settling/);
 f.b.entity.onGround=true;f.b.entity.velocity=new Vec3(.1,0,0);
 assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),false);assert.match(f.t.message,/Stopping/);
});

test('an unloaded part of the house volume cannot be declared clear',async()=>{
 const f=fixture(),original=f.b.blockAt;f.b.blockAt=p=>p.x===3&&p.y===68&&p.z===3?null:original(p);
 assert.equal(plot.scan(f.t,f.b).unloaded,true);
 assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),false);assert.match(f.t.message,/load/);
});

test('plot clearing returns from distant gathering before scanning local work faces',async()=>{
 const f=fixture({'(1, 65, 0)':'oak_leaves'});f.state.world.bounds=[-100,100,-100,100];f.b.entity.position=new Vec3(70.5,64,.5);
 let moved;f.t.walk=async(_b,_m,goal)=>{moved=goal;return undefined;};
 assert.equal(await plot.tick(f.t,f.b,f.motor,f.state),false);
 assert.ok(moved&&Math.abs(moved[0])<4&&Math.abs(moved[2])<6);assert.match(f.t.message,/Returning/);
 assert.equal(f.t.plotClearing.blockedAt,null);
 f.b.entity.position=new Vec3(...moved);f.t.walk=async(_b,_m,goal)=>{assert.ok(Math.hypot(goal[0]-.5,goal[2]-.5)<5);f.b.entity.position=new Vec3(...goal);return true;};
 const original=clearance.clear;clearance.clear=async(_t,_b,q)=>{f.cells.set(q.position.toString(),'air');return true;};
 try{for(let i=0;i<8&&plot.scan(f.t,f.b).pending.length;i++)await plot.tick(f.t,f.b,f.motor,f.state);assert.equal(plot.scan(f.t,f.b).pending.length,0);assert.equal(f.t.plotReturnGoal,null);}finally{clearance.clear=original;}
});

test('distant plot clearing approaches an unloaded home instead of waiting indefinitely',async()=>{
 const f=fixture();f.b.entity.position.x=70;const original=f.b.blockAt;f.b.blockAt=p=>p.x<10?null:original(p);
 let goal;f.t.walk=async(_b,_m,g)=>{goal=g;};await plot.tick(f.t,f.b,f.motor,f.state);
 assert.deepEqual(goal,[.5,64.1,-4.5]);assert.match(f.t.message,/Returning/);
 f.t.walk=async()=>false;await assert.rejects(plot.tick(f.t,f.b,f.motor,f.state),/return route/);
});
