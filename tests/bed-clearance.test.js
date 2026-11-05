const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const night=require('../controller/first_night'),house=require('../controller/house'),inventory=require('../controller/inventory_sync'),access=require('../controller/resource_access');
function fixture(name){
 const plot={x:0,y:64,z:0},foot=house.point(plot,'bed'),head=foot.offset(0,0,1),cells=new Map([[head.toString(),name]]);
 const b={username:'Fixture',entity:{position:new Vec3(.5,64,.5),onGround:true},players:{},inventory:{items:()=>[{name:'white_bed',count:1}]},blockAt(p){p=p.floored();const name=cells.get(p.toString())||(p.y<64?'stone':'air');return {name,position:p,boundingBox:['air','light'].includes(name)?'empty':'block'};},async look(_yaw,_pitch,force){assert.notEqual(force,true,'await actual turning instead of locally forcing an unsent angle');this.rotationSent=false;},async waitForTicks(n){assert.ok(n>=2);this.rotationSent=true;},async _placeBlockWithOptions(){assert.equal(this.rotationSent,true,'orientation must get physics ticks before native placement');cells.set(foot.toString(),'white_bed');cells.set(head.toString(),'white_bed');}};
 const t={phase:'night_bed',plot,wilderness:{},milestones:[],milestone(n){this.milestones.push(n);}},motor={pause(){}},state={run:'fixture',world:{}};
 return {b,t,motor,state,cells,head,foot};
}
for(const obstruction of ['snow','short_grass','light'])test('bed verifies both native halves after clearing '+obstruction,async ctx=>{
 const f=fixture(obstruction);ctx.mock.method(inventory,'sync',async()=>{});ctx.mock.method(inventory,'equip',async()=>{});
 ctx.mock.method(access,'dig',async(b,block,{validate})=>{assert.ok(validate(block));f.cells.set(block.position.toString(),'air');return true;});
 await night.tick(f.t,f.b,f.motor,f.state,async()=>({position:f.foot.toArray()}));
 assert.equal(f.b.blockAt(f.head).name,'white_bed');assert.equal(f.t.phase,'night_scout');assert.ok(f.t.milestones.includes('bed_home'));
});
for(const obstruction of ['chest','oak_planks','water'])test('bed preserves '+obstruction+' without awarding home',async ctx=>{
 const f=fixture(obstruction);ctx.mock.method(inventory,'sync',async()=>{});
 await assert.rejects(night.tick(f.t,f.b,f.motor,f.state,async()=>assert.fail('No home before a real bed')), {code:'BUILD_OBSTRUCTED'});
 assert.equal(f.b.blockAt(f.head).name,obstruction);assert.equal(f.t.phase,'night_bed');assert.deepEqual(f.t.milestones,[]);
});
