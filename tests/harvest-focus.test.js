const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {withinReach}=require('../controller/resource_target'),{chooseTree}=require('../controller/tree_target'),{level}=require('../controller/harvest');
test('upper logs use eye-to-block-center reach instead of feet distance',()=>{
 const b={entity:{position:new Vec3(.5,64,.5),eyeHeight:1.62}},p=new Vec3(1,68,0);
 assert.ok(p.distanceTo(b.entity.position)>3.6);assert.equal(withinReach(b,p),true);
 assert.equal(withinReach(b,new Vec3(1,71,0)),false);
});
test('a remembered tree releases unreachable upper logs and chooses another reachable tree',()=>{
 const b={username:'focus',players:{},entity:{position:new Vec3(.5,64,.5)},blockAt(p){return {name:p.y<64?'grass_block':'air',boundingBox:p.y<64?'block':'empty'};}};
 const selected=chooseTree(b,[new Vec3(2,71,0),new Vec3(5,64,0)],'2,0',()=>64,'focus',[1.5,64.1,.5]);
 assert.equal(selected.key,'5,0');assert.ok(selected.approach);
});
test('search gaze returns smoothly to level after looking up',async()=>{
 const pitches=[],b={entity:{position:new Vec3(0,64,0),yaw:1,pitch:1.2},look:async(yaw,pitch)=>{pitches.push(pitch);Object.assign(b.entity,{yaw,pitch});}};
 await level(b);assert.ok(pitches.length>3);assert.ok(Math.abs(b.entity.pitch)<.01);assert.equal(b.entity.yaw,1);
 for(let i=1;i<pitches.length;i++)assert.ok(Math.abs(pitches[i]-pitches[i-1])<=Math.PI/20+.001);
});


test('grounded harvesting does not mistake ordinary gravity velocity for being airborne',async()=>{
 const {EventEmitter}=require('node:events'),{harvest}=require('../controller/harvest'),b=new EventEmitter(),block={name:'oak_log',position:new Vec3(0,64,-1)};
 Object.assign(b,{entity:{position:new Vec3(.5,64,.5),eyeHeight:1.62,onGround:true,velocity:new Vec3(0,-.0784,0),yaw:0,pitch:Math.atan2(-1.12,1)},look:async()=>{},blockAt:()=>block,digTime:()=>0,swingArm(){}});
 b._client={write(packet,data){if(data.status===2)queueMicrotask(()=>b.emit('blockUpdate',block,{name:'air',position:block.position}));}};
 const started=performance.now();assert.equal(await harvest(b,block),true);assert.ok(performance.now()-started<800,'grounded gravity must not add ten 100-ms settling waits');
});
