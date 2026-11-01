const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const policy=require('../controller/shelter_policy'),night=require('../controller/first_night'),burrow=require('../controller/emergency_burrow');
function fixture(){
 const b={health:20,food:20,time:{timeOfDay:14000},entities:{},inventory:{slots:[],items:()=>[]},entity:{position:new Vec3(.5,64,.5)},world:{raycast:()=>null}};
 const t={phase:'gather',milestones:['hut'],plot:{x:0,y:64,z:0},path:[],navigator:{lastPlan:0}};night.init(t,{});
 const state={world:{mission:'first_night',first_night:{hostiles:true}}};return {b,t,state};
}
test('unprotected bots seek shelter before damage, including a night with no visible enemy',()=>{
 const {b,state}=fixture();assert.equal(policy.wantsCover(b,state.world),true);
 b.time.timeOfDay=6000;assert.equal(policy.wantsCover(b,state.world),false);
 b.entities.s={name:'skeleton',position:new Vec3(16,64,0)};assert.equal(policy.wantsCover(b,state.world),true);
 b.time.timeOfDay=14000;b.inventory.items=()=>[{name:'wooden_axe'}];assert.equal(policy.wantsCover(b,state.world),true,'a weapon alone does not provide armor for nighttime work');
 b.inventory.slots[5]={name:'leather_helmet'};assert.equal(policy.wantsCover(b,state.world),false);
 b.inventory.items=()=>[];assert.equal(policy.wantsCover(b,state.world),true,'armor alone is not a weapon');
 state.world.first_night.hostiles=false;assert.equal(policy.wantsCover(b,state.world),false);
});

test('daytime lone attackers trigger unarmed self-defense even when a hut exists',async ctx=>{
 const {b,t,state}=fixture();b.time.timeOfDay=6000;b.entities.z={name:'zombie',position:new Vec3(2,64,0)};
 assert.equal(policy.assess(b,state.world).mode,'fight');assert.equal(night.priority(b,t,state.world).kind,'defend');
 let defended=0;ctx.mock.method(require('../controller/survival_defense'),'tick',async()=>{defended++;return true;});
 ctx.mock.method(burrow,'tick',async()=>{throw Error('Manageable daylight fight must precede excavation');});
 assert.equal(await night.interrupt(t,b,{pause(){}},state),true);assert.equal(defended,1);assert.equal(t.phase,'gather');
});
test('underground assessment distinguishes a lone enemy, groups, ranged threats and equipment',()=>{
 const {b,state}=fixture();b.blockAt=()=>({name:'stone'});b.entities.z={name:'zombie',position:new Vec3(2,64,0)};
 let risk=policy.assess(b,state.world);assert.equal(risk.underground,true);assert.equal(risk.mode,'fight','a manageable cave encounter is not decided by surface time');
 b.entities.z2={name:'zombie',position:new Vec3(3,64,0)};assert.equal(policy.assess(b,state.world).mode,'cover');
 b.inventory.items=()=>[{name:'stone_sword'}];assert.equal(policy.assess(b,state.world).mode,'fight');
 b.entities.z3={name:'zombie',position:new Vec3(4,64,0)};assert.equal(policy.assess(b,state.world).mode,'cover');
 b.entities={s:{name:'skeleton',position:new Vec3(10,64,0)}};b.inventory.items=()=>[];assert.equal(policy.assess(b,state.world).mode,'cover');
 b.inventory.items=()=>[{name:'stone_sword'}];b.health=10;assert.equal(policy.assess(b,state.world).mode,'cover');
 b.blockAt=()=>({name:'oak_leaves'});assert.equal(policy.underground(b),false);
 b.blockAt=()=>({name:'oak_planks'});assert.equal(policy.underground(b),false);
});
test('house retreat stays latched through night, equipment changes and daylight threats, then resumes',async ctx=>{
 const {b,t,state}=fixture();ctx.mock.method(burrow,'tick',async()=>false);
 assert.equal(await night.interrupt(t,b,{pause(){}},state),true);assert.equal(t.phase,'night_retreat');assert.equal(t.wilderness.resume,'gather');
 t.phase='night_recover';assert.equal(night.priority(b,t,state.world).kind,'retreat');
 b.inventory.items=()=>[{name:'iron_sword'}];b.inventory.slots[5]={name:'iron_helmet'};
 assert.equal(night.priority(b,t,state.world).kind,'retreat');
 b.time.timeOfDay=6000;b.entities.s={name:'skeleton',position:new Vec3(20,64,0)};assert.equal(night.priority(b,t,state.world).kind,'retreat');
 b.entities={};await night.interrupt(t,b,{pause(){}},state);assert.equal(t.phase,'gather');assert.equal(t.wilderness.shelterWatch,false);
});
test('a sheltered watch closes its door and does not trigger outdoor food searches',async()=>{
 const {b,t,state}=fixture();t.phase='night_recover';Object.assign(t.wilderness,{shelterWatch:true,resume:'night_stone'});b.health=13;b.food=17;
 b.blockAt=()=>null;await night.tick(t,b,{pause(){}},state);
 assert.equal(t.phase,'night_recover');assert.match(t.message,/waiting for daylight/);assert.equal(night.priority(b,t,state.world).kind,'retreat');
});
test('no refuge never falls through to exposed work or combat',async ctx=>{
 const {b,t,state}=fixture();t.milestones=[];
 ctx.mock.method(burrow,'tick',async()=>false);let seeks=0;ctx.mock.method(burrow,'seek',async()=>{seeks++;});
 assert.equal(await night.interrupt(t,b,{pause(){}},state),true);assert.equal(t.phase,'night_seek_cover');assert.equal(seeks,1);
 b.time.timeOfDay=6000;await night.interrupt(t,b,{pause(){}},state);assert.equal(t.phase,'gather');
});
