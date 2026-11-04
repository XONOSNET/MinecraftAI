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
