const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),hunt=require('../controller/hunt_targets'),{WildernessMemory}=require('../controller/wilderness_memory'),registry=require('prismarine-registry')('1.21.4');
function setup(name='hunter'){
 const b={username:name,registry,food:20,players:{},entity:{id:99,position:new Vec3(.5,64,.5),onGround:true},inventory:{items:()=>[]},entities:{},world:{raycast:()=>null},blockAt(p){p=p.floored();return {name:p.y<64?'stone':'air',position:p,boundingBox:p.y<64?'block':'empty'};}};
 const t={phase:'night_wool',wilderness:{memory:new WildernessMemory(),rejectedAnimals:new Map(),searchGoal:[30.5,64.1,.5]}};
 const state={run:'hunt-'+name,world:{first_night:{stations:false},bounds:[-40,40,-40,40]}},approaches=(_b,q)=>[[q.position.x-.5,64.1,q.position.z+.5]];
 return {b,t,state,approaches};
}
function sheep(id,x){const metadata=[];metadata[registry.entitiesByName.sheep.metadataKeys.indexOf('wool')]=0;return {id,name:'sheep',position:new Vec3(x+.5,64,.5),metadata};}
test('a nearby sheep replaces a distant lock and interrupts scouting despite stale terrain rejection',()=>{
 const {b,t,state,approaches}=setup();b.entities={far:sheep(1,20),near:sheep(2,2)};t.wilderness.animal=1;t.wilderness.memory.reject([2.5,64,.5]);
 const choice=hunt.choose(t,b,state,approaches);assert.equal(choice.animal.id,2);assert.equal(t.wilderness.searchGoal,null);assert.match(choice.status.selection_reason,/nearby reachable/);hunt.release(b.username);
});
test('passing players do not mark an animal as owned, but a real hunter claim does',()=>{
 const a=setup('a'),b=setup('b'),e=sheep(3,2);b.state.run=a.state.run;a.b.entities={sheep:e};b.b.entities={sheep:e};a.b.players.other={username:'passing',entity:{id:22,position:e.position.clone()}};
 assert.equal(hunt.choose(a.t,a.b,a.state,a.approaches).animal.id,3);
 const busy=hunt.choose(b.t,b.b,b.state,b.approaches);assert.equal(busy.animal,null);assert.equal(busy.status.skipped['being hunted by another bot'],1);
 hunt.release(a.b.username);assert.equal(hunt.choose(b.t,b.b,b.state,b.approaches).animal.id,3);hunt.release(b.b.username);
});
test('failed approaches retry when the sheep or bot has moved enough, while jitter stays deferred',()=>{
 const {b,t}=setup(),e=sheep(1,5);hunt.defer(t.wilderness,b,e,1000);e.position.x+=.3;assert.equal(hunt.deferred(t.wilderness,b,e,2000),true);e.position.x+=2;assert.equal(hunt.deferred(t.wilderness,b,e,2000),false);
 hunt.defer(t.wilderness,b,e,3000);b.entity.position.z+=3;assert.equal(hunt.deferred(t.wilderness,b,e,3500),false);
 hunt.defer(t.wilderness,b,e,4000);assert.equal(hunt.deferred(t.wilderness,b,e,12000),false);
});
test('small distance changes do not switch a nearby active hunt',()=>{
 const {b,t,state,approaches}=setup(),locked=sheep(1,4);b.entities={locked,other:sheep(2,3)};t.wilderness.animal=1;
 assert.equal(hunt.choose(t,b,state,approaches).animal.id,1);hunt.release(b.username);
});
test('unreachable nearest sheep does not prevent selection of another reachable sheep',()=>{
 const {b,t,state,approaches}=setup();b.entities={near:sheep(1,6),far:sheep(2,9)};const goals=(_b,q)=>q.position.x===6?[]:approaches(_b,q);
 const choice=hunt.choose(t,b,state,goals);assert.equal(choice.animal.id,2);assert.equal(choice.status.skipped['no safe approach'],1);hunt.release(b.username);
});
test('sheep ownership, color and lamb restrictions remain enforced',()=>{
 const {b,t,state,approaches}=setup();state.world.first_night.stations=true;const e=sheep(1,2);e.metadata[2]='FirstNightother';b.entities={e};assert.equal(hunt.choose(t,b,state,approaches).animal,null);
 state.world.first_night.stations=false;e.metadata[registry.entitiesByName.sheep.metadataKeys.indexOf('baby')]=true;assert.equal(hunt.choose(t,b,state,approaches).status.skipped['not an adult unsheared white sheep'],1);
});
