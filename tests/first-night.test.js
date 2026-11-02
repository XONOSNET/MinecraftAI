const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),night=require('../controller/first_night'),{WildernessMemory}=require('../controller/wilderness_memory');
function bot(){return {health:20,food:20,username:'LabAI0',entity:{position:new Vec3(.5,64,.5),onGround:true},entities:{},players:{},inventory:{items:()=>[]},world:{raycast:()=>null},blockAt(p){return {name:p.y<64?'stone':'air',position:p,boundingBox:p.y<64?'block':'empty'};}};}

test('First Night mines exposed stone faces without removing lower neighboring support',async()=>{
 const scan=require('../controller/resource_scan'),original=scan.stone,b=bot(),floor=new Vec3(2,63,0),face=new Vec3(2,64,0);
 scan.stone=async()=>[floor,face];const previous=b.blockAt;
 b.blockAt=p=>p.equals(face)?{name:'stone',position:p,boundingBox:'block'}:previous(p);
 b.canDigBlock=()=>true;b.world.raycast=()=>({position:face});let mined;
 const t={phase:'night_stone',plot:{x:-10,y:64,z:-10},milestones:[],harvest:async(_b,_m,p)=>{mined=p;}};night.init(t,{});
 try{await night.tick(t,b,{pause(){}},{world:{bounds:[-20,20,-20,20],first_night:{}}});assert.ok(mined.equals(face));assert.ok(t.wilderness.stones.every(q=>q.position.y>=64));}
 finally{scan.stone=original;}
});

test('First Night starts a staircase when exposed stone is unavailable and returns before quarry credit',async ctx=>{
 const b=bot(),t={phase:'night_stone',plot:{x:-10,y:64,z:-10},milestones:[],milestone(name){this.milestones.push(name);}};night.init(t,{});
 ctx.mock.method(require('../controller/resource_scan'),'stone',async()=>[]);
 let digs=0;ctx.mock.method(require('../controller/staircase_mining'),'tick',async()=>{digs++;t.wilderness.mine={stage:'exit'};return {handled:true};});
 const state={world:{bounds:[-20,20,-20,20],first_night:{}}};
 await night.tick(t,b,{pause(){}},state);assert.equal(digs,1);assert.equal(t.phase,'night_stone');
 b.inventory.items=()=>[{name:'cobblestone',count:16}];await night.tick(t,b,{pause(){}},state);
 assert.equal(digs,2);assert.deepEqual(t.milestones,[],'gathering enough stone does not skip the return staircase');
 t.wilderness.mine.stage='done';await night.tick(t,b,{pause(){}},state);assert.deepEqual(t.milestones,['quarry']);assert.equal(t.phase,'night_fuel');
});
test('survival priorities interrupt work to eat or retreat and resume the original task',async()=>{
 const b=bot(),t={phase:'gather',milestones:['hut'],navigator:{},lastProgress:0};night.init(t,{});
 b.health=9;assert.equal(night.priority(b,t,{}).kind,'retreat');
 assert.equal(await night.interrupt(t,b,{}, {world:{}}),true);assert.equal(t.phase,'night_retreat');assert.equal(t.wilderness.resume,'gather');
 t.phase='night_recover';b.health=18;assert.equal(await night.interrupt(t,b,{}, {world:{}}),true);assert.equal(t.phase,'gather');
 b.food=12;b.inventory.items=()=>[{name:'cooked_beef',count:1}];assert.equal(night.priority(b,t,{}).kind,'eat');
});
test('visible threats cause a retreat while raw food is an emergency option before cooking',()=>{
 const b=bot(),t={phase:'night_stone',milestones:['hut']};night.init(t,{});
 b.entities={enemy:{name:'zombie',position:new Vec3(3,64,0)}};assert.equal(night.priority(b,t,{}).kind,'retreat');
 b.entities={};b.food=8;b.inventory.items=()=>[{name:'beef',count:1}];assert.equal(night.priority(b,t,{}).kind,'eat raw');
 b.inventory.items=()=>[{name:'chicken',count:1}];assert.notEqual(night.priority(b,t,{}).kind,'eat raw');
});
test('outdoor searches finish crossing the doorway before inspecting resources',async()=>{
 const b=bot(),t={phase:'night_stone',plot:{x:0,y:64,z:0},milestones:[],walk:async()=>false};night.init(t,{});
 await night.tick(t,b,{}, {world:{} });assert.equal(t.wilderness.leaving,true);
 b.entity.position.z=-2.4;t.walk=async()=>true;
 await night.tick(t,b,{}, {world:{} });assert.equal(t.wilderness.leaving,false);assert.equal(t.phase,'night_stone');
});
test('all outdoor survival searches exit at the sensed ground height below a raised doorway',async()=>{
 for(const phase of ['night_stone','night_food','night_wool','night_forage','night_scout','night_fuel']){
  const b=bot(),t={phase,plot:{x:0,y:65,z:0},milestones:[]};b.entity.position=new Vec3(.5,65,.5);night.init(t,{});let goal;
  t.walk=async(_b,_motor,q)=>{goal=q;return true;};
  await night.tick(t,b,{}, {world:{}});assert.deepEqual(goal,[.5,64.1,-4.5]);assert.equal(t.wilderness.leaving,false);
 }
});

test('recovery at food 17 eats carried meals or safely forages instead of waiting for impossible regeneration',async()=>{
 const b=bot(),t={phase:'night_recover',milestones:['hut'],navigator:{},path:[]};night.init(t,{});t.wilderness.resume='chest';
 b.health=16;b.food=17;b.inventory.items=()=>[{name:'wooden_axe',count:1}];
 assert.equal(night.priority(b,t,{}).kind,'recovery forage');
 await night.interrupt(t,b,{}, {world:{}});assert.equal(t.phase,'night_forage');assert.equal(t.wilderness.resume,'chest');assert.equal(t.wilderness.forageResume,'night_retreat');
 t.phase='night_recover';b.inventory.items=()=>[{name:'cooked_beef',count:1}];assert.equal(night.priority(b,t,{}).kind,'eat');
 b.inventory.items=()=>[{name:'mutton',count:1}];assert.equal(night.priority(b,t,{}).kind,'eat raw');
 b.inventory.items=()=>[{name:'chicken',count:1}];assert.notEqual(night.priority(b,t,{}).kind,'eat raw');
});

test('recovery forage never sends a badly injured or visibly threatened bot outside',()=>{
 const b=bot(),t={phase:'night_recover',milestones:['hut']};night.init(t,{});t.wilderness.resume='chest';b.food=17;b.inventory.items=()=>[{name:'wooden_axe',count:1}];
 b.health=9;assert.equal(night.priority(b,t,{}).kind,'retreat');
 b.health=16;b.entities={z:{name:'zombie',position:new Vec3(3,64,0)}};assert.equal(night.priority(b,t,{}).kind,'retreat');
 b.entities={};b.food=18;assert.notEqual(night.priority(b,t,{}).kind,'recovery forage');
 b.health=18;assert.equal(night.priority(b,t,{}).kind,'resume');
});

test('recovery food trip returns home before resuming its original lesson',async()=>{
 const b=bot(),t={phase:'night_forage',plot:{x:0,y:64,z:0},milestones:['hut'],navigator:{},walk:async()=>true};
 night.init(t,{});Object.assign(t.wilderness,{resume:'chest',forageResume:'night_retreat'});b.entity.position=new Vec3(12,64,.5);b.inventory.items=()=>[{name:'mutton',count:2}];
 const state={world:{first_night:{},bounds:[-30,30,-30,30]}};
 await night.tick(t,b,{pause(){}},state);assert.equal(t.phase,'night_retreat');assert.equal(t.wilderness.resume,'chest');
 await night.tick(t,b,{pause(){}},state);assert.equal(t.phase,'night_recover');
 await night.interrupt(t,b,{},state);assert.equal(t.phase,'chest');assert.equal(t.wilderness.resume,undefined);
});

test('critically injured recovery without food ends with an explicit food failure instead of waiting indefinitely',async()=>{
 const b=bot(),t={phase:'night_recover',plot:{x:0,y:64,z:0},milestones:['hut']};night.init(t,{});b.health=6.3;b.food=14;
 const blockAt=b.blockAt;b.blockAt=p=>({...blockAt(p),getProperties:()=>({open:false})});
 await assert.rejects(night.tick(t,b,{pause(){}},{world:{first_night:{}}}),/Cannot regenerate/);assert.equal(t.failureCategory,'food_exhausted');
 b.food=18;await night.tick(t,b,{pause(){}},{world:{first_night:{}}});assert.equal(t.phase,'night_recover','genuine regeneration remains allowed');
});

test('resource memory is bounded and creates road edges only from adjacent physical movement',()=>{
 const b=bot(),m=new WildernessMemory();m.observe(b);b.entity.position.x=1.5;m.observe(b);
 assert.deepEqual(m.snapshot().edges,[['0,64,0','1,64,0']]);
 b.entity.position.x=20.5;m.observe(b);assert.equal(m.snapshot().edges.length,1);
 b.entity.onGround=false;b.entity.position.x=21.5;m.observe(b);assert.equal(m.snapshot().roads.length,3);
 m.remember('wood',[4,64,4]);m.remember('wood',[4,64,4]);assert.equal(m.resources.length,1);
 m.reject([4,64,4],100);assert.equal(m.available([4,64,4],200),false);assert.equal(m.available([4,64,4],30101),true);
});
test('remembered roads must still have clear terrain before they can be reused',()=>{
 const b=bot(),m=new WildernessMemory({roads:[[.5,64.1,.5],[1.5,64.1,.5],[2.5,64.1,.5]],edges:[['0,64,0','1,64,0'],['1,64,0','2,64,0']]});
 assert.ok(m.detour(b,[2.5,64.1,.5],[-10,10,-10,10]));
 b.blockAt=p=>({name:'lava',boundingBox:'empty',position:p});assert.equal(m.detour(b,[2.5,64.1,.5],[-10,10,-10,10]),null);
});
test('natural stone discovery cannot nominate the block beneath the bot as an approach',()=>{
 const b=bot(),block={position:new Vec3(3,64,0)},goals=night.approaches(b,block,[-20,20,-20,20]);
 assert.ok(goals.length);assert.ok(goals.every(g=>Math.floor(g[0])!==3||Math.floor(g[2])!==0));
});
test('provisioned shelter watch verifies actual enclosure before crediting survival',async()=>{
 const b=bot(),t={phase:'night_hold',plot:{x:0,y:64,z:0},milestones:[],started:0,lastProgress:0};night.init(t,{});const block=b.blockAt;b.blockAt=p=>({...block(p),getProperties:()=>({})});
 await assert.rejects(()=>night.tick(t,b,{pause(){}},{world:{first_night:{hold_seconds:0}}}),/Shelter/);
 assert.notEqual(t.phase,'complete');
});

test('First Night attacks an in-reach sheep above its reached approach rather than walking to the same stance',async()=>{
 const b=bot(),hunt=require('../controller/hunt_targets'),combat=require('../controller/combat'),old={choose:hunt.choose,observe:combat.observe,teacher:combat.teacher,interact:combat.interact};
 b.registry=require('prismarine-registry')('1.21.4');const metadata=[];metadata[b.registry.entitiesByName.sheep.metadataKeys.indexOf('wool')]=0;
 const e={id:1,name:'sheep',position:new Vec3(1.5,65,.5),metadata};b.entities={e};
 let attacks=0,walks=0;const t={phase:'night_wool',plot:{x:-10,y:64,z:-10},milestones:[],walk:async()=>{walks++;return true;}};night.init(t,{});
 hunt.choose=()=>({animal:e,goal:[.5,64.1,.5],status:{}});combat.observe=()=>({angle:0,extra:[],metrics:{},gear:{weapon:true}});combat.teacher=()=>6;combat.interact=async()=>{attacks++;return true;};
 try{await night.tick(t,b,{pause(){},command(){}},{run:'ledge',world:{bounds:[-30,30,-30,30],first_night:{stations:false}}},async()=>({action:6}),()=>({pooled:[],hits:[],proximity:{}}),{});assert.equal(attacks,1);assert.equal(walks,0);}
 finally{hunt.choose=old.choose;combat.observe=old.observe;combat.teacher=old.teacher;combat.interact=old.interact;}
});
