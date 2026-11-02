const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {HutTeacher}=require('../controller/hut_teacher'),{WorldStall}=require('../controller/world_stall'),{WorldTiming}=require('../controller/world_timing'),night=require('../controller/first_night');
function fixture(){
 const now=Date.now(),b={username:'MortalityTest',health:4.5,food:0,players:{},entities:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},inventory:{items:()=>[]},removeListener(){}};
 const t=new HutTeacher();Object.assign(t,{run:'world-test',phase:'night_recover',started:now,lastProgress:now,lastReport:now,last:b.entity.position.clone(),anchor:b.entity.position.clone(),travelled:0,stall:new WorldStall(),timing:new WorldTiming(now),milestones:[],plot:null,settle:now-1,wilderness:{memory:{observe(){},snapshot(){return {};}}}});
 return {t,b,motor:{pause(){}},state:{run:'world-test',world:{mission:'first_night',bounds:[-20,20,-20,20]}},reports:[]};
}
test('critically injured and starving living bots reach the survival planner instead of being stopped',async ctx=>{
 const f=fixture();let calls=0;ctx.mock.method(night,'interrupt',async()=>{calls++;return true;});
 for(const health of [6,4.5,1]){f.b.health=health;await f.t.tick(f.b,f.motor,f.state,async()=>({}),null,{});assert.equal(f.t.phase,'night_recover');assert.equal(f.t.error,undefined);}
 assert.equal(calls,3);
});
test('zero health ends the world attempt as a death failure',async()=>{
 const f=fixture();f.b.health=0;await f.t.tick(f.b,f.motor,f.state,async(path,r)=>{f.reports.push(r);return {};},null,{});
 assert.equal(f.t.phase,'stopped');assert.equal(f.t.failureCategory,'death');assert.equal(f.reports.at(-1).health,0);assert.equal(f.reports.at(-1).failure_category,'death');
});
test('death stays terminal if respawn or an awaited action changes health and phase',async ctx=>{
 const f=fixture();ctx.mock.method(night,'interrupt',async()=>{assert.equal(f.t.died(f.state.run),true);f.b.health=20;f.t.phase='complete';return true;});
 await f.t.tick(f.b,f.motor,f.state,async(path,r)=>{f.reports.push(r);return {};},null,{});
 assert.equal(f.t.phase,'stopped');assert.equal(f.reports.at(-1).health,0);assert.equal(f.reports.at(-1).failure_category,'death');
});
test('stale deaths and deaths after completed trials do not invalidate another result',()=>{
 const f=fixture();assert.equal(f.t.died('old-run'),false);assert.equal(f.t.phase,'night_recover');f.t.phase='complete';assert.equal(f.t.died(f.state.run),false);
});
