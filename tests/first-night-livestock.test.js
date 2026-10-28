const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),livestock=require('../controller/first_night_livestock'),night=require('../controller/first_night'),{WildernessMemory}=require('../controller/wilderness_memory');
const registry=require('prismarine-registry')('1.21.4');
function bot(){return {username:'LabAI0',registry,health:20,food:20,entity:{position:new Vec3(.5,64,-15.5),onGround:true},entities:{},players:{},inventory:{items:()=>[]},world:{raycast:()=>null},blockAt(p){const q=p.floored();return {name:q.y<64?'stone':'air',position:q,boundingBox:q.y<64?'block':'empty'};}};}
function setup(){const b=bot(),t={phase:'night_food',plot:{x:0,y:64,z:0},campPlots:[{x:0,y:64,z:0},{x:10,y:64,z:0}],milestones:[],walk:async()=>undefined};night.init(t,{});return {b,t,state:{run:'world-test',world:{first_night:{stations:true},bounds:[-40,40,-40,40],index:0}}};}
function sheep(id,x=0,color=0,owner='LabAI0'){const metadata={2:'FirstNight'+owner};metadata[registry.entitiesByName.sheep.metadataKeys.indexOf('wool')]=color;return {id,name:'sheep',position:new Vec3(x+.5,64,-18.5),metadata};}
test('resource sightings remember wool separately and respect ownership and white wool',()=>{
 const {b,t,state}=setup();b.entities={white:sheep(1),black:sheep(2,3,15),neighbor:sheep(3,10,0,'LabAI1')};livestock.observe(t,b,state.world);
 assert.equal(t.wilderness.memory.resources.filter(r=>r.kind==='wool').length,1);assert.equal(t.wilderness.memory.resources.filter(r=>r.kind==='food').length,2);
});
test('supported drops belong to the nearest assigned animal station',()=>{
 const {t,state}=setup();assert.equal(livestock.localDrop(t,state.world,new Vec3(.5,64,-18.5)),true);assert.equal(livestock.localDrop(t,state.world,new Vec3(10.5,64,-18.5)),false);assert.equal(livestock.localDrop(t,{first_night:{stations:false}},new Vec3(10.5,64,-18.5)),true);
});
test('an exhausted supported station requests one bounded replacement and waits',async()=>{
 const {b,t,state}=setup();let requests=0;const api=async(path,data)=>{assert.equal(path,'/world/livestock');assert.equal(data.resource,'wool');requests++;return {remaining:3};};
 await livestock.support(t,b,{pause(){}},state,api,null,null,'wool');await livestock.support(t,b,{pause(){}},state,api,null,null,'wool');assert.equal(requests,1);assert.equal(t.wilderness.livestock_status.state,'waiting_for_replacement');
 assert.equal(await livestock.support(t,b,{}, {world:{first_night:{stations:false}}},api,null,null,'wool'),false);
});
test('loaded but unseen sheep trigger a sightline check rather than a replacement',async()=>{
 const {b,t,state}=setup();b.entities={sheep:sheep(1)};let walked=0;t.walk=async()=>{walked++;};await livestock.support(t,b,{},state,()=>{throw Error('do not resupply existing sheep');},null,null,'wool');assert.equal(walked,1);
});
test('food hunting preserves supported sheep until bed wool has been collected',async()=>{
 const {b,t,state}=setup();b.entities={sheep:sheep(1)};let replacement=null;
 await night.tick(t,b,{pause(){}},state,async(path,data)=>{assert.equal(path,'/world/livestock');replacement=data.resource;return {remaining:3};},null,null,null);assert.equal(replacement,'food');
});
test('food completion first collects nearby wool byproducts',async()=>{
 const {b,t,state}=setup(),Item=require('prismarine-item')(registry),metadata=[];metadata[registry.entitiesByName.item.metadataKeys.indexOf('item')]=Item.toNotch(new Item(registry.itemsByName.white_wool.id,1));b.inventory.items=()=>[{name:'beef',count:4}];b._syncWindow=async()=>{};b.entities={drop:{id:4,name:'item',position:b.entity.position.clone(),metadata}};
 await night.tick(t,b,{pause(){}},state,()=>{throw Error('no inference needed to collect the wool');},null,null,null);assert.equal(t.phase,'night_food');assert.match(t.message,/Collecting white_wool/);
});
