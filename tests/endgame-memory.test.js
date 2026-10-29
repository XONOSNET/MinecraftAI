const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{WildernessMemory}=require('../controller/wilderness_memory'),night=require('../controller/first_night');
test('moving-animal sightings cannot evict home or static resource landmarks',()=>{
 const m=new WildernessMemory();m.remember('home',[0,64,0]);m.remember('wood',[12,64,0]);m.remember('stone',[20,64,0]);
 for(let i=0;i<1000;i++){m.remember('food',[i,64,1]);m.remember('wool',[i,64,2]);}
 assert.ok(m.resources.length<=96);for(const k of ['home','wood','stone'])assert.equal(m.resources.filter(r=>r.kind===k).length,1);
 assert.ok(m.resources.filter(r=>r.kind==='food').length<=24);assert.ok(m.resources.filter(r=>r.kind==='wool').length<=16);
 const restored=new WildernessMemory(m.snapshot());assert.deepEqual(restored.resources,m.resources);
});
function fixture(){
 const b={username:'scout-test',entity:{position:new Vec3(.5,64,-4.5),onGround:true},inventory:{items:()=>[]},players:{},entities:{},blockAt(p){return {position:p,name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty'};}};
 const t={phase:'night_scout',plot:{x:0,y:64,z:0},milestones:[],navigator:{},milestone(n){this.milestones.push(n);}};night.init(t,{});
 const state={world:{bounds:[-30,90,-20,20],first_night:{stations:false,hold_seconds:180}}};return {b,t,state};
}
test('scouting revisits an observed resource and then actually returns home before credit',async()=>{
 const {b,t,state}=fixture();t.wilderness.memory.remember('wood',[12,64,0]);let calls=0;
 t.walk=async(_b,_m,g)=>{calls++;b.entity.position=new Vec3(...g);return true;};const motor={pause(){}};
 await night.tick(t,b,motor,state);assert.equal(t.phase,'night_scout_home');assert.deepEqual(t.milestones,[]);
 await night.tick(t,b,motor,state);assert.equal(t.phase,'night_hold');assert.deepEqual(t.milestones,['round_trip']);assert.equal(calls,2);
});
test('a blocked scouting target is released for another remembered approach',async()=>{
 const {b,t,state}=fixture();t.wilderness.memory.remember('wood',[12,64,0]);t.walk=async()=>false;
 await night.tick(t,b,{pause(){}},state);assert.equal(t.wilderness.scoutGoal,null);assert.equal(t.wilderness.scoutRejected.size,1);assert.deepEqual(t.milestones,[]);
});
test('missing scout landmarks end with an explicit report instead of endless wood exploration',async()=>{
 const {b,t,state}=fixture();t.wilderness.scoutSearchAt=Date.now()-31000;
 await assert.rejects(night.tick(t,b,{pause(){}},state),/No reachable remembered/);assert.equal(t.failureCategory,'landmark_unavailable');assert.deepEqual(t.milestones,[]);
});
test('checking exhausted wood does not erase its observed landmark',async()=>{
 const {b,t,state}=fixture();t.wilderness.memory.remember('wood',[12,64,0]);t.wilderness.exploration={visits:new Map(),observe(){},async choose(){return [20.5,64.1,.5];},hold(){}};t.walk=async()=>undefined;
 await night.explore(t,b,{pause(){}},state,null,null,null,()=>64,'wood');assert.equal(t.wilderness.memory.resources.filter(r=>r.kind==='wood').length,1);
});

const scouting=require('../controller/scouting');
test('upper logs yield ground-level scout goals without duplicating every log height',()=>{
 const {b,t,state}=fixture();for(let y=69;y<=75;y++)t.wilderness.memory.remember('wood',[12,y,0]);
 const goals=scouting.candidates(b,t.wilderness.memory,t.plot,[],state.world.bounds,()=>64);
 assert.equal(goals.length,4);assert.ok(goals.every(c=>c.goal[1]===64.1));
 assert.ok(scouting.choose(b,t,state.world,()=>64));
});
test('scout search advances past blocked approaches instead of retrying its first batch',()=>{
 const {b,t,state}=fixture();t.wilderness.scoutPlanning={cursor:0,checked:0,goals:[...Array.from({length:5},(_,i)=>({goal:[12.5,70.1,i+.5]})),{goal:[20.5,64.1,.5]}]};
 assert.equal(scouting.choose(b,t,state.world,()=>64),null);
 assert.equal(t.wilderness.scoutPlanning.checked,4);
 assert.deepEqual(scouting.choose(b,t,state.world,()=>64),[20.5,64.1,.5]);
 assert.equal(t.wilderness.scoutPlanning.checked,6);
});
test('scout goals stay near observed resources and outside private plots',()=>{
 const {b,t,state}=fixture();t.wilderness.memory.remember('wood',[12,72,0],[50.5,64.1,.5]);
 const goals=scouting.candidates(b,t.wilderness.memory,t.plot,[{x:12,y:64,z:0}],state.world.bounds,()=>64);
 assert.deepEqual(goals,[]);
 t.wilderness.memory.roads.set('far',[40.5,64.1,.5]);
 const open=scouting.candidates(b,t.wilderness.memory,t.plot,[],state.world.bounds,()=>64);
 assert.ok(open.length);assert.ok(open.every(c=>Math.hypot(c.goal[0]-12.5,c.goal[2]-.5)<=4));
});
test('confirmed harvesting stances survive memory snapshots and are revalidated',()=>{
 const {b,t,state}=fixture();const m=t.wilderness.memory;m.remember('wood',[12,72,0],[12.5,64.1,.5]);
 const restored=new WildernessMemory(m.snapshot());assert.deepEqual(restored.resources[0].approach,[12.5,64.1,.5]);
 assert.equal(scouting.candidates(b,restored,t.plot,[],state.world.bounds,()=>null).length,1);
 b.blockAt=p=>({name:'air',boundingBox:'empty',position:p});
 assert.equal(scouting.candidates(b,restored,t.plot,[],state.world.bounds,()=>null).length,0);
});
