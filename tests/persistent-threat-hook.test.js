const test=require('node:test'),assert=require('node:assert/strict');
const {Vec3}=require('vec3'),policy=require('../controller/shelter_policy');
test('persistent threat opt-in cannot filter other mobs and fails closed',()=>{
 const spider={name:'spider',id:1,isValid:true,position:new Vec3(9,64,0)},zombie={...spider,name:'zombie',id:2};
 const b={entity:{position:new Vec3(0,64,0)},world:{raycast:()=>null},entities:{1:spider,2:zombie}};
 assert.deepEqual(policy.threats(b),[spider,zombie]);
 b.labPersistentNeutralSpider=(e,p)=>{assert.equal(p,b.entity.position);return true;};
 assert.deepEqual(policy.threats(b),[zombie]);
 b.labPersistentNeutralSpider=()=>{throw Error('stale light');};
 assert.deepEqual(policy.threats(b),[spider,zombie]);
 b.labPersistentNeutralSpider=()=>1;
 assert.deepEqual(policy.threats(b),[spider,zombie]);
});
