const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),early=require('../controller/early_lighting'),house=require('../controller/house');
function fixture(){const items={oak_log:7},cells=new Map(),plot={x:0,y:64,z:0};const b={entity:{position:new Vec3(.5,64,.5),eyeHeight:1.62,onGround:true},inventory:{items:()=>Object.entries(items).filter(([,n])=>n).map(([name,count])=>({name,count}))},blockAt(p){const name=cells.get(p.toString())||'air';return {name,position:p,boundingBox:name==='air'||name==='wall_torch'?'empty':'block',getProperties:()=>({facing:'east'})};}};const t={phase:'build',plot,table:house.point(plot,'table'),wilderness:{},milestones:[],milestone(n){this.milestones.push(n);},craft:async(_b,name,n)=>{const log=name.replace('_planks','_log');items[log]-=n;items[name]=(items[name]||0)+4*n;}};return {t,b,items,cells,motor:{pause(){}},state:{world:{}}};}
test('initial crafting reserves real fuel across wood stacks and budgets preparation before enclosing',async()=>{
 const {t,b,items,motor,state}=fixture();items.oak_log=2;items.birch_log=5;assert.equal(early.reserveCost(t),28);
 await early.planks(t,b);assert.equal(items.oak_log+items.birch_log,4);assert.equal((items.oak_planks||0)+(items.birch_planks||0),12);
 await early.tick(t,b,motor,state);assert.equal(t.phase,'night_light_tools');assert.equal(t.wilderness.prebuildLighting,true);assert.equal(t.milestones.includes('hut'),false);
 t.phase='torch_craft';items.torch=12;await early.tick(t,b,motor,state);assert.equal(t.phase,'build');assert.equal(t.wilderness.lightingKitReady,true);assert.equal(early.reserveCost(t),0);
});
test('prebuild mining return reaches the floor without trying to open a nonexistent door',async()=>{
 const {t,b,motor,state}=fixture();t.wilderness.prebuildLighting=true;t.phase='stone_return';const api=()=>{},scan=()=>{},tasks={};
 t.walk=async(_b,_m,g,s,a,c,k)=>{assert.deepEqual(g,[.5,64.1,.5]);assert.equal(a,api);assert.equal(c,scan);assert.equal(k,tasks);return true;};
 await early.tick(t,b,motor,state,api,scan,tasks);assert.equal(t.phase,'stone_tools');
});
test('prebuild torches mount as soon as the support exists, before the roof, and gate later supply trips',async()=>{
 const {t,b,items,cells,motor,state}=fixture(),inv=require('../controller/inventory_sync'),sync=inv.sync,equip=inv.equip,mount=house.torchMount(t.plot,'indoor');
 t.wilderness.lightingKitReady=true;items.torch=12;assert.equal(await early.tick(t,b,motor,state),false,'no invented wall support');
 cells.set(mount.support.toString(),'oak_planks');inv.sync=async()=>{};inv.equip=async(_b,n)=>assert.equal(n,'torch');
 b.placeBlock=async(s,f)=>{assert.ok(s.position.equals(mount.support));assert.ok(f.equals(mount.face));items.torch--;cells.set(mount.position.toString(),'wall_torch');};
 try{assert.equal(await early.tick(t,b,motor,state),true);assert.equal(items.torch,11);assert.equal(t.phase,'build');assert.equal(t.milestones.includes('torch'),false,'outdoor verification is still required');
 t.phase='leave_hut';await early.tick(t,b,motor,state);assert.equal(t.phase,'light_exit');assert.equal(t.wilderness.earlyLighting,true);
 }finally{inv.sync=sync;inv.equip=equip;}
});
test('ordinary hut training and lit homes do not receive extra construction reserves',()=>{
 assert.equal(early.reserveCost({wilderness:null}),0);assert.equal(early.reserveCost({wilderness:{},supplyRun:true}),0);assert.equal(early.reserveCost({wilderness:{lightingKitReady:true}}),0);
});

test('a distant builder approaches the torch wall before it can continue roofing',async()=>{
 const {t,b,items,cells,motor,state}=fixture(),mount=house.torchMount(t.plot,'indoor');t.wilderness.lightingKitReady=true;items.torch=12;cells.set(mount.support.toString(),'oak_planks');b.entity.position=new Vec3(2.5,64,2.5);let walked=false;
 t.walk=async(_b,_m,goal)=>{walked=true;assert.deepEqual(goal,[-.5,64.1,.5]);};
 assert.equal(await early.tick(t,b,motor,state),true);assert.equal(walked,true);assert.equal(t.phase,'build');assert.equal(items.torch,12);
});

test('early lighting follows the return route beyond an occupied threshold before closing the door',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{WorldStall}=require('../controller/world_stall');
 const {insideHome}=require('../controller/world_navigation'),{occupied}=require('../controller/door_care'),firstNight=require('../controller/first_night');
 const tasks=require('../controller/tasks'),{scan}=require('../controller/perception'),lighting=require('../controller/house_lighting');
 const {b,t:setup,state,cells,motor}=fixture(),{plot}=setup,run='light-return',now=Date.now(),t=new HutTeacher();
 const door=new Vec3(0,64,-3),position=new Vec3(.5,64,-1.98),milestones=['hut','torch'];
 let open=true,closes=0,commands=0;
 for(const q of house.blueprint(plot))cells.set(new Vec3(q.x,q.y,q.z).toString(),q.table?'crafting_table':'oak_planks');
 for(const side of ['indoor','outdoor'])cells.set(house.torchMount(plot,side).position.toString(),'wall_torch');
 Object.assign(b,{username:'LightReturn',health:20,food:20,time:{timeOfDay:3000},players:{},entities:{},world:{raycast:()=>null}});
 Object.assign(b.entity,{id:1,position,yaw:Math.PI});
 b.blockAt=p=>{
  p=p.floored();
  if(p.x===door.x&&p.z===door.z&&[door.y,door.y+1].includes(p.y))
   return {name:'oak_door',position:p,boundingBox:'block',shapes:[[0,0,0,.1875,1,1]],getProperties:()=>({open,facing:'north',half:p.y===door.y?'lower':'upper'})};
  const name=cells.get(p.toString())||(p.y<64?'dirt':'air');
  return {name,position:p,boundingBox:['air','wall_torch'].includes(name)?'empty':'block',getProperties:()=>({facing:p.z===-4?'north':'east'})};
 };
 b.activateBlock=async block=>{assert.ok(block.position.equals(door));assert.equal(occupied(b,block),false);closes++;open=false;};
 motor.command=()=>{commands++;};
 Object.assign(state,{run,world:{mission:'first_night',driver:'student',bounds:[-12,12,-12,12]}});
 Object.assign(t,{run,plot,campPlots:[plot],phase:'light_return',milestones:[...milestones],lastReport:now,started:now,lastProgress:now,
  last:position.clone(),anchor:position.clone(),travelled:0,runtime:tasks.createRuntime(),timing:new WorldTiming(now),stall:new WorldStall(90)});
 firstNight.init(t,state.world);
 t.wilderness.earlyLighting=true;
 const tick=()=>t.tick(b,motor,state,async(path,data)=>{
  assert.ok(['/step','/world/report'].includes(path));
  return {action:data.teacher};
 },scan,tasks);

 assert.ok(insideHome(position,plot));
 assert.ok(occupied(b,b.blockAt(door)));
 await tick();
 assert.equal(t.phase,'light_return');
 assert.equal(commands,1,'the checked home route remains active when the bot still occupies the doorway');
 assert.equal(t.navigator.status.route_complete,true);
 assert.equal(closes,0);

 b.entity.position=new Vec3(.5,64,.5);
 b.players.other={entity:{id:2,position:new Vec3(.5,64,-2.4)},gamemode:0};
 await tick();
 assert.equal(t.phase,'light_return');
 assert.equal(closes,0,'wait for another player to clear the panel before securing the house');
 assert.equal(t.wilderness.earlyLighting,true);
 delete b.players.other;
 await tick();
 assert.equal(closes,1);
 assert.equal(t.phase,'leave_hut');
 assert.equal(t.wilderness.earlyLighting,false);
 assert.equal(t.supplyRun,true);
 assert.equal(lighting.missing(b,plot),0);
 assert.deepEqual(t.milestones,milestones);
});
