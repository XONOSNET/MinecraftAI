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
