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
