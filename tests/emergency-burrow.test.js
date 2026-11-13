const test=require('node:test'),assert=require('assert/strict'),{Vec3}=require('vec3'),burrow=require('../controller/emergency_burrow'),inventory=require('../controller/inventory_sync'),access=require('../controller/resource_access');
function fixture(){
 const cells=new Map(),b={username:'BurrowTest',health:16,food:20,time:{timeOfDay:14000},players:{},entities:{s:{id:2,name:'skeleton',position:new Vec3(13,64,.5)}},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,velocity:new Vec3(0,0,0)},inventory:{items:()=>[]},world:{raycast:()=>null}};
 b.blockAt=p=>{p=p.floored();const name=cells.get(p.toString())||(p.y<64?'dirt':'air');return {name,position:p,boundingBox:name==='air'?'empty':'block',getProperties:()=>({})};};
 const t={phase:'gather',plot:{x:30,y:64,z:30},campPlots:[],milestones:[],wilderness:{},navigator:{lastPlan:0},path:[],walk:async()=>true},motor={pause(){},lockLook(){}};
 return {b,t,cells,motor,state:{run:'burrow-unit',world:{bounds:[-50,50,-50,50],first_night:{hostiles:true}}}};
}
test('an unexcavated refuge approach timeout preserves the lesson and rejects the patch',async()=>{
 const f=fixture();f.t.phase='night_burrow';
 f.t.wilderness.burrow={feet:[3,66,0],cap:[3,66,0],stage:'approach',resume:'return_home',progressAt:Date.now()-31000};
 f.t.walk=async()=>assert.fail('expired approach must not be retried');
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.phase,'night_seek_cover');assert.equal(f.t.wilderness.coverResume,'return_home');
 assert.equal(f.t.wilderness.burrow,null);assert.ok(f.t.wilderness.burrowRejected.has(new Vec3(3,66,0).toString()));
});
test('a bot already knocked onto safe surface footing resumes work after its opened shaft is damaged',async()=>{
 const f=fixture();f.t.phase='night_burrow';
 f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],stage:'climb',resume:'stone_return',progressAt:Date.now()};
 f.b.entity.position=new Vec3(.5,64,-2.8);
 f.cells.set(new Vec3(0,61,0).toString(),'air');
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.burrow,null);assert.equal(f.t.phase,'stone_return');
});
test('a close hostile interrupts exposed digging and the bot keeps its lesson while seeking cover',async()=>{
 const f=fixture();f.t.phase='night_burrow';
 f.b.entities.s={id:2,name:'zombie',position:new Vec3(.5,64,-1.5)};
 f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],lip:[1,64,0],stage:'dig',resume:'stone_return',progressAt:Date.now()};
 f.b.dig=async()=>assert.fail('must not open the shaft within melee reach');
 const goals=[];f.t.walk=async(_bot,_motor,goal)=>{goals.push(goal);};
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.burrow,null);assert.equal(f.t.phase,'night_seek_cover');
 assert.equal(f.t.wilderness.coverResume,'stone_return');assert.equal(f.t.wilderness.burrowEvading,true);
 assert.ok(goals.length);assert.ok(new Vec3(...goals[0]).distanceTo(f.b.entities.s.position)>2);
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.burrow,null,'does not start another shaft while the pursuer is in reach');
});
test('safe burrow sites require two hand-diggable earth blocks and a closed supported dry shell',()=>{
 const f=fixture(),feet=new Vec3(0,64,0);assert.equal(burrow.site(f.t,f.b,feet,f.state.world),true);
 for(const [p,name] of [[feet.offset(0,-1,0),'sand'],[feet.offset(0,-2,0),'gravel'],[feet.offset(0,-2,0),'stone'],[feet.offset(1,-2,0),'water'],[feet.offset(1,-1,0),'air'],[feet.offset(0,-4,0),'air'],[feet.offset(1,1,0),'sand']]){
  f.cells.set(p.toString(),name);assert.equal(burrow.site(f.t,f.b,feet,f.state.world),false,name+' '+p);f.cells.clear();
 }
 const original=f.b.blockAt;f.b.blockAt=p=>p.equals(feet.offset(-1,-2,0))?null:original(p);assert.equal(burrow.site(f.t,f.b,feet,f.state.world),false);
});
test('burrows avoid occupied land, private plots and the trial boundary',()=>{
 const f=fixture(),feet=new Vec3(0,64,0);f.b.players.other={username:'Other',entity:{id:3,position:new Vec3(1.5,64,.5)}};assert.equal(burrow.site(f.t,f.b,feet,f.state.world),false);
 f.b.players={};f.t.campPlots=[{x:0,y:64,z:0}];assert.equal(burrow.site(f.t,f.b,feet,f.state.world),false);
 f.t.campPlots=[];assert.equal(burrow.site(f.t,f.b,new Vec3(49,64,0),f.state.world),false);
});
test('search leaves a sandy starting column for nearby verified dirt instead of digging sand',()=>{
 const f=fixture();f.cells.set(new Vec3(0,64,0).toString(),'sand');const found=burrow.find(f.t,f.b,f.state);assert.ok(found);assert.ok(found.x!==0||found.z!==0);assert.equal(burrow.site(f.t,f.b,found,f.state.world),true);
});

test('unarmed full-health bots proactively dig before enemies arrive and retry blocked approaches',async()=>{
 const f=fixture();f.b.health=20;f.b.entities={};f.t.walk=async()=>false;
 assert.equal(await burrow.tick(f.t,f.b,f.motor,f.state),true);
 assert.equal(f.t.wilderness.burrow,null);assert.equal(f.t.phase,'gather');assert.equal(f.t.wilderness.burrowRejected.size,1);
 f.t.walk=async()=>undefined;await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.phase,'night_burrow');assert.equal(f.t.wilderness.burrow.stage,'approach');
 assert.match(f.t.wilderness.burrow.reason,/before night-time work/);
});
test('refuge selection prefers distance but starts digging when an attacker is nearby without occupying the shaft',async ctx=>{
 const f=fixture();f.b.entities.s.position.x=5;const found=burrow.find(f.t,f.b,f.state);assert.ok(found);assert.ok(found.offset(.5,0,.5).distanceTo(f.b.entities.s.position)>=12);
 f.t.phase='night_burrow';f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],lip:[1,64,0],stage:'approach',resume:'gather',progressAt:Date.now()};
 ctx.mock.method(access,'stabilize',async()=>true);
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'night_burrow');assert.equal(f.t.wilderness.burrow.stage,'dig');
});

test('a fleeing bot can choose nearby dirt when every excavatable patch is within twelve blocks of a pursuer',()=>{
 const f=fixture(),old=f.b.blockAt;f.b.entities.s.position=new Vec3(5,64,.5);
 f.b.blockAt=p=>{const v=old(p);if(p.y===63&&(p.x<0||p.x>2||p.z<0||p.z>2))v.name='sand';return v;};
 const found=burrow.find(f.t,f.b,f.state);assert.ok(found);assert.equal(burrow.site(f.t,f.b,found,f.state.world),true);assert.ok(found.offset(.5,0,.5).distanceTo(f.b.entities.s.position)<12);
});

test('an underground bot attacks a hostile blocking the roof, respects cooldown and stops attacking when clear',async ctx=>{
 const f=fixture();f.b.entity.position=new Vec3(.5,62,.5);f.b.entities.s.position=new Vec3(.5,64,.5);f.b.lookAt=async()=>{};
 let attacks=0,now=10000;ctx.mock.method(Date,'now',()=>now);f.b.attack=e=>{assert.equal(e.name,'skeleton');attacks++;};
 const s={progressAt:1},cap=new Vec3(0,64,0);
 assert.equal(await burrow.defendOpening(f.t,f.b,f.motor,s,cap),true);assert.equal(attacks,1);assert.equal(s.progressAt,now);
 now+=100;assert.equal(await burrow.defendOpening(f.t,f.b,f.motor,s,cap),true);assert.equal(attacks,1);
 now+=650;assert.equal(await burrow.defendOpening(f.t,f.b,f.motor,s,cap),true);assert.equal(attacks,2);
 f.b.registry={entitiesByName:{skeleton:{metadataKeys:['health']}}};f.b.entities.s.metadata=[0];
 assert.equal(await burrow.defendOpening(f.t,f.b,f.motor,s,cap),true,'wait for the corpse entity to disappear before placing through its body');assert.equal(attacks,2);
 f.b.entities.s.isValid=false;assert.equal(await burrow.defendOpening(f.t,f.b,f.motor,s,cap),false);assert.equal(attacks,2);
 f.b.entities.s={id:2,name:'sheep',position:new Vec3(.5,64,.5)};assert.equal(await burrow.defendOpening(f.t,f.b,f.motor,s,cap),false);
});
test('a dead archer does not keep a sealed refuge occupied forever',async()=>{
 const f=fixture();f.b.registry={entitiesByName:{skeleton:{metadataKeys:['health']}}};f.b.entities.s.metadata=[0];f.b.entities.s.position.x=5;f.b.time.timeOfDay=6000;
 f.t.phase='night_burrow';f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],lip:[1,64,0],cap_name:'dirt',stage:'hidden',resume:'gather',progressAt:Date.now()};f.cells.set(new Vec3(0,64,0).toString(),'dirt');
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.burrow.stage,'open');
});
test('the first landing places cover in the same tick when real dirt is already held',async()=>{
 const f=fixture();f.t.phase='night_burrow';f.b.entities={};
 const s=f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],lip:[1,64,0],stage:'dig',progressAt:Date.now()};
 f.b.entity.position.y=63;f.cells.set(new Vec3(0,63,0).toString(),'air');
 f.b.heldItem={name:'dirt',count:1};f.b.inventory.items=()=>[f.b.heldItem];
 f.b.lookAt=async()=>{};
 f.b._placeBlockWithOptions=async(block,face)=>f.cells.set(block.position.plus(face).toString(),'dirt');
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(s.lip_name,'dirt');assert.equal(s.stage,'dig');
 assert.equal(f.b.blockAt(new Vec3(1,64,0)).name,'dirt');
});
test('a complete refuge digs only two earth blocks, caps, waits for a safe day and climbs out without lesson credit',async ctx=>{
 const f=fixture();let dirt=0,digs=0,steps=0;ctx.mock.method(access,'stabilize',async()=>true);ctx.mock.method(inventory,'sync',async()=>{});ctx.mock.method(inventory,'equip',async()=>{});
 f.b.inventory.items=()=>dirt?[{name:'dirt',count:dirt}]:[];f.b.canDigBlock=()=>true;f.b.lookAt=async()=>{};f.b.clearControlStates=()=>{};
 f.b.dig=async block=>{digs++;f.cells.set(block.position.toString(),'air');dirt++;if(block.position.y<Math.round(f.b.entity.position.y))f.b.entity.position.y--;};
 f.b._placeBlockWithOptions=async(block,face)=>{f.cells.set(block.position.plus(face).toString(),'dirt');dirt--;};
 ctx.mock.method(access,'jumpPlace',async(_b,q)=>{steps++;f.cells.set(q.toString(),'dirt');dirt--;f.b.entity.position.y++;return true;});
 for(let i=0;i<9&&f.t.wilderness.burrow?.stage!=='hidden';i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(digs,2);assert.equal(f.b.entity.position.y,62);assert.equal(f.t.wilderness.burrow.stage,'hidden');assert.equal(burrow.sealed(f.b,f.t.wilderness.burrow),true);
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.burrow.stage,'hidden','night stays sealed');
 f.b.entities.s.position.x=5;f.b.time.timeOfDay=6000;await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.burrow.stage,'hidden','visible surface threat keeps the roof closed');
 f.b.entities={};await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.burrow.stage,'open');
 for(let i=0;i<6&&f.t.wilderness.burrow;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.phase,'gather');assert.equal(f.t.wilderness.burrow,null);assert.equal(steps,2);assert.equal(f.b.entity.position.y,64);assert.equal(dirt,0);assert.deepEqual(f.t.milestones,[]);
});
test('missing roofs, fluid breaches and unproductive excavation never become a safe watch',async()=>{
 const f=fixture();f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],cap_name:'dirt',stage:'hidden',progressAt:Date.now(),resume:'gather'};
 f.cells.set(new Vec3(0,64,0).toString(),'air');await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/roof was breached/);
 f.cells.set(new Vec3(0,64,0).toString(),'dirt');f.cells.set(new Vec3(1,62,0).toString(),'water');await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no longer dry/);
 f.cells.clear();f.t.wilderness.burrow.stage='dig';f.t.wilderness.burrow.progressAt=Date.now()-31000;await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no physical progress/);
});

test('small shaft displacement recenters before digging without resetting the progress deadline',async ctx=>{
 const f=fixture();f.t.phase='night_burrow';const at=Date.now()-1000,s=f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],stage:'dig',progressAt:at,resume:'gather'};
 f.b.entity.position.x=.79;let centers=0,digs=0;f.b.canDigBlock=()=>true;f.b.dig=async()=>{digs++;};
 ctx.mock.method(access,'stabilize',async(_b,_m,q)=>{assert.deepEqual(q.toArray(),[0,64,0]);centers++;f.b.entity.position.x=.5;return true;});
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(centers,1);assert.equal(digs,0);assert.equal(s.progressAt,at);assert.equal(s.stage,'dig');assert.equal(f.t.phase,'night_burrow');
});

test('a grounded bot over an excavated shaft rim uses checked neighboring footing before abandoning it',async()=>{
 const f=fixture();f.t.phase='night_burrow';
 const s=f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],stage:'dig',resume:'gather',progressAt:Date.now()};
 f.b.entity.position=new Vec3(.47,64,.96);f.b.entity.yaw=0;
 f.cells.set(new Vec3(0,63,0).toString(),'air');
 f.b.dig=async()=>assert.fail('must not dig while overhanging the shaft');
 f.t.walk=async(_bot,_motor,goal)=>{assert.deepEqual(goal,[.5,64.1,1.5]);f.b.entity.position=new Vec3(.5,64,1.5);};
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.burrow,null);assert.equal(f.t.phase,'gather');
 assert.ok(f.t.wilderness.burrowRejected.get(new Vec3(...s.feet).toString())>Date.now());
});

test('a changed shell can be rejected from safe surface footing but not from underground',async()=>{
 const f=fixture();f.t.phase='night_burrow';f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],stage:'dig',progressAt:Date.now(),resume:'gather'};
 f.cells.set(new Vec3(1,62,0).toString(),'water');
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.burrow,null);assert.equal(f.t.phase,'gather');assert.equal(f.t.wilderness.burrowRejected.size,1);
 f.t.phase='night_burrow';f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],stage:'dig',progressAt:Date.now(),resume:'gather'};
 f.cells.set(new Vec3(0,63,0).toString(),'air');f.b.entity.position.y=63;
 await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no longer dry/);assert.equal(f.t.phase,'night_burrow');
});

test('a stopped bot no longer advertises its former refuge as safely sealed',()=>{
 const f=fixture();f.t.phase='stopped';f.t.wilderness.burrow={stage:'hidden',feet:[0,64,0],cap_name:'dirt'};
 assert.equal(burrow.report(f.t).sealed,false);
});

test('grass spreading on earth covers is not a roof breach and exits reclaim the changed soil',async()=>{
 const f=fixture();f.b.time.timeOfDay=6000;f.b.entities={};
 const s=f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],lip:[1,64,0],cap_name:'dirt',lip_name:'dirt',stage:'hidden',progressAt:Date.now(),resume:'gather'};
 f.t.phase='night_burrow';f.b.entity.position.y=62;f.cells.set(new Vec3(0,64,0).toString(),'grass_block');f.cells.set(new Vec3(1,64,0).toString(),'grass_block');
 f.b.dig=async v=>f.cells.set(v.position.toString(),'air');
 assert.equal(burrow.sealed(f.b,s),true);await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(s.stage,'open');
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(s.stage,'reclaim');await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(s.stage,'climb');
});

test('refuge exit rechecks newly arrived threats before removing the roof',async()=>{
 const f=fixture();f.b.time.timeOfDay=6000;f.b.entities.s.position.x=5;
 f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],cap_name:'dirt',stage:'open',progressAt:Date.now(),resume:'gather'};f.cells.set(new Vec3(0,64,0).toString(),'dirt');
 f.b.dig=async()=>{throw Error('Threatened exit must remain closed');};await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.burrow.stage,'hidden');
});

test('one-block-offset earth patches are found instead of skipped by a two-block sampling grid',()=>{
 const f=fixture();f.b.entities={};const blockAt=f.b.blockAt;
 f.b.blockAt=p=>{const v=blockAt(p);if(p.y===63&&(p.x<2||p.x>4||p.z<0||p.z>2))v.name='sand';return v;};
 const found=burrow.find(f.t,f.b,f.state);assert.ok(found);assert.equal(found.x,3);assert.equal(found.z,1);
});

test('escape goals stay committed across replanning intervals and quiet nights still search for earth',async ctx=>{
 const f=fixture();f.b.entities={};let now=1000;ctx.mock.method(Date,'now',()=>now);const goals=[];f.t.walk=async(_b,_m,g)=>{goals.push(g);};
 await burrow.seek(f.t,f.b,f.motor,f.state);assert.ok(f.t.wilderness.coverEscape,'no enemy should not freeze a bot lacking diggable ground');
 const goal=f.t.wilderness.coverEscape;now=5000;await burrow.seek(f.t,f.b,f.motor,f.state);assert.deepEqual(f.t.wilderness.coverEscape,goal);assert.deepEqual(goals[1],goals[0]);
});

test('escape routing increases separation without choosing a path through an attacker',async()=>{
 const f=fixture();f.b.entities.s.position=new Vec3(-5,64,.5);f.t.walk=async()=>undefined;
 await burrow.seek(f.t,f.b,f.motor,f.state);const goal=f.t.wilderness.coverEscape;assert.ok(goal);
 const enemy=f.b.entities.s.position,before=enemy.distanceTo(f.b.entity.position);
 assert.ok(enemy.distanceTo(new Vec3(...goal))>before+2);
 const planned=require('../controller/field_navigation').route(f.b,goal,24,2048,true,{bounds:f.state.world.bounds,reversible:true});
 assert.ok(planned.path.every(q=>enemy.distanceTo(new Vec3(...q))>=before-.75));
});

test('shelter seeking swims to a narrow dry bank instead of pausing over water',async()=>{
 const f=fixture();f.b.entities={};f.b.entity.position=new Vec3(.5,63.13,.5);f.b.entity.onGround=false;f.b.entity.isInWater=true;
 f.b.blockAt=p=>{p=p.floored();const bank=p.x===3&&Math.abs(p.z)<=1,name=p.y<63?'stone':p.y===63?(bank?'dirt':'water'):'air';return {position:p,name,boundingBox:['air','water'].includes(name)?'empty':'block',getProperties:()=>({level:0})};};
 let walking;f.t.walk=async(_b,_m,g)=>{walking=g;};
 await burrow.seek(f.t,f.b,f.motor,f.state);assert.ok(walking);assert.equal(Math.floor(walking[0]),3);assert.equal(walking[1],64.1);
 const dry=require('../controller/field_navigation').route(f.b,walking,32,4096,true,{bounds:f.state.world.bounds,reversible:true});assert.ok(!dry.reached);
 const transit=require('../controller/field_navigation').travelRoute(f.b,walking,32,4096,true,{bounds:f.state.world.bounds,reversible:true});assert.equal(transit.reached,true);assert.equal(transit.water_route,true);
 assert.equal(burrow.site(f.t,f.b,new Vec3(0,64,0),f.state.world),false,'swimming permission does not permit digging a flooded refuge');
});

test('surrounded shelter seekers choose a reachable escape rather than demanding separation from every attacker',async()=>{
 const f=fixture();f.b.entities=Object.fromEntries([[6,0],[-6,0],[0,6],[0,-6]].map(([x,z],i)=>[i,{id:i+2,name:i?'phantom':'skeleton',position:new Vec3(x+.5,64,z+.5)}]));
 let walking;f.t.walk=async(_b,_m,g)=>{walking=g;};await burrow.seek(f.t,f.b,f.motor,f.state);assert.ok(walking);assert.ok(f.t.wilderness.coverRoutesChecked>6,'strict safer routes were exhausted before fallback');
 const route=require('../controller/field_navigation').travelRoute(f.b,walking,32,4096,true,{bounds:f.state.world.bounds,reversible:true});assert.equal(route.reached,true);
});

test('carried-light blocks are clear exit headroom while real solid blocks remain obstructions',()=>{
 const f=fixture(),s={cap:[0,64,0],cap_name:'air'};
 for(const name of ['air','cave_air','void_air','light']){
  f.b.blockAt=()=>({name,boundingBox:'empty'});assert.equal(burrow.sealed(f.b,s),true,name);
 }
 for(const name of ['stone','water','oak_leaves','sand']){
  f.b.blockAt=()=>({name,boundingBox:name==='water'?'empty':'block'});assert.equal(burrow.sealed(f.b,s),false,name);
 }
 f.b.blockAt=()=>null;assert.equal(burrow.sealed(f.b,s),false);
});

test('sand-biome search uses longer inland goals instead of ending its next leg at the trial boundary',async()=>{
 const f=fixture();f.state.world.bounds=[-20,20,-20,20];f.b.entity.position=new Vec3(15.5,64,.5);f.b.entities.s.position=new Vec3(8,64,.5);f.t.walk=async()=>undefined;
 await burrow.seek(f.t,f.b,f.motor,f.state);const g=f.t.wilderness.coverEscape;assert.ok(g,'a safer route parallel to the boundary should remain available');
 assert.ok(g[0]<=13.5&&g[0]>=-13.5&&g[2]<=13.5&&g[2]>=-13.5);assert.ok(Math.hypot(g[0]-15.5,g[2]-.5)>=8);
});


test('exit reserves both steps and safely mines one capped side pocket when the lip drop is unavailable',async ctx=>{
 const f=fixture();let now=10000,dirt=1,steps=0;ctx.mock.method(Date,'now',()=>now);ctx.mock.method(inventory,'sync',async()=>{});
 f.b.entities={};f.b.entity.position.y=62;f.b.clearControlStates=()=>{};f.b.canDigBlock=()=>true;f.b.inventory.items=()=>dirt?[{name:'dirt',count:dirt}]:[];
 const s=f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],stage:'climb',resume:'gather',progressAt:now};f.t.phase='night_burrow';
 f.b.dig=async v=>{f.cells.set(v.position.toString(),'air');dirt++;};
 ctx.mock.method(access,'jumpPlace',async(_b,q)=>{steps++;dirt--;f.cells.set(q.toString(),'dirt');f.b.entity.position.y++;return true;});
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(steps,0,'do not strand bot halfway up');
 now+=1600;await burrow.tick(f.t,f.b,f.motor,f.state);assert.deepEqual(s.exitNotch,[1,62,0]);assert.equal(dirt,2);assert.equal(burrow.walls(f.b,new Vec3(0,64,0),s),true);
 for(let i=0;i<3;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.phase,'gather');assert.equal(steps,2);assert.equal(dirt,0);assert.deepEqual(f.t.milestones,[]);
});

test('exit supply pockets refuse exposed ceilings, water behind walls and occupied cells',()=>{
 const f=fixture(),feet=new Vec3(0,64,0),q=new Vec3(1,62,0);assert.equal(burrow.safeNotch(f.b,feet,q),true);
 for(const [p,name] of [[q.offset(0,1,0),'air'],[q.offset(1,0,0),'water'],[q.offset(0,-1,0),'sand']]){f.cells.set(p.toString(),name);assert.equal(burrow.safeNotch(f.b,feet,q),false);f.cells.clear();}
 assert.equal(burrow.safeNotch(f.b,feet,q.offset(0,1,0)),false);
 f.b.players.other={username:'Other',entity:{id:3,position:q.offset(.5,0,.5)}};assert.equal(burrow.safeNotch(f.b,feet,q),false);
});

test('daylight refuge reports the actual nearby skeleton holding up its exit',async()=>{
 const f=fixture();f.b.time.timeOfDay=6000;f.b.entities.s.position.x=5;f.cells.set(new Vec3(0,64,0).toString(),'dirt');
 f.t.phase='night_burrow';f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],cap_name:'dirt',stage:'hidden',progressAt:Date.now()};
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.match(f.t.message,/skeleton 5m/);assert.match(burrow.report(f.t).waiting_for,/skeleton/);assert.equal(f.t.wilderness.burrow.stage,'hidden');
});


test('critically injured living bots can still attempt emergency cover',async ctx=>{
 ctx.mock.method(access,'stabilize',async()=>true);
 const f=fixture();f.b.health=4.5;f.b.entities={};
 assert.equal(await burrow.tick(f.t,f.b,f.motor,f.state),true);assert.equal(f.t.phase,'night_burrow');assert.ok(f.t.wilderness.burrow);
});


test('a refused cover is retried with checked alternate hit points and confirmed inventory',async ctx=>{
 const f=fixture(),s={},cap=new Vec3(0,64,0),lip=new Vec3(1,64,0);f.b.entity.position.y=62;f.cells.set(lip.toString(),'dirt');let calls=0,syncs=0;const heights=[];
 ctx.mock.method(inventory,'sync',async()=>{syncs++;});ctx.mock.method(inventory,'equip',async()=>{});f.b.lookAt=async()=>{};
 f.b._placeBlockWithOptions=async(ref,face,options)=>{calls++;heights.push(options.delta.y);if(calls===1)throw Error('Server refused to place dirt');f.cells.set(cap.toString(),'dirt');};
 assert.equal(await burrow.placeCover(f.b,s,cap,lip,new Vec3(-1,0,0),'dirt'),true);assert.equal(calls,2);assert.equal(syncs,2);assert.deepEqual(heights,[.2,.5]);assert.equal(s.coverRefusals,1);
});

test('cover retries do not bypass physical blockers or invent placement success',async ctx=>{
 const f=fixture(),s={},cap=new Vec3(0,64,0),lip=new Vec3(1,64,0);f.b.entity.position.y=62;f.cells.set(lip.toString(),'dirt');let calls=0;
 ctx.mock.method(inventory,'sync',async()=>{});ctx.mock.method(inventory,'equip',async()=>{});f.b.lookAt=async()=>{};f.b._placeBlockWithOptions=async()=>{calls++;throw Error('Server refused to place dirt');};
 assert.equal(await burrow.placeCover(f.b,s,cap,lip,new Vec3(-1,0,0),'dirt'),false);assert.equal(calls,3);assert.equal(burrow.sealed(f.b,{cap:cap.toArray(),cap_name:'dirt'}),false);
 f.cells.set(cap.toString(),'water');assert.equal(await burrow.placeCover(f.b,s,cap,lip,new Vec3(-1,0,0),'dirt'),false);assert.equal(calls,3);
});

test('a silent server placement refusal is retried and still requires a confirmed roof block',async ctx=>{
 const f=fixture(),s={},cap=new Vec3(0,64,0),lip=new Vec3(1,64,0);f.b.entity.position.y=62;f.cells.set(lip.toString(),'dirt');let attempts=0;
 ctx.mock.method(inventory,'sync',async()=>{});ctx.mock.method(inventory,'equip',async()=>{});f.b.lookAt=async()=>{};
 f.b._placeBlockWithOptions=async()=>{if(++attempts===1)throw Error('Server did not answer the placement at (0, 64, 0): Event blockUpdate did not fire within timeout of 5000ms');f.cells.set(cap.toString(),'dirt');};
 assert.equal(await burrow.placeCover(f.b,s,cap,lip,new Vec3(-1,0,0),'dirt'),true);assert.equal(attempts,2);assert.equal(s.coverRefusals,1);
});

function damagedRefuge(ctx,{roof=false,carried=0,refused=false}={}){
 const f=fixture(),feet=new Vec3(0,64,0);let dirt=carried;
 f.b.entities={};f.b.entity.position.y=62;f.t.phase='night_burrow';
 const s=f.t.wilderness.burrow={feet:feet.toArray(),cap:feet.toArray(),lip:[1,64,0],cap_name:'dirt',lip_name:'dirt',shellVerified:true,stage:'hidden',resume:'gather',progressAt:Date.now()};
 for(const y of [62,63])f.cells.set(feet.offset(0,y-64,0).toString(),'air');
 f.cells.set(feet.toString(),roof?'air':'dirt');f.cells.set(feet.offset(1,0,0).toString(),'dirt');
 const gap=roof?feet:feet.offset(-1,-1,0);f.cells.set(gap.toString(),'air');
 ctx.mock.method(inventory,'sync',async()=>{});ctx.mock.method(inventory,'equip',async()=>{});
 f.b.inventory.items=()=>dirt?[{name:'dirt',count:dirt}]:[];f.b.canDigBlock=()=>true;f.b.lookAt=async()=>{};f.b.clearControlStates=()=>{};
 f.b.world.raycast=(eye,ray,distance)=>({position:eye.plus(ray.scaled(distance+.001)).floored()});
 ctx.mock.method(require('../controller/placement_reference'),'references',(_b,q)=>{const block=f.b.blockAt(q.offset(roof?1:0,roof?0:-1,0)),face=new Vec3(roof?-1:0,roof?0:1,0);return [{block,face,key:block.position.toString()+':'+face.toString(),point:block.position.offset(.5,1,.5),delta:new Vec3(.5,1,.5)}];});
 ctx.mock.method(require('../controller/target_scan'),'visibleBlock',()=>true);
 f.b.dig=async block=>{f.cells.set(block.position.toString(),'air');dirt++;};
 f.b._placeBlockWithOptions=async(block,face)=>{if(refused)throw Error('Server refused placement');assert.ok(dirt>0);f.cells.set(block.position.plus(face).toString(),'dirt');dirt--;};
 ctx.mock.method(access,'jumpPlace',async(_b,q)=>{assert.ok(dirt>0);f.cells.set(q.toString(),'dirt');dirt--;f.b.entity.position.y++;return true;});
 return {...f,s,gap,dirt:()=>dirt,setDirt:n=>{dirt=n;}};
}
test('verified refuge recovers real pocket dirt, patches a dry gap and resumes its interrupted task after daylight',async ctx=>{
 const f=damagedRefuge(ctx);await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.ok(f.s.repairNotch);assert.equal(f.dirt(),1);assert.equal(f.s.shellRepairs||0,0);
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.b.blockAt(f.gap).name,'dirt');assert.equal(f.dirt(),0);assert.equal(f.s.shellRepairs,1);
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.s.stage,'hidden');assert.equal(burrow.walls(f.b,new Vec3(...f.s.feet),f.s),true);
 f.b.time.timeOfDay=6000;
 for(let i=0;i<8&&f.t.wilderness.burrow;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.burrow,null);assert.equal(f.t.phase,'gather');assert.equal(f.b.entity.position.y,64);assert.deepEqual(f.t.milestones,[]);
});
test('a breached owned roof is patched with carried dirt before a safe watch resumes',async ctx=>{
 const f=damagedRefuge(ctx,{roof:true,carried:1});await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.s.shellRepairs,1);assert.equal(burrow.sealed(f.b,f.s),true);assert.equal(f.dirt(),0);
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.s.shellRecovery.status,'Shell restored and rechecked');assert.equal(f.s.stage,'hidden');
});
test('refused roof placements exhaust one bounded budget without granting progress or resetting it each tick',async ctx=>{
 const f=damagedRefuge(ctx,{roof:true,carried:1,refused:true}),progress=f.s.progressAt;
 for(let i=0;i<6;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.s.shellRecovery.attempts,6);assert.equal(f.s.progressAt,progress);assert.equal(f.dirt(),1);assert.equal(f.s.shellRepairs||0,0);
 await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/roof was breached/);
});
test('repair refuses hazardous neighbors, missing footing, unverified sites and private plots',async ctx=>{
 const f=damagedRefuge(ctx,{carried:1}),repair=require('../controller/burrow_repair'),problem=burrow.shellProblem(f.b,new Vec3(...f.s.feet),f.s);
 for(const hazard of ['water','lava','sand','gravel']){
  const p=f.gap.offset(-1,0,0);f.cells.set(p.toString(),hazard);assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),false,hazard);f.cells.delete(p.toString());
 }
 f.cells.set(new Vec3(0,61,0).toString(),'air');assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),false);f.cells.delete(new Vec3(0,61,0).toString());
 f.s.shellVerified=false;assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),false);f.s.shellVerified=true;
 f.t.campPlots=[{x:0,z:0}];assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),false);assert.equal(f.dirt(),1);
});
test('waiting for a missing dirt pickup expires without resetting physical progress',async ctx=>{
 const f=damagedRefuge(ctx),repair=require('../controller/burrow_repair'),problem=burrow.shellProblem(f.b,new Vec3(...f.s.feet),f.s),progress=f.s.progressAt;
 f.b.canDigBlock=()=>false;
 assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),true);assert.equal(f.s.progressAt,progress);
 f.s.shellRecovery.at=Date.now()-15001;assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),false);
});

test('a support changing during the awaited turn prevents repair placement',async ctx=>{
 const f=damagedRefuge(ctx,{carried:1});let placements=0;
 f.b.lookAt=async()=>f.cells.set(f.gap.offset(0,-1,0).toString(),'air');
 f.b._placeBlockWithOptions=async()=>placements++;
 await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no longer dry/);
 assert.equal(placements,0);assert.equal(f.dirt(),1);
});

test('repair pocket targeting checks exposed face heights when the block center is occluded',()=>{
 const f=fixture(),feet=new Vec3(0,64,0),q=feet.offset(1,-2,0),repair=require('../controller/burrow_repair');f.b.entity.position.y=62;
 let probes=0;f.b.world.raycast=(_eye,ray,distance)=>{probes++;const end=f.b.entity.position.offset(0,1.62,0).plus(ray.scaled(distance-.02));return {position:end.y>62.7?q:q.offset(0,1,0)};};
 assert.deepEqual(repair.pocketFace(f.b,feet,q).toArray(),[1,62.8,.5]);assert.equal(probes,1);
 f.b.world.raycast=()=>({position:q.offset(0,1,0)});assert.equal(repair.pocketFace(f.b,feet,q),null);
});

test('repair dirt recovery leaves a separate checked exit reserve when a cover drop is missing',async ctx=>{
 const f=damagedRefuge(ctx);let now=Date.now();ctx.mock.method(Date,'now',()=>now);
 await burrow.tick(f.t,f.b,f.motor,f.state);await burrow.tick(f.t,f.b,f.motor,f.state);assert.ok(f.s.repairNotch);
 f.b.time.timeOfDay=6000;await burrow.tick(f.t,f.b,f.motor,f.state);await burrow.tick(f.t,f.b,f.motor,f.state);await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.s.stage,'climb');f.setDirt(1);
 await burrow.tick(f.t,f.b,f.motor,f.state);now+=1600;await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.ok(f.s.exitNotch);assert.notDeepEqual(f.s.exitNotch,f.s.repairNotch);assert.equal(f.dirt(),2);
 for(let i=0;i<5&&f.t.wilderness.burrow;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.burrow,null);assert.equal(f.t.phase,'gather');assert.equal(f.b.entity.position.y,64);assert.deepEqual(f.t.milestones,[]);
});


test('successful shell patches do not exhaust the failed-placement budget or extend its deadline',async ctx=>{
 const f=damagedRefuge(ctx,{carried:8});let now=Date.now();ctx.mock.method(Date,'now',()=>now);
 const repair=require('../controller/burrow_repair'),problem=burrow.shellProblem(f.b,new Vec3(...f.s.feet),f.s);
 const started=now;
 for(let i=0;i<7;i++){
  f.cells.set(f.gap.toString(),'air');now+=100;
  assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),true);
  assert.equal(f.b.blockAt(f.gap).name,'dirt');assert.equal(f.s.shellRecovery.attempts,0);
  assert.equal(f.s.shellRecovery.at,started+100);
 }
 assert.equal(f.s.shellRepairs,7);assert.equal(f.dirt(),1);
 f.cells.set(f.gap.toString(),'air');now=started+15101;
 assert.equal(await repair.repair(f.t,f.b,f.motor,f.s,problem,f.state),false);
 assert.equal(f.dirt(),1);assert.equal(f.s.shellRecovery.status,'Bounded repair exhausted');
});


test('verified refuge keeps sheltering behind intact walls when an inaccessible diagonal corner is air',async ctx=>{
 const f=damagedRefuge(ctx,{carried:2}),feet=new Vec3(...f.s.feet);
 f.cells.set(f.gap.toString(),'dirt');f.cells.set(feet.offset(1,-2,-1).toString(),'air');
 assert.equal(burrow.shellProblem(f.b,feet,f.s),null);
 assert.equal(burrow.site(f.t,f.b,feet,f.state.world),false);
 f.b._placeBlockWithOptions=async()=>assert.fail('No repair through an intact wall');
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.s.stage,'hidden');assert.equal(f.dirt(),2);assert.equal(f.s.shellRepairs||0,0);
 f.b.time.timeOfDay=6000;
 for(let i=0;i<8&&f.t.wilderness.burrow;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.phase,'gather');assert.equal(f.b.entity.position.y,64);
});

test('corner handling still rejects hazards and prioritizes exposed inward walls and missing shaft floors',async ctx=>{
 const f=damagedRefuge(ctx,{carried:1}),feet=new Vec3(...f.s.feet),corner=feet.offset(-1,-2,-1),wall=feet.offset(0,-2,-1);
 f.cells.set(f.gap.toString(),'dirt');
 for(const name of ['water','lava','sand','gravel']){
  f.cells.set(corner.toString(),name);assert.deepEqual(burrow.shellProblem(f.b,feet,f.s).position,corner.toArray());
 }
 f.cells.set(corner.toString(),'air');f.cells.set(wall.toString(),'air');
 assert.deepEqual(burrow.shellProblem(f.b,feet,f.s).position,wall.toArray());
 f.cells.set(wall.toString(),'dirt');const floor=feet.offset(0,-3,0);f.cells.set(floor.toString(),'air');
 assert.deepEqual(burrow.shellProblem(f.b,feet,f.s).position,floor.toArray());
 f.cells.set(floor.toString(),'dirt');const original=f.b.blockAt;
 f.b.blockAt=p=>p.equals(wall)?null:original(p);
 assert.deepEqual(burrow.shellProblem(f.b,feet,f.s).position,wall.toArray());
});


test('a verified refuge rebuilds its destroyed owned lip before sealing and resuming its task',async ctx=>{
 const f=damagedRefuge(ctx,{carried:2}),lip=new Vec3(...f.s.lip);
 f.cells.set(f.gap.toString(),'dirt');f.cells.set(new Vec3(...f.s.cap).toString(),'air');f.cells.set(lip.toString(),'air');f.s.stage='seal';
 const before=f.s.progressAt;
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.s.stage,'lip');assert.equal(f.s.progressAt,before);assert.equal(f.dirt(),2);
 for(let i=0;i<3;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.s.stage,'hidden');assert.equal(f.b.blockAt(lip).name,'dirt');assert.equal(burrow.sealed(f.b,f.s),true);assert.equal(f.dirt(),0);
 f.b.time.timeOfDay=6000;
 for(let i=0;i<8&&f.t.wilderness.burrow;i++)await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.phase,'gather');assert.equal(f.b.entity.position.y,64);assert.deepEqual(f.t.milestones,[]);
});

test('roof support recovery never replaces a foreign obstruction or invents progress while waiting for dirt',async ctx=>{
 const f=damagedRefuge(ctx),lip=new Vec3(...f.s.lip);
 f.cells.set(f.gap.toString(),'dirt');f.cells.set(new Vec3(...f.s.cap).toString(),'air');f.s.stage='seal';f.setDirt(1);
 f.cells.set(lip.toString(),'oak_planks');await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/roof support changed: oak_planks/);
 f.cells.set(lip.toString(),'air');await burrow.tick(f.t,f.b,f.motor,f.state);f.setDirt(0);
 f.s.progressAt=Date.now()-30001;
 await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no physical progress/);
 assert.equal(f.b.blockAt(lip).name,'air');assert.equal(f.dirt(),0);
});


test('burrow failure reports preserve terminal footing instead of stale approach navigation',async ctx=>{
 const f=damagedRefuge(ctx,{carried:4}),p=new Vec3(.81,62,.5);f.b.entity.position=p;f.b.entity.onGround=false;f.b.entity.velocity=new Vec3(.1,-.2,0);
 f.t.lastNavigation={position:[.5,64,.5]};f.cells.set(p.floored().offset(0,-1,0).toString(),'air');
 const error=Error('Emergency shaft footing changed');burrow.captureFailure(f.t,f.b,error);
 const result=burrow.report(f.t).failure_context;
 assert.deepEqual(result.position,[.81,62,.5]);assert.deepEqual(result.velocity,[.1,-.2,0]);assert.equal(result.floor.block,'air');assert.equal(result.on_ground,false);assert.equal(result.centered,false);assert.equal(result.earth_blocks,4);
 f.b.entity.position=new Vec3(8,64,8);assert.deepEqual(burrow.report(f.t).failure_context.position,[.81,62,.5]);
 assert.deepEqual(f.t.lastNavigation.position,[.5,64,.5]);assert.deepEqual(f.t.milestones,[]);assert.equal(f.t.phase,'night_burrow');
 f.b.blockAt=()=>{throw Error('disconnected');};burrow.captureFailure(f.t,f.b,error);assert.equal(burrow.report(f.t).failure_context.capture_error,'disconnected');
});


test('a damaged refuge waits for a short dry descent, repairs after touchdown and resumes sheltering',async ctx=>{
 const f=damagedRefuge(ctx,{carried:1});f.s.stage='dig';f.b.entity.position.y=62.89;f.b.entity.onGround=false;
 f.cells.set(new Vec3(...f.s.cap).toString(),'air');const progress=f.s.progressAt;
 await burrow.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.dirt(),1);assert.equal(f.s.shellRepairs||0,0);assert.equal(f.s.progressAt,progress);assert.match(f.t.message,/settling/);
 f.b.entity.position.y=62;f.b.entity.onGround=true;
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.s.shellRepairs,1);assert.equal(f.dirt(),0);assert.equal(f.s.shellSettlingAt,undefined);
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.s.stage,'seal');assert.equal(burrow.walls(f.b,new Vec3(...f.s.feet),f.s),true);
});

test('airborne repair waiting expires and never accepts fluid, missing footing or a fall below the shaft',async ctx=>{
 const f=damagedRefuge(ctx,{carried:1});let now=Date.now();ctx.mock.method(Date,'now',()=>now);
 f.s.stage='dig';f.b.entity.position.y=62.89;f.b.entity.onGround=false;f.cells.set(new Vec3(...f.s.cap).toString(),'air');
 await burrow.tick(f.t,f.b,f.motor,f.state);now+=2000;
 await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no longer dry/);assert.equal(f.dirt(),1);
 for(const name of ['water','lava','air']){
  delete f.s.shellSettlingAt;f.cells.set(new Vec3(0,61,0).toString(),name);
  await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no longer dry/);
 }
 f.cells.set(new Vec3(0,61,0).toString(),'dirt');f.b.entity.position.y=61.5;
 await assert.rejects(burrow.tick(f.t,f.b,f.motor,f.state),/no longer dry/);assert.equal(f.s.shellRepairs||0,0);
});
