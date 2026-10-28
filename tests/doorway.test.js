const {test}=require('node:test');const assert=require('node:assert/strict');const {createDoorway}=require('../controller/doorway');
const permissions={move:true,turn:true},base={forward:true},door={id:'0,0',axis:'x',plane:.5,center:.59375,open:true,y:181};
const sensed=(d=door,canWalk=()=>true)=>({doorway:d,canWalk});

test('diagonal approach stays on the checked route until inside the door aisle',()=>{
 const c=createDoorway();
 assert.equal(c.update(base,sensed(),{x:-2,y:181,z:2},0,0,permissions),null);
 assert.equal(c.active(),false);
 assert.notEqual(c.update(base,sensed(),{x:-2,y:181,z:.6},0,100,permissions),null);
});

test('raised entry leaves its verified climb to the route until grounded at door level',()=>{
 const c=createDoorway(),d={...door,y:182};
 assert.equal(c.update(base,sensed(d,()=>false),{x:-1.5,y:181,z:.59375},-Math.PI/2,0,permissions),null);
 assert.equal(c.active(),false);
 assert.equal(c.update(base,{...sensed(d),onGround:false},{x:-.65,y:182,z:.59375},-Math.PI/2,100,permissions),null);
 const a=c.update(base,{...sensed(d),onGround:true},{x:-.65,y:182,z:.59375},-Math.PI/2,200,permissions);
 assert.equal(a.forward,true);assert.equal(c.active(),true);
});

test('world-height doors target the open space beside either hinge panel',()=>{
 const {doorwayDescriptor}=require('../controller/doorway'),{Vec3}=require('vec3');
 const bot={entity:{position:new Vec3(.5,70,-2)}};
 const block={name:'oak_door',position:new Vec3(0,70,0),getProperties:()=>({facing:'north',open:true}),shapes:[[0,0,0,.1875,1,1]]};
 const a=doorwayDescriptor(bot,block,[.5,70,3]);assert.equal(a.y,70);assert.equal(a.center,.59375);
 block.shapes=[[.8125,0,0,1,1,1]];assert.equal(doorwayDescriptor(bot,block,[.5,70,3]).center,.40625);
 assert.equal(doorwayDescriptor(bot,block,[.5,70,-4]),null);
 bot.entity.position.y=181;assert.equal(doorwayDescriptor(bot,block,[.5,70,3]),null);
});
test('doorway holds entry side, centres first and crosses without flipping at the plane',()=>{
 const c=createDoorway();let p={x:-1,z:1.2};let a=c.update(base,sensed(),p,0,0,permissions);assert.match(a.label,/lining up/);assert.equal(a.forward,false);
 p={x:-.65,z:.59375};a=c.update(base,sensed(),p,-Math.PI/2,100,permissions);assert.match(a.label,/crossing/);assert.equal(a.forward,true);
 a=c.update({forward:false,yaw:1},sensed(),{x:.6,z:.59375},-Math.PI/2,200,permissions);assert.match(a.label,/crossing/);assert.equal(a.targetYaw,-Math.PI/2);assert.equal(a.forward,true);
 assert.equal(c.update(base,sensed(),{x:1.6,z:.59375},-Math.PI/2,300,permissions),null);assert.equal(c.active(),false);
 assert.equal(c.update(base,sensed(),{x:1.7,z:.59375},0,400,permissions),null,'completed door cannot retrigger');
 c.reset();assert.notEqual(c.update(base,sensed(),p,0,500,permissions),null);
});
test('reverse-side approach works, closed door waits, unsafe paths never move',()=>{
 const c=createDoorway(),p={x:1.65,z:.59375};
 let a=c.update(base,sensed({...door,open:false}),p,Math.PI/2,0,permissions);assert.match(a.label,/waiting for door/);assert.equal(a.forward,false);
 a=c.update(base,sensed(door,()=>false),p,Math.PI/2,100,permissions);assert.equal(a.forward,false);
 a=c.update(base,sensed(),p,Math.PI/2,200,permissions);assert.equal(a.forward,true);assert.equal(a.targetYaw,Math.PI/2);
 assert.match(c.update(base,sensed(),p,0,13000,permissions).label,/waiting for reset/);
});
test('north/south doors use the same stable cross-axis alignment',()=>{
 const c=createDoorway(),d={...door,axis:'z'};
 const a=c.update(base,sensed(d),{x:.59375,z:-.65},Math.PI,0,permissions);assert.equal(a.forward,true);assert.ok(Math.abs(Math.abs(a.targetYaw)-Math.PI)<1e-9);
});

test('a checked one-block descent to a lower doorway releases edge crouching',()=>{
 const c=createDoorway(),p={x:-2,y:182,z:.59375},s={...sensed(door,()=>false),canStepDown:()=>true};
 const a=c.update(base,s,p,-Math.PI/2,0,permissions);assert.equal(a.forward,true);assert.equal(a.sneak,false);assert.match(a.label,/stepping down/);
 const b=createDoorway().update(base,{...s,canStepDown:()=>false},p,-Math.PI/2,0,permissions);assert.equal(b.forward,false);
 const high=createDoorway().update(base,s,{...p,y:184},-Math.PI/2,0,permissions);assert.equal(high.forward,false);
});

test('a door-frame snag corrects lateral drift without turning back to the entry point',()=>{
 const c=createDoorway();c.update(base,sensed(),{x:-.65,y:181,z:.59375},-Math.PI/2,0,permissions);
 const p={x:-.3,y:181,z:.75};let a=c.update(base,sensed(door,(heading,minimum)=>Math.abs(heading)<.1&&minimum<.2),p,0,100,permissions);
 assert.match(a.label,/centering/);assert.ok(Math.abs(a.targetYaw)<1e-9);assert.equal(a.forward,true);
 a=c.update(base,sensed(),{x:-.3,y:181,z:.61},-Math.PI/2,200,permissions);assert.match(a.label,/crossing/);assert.equal(a.forward,true);assert.ok(Math.abs(a.targetYaw+Math.PI/2)<.1);
});

test('ordinary doors stay upright; crouching is reserved for real low clearance',()=>{
 const p={x:-.65,y:181,z:.59375};
 const normal=createDoorway().update(base,sensed(),p,-Math.PI/2,0,permissions);assert.equal(normal.forward,true);assert.equal(normal.sneak,false);
 const low=createDoorway().update(base,sensed(door,(_yaw,_distance,height)=>height<1.5),p,-Math.PI/2,0,permissions);assert.equal(low.forward,true);assert.equal(low.sneak,true);assert.match(low.label,/low doorway/);
});
