const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const supply=require('../controller/build_supply'),{HutTeacher}=require('../controller/hut_teacher');
function fixture(){
 const items=[],cells=new Map(),t=new HutTeacher();
 Object.assign(t,{phase:'build',plot:{x:0,y:64,z:0},wilderness:{bootstrap:true,lightingKitReady:true},supplyRun:true,milestones:[],path:[]});
 const b={inventory:{items:()=>items},blockAt:p=>({name:cells.get(p.toString())||'air'})};
 // A partially built real blueprint: only twelve roof/wall cells remain.
 const blueprint=require('../controller/house').blueprint(t.plot);
 for(const q of blueprint)cells.set(new Vec3(q.x,q.y,q.z).toString(),q.table?'crafting_table':'oak_planks');
 for(const q of blueprint.filter(q=>!q.table).slice(-12))cells.delete(new Vec3(q.x,q.y,q.z).toString());
 items.push({name:'oak_door',count:1});
 const calls=[];t.craft=async(_b,name,n)=>{calls.push([name,n]);const log=items.find(i=>i.name===name.replace('_planks','_log'));items.splice(items.indexOf(log),1);items.push({name,count:n*4});};
 return {t,b,items,cells,calls,motor:{pause(){}},state:{world:{}}};
}
test('lighting-spent construction supplies gather the actual deficit, return and resume the same blueprint',async()=>{
 const {t,b,items,cells,calls,motor,state}=fixture();items.push({name:'oak_planks',count:2});
 const before=[...cells.entries()];assert.equal(t.requiredWood(b),12);
 await supply.tick(t,b,motor,state);assert.equal(t.phase,'gather');assert.equal(t.supplyRun,true);
 assert.equal(t.woodReady(b),false,'two planks cannot finish the remaining twelve cells');
 items.push({name:'birch_log',count:2});
 assert.equal(await supply.tick(t,b,motor,state),false);assert.equal(t.woodReady(b),false);
 items.push({name:'spruce_log',count:1});assert.equal(t.woodReady(b),true);
 await supply.tick(t,b,motor,state);assert.equal(t.phase,'build_resupply_return');
 // A survival interruption retains the pending materials and exact return task.
 t.phase='night_burrow';assert.equal(await supply.tick(t,b,motor,state),false);assert.ok(t.buildSupply);
 t.phase='build_resupply_return';let home=false;t.walk=async(_b,_m,goal)=>{assert.deepEqual(goal,[.5,64.1,.5]);return home;};
 await supply.tick(t,b,motor,state);assert.equal(t.phase,'build_resupply_return');
 home=true;await supply.tick(t,b,motor,state);assert.equal(t.phase,'build');assert.equal(t.buildSupply,null);
 await supply.tick(t,b,motor,state);assert.deepEqual(calls,[['birch_planks',2],['spruce_planks',1]]);
 assert.equal(await supply.tick(t,b,motor,state),false,'construction can now place its remaining blocks');
 assert.deepEqual([...cells.entries()],before,'keep all already-built blocks and earned progress');
});
test('carried logs are crafted before requesting wood and complete houses need no supplies',async()=>{
 const {t,b,items,motor,state}=fixture();items.push({name:'cherry_log',count:3});
 await supply.tick(t,b,motor,state);assert.equal(t.phase,'build');assert.equal(t.buildSupply,undefined);
 assert.equal(await supply.tick(t,b,motor,state),false);
 t.requiredWood=()=>0;items.splice(0);assert.equal(await supply.tick(t,b,motor,state),false);
});
