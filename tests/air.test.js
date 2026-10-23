const test=require('node:test'),assert=require('assert/strict'),{ownOxygen}=require('../controller/air');
test('breath ignores other entities and clamps only the local player air reading',()=>{
 assert.equal(ownOxygen({entityId:2,metadata:[{key:1,value:4500}]},1,8),8);
 assert.equal(ownOxygen({entityId:1,metadata:[{key:1,value:150}]},1,8),10);
 assert.equal(ownOxygen({entityId:1,metadata:[{key:1,value:-20}]},1,8),0);
 assert.equal(ownOxygen({entityId:1,metadata:[{key:1,value:4500}]},1,8),20);
});
