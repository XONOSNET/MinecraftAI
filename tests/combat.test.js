const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const combat=require('../controller/combat'),{motorPlan}=require('../controller/locomotion');
function fixture(){
 const task={kind:'combat',weapon:'iron_sword',armor:null,shield:false,mobs:['zombie'],mob_label:'LabCombat0-1',bounds:[-10,10,-5,5],kill_target:1,min_health:4};
 const enemy={id:2,name:'zombie',position:new Vec3(2,181,0),metadata:{2:{text:'LabCombat0-1'}},isValid:true};
 const attacks=[],equips=[],slots=[];
 const bot={entity:{position:new Vec3(0,181,0),yaw:-Math.PI/2},health:20,entities:{2:enemy},world:{raycast:()=>null},inventory:{slots,items:()=>[{name:'iron_sword'}]},heldItem:null,lookAt:async()=>{},deactivateItem:()=>{},activateItem:()=>{},equip:async(i,slot)=>{equips.push(slot);bot.heldItem=i;},attack:e=>attacks.push(e.id)};
 return {bot,task,enemy,attacks,equips};
}
test('teacher equips before fighting and policy observation remains twelve features',async()=>{
 const {bot,task,equips}=fixture(),runtime={};let s=combat.observe(bot,task,runtime,10000);
 assert.equal(s.extra.length,12);assert.equal(combat.teacher(s,task),5);
 assert.equal(await combat.interact(bot,task,s,runtime,5,{},10000),false);
 await combat.interact(bot,task,s,runtime,5,{combat_practice:true},10000);assert.deepEqual(equips,['hand']);
 s=combat.observe(bot,task,runtime,10000);assert.equal(combat.teacher(s,task),6);
});
test('attacks respect cooldown, line of sight, ownership, range and weapon',async()=>{
 const {bot,task,enemy,attacks}=fixture(),runtime={};bot.heldItem={name:'iron_sword'};
 let s=combat.observe(bot,task,runtime,10000);
 await combat.interact(bot,task,s,runtime,6,{combat_practice:true},10000);
 await combat.interact(bot,task,s,runtime,6,{combat_practice:true},10100);assert.equal(attacks.length,1);
 bot.world.raycast=()=>({intersect:new Vec3(.1,182,0)});
 await combat.interact(bot,task,s,runtime,6,{combat_practice:true},11000);assert.equal(attacks.length,1);
 enemy.name='player';await combat.interact(bot,task,s,runtime,6,{combat_practice:true},12000);assert.equal(attacks.length,1);
});
test('kills require a tracked attacked monster death and cannot be counted twice',()=>{
 const {task,enemy}=fixture(),runtime={};combat.death(enemy,task,runtime);assert.equal(runtime.kills,undefined);
 runtime.attacked=new Set([2]);combat.death(enemy,task,runtime);combat.death(enemy,task,runtime);assert.equal(runtime.kills,1);
 assert.equal(combat.reached(task,{health:20,inside:true,y:181,kills:1,hits:1,weapon_equipped:true,armor_equipped:true}),true);
});
test('combat spacing reverses only onto checked safe ground and never uses jump action',()=>{
 const permissions={move:true,turn:true,jump:true};
 assert.equal(motorPlan(3,permissions,{kind:'combat'},{rearSafe:true},0).back,true);
 assert.equal(motorPlan(3,permissions,{kind:'combat'},{rearSafe:false},0).back,false);
 assert.equal(motorPlan(3,permissions,{kind:'combat'},{rearSafe:true},0).jump,false);
});


test('hunting neither backs off during cooldown nor circles and follows during attack cooldown',()=>{
 const {bot,task}=fixture();task.mobs=['cow'];task.combat_style='hunt';
 const sensed={gear:{ready:true},enemy:{},sight:true,distance:1,angle:0,cooldown:.5};
 assert.equal(combat.teacher(sensed,task),4);
 const p={move:true,turn:true,jump:true};
 for(const action of [0,3,4,6]){const plan=motorPlan(action,p,task,{...sensed,distance:3.5},0);assert.equal(plan.forward,true);assert.equal(plan.back,false);}
 assert.equal(motorPlan(4,p,task,sensed,0).forward,false);
 assert.equal(combat.attackDelay({weapon:'stone_axe'}),1250);assert.equal(combat.attackDelay({weapon:'iron_sword'}),625);
});

test('successive swings happen at weapon readiness without an additional combat delay',async()=>{
 const {bot,task,attacks}=fixture();bot.heldItem={name:'iron_sword'};task.combat_style='hunt';const runtime={};
 await combat.interact(bot,task,combat.observe(bot,task,runtime,10000),runtime,6,{combat_practice:true},10000);
 assert.equal(await combat.interact(bot,task,combat.observe(bot,task,runtime,10624),runtime,6,{combat_practice:true},10624),false);
 assert.equal(await combat.interact(bot,task,combat.observe(bot,task,runtime,10625),runtime,6,{combat_practice:true},10625),true);
 assert.equal(attacks.length,2);
});

test('critical attacks jump once and strike while falling rather than on the upward swing',async()=>{
 const {bot,task,enemy}=fixture();bot.heldItem={name:'iron_sword'};bot.entity.onGround=true;bot.entity.velocity=new Vec3(0,0,0);
 bot.blockAt=p=>({name:p.y<181?'stone':'air',boundingBox:p.y<181?'block':'empty'});
 const controls={};bot.setControlState=(k,v)=>controls[k]=v;let hit=null;bot.attack=()=>hit={falling:bot.entity.velocity.y<0,ground:bot.entity.onGround};
 let steps=0;const physics=setInterval(()=>{if(controls.jump||bot.entity.onGround===false){steps++;bot.entity.onGround=false;bot.entity.velocity.y=steps>3?-.2:.2;bot.entity.position.y+=bot.entity.velocity.y;}},20);
 const runtime={};try{assert.equal(await combat.interact(bot,task,combat.observe(bot,task,runtime),runtime,6,{combat_practice:true}),true);}finally{clearInterval(physics);}
 assert.deepEqual(hit,{falling:true,ground:false});assert.equal(runtime.criticalAttempts,1);assert.equal(controls.jump,false);assert.equal(bot.labCriticalAttack,null);
});

test('critical jumping is suppressed under roofs, near edges and while hunting',()=>{
 const {bot,task}=fixture(),{safeJump}=require('../controller/critical_attack');bot.setControlState=()=>{};bot.entity.onGround=true;
 bot.blockAt=p=>({name:p.y<181?'stone':'air',boundingBox:p.y<181?'block':'empty'});assert.equal(safeJump(bot,task),true);
 const floor=bot.blockAt;bot.blockAt=p=>p.y===183?{name:'stone',boundingBox:'block'}:floor(p);assert.equal(safeJump(bot,task),false);
 bot.blockAt=p=>p.x<0?{name:'air',boundingBox:'empty'}:floor(p);assert.equal(safeJump(bot,task),false);
 bot.blockAt=floor;task.combat_style='hunt';bot.heldItem={name:'iron_sword'};assert.equal(combat.observe(bot,task,{}).prepareCritical,false);
});


test('hostile jump wind-up overlaps the final cooldown instead of delaying until after readiness',()=>{
 const {bot,task}=fixture();bot.heldItem={name:'iron_sword'};bot.entity.onGround=true;bot.setControlState=()=>{};
 bot.blockAt=p=>({name:p.y<181?'stone':'air',boundingBox:p.y<181?'block':'empty'});
 const sensed=combat.observe(bot,task,{lastAttack:10000},10300);
 assert.ok(sensed.cooldown>0);assert.equal(sensed.prepareCritical,true);assert.equal(combat.teacher(sensed,task),6);
 task.combat_style='hunt';const hunting=combat.observe(bot,task,{lastAttack:10000},10300);
 assert.equal(hunting.prepareCritical,false);assert.notEqual(combat.teacher(hunting,task),6);
});
