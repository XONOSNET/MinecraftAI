const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),night=require('../controller/first_night'),house=require('../controller/house');
test('a refused workbench placement retries from a different side',async()=>{
 const plot={x:0,y:64,z:0},pos=house.point(plot,'table'),b={entity:{position:new Vec3(pos.x+1.8,64,pos.z+.5),onGround:true,velocity:new Vec3(0,0,0)},inventory:{items:()=>[{name:'crafting_table',count:1}]},blockAt:()=>({name:'air'})};
 const goals=[],t={phase:'night_bootstrap',plot,navigator:{},walk:async(_b,_m,g)=>goals.push(g),place:async()=>{throw Error('Server refused placement');}};
 const state={world:{mission:'first_night',first_night:{}}};night.init(t,state.world);
 await night.tick(t,b,{pause(){}},state);assert.equal(t.wilderness.bootstrapRetries,1);
 await night.tick(t,b,{pause(){}},state);assert.deepEqual(goals,[[pos.x+.5,64.1,pos.z+1.8]]);
});
for(const scenario of ['overlap','moving','drift while crafting','resting gravity'])test('early workbench checks '+scenario+' before placement',async()=>{
 const plot={x:0,y:64,z:0},pos=house.point(plot,'table'),stance=new Vec3(pos.x+1.8,pos.y+.1,pos.z+.5),b={entity:{position:scenario==='overlap'?new Vec3(pos.x+1.28,pos.y,pos.z+.3):new Vec3(stance.x,pos.y,stance.z),velocity:new Vec3(scenario==='moving'?-.08:0,scenario==='resting gravity'?-.0784:0,0),onGround:true},inventory:{items:()=>[{name:'oak_log',count:4}]}};
 let walks=0,crafts=0,places=0,pauses=0;const t={phase:'night_bootstrap',plot,navigator:{},walk:async()=>{walks++;},craft:async()=>{crafts++;b.entity.position.x=pos.x+1.1;},place:async()=>{places++;}};const state={world:{mission:'first_night',first_night:{}}};night.init(t,state.world);
 await night.tick(t,b,{pause(){pauses++;}},state,null,null,null,null);
 assert.equal(places,0);if(scenario==='overlap'){assert.equal(walks,1);assert.equal(crafts,0);}else if(scenario==='moving'){assert.equal(pauses,1);assert.equal(crafts,0);}else{assert.equal(crafts,1);assert.equal(t.navigator.lastPlan,-Infinity);}
});

test('missing supporting face uses bounded alternate workbench stances instead of immediately stopping',async()=>{
 const plot={x:0,y:64,z:0},pos=house.point(plot,'table'),error=Object.assign(Error('No reachable supporting face for placement.'),{code:'BUILD_OBSTRUCTED'});
 const b={entity:{position:new Vec3(pos.x+1.8,64,pos.z+.5),onGround:true,velocity:new Vec3(0,0,0)},inventory:{items:()=>[{name:'crafting_table',count:1}]},blockAt:()=>({name:'air'})};
 const goals=[],t={phase:'night_bootstrap',plot,navigator:{},walk:async(_b,_m,g)=>goals.push(g),place:async()=>{throw error;}};
 const state={world:{mission:'first_night',first_night:{}}},motor={pause(){}};night.init(t,state.world);
 await night.tick(t,b,motor,state);assert.equal(t.wilderness.bootstrapRetries,1);await night.tick(t,b,motor,state);assert.deepEqual(goals[0],[pos.x+.5,64.1,pos.z+1.8]);
 b.entity.position=new Vec3(...goals[0]);await night.tick(t,b,motor,state);assert.equal(t.wilderness.bootstrapRetries,2);await night.tick(t,b,motor,state);
 b.entity.position=new Vec3(...goals.at(-1));await assert.rejects(night.tick(t,b,motor,state),e=>e===error);assert.equal(t.wilderness.bootstrapRetries,3);assert.equal(t.phase,'night_bootstrap');
});
