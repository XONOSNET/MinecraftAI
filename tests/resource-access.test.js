const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const access=require('../controller/resource_access');
test('temporary descent keeps its support after a transient check and retries without fake progress',async()=>{
 const b=fixture(),q=new Vec3(0,64,0),state={column:[{position:q,name:'dirt'}]},motor={pause(){},lockLook(){}};
 b.set(0,64,0,'dirt');b.entity.position=new Vec3(.5,65,.5);b.entity.yaw=0;b.entity.pitch=-Math.PI/2;
 b.world={raycast:()=>({position:q})};let available=false;b.canDigBlock=()=>available;
 b.waitForTicks=async()=>{};b.look=async(y,p)=>{b.entity.yaw=y;b.entity.pitch=p;};b.dig=async()=>b.set(0,64,0,'air');
 assert.equal(await access.descend(b,motor,state),false);assert.equal(state.column.length,1);assert.equal(state.descentFailures,1);
 available=true;assert.equal(await access.descend(b,motor,state),true);assert.equal(state.column.length,0);assert.equal(state.descentFailures,0);
});
test('repeated temporary-support refusal stops after three checks with useful diagnostics',async()=>{
 const b=fixture(),q=new Vec3(0,64,0),state={column:[{position:q,name:'dirt'}]},motor={pause(){},lockLook(){}};
 b.set(0,64,0,'dirt');b.entity.position=new Vec3(.5,65,.5);b.world={raycast:()=>({position:q})};b.canDigBlock=()=>false;b.waitForTicks=async()=>{};
 await access.descend(b,motor,state);await access.descend(b,motor,state);
 await assert.rejects(access.descend(b,motor,state),/failed three times.*can_dig/);assert.equal(state.column.length,1);
});
function fixture(){const map=new Map(),b={username:'access',players:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,eyeHeight:1.62},inventory:{items:()=>[{name:'dirt',count:5}]},blockAt(p){p=p.floored();return {position:p,name:map.get(p.toString())||(p.y<64?'stone':'air'),boundingBox:map.has(p.toString())||p.y<64?'block':'empty'};}};b.set=(x,y,z,n)=>map.set(new Vec3(x,y,z).toString(),n);return b;}
test('resource corridor distinguishes removable foliage and dirt from hard walls',()=>{
 const b=fixture(),target=new Vec3(2,65,0);b.set(2,65,0,'oak_log');b.set(1,65,0,'oak_leaves');
 assert.equal(access.obstruction(b,target).name,'oak_leaves');b.set(1,65,0,'dirt');assert.equal(access.obstruction(b,target).name,'dirt');
 b.set(1,65,0,'stone');assert.equal(access.obstruction(b,target),null);
});
test('build-up requires safe headroom, support, boundaries and distance',()=>{
 const b=fixture(),target=new Vec3(1,71,0),opts={bounds:[-8,8,-8,8]};assert.equal(access.canRaise(b,target,opts),true);
 b.set(0,67,0,'oak_leaves');assert.equal(access.canRaise(b,target,opts),false);
 const c=fixture();c.set(1,63,0,'lava');assert.equal(access.canRaise(c,target,opts),false);
 assert.equal(access.canRaise(fixture(),target,{bounds:[0,8,0,8]}),false);
 assert.equal(access.canRaise(fixture(),target,{plots:[{x:0,y:64,z:0}]}),false);
 assert.equal(access.canRaise(fixture(),new Vec3(5,71,0),opts),false);
 const d=fixture();d.entity.onGround=false;assert.equal(access.canRaise(d,target,opts),false);
});
test('another player prevents building a resource column',()=>{
 const b=fixture();b.players.other={username:'other',entity:{id:2,position:new Vec3(1,64,0)}};
 assert.equal(access.canRaise(b,new Vec3(1,71,0)),false);
});
test('clearing never removes the ground beneath the bot or house terrain',async()=>{
 const b=fixture();b.set(1,63,0,'dirt');b.set(2,62,0,'oak_log');b.canDigBlock=()=>true;b.world={raycast:()=>null};
 const motor={pause(){},lockLook(){}},state={};
 const result=await access.attempt(b,motor,new Vec3(2,62,0),{state});assert.equal(result.handled,false);
 b.set(1,65,0,'dirt');b.set(2,65,0,'oak_log');assert.equal((await access.attempt(b,motor,new Vec3(2,65,0),{state,plots:[{x:1,y:64,z:0}]})).handled,false);
});
test('descent refuses an untracked replacement support',async()=>{
 const b=fixture();b.entity.position=new Vec3(.5,65,.5);b.set(0,64,0,'stone');
 await assert.rejects(access.descend(b,{pause(){},lockLook(){}},{column:[{position:new Vec3(0,64,0),name:'dirt'}]}),/changed/);
});
test('build-up has a fixed height limit and cannot invent material',async()=>{
 const b=fixture(),motor={pause(){},lockLook(){}},target=new Vec3(1,71,0);
 b.set(1,71,0,'oak_log');
 assert.equal((await access.attempt(b,motor,target,{state:{column:[{},{},{}]}})).handled,false);
 b.inventory.items=()=>[];assert.match((await access.attempt(b,motor,target,{state:{}})).message,/carried dirt/);
 assert.equal(access.material('oak_log'),false);assert.equal(access.material('sand'),false);
});

test('high logs are selected only after reachable trees, with carried building blocks',()=>{
 const {chooseTree}=require('../controller/tree_target'),b=fixture(),high=new Vec3(2,71,0),low=new Vec3(5,64,0);
 assert.equal(chooseTree(b,[high,low],null,()=>64,'height').key,'5,0');
 const selected=chooseTree(b,[high],null,()=>64,'height');assert.equal(selected.key,'2,0');assert.ok(selected.approach);
 b.inventory.items=()=>[];assert.equal(chooseTree(b,[high],null,()=>64,'height').key,null);
});
test('distant tree approaches reject solid walls but allow a narrow foliage corridor',()=>{
 const {chooseTree}=require('../controller/tree_target'),b=fixture(),target=new Vec3(3,64,0);b.set(3,64,0,'oak_log');
 // Only the stance two blocks west is available to the route planner.
 const surface=(_b,x,z)=>x===1&&z===0?64:null;
 b.set(2,64,0,'oak_leaves');b.set(2,65,0,'oak_leaves');assert.equal(chooseTree(b,[target],null,surface,'foliage').key,'3,0');
 b.set(2,64,0,'stone');b.set(2,65,0,'stone');assert.equal(chooseTree(b,[target],null,surface,'foliage').key,null);
});

test('resource movement lease preserves jumping and is cancelled by an explicit pause',()=>{
 const {createMotor}=require('../controller/locomotion'),controls={jump:true},b=fixture();
 b.getControlState=k=>controls[k];b.setControlState=(k,v)=>controls[k]=v;
 const motor=createMotor(b,{move:true,turn:true,jump:true});b.labResourceAccess={until:Date.now()+1000,cancelled:false};
 motor.tick();assert.equal(controls.jump,true);motor.pause();assert.equal(b.labResourceAccess.cancelled,true);assert.equal(controls.jump,false);
 b.labResourceAccess={until:Date.now()-1,cancelled:false};controls.jump=true;motor.tick();assert.equal(controls.jump,false);
});

test('column recovery rejects a changed support, off-column stance and an airborne body',async()=>{
 const b=fixture(),state={column:[{position:new Vec3(0,64,0),name:'dirt'}]},motor={pause(){},lockLook(){}};
 b.entity.position=new Vec3(.72,65,.5);b.set(0,64,0,'stone');assert.equal(await access.recoverColumn(b,motor,state),false);
 b.set(0,64,0,'dirt');b.entity.position.x=1.1;assert.equal(await access.recoverColumn(b,motor,state),false);
 b.entity.position.x=.72;b.entity.onGround=false;assert.equal(await access.recoverColumn(b,motor,state),false);
});
test('a safe column recenter waits for residual motion to settle',async()=>{
 const b=fixture(),state={column:[{position:new Vec3(0,64,0),name:'dirt'}]},motor={pause(){},lockLook(){}},controls={};
 b.entity.position=new Vec3(.53,65,.5);b.set(0,64,0,'dirt');b.clearControlStates=()=>{};b.setControlState=(k,v)=>controls[k]=v;
 const waits=[];b.waitForTicks=async n=>waits.push(n);
 assert.equal(await access.recoverColumn(b,motor,state),true);assert.deepEqual(waits,[4]);assert.equal(b.labResourceAccess,undefined);
});

test('knockback during refuge centering aborts locally and releases controls without terminating survival',async()=>{
 for(const when of ['moving','settling']){
  const b=fixture(),feet=new Vec3(0,64,0),motor={pause(){},lockLook(v){b.locked=v;}},controls={};
  b.entity.position=new Vec3(.75,64,.5);b.entity.yaw=0;b.entity.pitch=0;
  b.look=async(y,p)=>{b.entity.yaw=y;b.entity.pitch=p;};b.setControlState=(k,v)=>controls[k]=v;b.clearControlStates=()=>{for(const k of Object.keys(controls))controls[k]=false;};
  b.waitForTicks=async n=>{
   if(n===1){if(when==='moving'){b.entity.position.x=1.1;b.entity.onGround=false;}else b.entity.position.x=.5;}
   if(n===3&&when==='settling')b.entity.onGround=false;
  };
  assert.equal(await access.stabilize(b,motor,feet),false,when);
  assert.equal(b.labResourceAccess,undefined);assert.equal(b.locked,false);assert.ok(Object.values(controls).every(v=>!v));
 }
});

test('a server-rejected jump placement returns failure and releases jump controls',async()=>{
 const b=fixture(),feet=new Vec3(0,64,0),controls={},trace={};
 b.heldItem={name:'dirt',count:2};b.entity.yaw=-Math.PI;b.entity.pitch=-Math.PI/2;
 b.setControlState=(k,v)=>controls[k]=v;b.look=async(y,p)=>{b.entity.yaw=y;b.entity.pitch=p;};
 b.waitForTicks=async()=>{b.entity.position.y=controls.jump?65.1:64;b.entity.onGround=!controls.jump;};
 b._placeBlockWithOptions=async()=>{throw Error('Server refused to place dirt: the block is still air');};
 assert.equal(await access.jumpPlace(b,feet,b.heldItem,trace),false);assert.equal(controls.jump,false);
 assert.equal(trace.stage,'landing_unverified');
 assert.deepEqual(trace.request_position,[.5,65.1,.5]);
 assert.equal(trace.confirmed_block,'air');
 assert.match(trace.placement_error,/Server refused/);
 assert.deepEqual(trace.end_position,[.5,64,.5]);
 assert.equal(trace.end_grounded,true);
 b._placeBlockWithOptions=async()=>{throw Error('Unexpected connection error');};await assert.rejects(access.jumpPlace(b,feet,b.heldItem),/connection/);assert.equal(controls.jump,false);
});

test('jump placement uses the first clear airborne tick and requires confirmation and landing',async()=>{
 for(const outcome of ['landed','unconfirmed','displaced']){
  const b=fixture(),feet=new Vec3(0,64,0),controls=[],heights=[.42,.75,1,1.166,1.252,1.176,1.02,0],trace={};
  b.heldItem={name:'dirt',count:2};b.entity.yaw=-Math.PI;b.entity.pitch=-Math.PI/2;
  b.setControlState=(key,value)=>{assert.equal(key,'jump');controls.push(value);};
  b.placeBlock=async()=>assert.fail('the ordinary placement calls lookAt again during the jump');
  let tick=0,writes=0;
  b.waitForTicks=async n=>{
   assert.equal(n,1);
   const landed=++tick===heights.length;
   b.entity.onGround=landed;
   b.entity.position.y=landed&&outcome!=='unconfirmed'?65:64+heights[tick-1];
   if(landed&&outcome==='displaced')b.entity.position.x=1.5;
  };
  b._placeBlockWithOptions=async(support,face,options)=>{
   writes++;
   assert.equal(b.entity.position.y,65.166);
   assert.deepEqual(controls,[true,false]);
   assert.deepEqual(support.position,feet.offset(0,-1,0));
   assert.deepEqual(face,new Vec3(0,1,0));
   assert.equal(options.forceLook,'ignore');
   if(outcome!=='unconfirmed')b.set(0,64,0,'dirt');
  };
  assert.equal(await access.jumpPlace(b,feet,b.heldItem,trace),outcome==='landed',outcome);
  assert.equal(writes,1);
  assert.equal(trace.stage,outcome==='landed'?'landed':'landing_unverified');
  assert.equal(trace.sampled_peak_y,65.252);
  assert.equal(trace.confirmed_block,outcome==='unconfirmed'?'air':'dirt');
  assert.deepEqual(trace.end_position,b.entity.position.toArray());
 }
});

test('a jump that lands below clearance records its sampled height without a placement request',async()=>{
 const b=fixture(),feet=new Vec3(0,64,0),trace={},heights=[64.42,64.8,64];
 b.heldItem={name:'dirt',count:2};b.entity.yaw=-Math.PI;b.entity.pitch=-Math.PI/2;
 b.setControlState=()=>{};
 b.waitForTicks=async()=>{b.entity.position.y=heights.shift();b.entity.onGround=!heights.length;};
 b._placeBlockWithOptions=async()=>assert.fail('the feet did not clear the placement cell');
 assert.equal(await access.jumpPlace(b,feet,b.heldItem,trace),false);
 assert.equal(trace.stage,'landed_before_clearance');
 assert.equal(trace.support_block,'stone');assert.equal(trace.target_block,'air');
 assert.equal(trace.sampled_peak_y,64.8);assert.equal(trace.request_position,undefined);
 assert.deepEqual(trace.end_position,[.5,64,.5]);assert.equal(trace.end_grounded,true);
});


test('a tracked dirt column that grows grass can recenter and descend without losing its task',async()=>{
 const b=fixture(),q=new Vec3(0,64,0),state={column:[{position:q,name:'dirt'}],tree:[1,0]},motor={pause(){},lockLook(){}};
 b.set(0,64,0,'grass_block');b.entity.position=new Vec3(.53,65,.5);
 b.clearControlStates=()=>{};b.setControlState=()=>{};b.waitForTicks=async()=>{};
 b.look=async(y,p)=>{b.entity.yaw=y;b.entity.pitch=p;};b.world={raycast:()=>({position:q})};b.canDigBlock=()=>true;
 assert.equal(await access.recoverColumn(b,motor,state),true);
 b.entity.position.x=.5;let removed=0;b.dig=async block=>{assert.equal(block.name,'grass_block');assert.deepEqual(block.position,q);removed++;b.set(0,64,0,'air');b.entity.position.y=64;};
 assert.equal(await access.descend(b,motor,state),true);assert.equal(removed,1);assert.equal(state.column.length,0);assert.deepEqual(state.tree,[1,0]);
});

test('grass tolerance stays limited to the owned dirt cell and dry supported descent',async()=>{
 for(const changed of ['stone','coarse_dirt','oak_planks']){
  const b=fixture();b.entity.position=new Vec3(.5,65,.5);b.set(0,64,0,changed);
  await assert.rejects(access.descend(b,{pause(){},lockLook(){}},{column:[{position:new Vec3(0,64,0),name:'dirt'}]}),/changed/);
 }
 const b=fixture(),state={column:[{position:new Vec3(0,64,0),name:'coarse_dirt'}]},motor={pause(){},lockLook(){}};
 b.entity.position=new Vec3(.5,65,.5);b.set(0,64,0,'grass_block');await assert.rejects(access.descend(b,motor,state),/changed/);
 state.column[0].name='dirt';b.set(1,64,0,'water');await assert.rejects(access.descend(b,motor,state),/changed/);
 assert.equal(await access.recoverColumn(b,motor,{column:[]}),false);
});
