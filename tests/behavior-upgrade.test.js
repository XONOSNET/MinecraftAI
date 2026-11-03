const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const loot=require('../controller/opportunistic_loot'),blockers=require('../controller/build_blockers'),gaze=require('../controller/enderman_gaze'),jump=require('../controller/checked_jump'),lighting=require('../controller/early_lighting');
function flat(){return {username:'Test',food:20,health:20,players:{},entities:{},inventory:{items:()=>[]},entity:{position:new Vec3(.5,64,.5),onGround:true,yaw:-Math.PI/2,pitch:0},world:{raycast:()=>null},blockAt(p){p=p.floored();return {name:p.y<64?'stone':'air',position:p,boundingBox:p.y<64?'block':'empty',getProperties:()=>({})};}};}
test('useful loot includes equipment, food, leather and saplings but excludes unsafe food and junk',()=>{
 for(const n of ['iron_sword','leather','cooked_mutton','oak_sapling','stone_pickaxe','iron_chestplate','torch'])assert.equal(loot.useful(n),true,n);
 for(const n of ['rotten_flesh','poisonous_potato','cobweb',null])assert.equal(loot.useful(n),false);
});
test('a visible useful item gets a bounded detour without losing its original lesson',async ctx=>{
 const b=flat(),drop={id:41,name:'item',isValid:true,drop:'leather',position:new Vec3(2.5,64,.5)};b.entities={41:drop};
 ctx.mock.method(require('../controller/survival'),'itemName',(_b,e)=>e.drop);
 let walked;const t={phase:'gather',wilderness:{},navigator:{},walk:async(_b,_m,g)=>{walked=g;}};
 const state={run:'loot',world:{bounds:[-20,20,-20,20]}};
 assert.equal(await loot.tick(t,b,{},state),true);assert.ok(walked);assert.equal(t.phase,'gather');assert.match(t.message,/leather/);
 t.loot.started=Date.now()-8000;assert.equal(await loot.tick(t,b,{},state),false);assert.equal(t.loot.target,null);
});
test('loot cannot pull a bot out of shelter recovery or an underground mining exit',async()=>{
 const b=flat(),t={phase:'night_recover',wilderness:{},walk:async()=>assert.fail('must remain sheltered')};
 assert.equal(await loot.tick(t,b,{},{}),false);t.phase='night_stone';t.wilderness.mine={stage:'exit'};assert.equal(await loot.tick(t,b,{},{}),false);
});
test('building blocker filtering excludes players, pets and named animals',()=>{
 const b=flat(),e={type:'mob',name:'sheep',position:new Vec3(3.2,64,.5),width:.9,height:1.3};
 assert.equal(blockers.eligible(b,e),true);assert.equal(blockers.intersects(e,{x:3,y:64,z:0}),true);assert.equal(blockers.intersects(e,{x:0,y:63,z:0}),false);
 assert.equal(blockers.eligible(b,{...e,type:'player'}),false);assert.equal(blockers.eligible(b,{...e,name:'wolf'}),false);assert.equal(blockers.eligible(b,{...e,customName:'Pet'}),false);
});
test('construction blockers receive a real cooldown-limited attack instead of a placement failure',async()=>{
 const b=flat(),enemy={id:2,type:'mob',name:'cow',position:new Vec3(3.1,64,.5),isValid:true};b.entities={enemy};b.heldItem={name:'wooden_axe'};b.inventory.items=()=>[{name:'wooden_axe',count:1}];b.lookAt=async()=>{};b.deactivateItem=()=>{};b.setControlState=()=>{};let hits=0;b.attack=()=>hits++;
 const t={phase:'build',plot:{x:0,y:64,z:0}},state={world:{bounds:[-20,20,-20,20]}};
 assert.equal(await blockers.tick(t,b,{pause(){}},state),true);assert.equal(hits,1);
 await blockers.tick(t,b,{pause(){}},state);assert.equal(hits,1,'native attack cooldown remains enforced');
});
test('neutral Enderman gaze is lowered but looking away and fighting an angry Enderman remain distinct',()=>{
 const b=flat();b.registry={entitiesByName:{enderman:{metadataKeys:['creepy','stared_at']}}};b.entities.e={name:'enderman',position:new Vec3(.5,64,-5),metadata:[false,false]};
 const pitch=Math.atan2(.93,5.5);assert.equal(gaze.protect(b,0,pitch),-.55);assert.equal(gaze.protect(b,Math.PI,0),0);
 b.entities.e.metadata[0]=true;assert.equal(gaze.protect(b,0,pitch),pitch);
});
test('gap routing accepts exactly one empty cell, rejects fluids, long gaps and blocked jump headroom',()=>{
 const b=flat(),original=b.blockAt;b.blockAt=p=>p.x===1&&p.y===63?{name:'air',position:p,boundingBox:'empty'}:original(p);
 assert.equal(jump.gap(b,[0,64,0],[2,64,0]),true);assert.equal(jump.gap(b,[0,64,0],[3,64,0]),false);
 assert.equal(jump.gap(b,[0,64,0],[2,64,0],{forbidden:q=>q[0]===1}),false);
 b.blockAt=p=>p.x===1&&p.y===63?{name:'water',position:p,boundingBox:'empty'}:original(p);assert.equal(jump.gap(b,[0,64,0],[2,64,0]),false);
});
test('world route planner exposes a one-block jump intention without allowing a wider chasm',()=>{
 const b=flat(),original=b.blockAt;b.blockAt=p=>p.x===1&&p.y<64?{name:'air',position:p,boundingBox:'empty'}:original(p);
 const route=require('../controller/field_navigation').route(b,[2.5,64.1,.5],4,256,true,{allowGaps:true});assert.equal(route.reached,true);assert.ok(route.path.some(p=>p.gapFrom));
});
test('lighting starts before the chest and carries a real mine torch reserve',async()=>{
 const b=flat(),items={wooden_pickaxe:1},t={phase:'chest',milestones:['hut'],wilderness:{},table:{x:0,y:64,z:0},milestone(n){if(!this.milestones.includes(n))this.milestones.push(n);}};b.inventory.items=()=>Object.entries(items).map(([name,count])=>({name,count}));
 await lighting.tick(t,b,{},{});assert.equal(t.phase,'night_light_tools');await lighting.tick(t,b,{pause(){}},{});assert.equal(t.phase,'quarry_setup');assert.ok(t.milestones.includes('wooden_pickaxe'));
 t.phase='quarry_setup';t.milestones.push('torch','stocked');await lighting.tick(t,b,{},{});assert.equal(t.phase,'night_food','lighting must not repeat after settlement extras');
});


test('gaze guard waits for Mineflayer plugins before wrapping look',()=>{
 const {EventEmitter}=require('events'),b=new EventEmitter();
 gaze.attach(b);assert.equal(b.listenerCount('spawn'),1);let called=0;b.look=()=>{called++;return Promise.resolve();};
 b.emit('spawn');assert.equal(b.listenerCount('spawn'),0);assert.equal(b.listenerCount('physicsTick'),1);
 b.look(0,0,true);assert.equal(called,1);b.emit('end');assert.equal(b.listenerCount('physicsTick'),0);
});
