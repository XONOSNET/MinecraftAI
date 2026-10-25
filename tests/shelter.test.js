const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const cabin=require('../controller/shelter'),{teacherAction,reached}=require('../controller/tasks'),{motorPlan}=require('../controller/locomotion');
function fixture(){let open=false,missing=false;const task={kind:'shelter',enclosed:true,shelter_box:[0,6,-3,3],shelter_door:[0,0],shelter_hold_seconds:2};
const bot={entity:{position:new Vec3(2,181,.5)},canSeeBlock:()=>true,blockAt(p){if(p.x===0&&p.z===0&&[181,182].includes(p.y))return {name:'oak_door',position:p,getProperties:()=>({open})};return {name:'stone',boundingBox:missing&&p.x===6&&p.y<184?'empty':'block',position:p};},activateBlock:async()=>{open=!open},look:async()=>{}};
return {bot,task,setOpen:v=>open=v,setMissing:v=>missing=v};}
test('secure shelter needs intact enclosure, a closed door, full entry and a continuous hold',()=>{
 const {bot,task,setOpen,setMissing}=fixture(),runtime={};
 assert.equal(cabin.state(bot,task,runtime,1000).seconds,0);assert.equal(cabin.state(bot,task,runtime,3000).seconds,2);
 setOpen(true);assert.equal(cabin.state(bot,task,runtime,3100).secure,false);
 setOpen(false);assert.equal(cabin.state(bot,task,runtime,3200).seconds,0);
 setMissing(true);assert.equal(cabin.state(bot,task,runtime,5000).secure,false);
 setMissing(false);bot.entity.position=new Vec3(.7,181,.5);assert.equal(cabin.state(bot,task,runtime,6000).secure,false);
});
test('teacher explicitly closes the door and waits inside; closing never walks forward',async()=>{
 const {bot,task,setOpen}=fixture(),runtime={};setOpen(true);const shelter=cabin.state(bot,task,runtime,1000);
 assert.equal(shelter.closeDoor,true);assert.ok(shelter.door);
 const sensed={door:shelter.door,closeShelterDoor:true,shelter};assert.equal(teacherAction(bot,task,sensed,runtime,0),5);
 assert.equal(motorPlan(5,{move:true,turn:true},task,sensed,0).forward,false);
 assert.equal(await cabin.interact(bot,task,sensed,{}),false);
 await cabin.interact(bot,task,sensed,{open_practice_doors:true});assert.equal(cabin.state(bot,task,runtime,1100).closed,true);
 assert.equal(teacherAction(bot,task,{shelter:{secure:true}},runtime,0),4);
 assert.equal(reached(task,{health:20,inside:true,y:181,shelter_secure:true,shelter_seconds:1}),false);
 assert.equal(reached(task,{health:20,inside:true,y:181,shelter_secure:true,shelter_seconds:2}),true);
});

test('a shelter entry that drifts past its approach point continues inward instead of going back outside',()=>{
 const {createDoorway}=require('../controller/doorway'),door=createDoorway();
 const d={id:'cabin',axis:'x',plane:.5,center:.59375,open:true,y:181};
 const sensed={enclosedShelter:true,doorway:d,canWalk:()=>true};
 door.update({forward:true},sensed,{x:-2,y:181,z:.6},-Math.PI/2,0,{move:true,turn:true});
 const plan=door.update({forward:true},sensed,{x:1.071,y:181,z:.668},-Math.PI/2,100,{move:true,turn:true});
 assert.equal(plan.forward,true);assert.ok(plan.moveTarget.x>1.071);
});

test('shelter entry also continues inward if it passed the outside alignment stop',()=>{
 const {createDoorway}=require('../controller/doorway'),door=createDoorway();const d={id:'cabin',axis:'x',plane:.5,center:.59375,open:true,y:181};
 const sensed={enclosedShelter:true,doorway:d,canWalk:()=>true};
 door.update({forward:true},sensed,{x:-2,y:181,z:.6},-Math.PI/2,0,{move:true,turn:true});
 const plan=door.update({forward:true},sensed,{x:-.1,y:181,z:.59},-Math.PI/2,100,{move:true,turn:true});assert.equal(plan.forward,true);assert.ok(plan.moveTarget.x>-.1);
});
