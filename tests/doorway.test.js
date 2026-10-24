const {test}=require('node:test');const assert=require('node:assert/strict');const {createDoorway}=require('../controller/doorway');
const permissions={move:true,turn:true},base={forward:true},door={id:'0,0',axis:'x',plane:.5,center:.59375,open:true,y:181};
const sensed=(d=door,canWalk=()=>true)=>({doorway:d,canWalk});
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
