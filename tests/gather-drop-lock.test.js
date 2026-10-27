const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{HutTeacher}=require('../controller/hut_teacher');
for(const kind of ['high','ignored','collectible'])test('exhausted-tree lock handles '+kind+' wood drops',async()=>{
 const registry=require('prismarine-registry')('1.21.4'),Item=require('prismarine-item')(registry),metadata=[];metadata[registry.entitiesByName.item.metadataKeys.indexOf('item')]=Item.toNotch(new Item(registry.itemsByName.oak_log.id,1));
 const item={id:901,name:'item',position:new Vec3(.5,kind==='high'?70:64,.5),metadata};
 const b={username:'LabAI0',registry,health:20,food:20,players:{},entities:{item},game:{gameMode:'survival'},entity:{position:new Vec3(.5,64,.5),yaw:0,onGround:true},inventory:{items:()=>[]},world:{raycast:()=>null},canDigBlock:()=>false,blockAt(p){const q=p.floored(),log=q.x===4&&q.y===64&&q.z===0,solid=q.y<64||log;return {name:log?'oak_log':solid?'stone':'air',position:q,boundingBox:solid?'block':'empty',getProperties:()=>({})};}};
 const t=new HutTeacher(),motor={pause(){}},state={run:'world-drop-lock',world:{bounds:[-40,40,-40,40],mission:'first_night',first_night:{trees:true},driver:'teacher',index:0}},api=async()=>({}),tasks={createRuntime:()=>({})};
 await t.tick(b,motor,state,api,null,tasks);
 Object.assign(t,{phase:'gather',started:Date.now(),lastReport:Date.now(),inventoryAt:Date.now(),resourceAt:Date.now(),plot:{x:-10,y:64,z:0},resources:[new Vec3(4,64,0)],tree:'0,0',treeApproach:[1.5,64.1,.5]});t.wilderness.bootstrap=true;
 if(kind==='ignored')t.ignoredDrops.set(item.id,Date.now()+5000);
 t.walk=async(_b,_m,goal)=>{t.testGoal=goal;};
 await t.tick(b,motor,state,api,null,tasks);
 if(kind==='collectible')assert.equal(t.tree,'0,0','collect nearby ground drops before changing trees');else assert.equal(t.tree,'4,0','release the depleted tree and select the reachable tree');
 assert.notEqual(t.phase,'stopped',t.error);
});
