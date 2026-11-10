const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const repair=require('../controller/home_repair'),house=require('../controller/house'),inventory=require('../controller/inventory_sync');
function fixture(milestones=['hut']){
 const cells=new Map(),items={oak_planks:200,cobblestone:8,white_wool:3,coal:1,stick:2};
 const set=(p,name,props={})=>cells.set(p.toString(),{name,props});
 const t={run:'repair-unit',phase:'night_scout',plot:{x:0,y:64,z:0},campPlots:[],milestones:[...milestones],wilderness:{},navigator:{lastPlan:0},supplyRun:false};
 for(const q of house.blueprint(t.plot))set(new Vec3(q.x,q.y,q.z),q.table?'crafting_table':'oak_planks');
 const door=new Vec3(0,64,-3);set(door,'oak_door',{half:'lower',open:false});set(door.offset(0,1,0),'oak_door',{half:'upper',open:false});
 for(const [m,key,name] of [['chest','chest','chest'],['furnace','furnace','furnace'],['bed_home','bed','white_bed']])if(milestones.includes(m)){const p=house.point(t.plot,key);set(p,name,name==='white_bed'?{part:'foot'}:{});if(name==='white_bed')set(p.offset(0,0,1),name,{part:'head'});}
 if(milestones.includes('torch'))for(const side of ['indoor','outdoor']){const m=house.torchMount(t.plot,side);set(m.position,'wall_torch',{facing:m.facing});}
 const b={username:'RepairUnit',health:20,food:20,players:{},entities:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},world:{raycast:()=>null},inventory:{slots:[],items:()=>Object.entries(items).filter(([,count])=>count).map(([name,count])=>({name,count}))}};
 b.blockAt=p=>{p=p.floored();const v=cells.get(p.toString())||{name:p.y<64?'stone':'air',props:{}};return {name:v.name,position:p,boundingBox:['air','light','wall_torch'].includes(v.name)?'empty':v.name.endsWith('_door')?'empty':'block',getProperties:()=>v.props};};
 t.walk=async(_b,_m,g)=>{b.entity.position=new Vec3(g[0],Math.round(g[1]),g[2]);return true;};
 t.place=async(_b,q,name)=>{assert.ok(items[name]>0,'actual item required: '+name);items[name]--;const p=new Vec3(q.x,q.y,q.z);set(p,name,name.endsWith('_door')?{half:'lower',open:false}:{});if(name.endsWith('_door'))set(p.offset(0,1,0),name,{half:'upper',open:false});};
 t.craft=async(_b,name)=>{
  const cost=name.endsWith('_door')?6:name==='chest'?8:name==='crafting_table'?4:name==='white_bed'?3:0;
  assert.ok(items.oak_planks>=cost);items.oak_planks-=cost;
  if(name==='furnace'){assert.ok(items.cobblestone>=8);items.cobblestone-=8;}
  if(name==='white_bed'){assert.ok(items.white_wool>=3);items.white_wool-=3;}
  items[name]=(items[name]||0)+(name.endsWith('_door')?3:1);
 };
 b.look=async()=>{};b._placeBlockWithOptions=async(support,face)=>{const p=support.position.plus(face);assert.ok(items.white_bed>0);items.white_bed--;set(p,'white_bed',{part:'foot'});set(p.offset(0,0,1),'white_bed',{part:'head'});};
 b.placeBlock=async(support,face)=>{assert.ok(items.torch>0);items.torch--;set(support.position.plus(face),'wall_torch',{facing:face.x===1?'east':'north'});};
 b.dig=async v=>set(v.position,'air');
 return {t,b,cells,items,set,motor:{pause(){}},state:{world:{bounds:[-30,30,-30,30]}}};
}
test('only earned furnishings are expected; intact homes are not put through another build lesson',async()=>{
 const f=fixture();assert.equal(repair.inspect(f.t,f.b).missing.length,0);assert.equal(await repair.tick(f.t,f.b,f.motor,f.state),false);assert.equal(f.t.phase,'night_scout');
 assert.ok(!repair.expected(f.t).some(q=>q.kind==='bed'||q.kind==='furnace'));
 f.set(new Vec3(1,63,0),'air');assert.equal(repair.inspect(f.t,f.b).unsafe,true);
 const old=f.b.blockAt;f.b.blockAt=p=>p.x===3?null:old(p);assert.ok(repair.inspect(f.t,f.b).unknown.length>0);
});
test('floor and shell damage is repaired with consumed materials and no extra milestones',async()=>{
 const f=fixture(),before=f.items.oak_planks;
 for(const p of [new Vec3(1,63,0),new Vec3(3,65,0),new Vec3(0,67,0)])f.set(p,'air');
 for(let i=0;i<80;i++){await repair.tick(f.t,f.b,f.motor,f.state);if(!f.t.homeRepair)break;}
 assert.equal(f.t.homeRepair,null);assert.equal(f.t.phase,'night_scout');assert.equal(f.items.oak_planks,before-3);assert.equal(repair.inspect(f.t,f.b).missing.length,0);assert.deepEqual(f.t.milestones,['hut']);
});
test('missing supplies start real wood gathering and cannot be satisfied by phantom inventory',async()=>{
 const f=fixture();f.items.oak_planks=0;f.set(new Vec3(3,65,0),'air');
 await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.homeRepair.stage,'wood');assert.equal(f.t.phase,'gather');assert.equal(repair.collecting(f.t),true);
 assert.equal(await repair.tick(f.t,f.b,f.motor,f.state),false);assert.equal(f.b.blockAt(new Vec3(3,65,0)).name,'air');
 f.items.oak_planks=4;await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'home_repair');
});

test('a distant repair supply trip returns before inspecting unloaded house cells or planning local work stances',async()=>{
 const f=fixture();f.set(new Vec3(3,65,0),'air');f.items.oak_planks=0;
 await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'gather');
 f.b.entity.position=new Vec3(25.5,64,25.5);f.items.oak_planks=4;
 const blockAt=f.b.blockAt;f.b.blockAt=p=>Math.hypot(p.x-f.b.entity.position.x,p.z-f.b.entity.position.z)>16?null:blockAt(p);
 assert.equal(await repair.tick(f.t,f.b,f.motor,f.state),true);assert.equal(f.t.phase,'home_repair');
 assert.equal(f.t.homeRepair.stage,'repair');assert.equal(f.t.homeRepair.repaired,0);
 const walk=f.t.walk;let returns=0,arrive=false;
 f.t.walk=async(...args)=>{returns++;assert.ok(Math.hypot(args[2][0],args[2][2])<8);if(arrive)return walk(...args);return undefined;};
 await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(returns,1);assert.equal(f.t.homeRepair.repaired,0);
 arrive=true;await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(returns,2);
 for(let i=0;i<20&&f.t.homeRepair;i++)await repair.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.homeRepair,null);assert.equal(f.t.phase,'night_scout');
 assert.equal(f.b.blockAt(new Vec3(3,65,0)).name,'oak_planks');assert.equal(f.items.oak_planks,3);
 assert.deepEqual(f.t.milestones,['hut']);
});
test('replacement furnishings are crafted and verified, the chest is restocked and the bed home re-registered',async ctx=>{
 const milestones=['hut','chest','stocked','furnace','bed_home'],f=fixture(milestones),calls=[];
 f.items.oak_planks=29;
 ctx.mock.method(inventory,'equip',async()=>{});
 ctx.mock.method(require('../controller/settlement'),'stockChest',async(_b,block,n)=>{assert.equal(block.name,'chest');f.items.oak_planks-=n;calls.push('stock');return n;});
 for(const key of ['table','chest','furnace','bed']){const p=house.point(f.t.plot,key);f.set(p,'air');if(key==='bed')f.set(p.offset(0,0,1),'air');}
 f.set(new Vec3(0,64,-3),'air');f.set(new Vec3(0,65,-3),'air');
 for(let i=0;i<100;i++){await repair.tick(f.t,f.b,f.motor,f.state,async(path,data)=>{assert.equal(path,'/world/survival');assert.equal(data.action,'home');calls.push('home');return {position:data.position};});if(!f.t.homeRepair)break;}
 assert.equal(f.t.homeRepair,null);assert.equal(repair.inspect(f.t,f.b).missing.length,0);assert.deepEqual(calls,['stock','home']);assert.deepEqual(f.t.milestones,milestones);assert.equal(f.items.cobblestone,0);assert.equal(f.items.white_wool,0);
 assert.equal(f.items.oak_planks,0,'exact recipe and restocking budget must suffice without another wood trip');
});
test('repair guards reject fluids, player overlap, and digging a floor under the bot',()=>{
 const f=fixture(),q={x:1,y:63,z:0,floor:true};assert.equal(repair.safe(f.t,f.b,q),true);
 f.b.entity.position=new Vec3(1.5,64,.5);assert.equal(repair.safe(f.t,f.b,q),false);
 f.b.entity.position=new Vec3(.5,64,.5);f.set(new Vec3(1,62,0),'water');assert.equal(repair.safe(f.t,f.b,q),false);
 f.set(new Vec3(1,62,0),'stone');f.b.players.other={username:'Other',entity:{id:2,position:new Vec3(1.5,64,.5)}};assert.equal(repair.safe(f.t,f.b,q),false);
});
test('damaged homes are not eligible retreat shelters',()=>{
 const f=fixture();f.b.time={timeOfDay:14000};f.t.homeDamage={unsafe:true};
 assert.equal(require('../controller/first_night').priority(f.b,f.t,{first_night:{hostiles:true}}).kind,'seek cover');
});

test('an entrance-only crater starts real backfill even when the house shell and door remain intact',async()=>{
 const f=fixture();f.items.dirt=2;
 const holes=[new Vec3(0,63,-4),new Vec3(0,62,-4)];for(const p of holes)f.set(p,'air');
 const damage=repair.inspect(f.t,f.b);
 assert.equal(damage.unsafe,true);assert.equal(damage.missing.length,2);
 assert.ok(damage.missing.every(q=>q.kind==='foundation'&&q.z===-4));
 const planks=f.items.oak_planks;
 for(let i=0;i<30;i++){await repair.tick(f.t,f.b,f.motor,f.state);if(!f.t.homeRepair)break;}
 assert.equal(f.t.homeRepair,null);assert.equal(f.t.phase,'night_scout');
 for(const p of holes)assert.equal(f.b.blockAt(p).name,'dirt');
 assert.equal(f.items.dirt,0);assert.equal(f.items.oak_planks,planks);
 assert.equal(repair.inspect(f.t,f.b).unsafe,false);assert.deepEqual(f.t.milestones,['hut']);
});

test('ordinary entrance step-downs do not mark an intact refuge unsafe or start repairs',async()=>{
 const f=fixture();
 f.set(new Vec3(0,63,-5),'air');f.set(new Vec3(1,63,-5),'air');
 assert.equal(repair.inspect(f.t,f.b).unsafe,false);assert.equal(await repair.tick(f.t,f.b,f.motor,f.state),false);
 // Two successive one-block descents are still a walkable slope.
 f.set(new Vec3(0,63,-4),'air');f.set(new Vec3(0,62,-5),'air');
 assert.equal(repair.inspect(f.t,f.b).missing.length,0);assert.equal(await repair.tick(f.t,f.b,f.motor,f.state),false);
 assert.equal(f.t.phase,'night_scout');assert.equal(f.t.homeRepair,undefined);
 // A two-block drop on either walking step still requires backfill.
 f.set(new Vec3(0,61,-5),'air');assert.equal(repair.inspect(f.t,f.b).unsafe,true);
});

test('a bot moves off a damaged work cell before replacing it and checks both halves of a bed',()=>{
 const f=fixture(),q={x:0,y:64,z:0,kind:'chest'};assert.equal(repair.safe(f.t,f.b,q),false);assert.equal(repair.safe(f.t,f.b,q,true),true);
 const g=repair.stance(f.t,f.b,q,f.state);assert.ok(g);assert.ok(Math.floor(g[0])!==q.x||Math.floor(g[2])!==q.z);
 f.b.entity.position=new Vec3(-1.5,64,-1.5);f.b.players.other={username:'Other',entity:{id:2,position:new Vec3(2.5,64,.5)}};
 assert.equal(repair.safe(f.t,f.b,{x:2,y:64,z:-1,kind:'bed'}),false);
});

test('repair reach uses actual off-center position and leaves room for walking tolerance',()=>{
 const f=fixture(),q={x:-3,y:63,z:-1,kind:'planks',floor:true};f.set(new Vec3(q.x,q.y,q.z),'air');
 f.b.entity.position=new Vec3(1.7,64,-.5);
 const placement=require('../controller/placement_reference');assert.equal(placement.reference(f.b,q),null);
 const goal=repair.stance(f.t,f.b,q,f.state);assert.ok(goal);assert.notDeepEqual(goal,[1.7,64.1,-.5]);
 const p=new Vec3(goal[0],Math.round(goal[1]),goal[2]);assert.ok(placement.references(f.b,q,{standing:p}).some(r=>r.point.distanceTo(p.offset(0,1.62,0))<=3.7));
});

test('a refused repair retries a different supported stance without inventing progress',async()=>{
 const f=fixture(),q=new Vec3(3,65,0);f.set(q,'air');const place=f.t.place;let attempts=0,first;
 f.t.place=async(...args)=>{attempts++;if(attempts===1){first=f.b.entity.position.floored().toArray();const e=Error('support moved');e.code='BUILD_OBSTRUCTED';throw e;}assert.notDeepEqual(f.b.entity.position.floored().toArray(),first);return place(...args);};
 await repair.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.homeRepair.repaired,0);assert.equal(f.t.phase,'home_repair');
 for(let i=0;i<30&&f.t.homeRepair;i++)await repair.tick(f.t,f.b,f.motor,f.state);
 assert.ok(attempts>=2);assert.equal(f.t.homeRepair,null);assert.equal(repair.inspect(f.t,f.b).missing.length,0);
});

test('repair walking can reach the outer work strip of its own plot while protecting other homes',async ctx=>{
 const {HutTeacher}=require('../controller/hut_teacher'),{WorldNavigation}=require('../controller/world_navigation'),entrance=require('../controller/entrance_clearance');
 const f=fixture(),t=new HutTeacher();t.phase='home_repair';t.plot=f.t.plot;t.campPlots=[t.plot,{x:12,y:64,z:0}];
 f.b.entity.position=new Vec3(1.5,64,-4.5);f.b.entity.onGround=true;
 const goal=[3.5,64.1,-2.5],options={plot:t.plot,plots:t.campPlots,bounds:f.state.world.bounds};
 // The outer strip is outside insideHome(), but is still part of the owner's
 // repair workspace. A normal travel route intentionally cannot enter it.
 const emptyBot={...f.b,blockAt(p){return {position:p.floored(),name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty'};}};
 assert.equal(new WorldNavigation().plan(emptyBot,goal,options).blocked,true);
 assert.equal(new WorldNavigation().plan(emptyBot,goal,{...options,constructionWork:true}).blocked,false);
 assert.equal(new WorldNavigation().plan(emptyBot,[15.5,64.1,-2.5],{...options,constructionWork:true}).blocked,true);
 let received;
 ctx.mock.method(entrance,'resume',async()=>null);ctx.mock.method(entrance,'tick',async()=>false);
 t.navigator={portalFor:()=>null,plan(_b,_g,o){received=o;return {blocked:true,path:[],cue:goal};},status:{}};
 await t.walk(emptyBot,f.motor,goal,f.state);assert.equal(received.constructionWork,true);
 t.phase='night_scout';await t.walk(emptyBot,f.motor,goal,f.state);assert.equal(received.constructionWork,false);
});


test('finished repairs approach the open door from inside before closing and resuming',async ctx=>{
 const f=fixture(),door=new Vec3(0,64,-3);f.set(door,'oak_door',{half:'lower',open:true});f.set(door.offset(0,1,0),'oak_door',{half:'upper',open:true});
 f.t.phase='home_repair';f.t.homeRepair={stage:'repair',resume:'night_scout',repaired:15};f.b.entity.position=new Vec3(6.2,63,-1.5);
 let closes=0;ctx.mock.method(require('../controller/door_care'),'closeDoor',async()=>{closes++;assert.ok(f.b.entity.position.distanceTo(new Vec3(.5,64,.5))<.1);f.set(door,'oak_door',{half:'lower',open:false});return true;});
 await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(closes,0);assert.deepEqual(f.b.entity.position.toArray(),[.5,64,.5]);assert.equal(f.t.phase,'home_repair');
 await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(closes,1);await repair.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.homeRepair,null);assert.equal(f.t.phase,'night_scout');assert.deepEqual(f.t.milestones,['hut']);
});

test('blast craters are filled bottom up before restoring the floor and entrance',async()=>{
 const f=fixture(),terrain=require('../controller/home_terrain');f.items.dirt=40;
 const holes=[[1,0],[0,-3],[0,-4],[0,-5]];
 for(const [x,z] of holes)for(let y=61;y<=63;y++)f.set(new Vec3(x,y,z),'air');
 f.set(new Vec3(0,64,-3),'air');f.set(new Vec3(0,65,-3),'air');
 f.b.entity.position=new Vec3(1.5,64,-4.5);
 f.t.homeDamage={unsafe:true};
 const plans=terrain.plan(f.t,f.b);assert.equal(plans.length,11);
 const place=f.t.place,placed=[];
 f.t.place=async(b,q,item)=>{if(q.terrain){assert.ok(b.entity.position.y>=f.t.plot.y,'backfill must be placed from the rim');assert.equal(terrain.solid(b.blockAt(new Vec3(q.x,q.y-1,q.z))),true);assert.equal(item,'dirt');}placed.push({...q,item});return place(b,q,item);};
 for(let i=0;i<100;i++){await repair.tick(f.t,f.b,f.motor,f.state);if(!f.t.homeRepair)break;}
 assert.equal(f.t.homeRepair,null,JSON.stringify({position:f.b.entity.position,missing:repair.inspect(f.t,f.b).missing}));assert.equal(f.items.dirt,29);
 for(const [x,z] of holes)for(let y=61;y<=63;y++)assert.equal(f.b.blockAt(new Vec3(x,y,z)).boundingBox,'block');
 assert.equal(placed.filter(q=>q.terrain).length,11);
 assert.equal(f.b.blockAt(new Vec3(1,63,0)).name,'oak_planks');
});

test('backfill leaves intact floors, fluids, deep voids and other plots alone',()=>{
 const f=fixture(),terrain=require('../controller/home_terrain');
 f.set(new Vec3(1,62,0),'air');assert.equal(terrain.plan(f.t,f.b).length,0,'do not fill a cave beneath an intact floor');
 f.set(new Vec3(1,63,0),'air');f.set(new Vec3(1,61,0),'water');assert.equal(terrain.plan(f.t,f.b).length,1);assert.equal(repair.safe(f.t,f.b,terrain.plan(f.t,f.b)[0]),false);
 for(let y=57;y<=63;y++)f.set(new Vec3(1,y,0),'air');assert.equal(terrain.plan(f.t,f.b).length,0,'no floating cap over an unbounded hole');
 f.set(new Vec3(1,60,0),'stone');f.t.campPlots=[{x:4,z:0}];assert.equal(terrain.plan(f.t,f.b).length,0);
 assert.equal(repair.safe(f.t,f.b,{x:1,y:63,z:0,terrain:true}),false);
 f.t.campPlots=[];f.set(new Vec3(1,62,0),'sand');assert.equal(terrain.plan(f.t,f.b).length,0);
});

test('backfill budgeting uses carried rubble while reserving furnace recipe stone',()=>{
 const f=fixture();f.items.dirt=5;f.items.cobblestone=10;
 const missing=Array.from({length:10},()=>({kind:'foundation'}));missing.push({kind:'furnace'},{kind:'planks'});
 assert.equal(repair.budget(missing,f.b).woodNeeded,4);
 assert.equal(require('../controller/home_terrain').material(f.b,8),'dirt');
 delete f.items.dirt;f.items.cobblestone=8;
 assert.equal(require('../controller/home_terrain').material(f.b,8),'oak_planks');
});


for(const position of [[4.5,68,.5],[13.5,64,.5]])test('loaded damaged home repairs from a checked nearby stance at '+position.join(','),async ctx=>{
 const f=fixture(),q=new Vec3(3,66,0);f.set(q,'air');f.items.oak_planks=0;
 await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.homeRepair.stage,'wood');
 f.items.oak_planks=4;f.b.entity.position=new Vec3(...position);if(position[1]===68)f.set(new Vec3(4,67,0),'stone');
 await repair.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'home_repair');
 ctx.mock.method(require('../controller/world_navigation'),'homeApproach',()=>assert.fail('Repair must not demand the damaged entrance first'));
 for(let i=0;i<15&&f.t.homeRepair;i++)await repair.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.homeRepair,null);assert.equal(f.t.phase,'night_scout');assert.equal(f.b.blockAt(q).name,'oak_planks');assert.equal(f.items.oak_planks,3);assert.deepEqual(f.t.milestones,['hut']);
});

test('blast damage before the hut milestone restores the earned floor and stations then resumes smelting',async ctx=>{
 const f=fixture(['furnace']);f.t.phase='smelt';f.items.dirt=1;
 // The shell is still unfinished: recovery must not build it or grant hut credit.
 for(const q of house.blueprint(f.t.plot))if(!q.floor&&!q.table)f.set(new Vec3(q.x,q.y,q.z),'air');
 f.set(new Vec3(0,64,-3),'air');f.set(new Vec3(0,65,-3),'air');
 const table=house.point(f.t.plot,'table'),hearth=house.point(f.t.plot,'furnace');
 f.set(table,'air');f.set(hearth,'crafting_table');f.set(new Vec3(1,63,0),'air');f.set(new Vec3(1,62,0),'air');
 const before=f.items.oak_planks;let recovered=0;
 ctx.mock.method(require('../controller/resource_access'),'dig',async(b,v,{validate})=>{assert.equal(v.name,'crafting_table');assert.equal(validate(v),true);f.set(v.position,'air');recovered++;return true;});
 for(let i=0;i<80;i++){await repair.tick(f.t,f.b,f.motor,f.state);if(!f.t.homeRepair)break;}
 assert.equal(f.t.homeRepair,null);assert.equal(f.t.phase,'smelt');assert.equal(recovered,1);assert.equal(f.b.blockAt(table).name,'crafting_table');assert.equal(f.b.blockAt(hearth).name,'furnace');
 assert.equal(f.b.blockAt(new Vec3(1,62,0)).name,'dirt');assert.equal(f.b.blockAt(new Vec3(1,63,0)).name,'oak_planks');
 assert.equal(f.items.dirt,0);assert.equal(f.items.cobblestone,0);assert.equal(f.items.oak_planks,before-5);assert.deepEqual(f.t.milestones,['furnace']);assert.equal(f.b.blockAt(new Vec3(3,64,0)).name,'air');
});

test('unfinished homes without an earned workstation are not fabricated into repair progress',()=>{
 const f=fixture([]);assert.equal(repair.inspect(f.t,f.b),null);
});
