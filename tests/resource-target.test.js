const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('events'),{Vec3}=require('vec3');
const space=require('../controller/resource_space'),{chooseTree}=require('../controller/tree_target'),{route}=require('../controller/field_navigation'),{aim,harvest}=require('../controller/harvest');
test('live harvest intent follows the current block and clears immediately when mined or changing tasks',()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),t=new HutTeacher(),p=new Vec3(3,70,4);let name='oak_log';
 Object.assign(t,{run:'live-run',phase:'gather',harvestTarget:p,harvestKind:'mining'});
 const b={health:20,blockAt:()=>({name,position:p})};
 assert.deepEqual(t.target(b),{run:'live-run',position:[3,70,4],kind:'mining',block:'oak_log'});
 name='air';assert.equal(t.target(b),null);
 name='oak_log';t.phase='craft';assert.equal(t.target(b),null);
 t.phase='gather';b.health=0;assert.equal(t.target(b),null);
});
function bot(name='miner'){
 const b=new EventEmitter();Object.assign(b,{username:name,players:{},entity:{id:name,position:new Vec3(.5,64,.5),onGround:true,yaw:0,pitch:0},
 blockAt(p){return {name:p.y<64?'grass_block':'air',boundingBox:p.y<64?'block':'empty',position:p.floored()};}});return b;
}
test('nearby players exclude resources, spectators do not, crowded spawns can disperse',()=>{
 const b=bot();b.players.human={username:'human',gamemode:0,entity:{id:2,position:new Vec3(1,64,.5)}};
 assert.equal(space.clearOfPlayers(b,new Vec3(2,64,.5)),false);
 assert.equal(space.stepClear(b.entity.position,new Vec3(-.5,64,.5),space.players(b)),true);
 assert.equal(space.stepClear(b.entity.position,new Vec3(.8,64,.5),space.players(b)),false);
 b.players.human.gamemode=3;assert.equal(space.clearOfPlayers(b,new Vec3(2,64,.5)),true);
});
test('reservations prevent neighbouring miners selecting the same tree and expire or release',()=>{
 const a=bot('claimA'),b=bot('claimB'),p=new Vec3(5,64,5);
 assert.equal(space.reserve(a,'claim-run',p,100),true);
 assert.equal(space.busy(b,'claim-run',p.offset(1,0,0),101),true);
 assert.equal(space.reserve(b,'claim-run',p,101),false);
 assert.equal(space.busy(b,'claim-run',p,30101),false);
 space.reserve(a,'claim-run',p);space.release(a.username);assert.equal(space.busy(b,'claim-run',p),false);
});
test('observed player mining protects a column even beyond physical player clearance',()=>{
 const b=bot();space.attach(b);const p=new Vec3(5,64,5),block={position:p};
 b.emit('blockBreakProgressObserved',block,1,{id:2});assert.equal(space.busy(b,'animations',p),true);
 b.emit('blockBreakProgressEnd',block);assert.equal(space.busy(b,'animations',p),false);
 b.emit('blockBreakProgressObserved',block,1,b.entity);assert.equal(space.busy(b,'animations',p),false);
});
test('tree selection rejects a sealed nearby tree, holds a reachable lock, and honours reservations',()=>{
 const b=bot('select'),trees=[new Vec3(3,64,0),new Vec3(7,64,0)];
 const base=b.blockAt;b.blockAt=p=>Math.abs(p.x-3)<=1&&Math.abs(p.z)<=1&&p.y>=64&&p.y<=66?{name:'stone',boundingBox:'block',position:p}:base(p);
 const selected=chooseTree(b,trees,null,(_b,x,z)=>x>=2&&x<=4&&Math.abs(z)<=1?null:64,'selection');
 assert.equal(selected.key,'7,0');assert.ok(selected.approach);
 b.entity.position=new Vec3(2.5,64,.5);assert.equal(chooseTree(b,trees,'7,0',()=>64,'selection').key,'7,0');
 const other=bot('other');space.reserve(other,'selection',trees[1]);assert.equal(chooseTree(b,trees,'7,0',()=>null,'selection').key,null);space.release(other.username);
});
test('route detours around players and distinguishes partial paths from reached goals',()=>{
 const b=bot();b.players.other={username:'other',entity:{id:2,position:new Vec3(3.5,64,.5)},gamemode:0};
 const r=route(b,[7.5,64.1,.5],16,512,true);assert.equal(r.reached,true);
 assert.ok(r.path.every(p=>Math.hypot(p[0]-3.5,p[2]-.5)>=2));
 const short=route(b,[100,64,0],2,8);assert.equal(short.reached,false);assert.ok(short.expanded<=8);
});
test('harvest aiming moves upward in bounded steps rather than snapping',async()=>{
 const b=bot(),angles=[];b.look=async(yaw,pitch)=>{angles.push([yaw,pitch]);Object.assign(b.entity,{yaw,pitch});};
 await aim(b,new Vec3(.5,68,-1));assert.ok(angles.length>4);
 assert.ok(angles.at(-1)[1]>.9);
 for(let i=1;i<angles.length;i++)assert.ok(Math.abs(angles[i][1]-angles[i-1][1])<=Math.PI/20+.0001);
});
test('tool break time is respected without the old log floor, and success requires server removal',async()=>{
 const b=bot(),pos=new Vec3(0,65,-2),block={name:'oak_log',position:pos};
 b.entity.position=new Vec3(.5,63.88,.5);b.look=async(yaw,pitch)=>Object.assign(b.entity,{yaw,pitch});b.swingArm=()=>{};b.digTime=()=>100;
 let start,elapsed;b._client={write(packet,data){if(data.status===0)start=Date.now();if(data.status===2){elapsed=Date.now()-start;b.emit('blockUpdate',block,{position:pos,name:'air'});}}};
 assert.equal(await harvest(b,block),true);assert.ok(elapsed>=190&&elapsed<800);assert.equal(b.listenerCount('blockUpdate'),0);
});
test('quarry finishes reachable stone instead of diverting toward a loose drop',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),registry=require('minecraft-data')('1.21.4'),Item=require('prismarine-item')(registry);
 const b=bot('quarry'),t=new HutTeacher(),state={run:'quarry-test',world:{bounds:[-30,30,-30,30]}},tasks={createRuntime:()=>({})};
 Object.assign(b,{registry,health:20,food:20,game:{gameMode:'survival'},inventory:{items:()=>[]},entities:{},canDigBlock:()=>true});
 await t.tick(b,{pause(){}},state,async()=>({}),null,tasks);
 const stone={name:'stone',position:new Vec3(0,64,-2)},original=b.blockAt;
 b.blockAt=p=>p.equals(stone.position)?stone:original(p);b.world={raycast:()=>stone};
 const itemKey=registry.entitiesByName.item.metadataKeys.indexOf('item');
 b.entities[9]={id:9,name:'item',position:new Vec3(3,64,.5),metadata:{[itemKey]:Item.toNotch(new Item(registry.itemsByName.cobblestone.id,1))}};
 Object.assign(t,{phase:'quarry',settle:0,quarry:{blocks:[[0,64,-2]],approach:[.5,64,-.5]}});
 let mined=false,walked=false;t.harvest=async()=>{mined=true};t.walk=async()=>{walked=true};
 await t.tick(b,{pause(){}},state,async()=>({}),null,tasks);
 assert.equal(mined,true);assert.equal(walked,false);
});
