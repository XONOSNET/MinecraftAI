const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),back=require('../controller/furnace_return');
for(const phase of ['smelt','night_cook'])test(phase+' returns from interrupted shelter work before interacting with its furnace',async()=>{
 const t={phase,plot:{x:0,y:64,z:0},milestones:['furnace','charcoal']},b={entity:{position:new Vec3(25.5,64,20.5),eyeHeight:1.62}},state={world:{}},motor={},api={},scan={},tasks={};let walks=0;
 t.walk=async(bot,m,goal,s,a,c,k)=>{walks++;assert.equal(bot,b);assert.equal(m,motor);assert.deepEqual(goal,[.5,64.1,.5]);assert.equal(s,state);assert.equal(a,api);assert.equal(c,scan);assert.equal(k,tasks);b.entity.position=new Vec3(...goal);return true;};
 assert.equal(await back.tick(t,b,motor,state,api,scan,tasks),true);assert.equal(t.phase,phase);assert.equal(walks,1);
 assert.equal(await back.tick(t,b,motor,state,api,scan,tasks),false,'native furnace work may resume only after returning');
 assert.deepEqual(t.milestones,['furnace','charcoal']);
 // Being within interaction distance through a house wall is not a return.
 b.entity.position=new Vec3(4,64,.5);assert.equal(await back.tick(t,b,motor,state,api,scan,tasks),true);assert.equal(walks,2);
 t.phase='night_burrow';b.entity.position=new Vec3(25.5,60,20.5);
 assert.equal(await back.tick(t,b,motor,state,api,scan,tasks),false,'danger still owns sheltering');assert.equal(walks,2);
});
