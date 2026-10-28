const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{logs}=require('../controller/resource_scan'),{recover}=require('../controller/service_errors');

test('loaded tree scan yields while preserving height, radius, ordering and missing-chunk limits',async()=>{
 const blocks={'1,64,0':1,'2,68,0':1,'3,69,0':1,'4,64,0':2},reads=[];let yielded=0;
 const b={entity:{position:new Vec3(.5,64,.5)},game:{minY:-64},registry:{blocksByStateId:{0:{name:'air'},1:{name:'oak_log'},2:{name:'stone'}}},world:{getColumn(x,z){if(x!==0||z!==0)return null;const sections=[];sections[8]={palette:[0,1,2]};return {sections,getBlockStateId(p){reads.push([p.x,p.y,p.z]);return blocks[[p.x,p.y,p.z].join(',')]||0;}};}}};
 const found=await logs(b,{range:8,yieldNow:async()=>{yielded++;}});
 assert.deepEqual(found.map(p=>[p.x,p.y,p.z]),[[1,64,0],[2,68,0]]);assert.ok(yielded>0);assert.ok(reads.length>0);
 assert.deepEqual(await logs(b,{range:.5}),[]);
});

test('palette rejection avoids scanning every block in non-tree sections',async()=>{
 const sections=[];sections[8]={palette:[0,2]};let reads=0;
 const b={entity:{position:new Vec3(0,64,0)},game:{minY:-64},registry:{blocksByStateId:{0:{name:'air'},2:{name:'stone'}}},world:{getColumn:()=>({sections,getBlockStateId(){reads++;return 2;}})}};
 assert.deepEqual(await logs(b,{range:8}),[]);assert.equal(reads,0);
});

test('temporary fetch failure preserves the attempt and has a bounded retry window',()=>{
 const state={phase:'gather'},error=new TypeError('fetch failed');
 assert.equal(recover(state,error,1000),true);assert.equal(state.phase,'gather');assert.equal(state.serviceRetryAt,1500);
 assert.equal(recover(state,error,30999),true);assert.equal(recover(state,error,31000),false);assert.equal(state.failureCategory,'infrastructure');
 assert.equal(recover({},Error('No safe route'),0),false);
});
