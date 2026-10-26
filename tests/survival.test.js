const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),combat=require('../controller/combat'),survival=require('../controller/survival');
test('world combat accepts only the named owned threat within the camp height and bounds',()=>{
 const task={mobs:['husk'],mob_label:'WorldThreatLabAI0',bounds:[100,200,100,200],min_y:62,max_y:70};
 const e={name:'husk',position:new Vec3(150,64,150),metadata:{2:'WorldThreatLabAI0'}};
 assert.equal(combat.ownedTarget(e,task),true);
 assert.equal(combat.ownedTarget({...e,metadata:{2:'WorldThreatLabAI1'}},task),false);
 assert.equal(combat.ownedTarget({...e,position:new Vec3(150,71,150)},task),false);
 assert.equal(combat.ownedTarget({...e,position:new Vec3(201,64,150)},task),false);
 // Basics retains its original practice height restriction.
 assert.equal(combat.ownedTarget(e,{...task,min_y:undefined,max_y:undefined}),false);
});
test('world lesson animals exclude unowned livestock and completed beds require a two-block check',async()=>{
 const cow={id:1,name:'cow',position:new Vec3(1,64,0),metadata:{2:'LabAI0 lesson cow'}},other={...cow,id:2,metadata:{2:'LabAI1 lesson cow'}};
 const b={entity:{position:new Vec3(0,64,0)},entities:{cow,other}};
 assert.equal(survival.lessonAnimal(b,'LabAI0 lesson ','cow'),cow);
 assert.equal(survival.lessonAnimal(b,'LabAI2 lesson ','cow'),undefined);
 const calls=[],teacher={phase:'survival_finish',home:{position:[1,64,0]},plot:{x:0,y:64,z:0},survival:{},lastProgress:0};
 b.blockAt=()=>({name:'air',getProperties:()=>({open:false})});
 await assert.rejects(()=>survival.tick(teacher,b,{pause(){}},{world:{}},async(...args)=>calls.push(args)),/bed home is missing/);
 assert.equal(calls.length,0);assert.notEqual(teacher.phase,'complete');
});
test('a visible owned threat blocking the doorway starts defense without waiting to walk through it',async()=>{
 const enemy={id:2,name:'husk',position:new Vec3(.5,64,-1.5),metadata:{2:'WorldThreatLabAI0'}};
 const b={health:20,inventory:{slots:[]},entity:{position:new Vec3(.5,64,.5)},entities:{enemy},world:{raycast:()=>null}},t={phase:'survival_defend_exit',plot:{x:0,y:64,z:0},survival:{threat:{label:'WorldThreatLabAI0'}},walk(){throw Error('Should defend instead of walking through the monster');}};
 await survival.tick(t,b,{pause(){}},{world:{bounds:[-20,20,-20,20]}});
 assert.equal(t.phase,'survival_defend');
});
