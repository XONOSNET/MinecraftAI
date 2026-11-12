const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{EventEmitter}=require('node:events');
const work=require('../controller/shelter_work'),defense=require('../controller/survival_defense');
const policy=require('../controller/shelter_policy'),{WildernessMemory}=require('../controller/wilderness_memory');
const observations=require('../controller/survival_observations'),burrow=require('../controller/emergency_burrow');
const workspace=require('../controller/burrow_workspace'),prospect=require('../controller/iron_prospect');
function fixture(){
 const stock=[],slots=[],cells=new Map(),registry=require('minecraft-data')('1.21.4'),b=new EventEmitter();
 Object.assign(b,{username:'ProgressUnit',health:20,food:20,inventory:{slots,items:()=>stock},registry,players:{},entities:{},
  time:{timeOfDay:14000},entity:{id:1,position:new Vec3(.5,64,.5),yaw:0,onGround:true},world:{raycast:()=>null}});
 b.blockAt=p=>{const q=p.floored(),name=cells.get(q.toArray().join(','))||(q.y<64?'stone':'air');
  return {position:q,name,boundingBox:['air','cave_air','water','lava','wall_torch'].includes(name)?'empty':'block',getProperties:()=>({})};};
 b.recipesFor=(id,_meta,_count,station)=>station||registry.items[id].name==='torch'&&stock.some(i=>['coal','charcoal'].includes(i.name)&&i.count>0)?[{}]:[];
 const t={run:'progression-fixture',phase:'night_recover',plot:{x:35,y:64,z:35},campPlots:[],milestones:['hut'],
  wilderness:{memory:new WildernessMemory()},navigator:{},lastProgress:0};
 const w={bounds:[-48,48,-48,48],first_night:{hostiles:true}},motor={pause(){},command(){}};
 return {b,t,w,stock,slots,cells,motor};
}
const item=(name,count=1)=>({name,count});
test('secure work chooses fuel, incremental iron equipment and confirmed offhand equip from carried materials',async ctx=>{
 const {b,t,stock,slots,motor}=fixture(),table={},hearth={};
 stock.push(item('stone_pickaxe'),item('oak_log',2),item('oak_planks',8),item('stick',4),item('raw_iron',3));
 assert.equal(work.choose(b,{table,hearth}).name,'charcoal');
 const cooked=[];ctx.mock.method(require('../controller/furnace'),'smelt',async(_b,_hearth,input,output,_fuel,options)=>{
  assert.equal(options.amount,1);assert.ok(stock.find(i=>i.name===input).count>0);
  stock.find(i=>i.name===input).count--;stock.push(item(output));cooked.push(output);return 1;
 });
 t.craft=async(_b,name)=>{
  if(name==='torch')stock.push(item(name,8));
  else{const needed={shield:1,iron_sword:2,iron_boots:4}[name];assert.ok(needed);
   for(let i=0;i<needed;i++){const at=stock.findIndex(x=>x.name==='iron_ingot');assert.notEqual(at,-1);stock.splice(at,1);}
   stock.push(item(name));
  }
 };
 b.equip=async(i,slot)=>{assert.equal(slot,'off-hand');slots[45]=i;stock.splice(stock.indexOf(i),1);};
 for(let i=0;i<8;i++)await work.tick(t,b,motor,{table,hearth});
 assert.deepEqual(cooked,['charcoal','iron_ingot','iron_ingot','iron_ingot']);
 assert.equal(slots[45].name,'shield');assert.ok(stock.some(i=>i.name==='iron_sword'));
 stock.push(...Array.from({length:4},()=>item('iron_ingot')));
 assert.equal(work.choose(b,{table,hearth}).name,'iron_boots','buy an affordable piece with four ingots');
});
test('failed optional crafting has a cooldown and an open door blocks protected work',async()=>{
 const {b,t,motor,stock}=fixture();stock.push(item('coal'),item('stick',2));
 let tries=0;t.craft=async()=>{tries++;throw Error('recipe disappeared');};
 assert.equal(await work.tick(t,b,motor),true);
 assert.equal(await work.tick(t,b,motor),false);
 assert.equal(tries,1);assert.equal(t.wilderness.shelterWork.failures,1);
 t.plot={x:0,y:64,z:0};
 const old=b.blockAt;b.blockAt=p=>p.z===-3?{name:'oak_door',getProperties:()=>({open:true})}:old(p);
 assert.equal(await work.atHome(t,b,motor),false);
});
test('capped burrow alcove admits only the owned opening while its roof and stair envelope remain intact',()=>{
 const {b,cells}=fixture(),feet=new Vec3(0,64,0);
 const room={floor:[1,62,0],stair:true},s={workspace:room,cap:feet.toArray(),cap_name:'dirt'};
 for(const k of ['1,62,0','1,63,0','2,61,0','2,62,0','2,63,0'])cells.set(k,'air');
 cells.set('1,64,0','stone');cells.set('2,64,0','stone');
 cells.set('0,64,0','dirt');
 assert.equal(workspace.safe(b,feet,room),true);
 assert.equal(burrow.walls(b,feet,s),true);
 assert.equal(burrow.sealed(b,s),true);
 for(const hazard of ['water','lava','cave_air','gravel']){
  cells.set('3,62,0',hazard);
  assert.equal(workspace.safe(b,feet,room),false,hazard);
 }
});
test('iron prospects require a safe daylight window, food, light, repair material and a capable pick',()=>{
 const {b,t,w,stock}=fixture();t.plot={x:0,y:64,z:0};t.wilderness.sleep={morning_seen:true};
 stock.push(item('torch',4),item('cobblestone',3),item('wooden_pickaxe'));b.time.timeOfDay=5000;
 assert.equal(prospect.begin(t,b,w,300,2,1000),false);
 stock.push(item('stone_pickaxe'));assert.equal(prospect.begin(t,b,w,120,2,1000),false);
 assert.equal(prospect.begin(t,b,w,300,1,1000),false);
 assert.equal(prospect.begin(t,b,w,300,2,1000),true);assert.equal(t.phase,'night_iron');assert.equal(t.wilderness.prospect.target,1);
});
function encounter(name){
 const f=fixture(),{b,stock,slots}=f,enemy={id:8,name,position:new Vec3(.5,64,-2),isValid:true,metadata:[]};
 b.entities.enemy=enemy;b.heldItem=item('iron_sword');stock.push(b.heldItem);
 slots[5]=item('iron_helmet');slots[6]=item('iron_chestplate');slots[7]=item('iron_leggings');
 b.lookAt=async()=>{};b.deactivateItem=()=>{b.usingHeldItem=false;};b.activateItem=()=>{b.usingHeldItem=true;};
 b.attack=()=>{f.hits=(f.hits||0)+1;};
 f.enemy=enemy;return f;
}
test('an equipped zombie engagement becomes a retreat when health falls or another threat joins',()=>{
 const {b,t,w,enemy}=encounter('zombie');assert.equal(policy.assess(b,w,t).engagement.style,'melee');
 b.entities.second={...enemy,id:9,position:new Vec3(2.5,64,.5)};assert.equal(policy.assess(b,w,t).mode,'cover');
 delete b.entities.second;t.wilderness.defense={target_id:enemy.id};b.health=9;
 assert.equal(policy.assess(b,w,t).mode,'cover');
});
test('skeletons require a usable shield and guard during a checked approach',async()=>{
 const {b,t,w,slots,enemy,motor}=encounter('skeleton');enemy.position.z=-4;
 assert.equal(policy.assess(b,w,t).mode,'cover');
 slots[45]={name:'shield',durabilityUsed:330};assert.equal(policy.assess(b,w,t).mode,'cover');
 slots[45]=item('shield');assert.equal(policy.assess(b,w,t).engagement.style,'ranged');
 await defense.tick(t,b,motor,{world:w,run:'unit'},async(_p,d)=>({action:d.teacher}),
  ()=>({pooled:[],hits:[],proximity:{canWalk:()=>true}}));
 assert.equal(b.usingHeldItem,true);
});
test('isolated creepers are struck and backed away from, including when a candidate chooses a swing during the fuse',async()=>{
 const f=encounter('creeper'),{b,t,w,slots,enemy,motor}=f;slots[45]=item('shield');
 const commands=[];motor.command=a=>commands.push(a);
 const state={world:w,run:'unit'},scan=()=>({pooled:[],hits:[],proximity:{canWalk:()=>true}});
 await defense.tick(t,b,motor,state,async(_p,d)=>({action:d.teacher}),scan);assert.equal(f.hits,1);
 enemy.metadata[b.registry.entitiesByName.creeper.metadataKeys.indexOf('swell_dir')]=1;
 await defense.tick(t,b,motor,state,async()=>({action:6}),scan);
 assert.equal(f.hits,1);assert.equal(commands.at(-1),3);
 t.plot={x:0,y:64,z:0};assert.equal(policy.assess(b,w,t).mode,'cover');
});
test('night observations count dawn, preserve downtime, and attribute only observed damage',()=>{
 const {b,t}=fixture();observations.attach(b,()=>t);b.emit('spawn');
 observations.tick(t,b,1000);t.message='Protected work: craft torch';observations.activity(t);
 observations.tick(t,b,4000);t.message='Waiting behind closed door';observations.activity(t);
 b.emit('entityHurt',b.entity,{name:'skeleton'});b.health=14;b.emit('health');
 b.time.timeOfDay=100;observations.tick(t,b,6000);
 const report=observations.report(t);
 assert.deepEqual(report.night,{started:1,survived:1,productive_seconds:3,idle_seconds:2,travel_seconds:0});
 assert.deepEqual(report.combat.damage,{skeleton:6});assert.equal(t.wilderness.memory.encounters.at(-1).outcome,'damage');
});
