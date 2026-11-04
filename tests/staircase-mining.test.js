const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const mine=require('../controller/staircase_mining'),access=require('../controller/resource_access'),inventory=require('../controller/inventory_sync');
function fixture(ground=64){
 const cells=new Map(),items={wooden_pickaxe:1,stick:4},b={username:'MineUnit',game:{minY:-64},players:{},entities:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},inventory:{items:()=>Object.entries(items).filter(([,n])=>n).map(([name,count])=>({name,count}))},world:{raycast:()=>null}};
 b.blockAt=p=>{p=p.floored();const name=cells.get(p.toString())||(p.y<ground?'stone':'air');return {name,position:p,boundingBox:['air','wall_torch'].includes(name)?'empty':'block',getProperties:()=>({})};};b.canDigBlock=()=>true;
 b.world.raycast=(eye,dir,length)=>{for(let d=0;d<=length;d+=.03){const v=b.blockAt(eye.plus(dir.scaled(d)));if(v.boundingBox==='block')return {position:v.position};}return null;};
 const t={run:'mine-unit',phase:'night_stone',plot:{x:30,y:64,z:30},campPlots:[],wilderness:{},harvested:0,lastProgress:0};
 t.walk=async(_b,_m,q)=>{b.entity.position=new Vec3(q[0],Math.round(q[1]),q[2]);return true;};
 t.harvest=async(_b,_m,q)=>{const v=b.blockAt(q),drop=v.name.includes('coal')?'coal':v.name.includes('iron_ore')?'raw_iron':'cobblestone';cells.set(q.toString(),'air');items[drop]=(items[drop]||0)+1;};
 t.craft=async(_b,name)=>{if(name==='torch'){items.coal--;items.stick--;items.torch=(items.torch||0)+4;}};
 b.placeBlock=async(support,face)=>{cells.set(support.position.plus(face).toString(),'wall_torch');items.torch--;};
 return {b,t,cells,items,motor:{pause(){},lockLook(){}},state:{world:{bounds:[-40,40,-40,40]}}};
}
test('depth knowledge separates early stone, shallow coal and underground iron and obeys dimension floor',()=>{
 const {b}=fixture();assert.equal(mine.depth('stone',64,b),48);assert.equal(mine.depth('coal',4,b),4);assert.equal(mine.depth('coal',120,b),96);assert.equal(mine.depth('coal',64,b),64);assert.equal(mine.depth('iron',64,b),16);
 b.game.minY=0;assert.equal(mine.depth('stone',8,b),5);
});
test('stairs have three-block headroom and never mine directly under the bot',()=>{
 const {b,t,state}=fixture(),from=new Vec3(0,64,0),s=mine.step(t,b,from,[1,0],state.world);
 assert.ok(s);assert.deepEqual(s.q.toArray(),[1,63,0]);assert.deepEqual(s.cells.map(p=>p.y),[65,64,63]);
 assert.ok(s.cells.every(p=>p.x!==0||p.z!==0));assert.equal(b.blockAt(s.q.offset(0,-1,0)).name,'stone');
 b.players.other={username:'Other',entity:{id:2,position:new Vec3(1.5,64,.5)}};assert.equal(mine.step(t,b,from,[1,0],state.world),null);
});
test('excavation refuses fluids, falling blocks, cave floors, private plots and unloaded neighbors',()=>{
 for(const hazard of ['water','lava','sand','gravel','blue_concrete_powder']){
  const {b,t,state,cells}=fixture();cells.set(new Vec3(2,64,0).toString(),hazard);assert.equal(mine.step(t,b,new Vec3(0,64,0),[1,0],state.world),null,hazard);
 }
 const {b,t,state,cells}=fixture();cells.set(new Vec3(1,62,0).toString(),'air');assert.equal(mine.step(t,b,new Vec3(0,64,0),[1,0],state.world),null);
 cells.clear();t.plot={x:1,y:64,z:0};assert.equal(mine.step(t,b,new Vec3(0,64,0),[1,0],state.world),null);
 t.plot=null;const old=b.blockAt;b.blockAt=p=>p.x===2?null:old(p);assert.equal(mine.step(t,b,new Vec3(0,64,0),[1,0],state.world),null);
});
test('a complete stone trip descends beside intact floors and returns along its recorded stairs',async()=>{
 const f=fixture();for(let i=0;i<150;i++){await mine.tick(f.t,f.b,f.motor,f.state);if(f.t.wilderness.mine?.stage==='done')break;}
 const m=f.t.wilderness.mine;assert.equal(m.stage,'done');assert.ok(f.items.cobblestone>=16);assert.ok(m.steps>0);assert.ok(m.steps<=6);assert.equal(f.b.entity.position.y,64);
 for(const p of m.path)assert.equal(f.b.blockAt(new Vec3(...p).offset(0,-1,0)).name,'stone','original stairs remain intact');
});
test('exposed coal is collected without removing stair supports and crafts verified wall lighting',async ctx=>{
 const f=fixture();ctx.mock.method(inventory,'equip',async()=>{});
 // Coal in the wall beside the fourth landing, away from stair supports.
 f.cells.set(new Vec3(4,61,1).toString(),'coal_ore');
 for(let i=0;i<180;i++){await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{amount:18});if(f.t.wilderness.mine?.stage==='done')break;}
 const m=f.t.wilderness.mine;assert.equal(m.stage,'done',JSON.stringify({m,items:f.items,message:f.t.message}));assert.equal(m.coal_mined,1);assert.ok(m.torches>=1);assert.ok([...f.cells.values()].includes('wall_torch'));assert.equal(f.b.entity.position.y,64);
});
test('unlit mines return rather than continuing indefinitely into darkness',async()=>{
 const f=fixture();for(let i=0;i<180;i++){await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{amount:100});if(f.t.wilderness.mine?.stage==='done')break;}
 assert.equal(f.t.wilderness.mine.steps,10);assert.match(f.t.wilderness.mine.reason,/torch supplies/);assert.equal(f.b.entity.position.y,64);
});

test('water spilling into a working branch triggers dry retreat and a different heading',async()=>{
 const f=fixture();
 for(let i=0;i<20&&f.t.wilderness.mine?.steps!==3;i++)await mine.tick(f.t,f.b,f.motor,f.state);
 const m=f.t.wilderness.mine;assert.equal(m.steps,3);const wet=new Vec3(...m.path.at(-1));
 f.cells.set(wet.offset(1,0,0).toString(),'water');
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.stage,'water_retreat');assert.ok(m.waterIndex<m.path.length-1);
 const oldDir=m.dir;await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.stage,'dig');assert.notEqual(m.dir,oldDir);assert.ok(m.flooded.includes(wet.toString()));
 assert.equal(mine.step(f.t,f.b,new Vec3(...m.path.at(-1)),[1,0],f.state.world),null,'wet branch stays rejected');
});

test('turning back cannot remove the floor of a recorded return stair',()=>{
 const f=fixture();f.t.wilderness.mine={path:[[0,64,0],[1,63,0]]};f.b.entity.position=new Vec3(1.5,63,.5);
 assert.equal(mine.step(f.t,f.b,new Vec3(1,63,0),[-1,0],f.state.world),null);
});

test('an exhausted mine returns to exploration instead of repeatedly using the same entrance',async()=>{
 const f=fixture();f.t.wilderness.mine={stage:'done',entry:[0,64,0],path:[[0,64,0]],steps:0,reason:'No dry branch'};
 const result=await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(result.handled,false);assert.equal(f.t.wilderness.mine,null);assert.equal(f.t.wilderness.rejectedMines.length,1);
 const next=mine.start(f.t,f.b,f.state,'stone');assert.ok(next);assert.ok(Math.hypot(next.entry[0],next.entry[2])>=4);
});


test('multi-tick descent commits the new landing instead of pulling back toward the previous stair',async()=>{
 const f=fixture(),goals=[];f.t.wilderness.mine={stage:'descend',entry:[0,64,0],path:[[0,64,0]],supports:[[0,64,0]],next:{d:0},steps:0,flooded:[],dir:0,target_y:48};
 for(const y of [63,64,65])f.cells.set(new Vec3(1,y,0).toString(),'air');
 f.t.walk=async(_b,_m,g)=>{goals.push(g);f.b.entity.position=new Vec3(1.2,64,.5);return goals.length<3?undefined:true;};
 for(let i=0;i<3;i++)await mine.tick(f.t,f.b,f.motor,f.state);
 assert.deepEqual(goals,Array(3).fill([1.5,63.1,.5]));assert.equal(f.t.wilderness.mine.steps,1);assert.equal(f.t.wilderness.mine.stage,'dig');assert.deepEqual(f.t.wilderness.mine.path.at(-1),[1,63,0]);
});

test('a committed descent still rejects flooding before moving onto the landing',async()=>{
 const f=fixture();f.t.wilderness.mine={stage:'descend',entry:[0,64,0],path:[[0,64,0]],supports:[[0,64,0]],next:{d:0},steps:0,flooded:[],dir:0,target_y:48};
 f.cells.set(new Vec3(1,63,0).toString(),'water');f.t.walk=async()=>{throw Error('must not enter water');};
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.mine.stage,'dig');assert.equal(f.t.wilderness.mine.next,null);assert.equal(f.t.wilderness.mine.steps,0);
});

test('coal vein harvesting follows newly exposed ore before digging another stair',async()=>{
 const f=fixture();f.t.wilderness.mine={stage:'dig',resource:'coal',entry:[0,64,0],path:[[0,64,0]],supports:[[0,64,0]],target_y:64,steps:0,lit_at:0,torches:0,coal_mined:0,dir:0,flooded:[]};
 for(const x of [1,2,3])f.cells.set(new Vec3(x,64,0).toString(),'coal_ore');
 for(let i=0;i<10;i++){await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{resource:'coal',amount:3});if(f.t.wilderness.mine.stage==='done')break;}
 assert.equal(f.items.coal,3);assert.equal(f.t.wilderness.mine.stage,'done');assert.equal(f.t.wilderness.mine.steps,0,'visible vein wins over blind excavation');
 assert.equal(f.b.entity.position.y,64);assert.equal(f.b.blockAt(new Vec3(0,63,0)).name,'stone');
});

test('iron prospecting turns horizontal at target depth and counts raw iron rather than cobblestone',async()=>{
 const f=fixture(16);f.b.entity.position=new Vec3(.5,16,.5);f.items.stone_pickaxe=1;f.items.cobblestone=100;
 const m=f.t.wilderness.mine={stage:'dig',resource:'iron',entry:[0,16,0],path:[[0,16,0]],supports:[[0,16,0]],target_y:16,steps:0,lit_at:0,torches:0,coal_mined:0,dir:0,flooded:[]};
 for(const y of [16,17])f.cells.set(new Vec3(1,y,0).toString(),'stone');
 for(let i=0;i<8&&m.steps<1;i++)await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{resource:'iron',amount:1});
 assert.equal(m.steps,1,'carve a level prospecting corridor before finding ore');
 f.cells.set(new Vec3(2,16,0).toString(),'iron_ore');
 for(let i=0;i<12;i++){await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{resource:'iron',amount:1});if(m.stage==='done')break;}
 assert.equal(f.items.raw_iron,1);assert.equal(m.stage,'done');assert.ok(m.steps>0);assert.ok(m.path.every(p=>p[1]===16));
 assert.equal(mine.report(f.t).strategy,'Horizontal prospecting near target depth');
});

test('ore quotas cannot be satisfied with stone and wooden picks cannot collect iron',async()=>{
 const f=fixture();f.items.cobblestone=100;
 const m=f.t.wilderness.mine={stage:'done',resource:'iron',entry:[0,64,0],path:[[0,64,0]],steps:0};
 assert.equal((await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{resource:'iron',amount:1})).done,undefined);
 f.t.wilderness.mine={...m,stage:'dig',target_y:16,dir:0,lit_at:0,flooded:[]};f.cells.set(new Vec3(1,64,0).toString(),'iron_ore');
 await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{resource:'iron',amount:1});
 assert.equal(f.b.blockAt(new Vec3(1,64,0)).name,'iron_ore');assert.equal(f.items.raw_iron,undefined);
});

test('flat prospecting preserves stair supports and refuses water or unsupported floors',()=>{
 const f=fixture(),from=new Vec3(0,64,0);
 assert.deepEqual(mine.step(f.t,f.b,from,[1,0],f.state.world,0).q.toArray(),[1,64,0]);
 f.cells.set(new Vec3(1,63,0).toString(),'air');assert.equal(mine.step(f.t,f.b,from,[1,0],f.state.world,0),null);
 f.cells.set(new Vec3(1,63,0).toString(),'stone');f.cells.set(new Vec3(1,64,1).toString(),'water');assert.equal(mine.step(f.t,f.b,from,[1,0],f.state.world,0),null);
 assert.equal(mine.step(f.t,f.b,from,[1,0],f.state.world,-2),null);
});

test('prospecting approaches real ore drops before more excavation without inventing inventory',async ctx=>{
 const f=fixture();ctx.mock.method(require('../controller/survival'),'itemName',()=> 'coal');
 f.b.entities.drop={id:7,name:'item',position:new Vec3(2.5,64.2,.5)};
 const m=f.t.wilderness.mine={stage:'dig',resource:'coal',entry:[0,64,0],path:[[0,64,0]],target_y:64,steps:0,dir:0};
 let goal;f.t.walk=async(_b,_m,g)=>{goal=g;};f.t.harvest=async()=>{throw Error('collect the drop before digging');};
 await mine.tick(f.t,f.b,f.motor,f.state,undefined,undefined,undefined,{resource:'coal',amount:3});
 assert.ok(new Vec3(...goal).distanceTo(f.b.entities.drop.position)<1.2,'supported stance reaches the drop without standing on its edge');
 assert.equal(f.items.coal,undefined);assert.equal(m.steps,0);assert.equal(m.stage,'dig');
});

test('mine selection checks the entrance envelope, not just its first excavation',()=>{
 const f=fixture();f.cells.set(new Vec3(-1,64,0).toString(),'sand');
 assert.ok(mine.step(f.t,f.b,new Vec3(0,64,0),[1,0],f.state.world));
 const m=mine.start(f.t,f.b,f.state,'stone');assert.ok(m);assert.ok(mine.dry(f.b,new Vec3(...m.entry)));assert.notDeepEqual(m.entry,[0,64,0]);
});

test('an unused entrance with safe occupied footing can be abandoned without a fatal retreat error',async()=>{
 const f=fixture();f.t.wilderness.mine={stage:'dig',entry:[0,64,0],path:[[0,64,0]],steps:0,flooded:[]};f.cells.set(new Vec3(-1,64,0).toString(),'sand');
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.mine.stage,'done');assert.equal(f.items.cobblestone,undefined);
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.mine,null);assert.equal(f.t.wilderness.rejectedMines.length,1);
});

test('the entrance fallback cannot excuse an actual flooded occupied cell',async()=>{
 const f=fixture();f.t.wilderness.mine={stage:'dig',entry:[0,64,0],path:[[0,64,0]],steps:0,flooded:[]};f.cells.set(new Vec3(0,64,0).toString(),'water');
 await assert.rejects(mine.tick(f.t,f.b,f.motor,f.state),/no verified dry retreat/);
});

test('a temporarily occupied return stair yields without abandoning the mine or inventing progress',async()=>{
 const f=fixture(),m=f.t.wilderness.mine={stage:'exit',entry:[0,64,0],path:[[0,64,0]],exitIndex:0};f.t.lastProgress=123;
 f.b.players.other={username:'Other',entity:{id:2,position:new Vec3(1.5,64,.5)}};f.t.walk=async()=>false;
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.stage,'exit');assert.equal(m.exitIndex,0);assert.equal(f.t.lastProgress,123);assert.match(f.t.message,/waiting for another player/);
 f.b.players={};await assert.rejects(mine.tick(f.t,f.b,f.motor,f.state),/Unable to climb/);
 f.t.walk=async()=>true;await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.stage,'done');
});

test('mine exit also yields when a nearby player blocks the approach rather than the landing',async()=>{
 const f=fixture(),m=f.t.wilderness.mine={stage:'exit',entry:[3,64,0],path:[[3,64,0]],exitIndex:0};f.t.lastProgress=123;
 f.b.players.other={username:'Other',entity:{id:2,position:new Vec3(1.5,64,2.2)}};
 assert.equal(require('../controller/resource_space').clearOfPlayers(f.b,new Vec3(3.5,64,.5)),true,'landing itself is clear');
 f.t.walk=async()=>false;
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.stage,'exit');assert.equal(f.t.lastProgress,123);assert.match(f.t.message,/waiting for another player/);
 f.b.players={};await assert.rejects(mine.tick(f.t,f.b,f.motor,f.state),/Unable to climb/);
});

test('an interrupted mine exit reconnects from the surface instead of revisiting an obstructed lower stair',async()=>{
 const f=fixture(),m=f.t.wilderness.mine={stage:'exit',entry:[0,64,0],path:[[0,64,0],[1,63,0],[2,62,0]],exitIndex:2};
 f.b.entity.position=new Vec3(10.5,64,.5);f.t.lastProgress=123;let destination;
 f.t.walk=async(_b,_m,g)=>{destination=g;return undefined;};
 await mine.tick(f.t,f.b,f.motor,f.state);assert.deepEqual(destination,[.5,64.1,.5]);assert.equal(m.exitIndex,0);assert.equal(m.stage,'exit');assert.equal(f.t.lastProgress,123);
 f.t.walk=async(_b,_m,g)=>{f.b.entity.position=new Vec3(...g);return true;};
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.stage,'done');assert.equal(f.items.cobblestone,undefined,'returning does not create mined supplies');
});

test('a mine exit waits through an airborne frame and retains failure for a genuinely blocked staircase',async()=>{
 const f=fixture(),m=f.t.wilderness.mine={stage:'exit',entry:[0,64,0],path:[[0,64,0],[1,63,0]],exitIndex:1};
 f.b.entity.position=new Vec3(1.5,64.001,.5);f.b.entity.onGround=false;f.t.lastProgress=123;
 f.t.walk=async()=>{throw Error('cannot plan while airborne');};
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.exitIndex,1);assert.equal(f.t.lastProgress,123);assert.match(f.t.message,/waiting to land/);
 f.b.entity.onGround=true;f.b.blockAt=p=>({position:p,name:'stone',boundingBox:'block'});
 await assert.rejects(mine.tick(f.t,f.b,f.motor,f.state),/return stair is obstructed/);assert.equal(m.stage,'exit');
});
test('mine exit leaves a committed jump controller holding forward while airborne',async()=>{
 const f=fixture(),m=f.t.wilderness.mine={stage:'exit',entry:[0,64,0],path:[[0,64,0],[1,63,0]],exitIndex:1};
 f.b.entity.position=new Vec3(1.5,63.7,.5);f.b.entity.onGround=false;
 f.motor.committedJump=()=>true;f.motor.pause=()=>assert.fail('Do not cancel the in-flight jump');f.t.walk=async()=>assert.fail('Wait for landing before replanning');
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.exitIndex,1);assert.equal(m.stage,'exit');
});
test('a miner across the stance-cell boundary walks back instead of repeatedly failing local centering',async ctx=>{
 const f=fixture(),m=f.t.wilderness.mine={stage:'dig',resource:'stone',entry:[0,64,0],path:[[0,64,0]],target_y:48,steps:0,flooded:[],ore_target:[1,64,0]};
 f.b.entity.position=new Vec3(1.1,64,.5);assert.ok(f.b.entity.position.distanceTo(new Vec3(.5,64,.5))<.65);
 let goal;f.t.walk=async(_b,_m,g)=>{goal=g;};ctx.mock.method(access,'stabilize',async()=>assert.fail('Local centering cannot cross into another cell'));
 await mine.tick(f.t,f.b,f.motor,f.state);assert.deepEqual(goal,[.5,64.1,.5]);assert.equal(m.ore_target,null);
});

test('home retreat retires a stale flooded mine in every working stage but requires actual stone',async()=>{
 for(const stage of ['dig','descend','water_retreat','exit']){
  const f=fixture();f.t.plot={x:0,y:64,z:5};
  f.b.entity.position=new Vec3(.5,64,.5);
  const m=f.t.wilderness.mine={stage,entry:[20,64,0],path:[[20,64,0],[21,63,0]],steps:1,flooded:[],exitIndex:1};
  f.cells.set(new Vec3(21,63,0).toString(),'water');f.t.lastProgress=123;
  const r=await mine.tick(f.t,f.b,f.motor,f.state);
  assert.equal(r.handled,false,stage);assert.equal(r.done,undefined);assert.equal(f.t.wilderness.mine,null);assert.equal(f.items.cobblestone,undefined);assert.equal(f.t.lastProgress,123);assert.match(m.reason,/ended safely at home/);
 }
 const f=fixture();f.t.plot={x:0,y:64,z:0};f.items.cobblestone=16;
 f.t.wilderness.mine={stage:'dig',entry:[20,64,0],path:[[20,64,0]],steps:0};
 assert.equal((await mine.tick(f.t,f.b,f.motor,f.state)).done,true);
});

test('an obstructed return waypoint can be skipped only over a checked reversible route',async ctx=>{
 const f=fixture(),m=f.t.wilderness.mine={stage:'exit',entry:[0,64,0],path:[[0,64,0],[1,64,0],[2,64,0]],exitIndex:2};
 f.cells.set(new Vec3(2,64,0).toString(),'stone');f.b.entity.position=new Vec3(2.5,64,.5);
 const nav=require('../controller/field_navigation');ctx.mock.method(nav,'route',(_b,g,_r,_budget,_diag,options)=>{assert.equal(options.reversible,true);return {reached:g[0]===1.5};});
 let goal;f.t.walk=async(_b,_m,g)=>{goal=g;return undefined;};
 await mine.tick(f.t,f.b,f.motor,f.state);assert.equal(m.exitIndex,1);assert.deepEqual(goal,[1.5,64.1,.5]);assert.equal(m.stage,'exit');assert.equal(f.items.cobblestone,undefined);
});

test('a changed entrance height uses its sensed supported surface rather than stopping on air',async()=>{
 const f=fixture(63),m=f.t.wilderness.mine={stage:'exit',entry:[0,64,0],path:[[0,64,0]],exitIndex:0};
 f.b.entity.position=new Vec3(1.5,63,.5);let destination;
 f.t.walk=async(_b,_m,g)=>{destination=g;return true;};
 await mine.tick(f.t,f.b,f.motor,f.state);assert.deepEqual(destination,[.5,63.1,.5]);assert.deepEqual(m.return_landing,[0,63,0]);assert.equal(m.stage,'done');assert.equal(f.items.cobblestone,undefined);
 assert.deepEqual(m.entry,[0,64,0],'retain the recorded entrance and excavation history');
});

test('changed entrance recovery cannot choose a hazardous or unreachable landing',async ctx=>{
 const f=fixture(63),m=f.t.wilderness.mine={stage:'exit',entry:[0,64,0],path:[[0,64,0]],exitIndex:0};f.b.entity.position=new Vec3(1.5,63,.5);
 f.cells.set(new Vec3(0,63,0).toString(),'water');f.t.walk=async()=>{throw Error('must not walk toward a hazard');};
 await assert.rejects(mine.tick(f.t,f.b,f.motor,f.state),/return stair is obstructed/);
 f.cells.delete(new Vec3(0,63,0).toString());ctx.mock.method(require('../controller/field_navigation'),'route',()=>({reached:false}));
 await assert.rejects(mine.tick(f.t,f.b,f.motor,f.state),/return stair is obstructed/);assert.equal(m.stage,'exit');assert.equal(m.return_landing,undefined);
});
