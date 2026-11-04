const test=require('node:test'),assert=require('node:assert/strict'),wood=require('../controller/wood_resupply');
test('the bed lesson requests resupply instead of failing when only wool remains',async()=>{
 const {Vec3}=require('vec3'),night=require('../controller/first_night');
 const t={phase:'night_bed',plot:{x:0,y:64,z:0},wilderness:{},navigator:{}},b={_syncWindow:async()=>{},entity:{position:new Vec3(.5,64,.5)},inventory:{items:()=>[{name:'white_wool',count:3}]}},motor={pause(){}};
 await night.tick(t,b,motor,{world:{}});assert.equal(t.phase,'gather');assert.equal(t.wilderness.woodResupply.resume,'night_bed');
 assert.equal(b.inventory.items()[0].count,3,'the wool is retained for the resumed bed recipe');
});
test('missing bed wood gathers a real log and returns to the bed task without rebuilding',()=>{
 const t={phase:'night_bed',wilderness:{},navigator:{lastPlan:99},path:[[1,2,3]]},items=[];const b={inventory:{items:()=>items}};
 wood.request(t,'night_bed');assert.equal(t.phase,'gather');assert.equal(t.wilderness.fuelTrip,true);assert.equal(wood.tick(t,b),false);
 items.push({name:'birch_log',count:1});assert.equal(wood.tick(t,b),true);assert.equal(t.phase,'night_wool_home');assert.equal(t.wilderness.fuelTrip,false);assert.equal(t.wilderness.woodResupply,undefined);
});
test('resupply preserves shelter interruptions and the original fuel-trip setting',()=>{
 const t={phase:'night_cook',wilderness:{fuelTrip:true},navigator:{}},b={inventory:{items:()=>[{name:'spruce_planks',count:3}]}};
 wood.request(t,'night_cook');t.phase='night_recover';assert.equal(wood.tick(t,b),false);assert.equal(t.phase,'night_recover');
 t.phase='gather';assert.equal(wood.tick(t,b),true);assert.equal(t.phase,'night_food_home');assert.equal(t.wilderness.fuelTrip,true);
});
