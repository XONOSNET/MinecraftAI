const {test}=require('node:test');const assert=require('node:assert/strict');
const {createRecovery}=require('../controller/recovery');
const permissions={move:true,turn:true},forward={forward:true,jump:false,yaw:0},routes=[{yaw:Math.PI/2,offset:Math.PI/2,clearance:2},{yaw:-Math.PI/2,offset:-Math.PI/2,clearance:2}];
const wall={wallAhead:true,rearSafe:true,escapeRoutes:routes,forwardClearance:0,escapeForwardSafe:false};
const clear={wallAhead:false,rearSafe:true,escapeRoutes:routes,forwardClearance:2,escapeForwardSafe:true};
test('recovery keeps control after reversing, turns, then commits to a checked detour',()=>{
 const r=createRecovery(),p={x:0,z:0};r.update(forward,wall,p,0,0,permissions);
 assert.equal(r.update(forward,wall,p,0,950,permissions).back,true);
 const turn=r.update(forward,wall,{x:0,z:.3},0,1400,permissions);assert.equal(turn.forward,false);assert.equal(turn.targetYaw,Math.PI/2);
 const stillTurn=r.update({...forward,yaw:-.8},clear,p,.4,1500,permissions);assert.equal(stillTurn.targetYaw,Math.PI/2,'policy cannot cancel the committed turn');
 const walk=r.update(forward,clear,p,Math.PI/2,1800,permissions);assert.equal(walk.forward,true);assert.equal(walk.targetYaw,Math.PI/2);
 r.update(forward,clear,{x:-1.6,z:0},Math.PI/2,2300,permissions);assert.equal(r.active(),false);assert.equal(r.remembering(),true);
 const retry=r.update(forward,wall,{x:-1.6,z:0},0,2400,permissions);assert.match(retry.label,/turning/);assert.equal(!!retry.back,false,'remembered obstruction starts a detour without repeating the reverse loop');assert.equal(retry.forward,false);
});
test('a clear parallel route is allowed after detouring, and memory expires or resets',()=>{
 const r=createRecovery(),p={x:0,z:0};r.update(forward,wall,p,0,0,permissions);r.update(forward,wall,p,0,950,permissions);r.update(forward,wall,p,0,1400,permissions);r.update(forward,clear,p,Math.PI/2,1800,permissions);r.update(forward,clear,{x:-1.6,z:0},Math.PI/2,2300,permissions);
 assert.equal(r.update(forward,clear,{x:-1.6,z:0},0,2400,permissions).forward,true);
 r.update(forward,clear,p,0,15000,permissions);assert.equal(r.remembering(),false);r.reset();assert.equal(r.active(),false);
});
test('unsafe rear skips reversing, no checked exit waits for reset, and recovery has a deadline',()=>{
 const r=createRecovery(),p={x:0,z:0},unsafe={...wall,rearSafe:false,escapeRoutes:[]};r.update(forward,unsafe,p,0,0,permissions);
 const result=r.update(forward,unsafe,p,0,950,permissions);assert.equal(result.forward,false);assert.equal(!!result.back,false);assert.match(result.label,/checking nearby routes/);
 assert.match(r.update(forward,clear,p,0,7000,permissions).label,/waiting for reset/);r.reset();assert.equal(r.update(forward,clear,p,0,7100,permissions).forward,true);
 const t=createRecovery();t.update(forward,wall,p,0,0,permissions);t.update(forward,wall,p,0,950,permissions);assert.match(t.update(forward,clear,p,0,7000,permissions).label,/waiting for reset/);
});
test('no turn permission or a short/invalid exit cannot trigger blind forward recovery',()=>{
 for(const escapeRoutes of [[{yaw:Math.PI/2,offset:Math.PI/2,clearance:.65}],[{yaw:NaN,offset:1,clearance:2}],routes]){
 const r=createRecovery(),p={x:0,z:0},s={...wall,rearSafe:false,escapeRoutes};r.update(forward,s,p,0,0,{move:true,turn:false});assert.match(r.update(forward,s,p,0,950,{move:true,turn:false}).label,/movement restricted/);
 }
});

test('a timed-out detour without physical progress is not reported as complete',()=>{
 const r=createRecovery(),p={x:0,z:0};r.update(forward,wall,p,0,0,permissions);r.update(forward,wall,p,0,950,permissions);r.update(forward,wall,p,0,1400,permissions);r.update(forward,clear,p,Math.PI/2,1800,permissions);
 assert.match(r.update(forward,clear,p,Math.PI/2,3100,permissions).label,/checking another exit/);assert.equal(r.remembering(),false);assert.equal(r.active(),true);
});

test('land recovery never overrides swimming or climbing and cancels when entering water',()=>{
 const r=createRecovery(),p={x:0,z:0};r.update(forward,wall,p,0,0,permissions);r.update(forward,wall,p,0,950,permissions);
 for(const kind of ['inWater','inLava','climbing']){const plan={...forward,jump:true};assert.equal(r.update(plan,{...wall,[kind]:true},p,0,1000,permissions),plan);assert.equal(r.active(),false);}
});

test('equally clear exits favour the observed bearing and respect arena limits',()=>{
 const p={x:0,z:0};
 function turn(angle,bounds){const r=createRecovery();r.update(forward,wall,p,0,0,permissions,angle,bounds);r.update(forward,wall,p,0,950,permissions,angle,bounds);return r.update(forward,wall,p,0,1400,permissions,angle,bounds);}
 assert.equal(turn(-.3).targetYaw,-Math.PI/2);
 assert.equal(turn(-.3,[-3,.9,-3,3]).targetYaw,Math.PI/2,'right exit outside the arena is rejected');
 assert.match(turn(0,[-.5,.5,-.5,.5]).label,/checking nearby routes/);
});

test('detour releases as soon as the observed checkpoint path clears, avoiding doorway overshoot',()=>{
 const r=createRecovery(),p={x:0,z:0};r.update(forward,wall,p,0,0,permissions);r.update(forward,wall,p,0,950,permissions);r.update(forward,wall,p,0,1400,permissions);r.update(forward,clear,p,Math.PI/2,1800,permissions);
 assert.match(r.update(forward,{...clear,goalClearance:2},{x:-.4,z:0},Math.PI/2,2000,permissions).label,/detour complete/);assert.equal(r.active(),false);
});

test('a newly clear route is picked up by bounded rechecks instead of a permanent no-exit latch',()=>{
 const r=createRecovery(),p={x:0,z:0},s={...wall,rearSafe:false,escapeRoutes:[]};r.update(forward,s,p,0,0,permissions);
 assert.match(r.update(forward,s,p,0,950,permissions).label,/checking nearby routes/);
 const a=r.update(forward,clear,p,0,1800,permissions);assert.match(a.label,/turning/);assert.equal(a.targetYaw,Math.PI/2);
 const t=createRecovery();t.update(forward,s,p,0,0,permissions);t.update(forward,s,p,0,950,permissions);t.update(forward,s,p,0,1800,permissions);
 assert.match(t.update(forward,s,p,0,2650,permissions).label,/no checked local route/);
});
test('a checked short reposition is used when an alcove has no long straight exit',()=>{
 const r=createRecovery(),p={x:0,z:0},s={...wall,rearSafe:false,escapeRoutes:[{yaw:Math.PI/2,offset:Math.PI/2,clearance:.65}]};
 r.update(forward,s,p,0,0,permissions);assert.match(r.update(forward,s,p,0,950,permissions).label,/turning/);
 assert.equal(r.update(forward,{...s,wallAhead:false,canWalk:()=>true},p,Math.PI/2,1300,permissions).forward,true);
 assert.match(r.update(forward,{...clear,canWalk:()=>true},{x:-.51,z:0},Math.PI/2,1500,permissions).label,/detour complete/);
});
