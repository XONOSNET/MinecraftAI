const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{inspect,allocate}=require('../controller/site_suitability');
function fixture(){
 const names=['air','stone','coal_ore','iron_ore','oak_log'],b={username:'SiteFixture',players:{},entity:{position:new Vec3(2.5,65.1,2.5)},blockAt(p){const q=p.floored(),name=q.y<=64?'stone':'air';return {position:q,name,boundingBox:name==='air'?'empty':'block'};},game:{minY:0},registry:{blocksByStateId:names.map(name=>({name}))},entities:{a:{name:'sheep',position:new Vec3(2,65,2)},b:{name:'sheep',position:new Vec3(3,65,2)}},world:{getColumn:()=>({sections:[{palette:[1,2,3]},null,null,null,{palette:[4]}],getBlockStateId:p=>p.y<8?1:p.y===8?2:p.y===9?3:p.y===64?4:0})}},world={count:2,bounds:[0,16,0,16]},plots=[{x:2,y:65,z:2},{x:10,y:65,z:10}];return {b,world,plots};
}
test('whole-roster audit measures natural starting stock without modifying inventory or terrain',()=>{const f=fixture(),r=inspect(f.b,f.world,f.plots);assert.equal(r.ok,true);assert.equal(r.complete,true);assert.equal(r.allocated_logs,r.needs.logs);assert.equal(r.counts.sheep,2);});
test('one grove cannot be allocated twice and distant wood cannot provision another plot',()=>{assert.equal(allocate([{x:0,z:0,count:100}],[{x:0,z:0},{x:1,z:1}],60),100);assert.equal(allocate([{x:0,z:0,count:100}],[{x:0,z:0},{x:1000,z:1000}],40),40);});
test('ocean or missing independent plots rejects setup before any bot is deployed',()=>{const f=fixture();const r=inspect(f.b,f.world,[]);assert.equal(r.complete,true);assert.equal(r.ok,false);assert.match(r.reason,/0\/2/);});
test('wood, ore and animal shortages are named instead of pretending the site is supplied',()=>{const f=fixture();f.b.entities={};f.b.world.getColumn=()=>({sections:[{palette:[1]}],getBlockStateId:()=>1});const r=inspect(f.b,f.world,f.plots);assert.equal(r.ok,false);for(const resource of ['logs','coal','iron','sheep','food_animals'])assert.ok(r.reason.includes(resource));});
test('unloaded resource data remains unknown rather than evidence of absent supplies',()=>{const f=fixture();f.world.bounds=[0,64,0,16];const column=f.b.world.getColumn();f.b.entities={};f.b.world.getColumn=(x)=>x===0?column:null;const r=inspect(f.b,f.world,f.plots);assert.equal(r.ok,false);assert.equal(r.complete,false);assert.match(r.reason,/Waiting/);});

test('sufficient stock cannot pass when the plots have no checked path to a tree',()=>{const f=fixture();f.b.blockAt=p=>({position:p.floored(),name:'water',boundingBox:'empty',getProperties:()=>({level:0})});const r=inspect(f.b,f.world,f.plots);assert.equal(r.ok,false);assert.equal(r.reachable_wood_plots,0);assert.match(r.reason,/checked tree approaches/);});

test('a finalized setup rejection cannot later release a partial roster when sheep appear',ctx=>{
 const gate=require('../controller/hut_teacher'),audit=require('../controller/site_suitability');let now=1000,calls=0,ready=false;
 ctx.mock.method(Date,'now',()=>now);
 ctx.mock.method(audit,'inspect',()=>{calls++;return {ok:ready,complete:true,reason:ready?'Resources checked':'Site lacks sheep 7/8'};});
 const b={players:{},entity:{position:new Vec3(1.5,65,1.5)},blockAt(p){p=p.floored();const name=p.y<65?'stone':'air';return {position:p,name,boundingBox:name==='air'?'empty':'block'};}};
 const world={count:2,index:0,mission:'first_night',bounds:[0,48,0,48]},run='cohort-final-rejection';
 assert.equal(gate.claimPlot(b,world,run),null);assert.equal(calls,1);
 gate.rejectSiteAudit(run);ready=true;now+=5000;
 assert.equal(gate.claimPlot(b,{...world,index:1},run),null);assert.equal(calls,1,'final rejected audit must not be replaced by a late positive observation');
 assert.ok(gate.claimPlot(b,world,'cohort-next-comparison'),'fresh runs still survey normally');
 assert.ok(gate.claimPlot(b,{...world,index:1},'cohort-next-comparison'));
});

test('an undecided setup audit may refresh and release the full roster before rejection',ctx=>{
 const gate=require('../controller/hut_teacher'),audit=require('../controller/site_suitability');let now=1000,ready=false;
 ctx.mock.method(Date,'now',()=>now);ctx.mock.method(audit,'inspect',()=>({ok:ready,complete:true,reason:'Resource survey'}));
 const b={players:{},entity:{position:new Vec3(1.5,65,1.5)},blockAt(p){p=p.floored();const name=p.y<65?'stone':'air';return {position:p,name,boundingBox:name==='air'?'empty':'block'};}};
 const world={count:2,index:0,mission:'first_night',bounds:[0,48,0,48]},run='cohort-pending-survey';
 assert.equal(gate.claimPlot(b,world,run),null);ready=true;now+=3000;
 assert.ok(gate.claimPlot(b,world,run));gate.rejectSiteAudit(run);
 assert.ok(gate.claimPlot(b,{...world,index:1},run),'positive cohort decisions remain usable for all bots');
});

test('pending livestock visibility uses survey wording while preserving the final shortage and quotas',()=>{
 const f=fixture();delete f.b.entities.b;const r=inspect(f.b,f.world,f.plots);
 assert.equal(r.ok,false);assert.equal(r.counts.sheep,1);assert.equal(r.needs.sheep,2);
 assert.match(r.survey_reason,/Checking natural starting resources.*sheep 1\/2 observed.*survey still in progress/);
 assert.match(r.reason,/Site lacks starting resources.*sheep 1\/2/);
 f.b.entities.b={name:'sheep',position:new Vec3(3,65,2)};assert.equal(inspect(f.b,f.world,f.plots).ok,true);
});
