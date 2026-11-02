const test=require('node:test'),assert=require('assert/strict'),{Vec3}=require('vec3'),burrow=require('../controller/emergency_burrow'),inventory=require('../controller/inventory_sync'),access=require('../controller/resource_access');
function fixture(){
 const cells=new Map(),b={username:'BurrowTest',health:16,food:20,time:{timeOfDay:14000},players:{},entities:{s:{id:2,name:'skeleton',position:new Vec3(13,64,.5)}},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,velocity:new Vec3(0,0,0)},inventory:{items:()=>[]},world:{raycast:()=>null}};
 b.blockAt=p=>{p=p.floored();const name=cells.get(p.toString())||(p.y<64?'dirt':'air');return {name,position:p,boundingBox:name==='air'?'empty':'block',getProperties:()=>({})};};
 const t={phase:'gather',plot:{x:30,y:64,z:30},campPlots:[],milestones:[],wilderness:{},navigator:{lastPlan:0},path:[],walk:async()=>true},motor={pause(){},lockLook(){}};
 return {b,t,cells,motor,state:{run:'burrow-unit',world:{bounds:[-50,50,-50,50],first_night:{hostiles:true}}}};
}
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
test('refuge selection keeps distance from attackers and refuses excavation when a mob catches up',async()=>{
 const f=fixture();f.b.entities.s.position.x=5;const found=burrow.find(f.t,f.b,f.state);assert.ok(found);assert.ok(found.offset(.5,0,.5).distanceTo(f.b.entities.s.position)>=12);
 f.t.phase='night_burrow';f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],lip:[1,64,0],stage:'approach',resume:'gather',progressAt:Date.now()};
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'gather');assert.equal(f.t.wilderness.burrow,null);assert.match(f.t.message,/too close/);
});
test('a dead archer does not keep a sealed refuge occupied forever',async()=>{
 const f=fixture();f.b.registry={entitiesByName:{skeleton:{metadataKeys:['health']}}};f.b.entities.s.metadata=[0];f.b.entities.s.position.x=5;f.b.time.timeOfDay=6000;
 f.t.phase='night_burrow';f.t.wilderness.burrow={feet:[0,64,0],cap:[0,64,0],lip:[1,64,0],cap_name:'dirt',stage:'hidden',resume:'gather',progressAt:Date.now()};f.cells.set(new Vec3(0,64,0).toString(),'dirt');
 await burrow.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.wilderness.burrow.stage,'open');
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
