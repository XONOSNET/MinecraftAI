const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {sprintIntent}=require('../controller/sprint'),{createMotor}=require('../controller/locomotion');
function fixture(){const state={},bot={entity:{position:new Vec3(.5,181,.5),yaw:0,onGround:true},food:20,getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v,look:async()=>{},blockAt:p=>({name:p.y===180?'stone':'air',position:p.floored(),boundingBox:p.y===180?'block':'empty',shapes:p.y===180?[[0,0,0,1,1,1]]:[]})};return {bot,state,permissions:{move:true,turn:true,jump:true,sprint:true},plan:{forward:true},sensed:{cueDistance:20,canWalk:()=>true}};}
test('sprint needs a long clear flat path, food, alignment and explicit permission',()=>{
 const {bot,permissions,plan,sensed}=fixture();assert.equal(sprintIntent(bot,permissions,null,plan,sensed,0),true);
 for(const changes of [{frontBlocked:true},{wallAhead:true},{frontHazard:true},{crouchClearance:true},{doorway:{}},{cueDistance:2},{canWalk:()=>false}])assert.equal(sprintIntent(bot,permissions,null,plan,{...sensed,...changes},0),false);
 assert.equal(sprintIntent(bot,permissions,null,plan,sensed,.3),false);bot.food=6;assert.equal(sprintIntent(bot,permissions,null,plan,sensed,0),false);
 bot.food=20;assert.equal(sprintIntent(bot,{...permissions,sprint:false},null,plan,sensed,0),false);
});
test('precision tasks, recovery, jumping, low ceilings and unsupported land never sprint',()=>{
 const {bot,permissions,plan,sensed}=fixture();for(const kind of ['advanced','terrain','expedition','jump','hazard'])assert.equal(sprintIntent(bot,permissions,{kind},plan,sensed,0),false);
 for(const change of [{jump:true},{sneak:true},{back:true},{moveTarget:{}},{label:'Recovering:'}])assert.equal(sprintIntent(bot,permissions,null,{...plan,...change},sensed,0),false);
 const block=bot.blockAt;for(const name of ['water','lava','ice','soul_sand','magma_block']){bot.blockAt=p=>({...block(p),name:p.y===180?name:'air'});assert.equal(sprintIntent(bot,permissions,null,plan,sensed,0),false);}
 bot.blockAt=()=>null;assert.equal(sprintIntent(bot,permissions,null,plan,sensed,0),false);
});
test('combat sprint requires ready equipment and a distant actual opponent',()=>{
 const {bot,permissions,plan,sensed}=fixture(),task={kind:'combat',bounds:[-10,10,-30,30]};
 assert.equal(sprintIntent(bot,permissions,task,plan,{...sensed,enemy:{},distance:10,gear:{ready:true}},0),true);
 assert.equal(sprintIntent(bot,permissions,task,plan,{...sensed,enemy:{},distance:3,gear:{ready:true}},0),false);
});

test('world travel sprints along the straight route despite a one-block next waypoint',()=>{
 const {bot,permissions,plan,sensed}=fixture(),task={kind:'expedition',travel_sprint:true,sprint_path:Array.from({length:12},(_,i)=>[.5,181.1,-i-.5])};
 assert.equal(sprintIntent(bot,permissions,task,{...plan,label:'Following locked route'},{...sensed,cueDistance:1},0),true);
 assert.equal(sprintIntent(bot,permissions,{...task,travel_sprint:false},plan,sensed,0),false);
 assert.equal(sprintIntent(bot,permissions,task,{...plan,label:'Recovering:'},sensed,0),false);
 for(const path of [task.sprint_path.slice(0,3),[[.5,181,-.5],[1.5,181,-.5]],[[.5,182,-.5]]])assert.equal(sprintIntent(bot,permissions,{...task,sprint_path:path},plan,sensed,0),false);
 bot.food=11;assert.equal(sprintIntent(bot,permissions,task,plan,sensed,0),false);
});

test('route sprint length ends at a corner or elevation change instead of using total journey distance',()=>{
 const {routeRunway}=require('../controller/sprint'),{bot}=fixture(),task={travel_sprint:true,sprint_path:[[.5,181,-.5],[.5,181,-1.5],[1.5,181,-1.5],[1.5,181,-20.5]]};
 assert.equal(routeRunway(bot,task),2);
 assert.equal(routeRunway(bot,{...task,sprint_path:[[.5,181,-.5],[.5,180,-1.5],[.5,180,-20.5]]}),1);
});
test('native sprint control stops on pause, stale policy, hunger and a newly unsafe decision',()=>{
 const {bot,state,permissions,sensed}=fixture();let now=0;const motor=createMotor(bot,permissions,{clock:()=>now});
 motor.command(0,null,sensed,0);now=50;motor.tick();assert.equal(state.sprint,true);
 bot.food=6;now+=50;motor.tick();assert.equal(state.sprint,false);
 bot.food=20;motor.command(0,null,sensed,0);now+=50;motor.tick();assert.equal(state.sprint,true);motor.pause();assert.equal(state.sprint,false);
 motor.command(0,null,sensed,0);now+=50;motor.tick();motor.command(0,null,{...sensed,frontHazard:true},0);now+=50;motor.tick();assert.equal(state.sprint,false);
 motor.command(0,null,sensed,0);now+=50;motor.tick();now+=300;motor.tick();assert.equal(state.sprint,true);now+=600;motor.tick();assert.equal(state.sprint,false);now+=500;motor.tick();assert.equal(state.forward,false);
});

test('held sprint checks newly unsafe ground before another policy reply arrives',()=>{
 const {bot,state,permissions,sensed}=fixture();let now=0;const motor=createMotor(bot,permissions,{clock:()=>now});
 motor.command(0,null,sensed,0);now=50;motor.tick();assert.equal(state.sprint,true);
 const original=bot.blockAt;bot.blockAt=p=>({...original(p),name:p.y===180&&p.z<-1?'lava':original(p).name});
 now=150;motor.tick();assert.equal(state.sprint,false);
});
