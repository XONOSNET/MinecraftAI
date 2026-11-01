const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {reference,references}=require('../controller/placement_reference');
function fixture(entries){
 const cells=new Map(Object.entries(entries)),bot={entity:{position:new Vec3(.5,64,2.5),onGround:true,yaw:0,pitch:0},players:{},inventory:{items:()=>[{name:'oak_planks',count:10}]},async look(y,p){this.entity.yaw=y;this.entity.pitch=p;},blockAt(p){p=p.floored();const name=cells.get(p.toString())||'air';return {name,position:p,boundingBox:name==='air'?'empty':'block'};}};
 bot.world={raycast(eye,dir,length){for(let d=0;d<=length;d+=.005){const block=bot.blockAt(eye.plus(dir.scaled(d)));if(block.boundingBox==='block')return block;}return null;}};
 return {bot,cells};
}

test('a supporting top face above eye level is rejected in favor of a visible side face',()=>{
 const {bot}=fixture({'(0, 65, 0)':'oak_planks','(0, 66, -1)':'oak_planks'});
 const ref=reference(bot,{x:0,y:66,z:0});assert.ok(ref);assert.deepEqual(ref.block.position,new Vec3(0,66,-1));assert.ok(ref.face.equals(new Vec3(0,0,1)));
});

test('support faces behind intervening blocks, out of reach or interactive are excluded',()=>{
 const {bot}=fixture({'(0, 63, 0)':'stone','(0, 64, 1)':'stone'});
 assert.equal(reference(bot,{x:0,y:64,z:0},{visibleOnly:true}),null);
 bot.entity.position=new Vec3(12,64,.5);assert.equal(reference(bot,{x:0,y:64,z:0}),null);
 const b=fixture({'(0, 63, 0)':'furnace'}).bot;assert.equal(reference(b,{x:0,y:64,z:0}),null);
});

test('a refused support face is not retried before another visible face, and placement must verify',async()=>{
 const {bot,cells}=fixture({'(0, 63, 0)':'stone','(0, 64, -1)':'oak_planks'}),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher');
 const sync=inventory.sync,equip=inventory.equip,calls=[];inventory.sync=async()=>{};inventory.equip=async()=>{};
 bot._placeBlockWithOptions=async(block,face)=>{calls.push(block.position.toString());if(calls.length===1)throw Error('Server refused placement');cells.set(block.position.plus(face).toString(),'oak_planks');};
 const t=new HutTeacher();Object.assign(t,{plot:{x:0,y:64,z:0},phase:'build',campPlots:[]});
 try{await t.place(bot,{x:0,y:64,z:0},'oak_planks');assert.deepEqual(calls,['(0, 63, 0)','(0, 64, -1)']);assert.equal(bot.blockAt(new Vec3(0,64,0)).name,'oak_planks');}
 finally{inventory.sync=sync;inventory.equip=equip;}
});

test('an unchanged target after placement is not reported as success',async()=>{
 const {bot}=fixture({'(0, 63, 0)':'stone'}),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher');
 const sync=inventory.sync,equip=inventory.equip;inventory.sync=async()=>{};inventory.equip=async()=>{};let calls=0;bot._placeBlockWithOptions=async()=>{calls++;};
 const t=new HutTeacher();Object.assign(t,{plot:{x:0,y:64,z:0},phase:'build',campPlots:[]});
 try{await assert.rejects(t.place(bot,{x:0,y:64,z:0},'oak_planks'),{code:'BUILD_OBSTRUCTED'});assert.equal(calls,1);assert.deepEqual(t.lastNavigation.placement_failure.target,[0,64,0]);assert.equal(t.lastNavigation.placement_failure.rejected_faces.length,1);}
 finally{inventory.sync=sync;inventory.equip=equip;}
});
