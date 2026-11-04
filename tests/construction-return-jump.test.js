const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
for(const name of ['plot_clearance','floor_builder'])test(name+' preserves a committed return jump but pauses an unplanned fall',async()=>{
 for(const committed of [true,false]){
  const t={plot:{x:0,y:66,z:0}},b={entity:{position:new Vec3(.5,65.4,-6.8),onGround:false,isInWater:false}};
  let paused=0;const motor={committedJump:()=>committed,pause(){paused++;}};
  await require('../controller/'+name).tick(t,b,motor,{world:{}});
  assert.equal(paused,committed?0:1);assert.match(t.message,/Waiting to land/);
 }
 const t={plot:{x:0,y:66,z:0}},b={entity:{position:new Vec3(.5,65.8,-5.3),onGround:false,isInWater:false}};
 await require('../controller/'+name).tick(t,b,{committedJump:()=>true,pause(){throw Error('Local work radius must not cancel the jump');}},{world:{}});
 assert.match(t.message,/Waiting to land/);
});
