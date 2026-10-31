const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('events'),{Vec3}=require('vec3');
const forest=require('../controller/reforest'),inventory=require('../controller/inventory_sync');
function fixture(ctx,name='oak_sapling',count=5){
 const b=new EventEmitter(),blocks=new Map(),items=[{name,count},{name:'stone_axe',count:1}],t={phase:'gather',plot:{x:8,y:64,z:8},campPlots:[],navigator:{path:[]},lastProgress:123},state={run:'reforest-test',world:{count:1,bounds:[0,100,0,100]}};
 Object.assign(b,{username:'LabAI0',health:20,food:20,entities:{},players:{},heldItem:items[1],entity:{position:new Vec3(20.5,64,20.5),velocity:new Vec3(0,0,0),onGround:true,eyeHeight:1.62},getControlState:()=>false,
  inventory:{items:()=>items.filter(i=>i.count>0)},blockAt(p){return {name:blocks.get(p.toArray().join(','))||(p.y===63?'grass_block':'air'),position:p,skyLight:15,light:0};},world:{raycast(eye,dir){const distance=(64-eye.y)/dir.y,p=eye.plus(dir.scaled(distance));return {position:new Vec3(Math.floor(p.x),63,Math.floor(p.z))};}},
  async _genericPlace(ground){const p=ground.position.offset(0,1,0),item=this.heldItem;assert.ok(item.count>0);blocks.set(p.toArray().join(','),item.name);item.count--;queueMicrotask(()=>b.emit('blockUpdate',null,b.blockAt(p)));}});
 ctx.mock.method(inventory,'equip',async(bot,itemName)=>{bot.heldItem=bot.inventory.items().find(i=>i.name===itemName);if(!bot.heldItem)throw Error('Missing '+itemName);});
 const motor={lockLook(value){this.locked=value;},pause(){assert.fail('Replanting must not stop active movement');}};
 return {b,t,state,motor,items,blocks};
}
test('recognizes every registry-style tree sapling plus propagules and azaleas',()=>{
 for(const name of ['oak','spruce','birch','jungle','acacia','dark_oak','cherry','pale_oak'])assert.equal(forest.sapling(name+'_sapling'),true);
 for(const name of ['mangrove_propagule','azalea','flowering_azalea'])assert.equal(forest.sapling(name),true);
 for(const name of ['oak_log','wheat_seeds','crimson_fungus','dirt'])assert.equal(forest.sapling(name),false);
});
test('planting opportunities wait for healthy stationary outdoor work',ctx=>{
 const {t,b,state}=fixture(ctx);assert.equal(forest.idle(t,b,state),true);
 for(const field of ['navigationActive','harvestTarget','error']){t[field]=true;assert.equal(forest.idle(t,b,state),false);delete t[field];}
 for(const phase of ['night_hold','night_food','clear_plot','build','complete','stopped','survival_combat']){t.phase=phase;assert.equal(forest.idle(t,b,state),false);}t.phase='gather';
 b.entity.velocity.x=.05;assert.equal(forest.idle(t,b,state),false);b.entity.velocity.x=0;
 b.entity.velocity.y=-.0784;assert.equal(forest.idle(t,b,state),true);b.entity.velocity.y=0;
 b.getControlState=key=>key==='forward';assert.equal(forest.idle(t,b,state),false);b.getControlState=()=>false;
 b.food=10;assert.equal(forest.idle(t,b,state),false);b.food=20;
 b.isSleeping=true;assert.equal(forest.idle(t,b,state),false);b.isSleeping=false;
 b.entities={z:{name:'zombie',position:b.entity.position.offset(9,0,0)}};assert.equal(forest.idle(t,b,state),false);
});
test('random nearby choices respect plots, boundaries, space and actual line of sight',ctx=>{
 const {t,b,state}=fixture(ctx),first=forest.choose(t,b,state,()=>0),last=forest.choose(t,b,state,()=>.999);
 assert.ok(first&&last);assert.notDeepEqual(first.positions[0],last.positions[0]);
 t.campPlots=[{x:20,y:64,z:20}];assert.equal(forest.choose(t,b,state),null);
 t.campPlots=[];state.world.count=8;assert.equal(forest.idle(t,b,state),false);state.world.count=1;
 state.world.bounds=[19,24,19,24];assert.equal(forest.choose(t,b,state),null);state.world.bounds=[0,100,0,100];
 b.world.raycast=()=>null;assert.equal(forest.choose(t,b,state),null);
});
test('does not clear obstructions or plant on unsuitable soil or crowded routes',ctx=>{
 const {t,b,state}=fixture(ctx),original=b.blockAt;
 for(const name of ['sand','dirt_path','stone']){b.blockAt=p=>({...original(p),name:p.y===63?name:'air'});assert.equal(forest.choose(t,b,state),null);}
 b.blockAt=p=>({...original(p),name:p.y>64?'oak_planks':original(p).name});assert.equal(forest.choose(t,b,state),null);
 b.blockAt=original;t.navigator.path=[];for(let x=17;x<=23;x++)for(let z=17;z<=23;z++)t.navigator.path.push([x+.5,64,z+.5]);assert.equal(forest.choose(t,b,state),null);
});
test('uses collected sapling, verifies the block, restores tool and preserves lesson progress',async ctx=>{
 const {t,b,state,motor,items}=fixture(ctx);let calls=0;const place=b._genericPlace;b._genericPlace=async(...args)=>{calls++;return place.apply(b,args);};
 assert.equal(await forest.tick(t,b,motor,state,{now:100,random:()=>0}),true);
 assert.equal(items[0].count,4);assert.equal(t.reforest.planted,1);assert.equal(b.heldItem.name,'stone_axe');assert.equal(motor.locked,false);
 assert.equal(t.phase,'gather');assert.equal(t.lastProgress,123);assert.match(t.message,/Replanted/);
 await forest.tick(t,b,motor,state,{now:200,random:()=>0});assert.equal(calls,1);
});
test('no saplings or safe spot simply skips replanting',async ctx=>{
 const {t,b,state,motor,items}=fixture(ctx);items[0].count=0;
 assert.equal(await forest.tick(t,b,motor,state),false);assert.equal(t.reforest.planted,0);
});
test('zero cached light allows open sky but rejects a genuinely shaded site',ctx=>{
 const {t,b,state}=fixture(ctx),at=b.blockAt,ray=b.world.raycast;
 b.blockAt=p=>({...at(p),skyLight:0,light:0});b.world.raycast=(eye,dir,...args)=>dir.y>0?null:ray(eye,dir,...args);
 assert.ok(forest.choose(t,b,state));
 b.world.raycast=(eye,dir,...args)=>dir.y>0?{name:'oak_planks',position:eye.offset(0,15,0)}:ray(eye,dir,...args);
 assert.equal(forest.choose(t,b,state),null);
});
test('dark and pale oak wait for four saplings and plant actual 2x2 groups',async ctx=>{
 const {t,b,state,motor,items}=fixture(ctx,'pale_oak_sapling',3);assert.equal(forest.choose(t,b,state),null);items[0].count=4;
 const choice=forest.choose(t,b,state,()=>0);assert.equal(choice.positions.length,4);
 assert.equal(await forest.tick(t,b,motor,state,{now:100,random:()=>0}),true);
 assert.equal(t.reforest.planted,4);assert.equal(items[0].count,0);assert.equal(t.reforest.pending,null);
 assert.equal(new Set(choice.positions.map(p=>p.x)).size,2);assert.equal(new Set(choice.positions.map(p=>p.z)).size,2);
});
test('a partly planted group can finish later without needing four more saplings',async ctx=>{
 const {t,b,state,motor}=fixture(ctx,'dark_oak_sapling',4),place=b._genericPlace;let placed=0;
 b._genericPlace=async(...args)=>{await place.apply(b,args);if(++placed===2)b.food=10;};
 await forest.tick(t,b,motor,state,{now:100,random:()=>0});assert.equal(t.reforest.planted,2);assert.ok(t.reforest.pending);
 b.food=20;await forest.tick(t,b,motor,state,{now:40000,random:()=>0});assert.equal(t.reforest.planted,4);assert.equal(t.reforest.pending,null);
});
test('placement failures never stop the trial, credit planting or lose the equipped tool',async ctx=>{
 const {t,b,state,motor}=fixture(ctx);b._genericPlace=async()=>{throw Error('Server refused planting');};
 assert.equal(await forest.tick(t,b,motor,state,{now:100,random:()=>0}),false);
 assert.equal(t.reforest.planted,0);assert.match(t.reforest.last_error,/refused/);assert.equal(t.phase,'gather');assert.equal(b.heldItem.name,'stone_axe');assert.equal(b.listenerCount('blockUpdate'),0);
});
