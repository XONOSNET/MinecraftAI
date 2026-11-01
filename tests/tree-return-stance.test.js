const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {chooseTree}=require('../controller/tree_target'),{proximity}=require('../controller/perception'),{WorldNavigation}=require('../controller/world_navigation');

test('harvesting from a ledge remembers a supported cell center rather than an unsafe fractional return point',()=>{
 const trunk=new Vec3(2,65,0),oldPosition=new Vec3(.532,64,.067);
 const b={username:'ledge-tree',players:{},entity:{id:1,position:oldPosition.clone(),onGround:true,yaw:0},inventory:{items:()=>[]},canDigBlock:()=>true,
  blockAt(p){p=p.floored();const floor=p.z<0?63:64,name=p.equals(trunk)?'oak_log':p.y<floor?'stone':'air';return {name,position:p,boundingBox:name==='air'?'empty':'block'};},world:{raycast:()=>({position:trunk})}};
 const selected=chooseTree(b,[trunk],'2,0',()=>64,'return-stance');
 assert.equal(selected.key,'2,0');assert.deepEqual(selected.approach,[.5,64.1,.5]);
 b.entity.position=new Vec3(.5,64,.5);
 const dx=oldPosition.x-.5,dz=oldPosition.z-.5,heading=Math.atan2(-dx,-dz),distance=Math.hypot(dx,dz);
 assert.equal(proximity(b,{recovery:false}).canWalk(heading,distance),false,'the old return point is rejected by actual full-body support checks');
 const nav=new WorldNavigation(),result=nav.plan(b,selected.approach,{bounds:[-10,10,-10,10]});
 assert.equal(result.arrived,true);assert.equal(result.blocked,false);
});
