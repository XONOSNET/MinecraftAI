const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),night=require('../controller/first_night'),house=require('../controller/house');
for(const scenario of ['overlap','moving','drift while crafting','resting gravity'])test('early workbench checks '+scenario+' before placement',async()=>{
 const plot={x:0,y:64,z:0},pos=house.point(plot,'table'),stance=new Vec3(pos.x+1.8,pos.y+.1,pos.z+.5),b={entity:{position:scenario==='overlap'?new Vec3(pos.x+1.28,pos.y,pos.z+.3):new Vec3(stance.x,pos.y,stance.z),velocity:new Vec3(scenario==='moving'?-.08:0,scenario==='resting gravity'?-.0784:0,0),onGround:true},inventory:{items:()=>[{name:'oak_log',count:4}]}};
 let walks=0,crafts=0,places=0,pauses=0;const t={phase:'night_bootstrap',plot,navigator:{},walk:async()=>{walks++;},craft:async()=>{crafts++;b.entity.position.x=pos.x+1.1;},place:async()=>{places++;}};const state={world:{mission:'first_night',first_night:{}}};night.init(t,state.world);
 await night.tick(t,b,{pause(){pauses++;}},state,null,null,null,null);
 assert.equal(places,0);if(scenario==='overlap'){assert.equal(walks,1);assert.equal(crafts,0);}else if(scenario==='moving'){assert.equal(pauses,1);assert.equal(crafts,0);}else{assert.equal(crafts,1);assert.equal(t.navigator.lastPlan,-Infinity);}
});
