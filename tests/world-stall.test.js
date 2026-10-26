const test=require('node:test'),assert=require('node:assert/strict'),{WorldStall}=require('../controller/world_stall');
test('stationary turning and small collision jitter cannot keep an attempt alive forever',()=>{
 const guard=new WorldStall(),position={x:0,z:0};
 assert.equal(guard.update(position,'gather:logs=0',0).stall_seconds_left,null);
 assert.equal(guard.update({x:.2,z:.1},'gather:logs=0',30000).stall_seconds_left,60);
 assert.equal(guard.update(position,'gather:logs=0',90000).expired,true);
});
test('slow active exploration is not a gathering speed cutoff',()=>{
 const guard=new WorldStall();
 for(let i=0;i<100;i++)assert.equal(guard.update({x:i,z:0},'gather:logs=0',i*60000).expired,false);
});
test('real material or lesson progress resets a stationary countdown',()=>{
 const guard=new WorldStall(),p={x:1,z:1};guard.update(p,'quarry:stone=0',0);
 assert.equal(guard.update(p,'quarry:stone=0',80000).stall_seconds_left,10);
 assert.equal(guard.update(p,'quarry:stone=1',81000).idle_seconds,0);
 assert.equal(guard.update(p,'fuel:logs=0',160000).expired,false);
});
