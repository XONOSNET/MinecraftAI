const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{WorldNavigation,privatePlotCell}=require('../controller/world_navigation'),combat=require('../controller/combat');
function flat(){return {username:'LabAI0',players:{},entity:{position:new Vec3(4.5,64,.5),onGround:true},blockAt(p){const q=p.floored();return {name:q.y<64?'stone':'air',position:q,boundingBox:q.y<64?'block':'empty',getProperties:()=>({})};}};}
test('camp routes go around another home even when its open interior would be shorter',()=>{
 const b=flat(),own={x:0,y:64,z:0},other={x:10,y:64,z:0};
 const plan=new WorldNavigation().plan(b,[16.5,64.1,.5],{plot:own,plots:[own,other],bounds:[-30,30,-30,30]});
 assert.equal(plan.blocked,false);assert.ok(plan.path.every(q=>!privatePlotCell([Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])],other)));
 assert.ok(plan.path.some(q=>q[2]<-3||q[2]>4));
});
test('a bot already in a foreign room commits to that exit through the threshold',()=>{
 const b=flat(),own={x:0,y:64,z:0},other={x:10,y:64,z:0},nav=new WorldNavigation();b.entity.position=new Vec3(10.5,64,.5);
 const original=b.blockAt;b.blockAt=p=>p.x===10&&p.y===64&&p.z===-3?{name:'oak_door',position:p,getProperties:()=>({open:true})}:original(p);
 let plan=nav.plan(b,[.5,64.1,.5],{plot:own,plots:[own,other],bounds:[-30,30,-30,30],now:1000});
 assert.deepEqual(nav.status.target,[10.5,64.1,-4.5]);assert.equal(plan.portal,other);
 b.entity.position=new Vec3(10.5,64,-2.2);assert.equal(nav.portalFor(b,[.5,64.1,.5],own,[own,other]),other);
 b.entity.position=new Vec3(10.5,64,-4.5);assert.equal(nav.portalFor(b,[.5,64.1,.5],own,[own,other]),own);
});
test('steady progress retains the route instead of periodically changing aisles',()=>{
 const b=flat(),nav=new WorldNavigation();nav.plan(b,[20.5,64.1,.5],{bounds:[-30,30,-30,30],now:1000});
 b.entity.position.x=5.5;nav.plan(b,[20.5,64.1,.5],{bounds:[-30,30,-30,30],now:3500});nav.plan(b,[20.5,64.1,.5],{bounds:[-30,30,-30,30],now:4000});assert.equal(nav.replanned,false);
 nav.plan(b,[20.5,64.1,.5],{bounds:[-30,30,-30,30],now:7000});assert.equal(nav.replanned,true);
});
test('hunting respects the locked animal even if a neighbors animal is closer',()=>{
 const b=flat(),task={mobs:['sheep'],mob_label:'FirstNightLabAI0',target_id:2,bounds:[-30,30,-30,30],min_y:60,max_y:70};
 const other={id:1,name:'sheep',position:new Vec3(5,64,0),metadata:{2:'FirstNightLabAI1'}},own={id:2,name:'sheep',position:new Vec3(8,64,0),metadata:{2:'FirstNightLabAI0'}};
 b.entities={other,own};assert.equal(combat.target(b,task),own);assert.equal(combat.ownedTarget(other,task),false);
 b.entities={other};assert.equal(combat.target(b,task),null);
});

test('remembered solid resources do not crowd reachable scouting ground out of the search',async()=>{
 const {explore}=require('../controller/first_night'),{WildernessMemory}=require('../controller/wilderness_memory');
 const b=flat(),base=b.blockAt;b.entity.position=new Vec3(.5,64,.5);
 const resources=Array.from({length:24},(_,i)=>({kind:'wood',position:[12+i,64,12]}));
 b.blockAt=p=>p.y===64&&p.z===12&&p.x>=12&&p.x<36?{name:'oak_log',boundingBox:'block',position:p,getProperties:()=>({})}:base(p);
 const t={wilderness:{memory:new WildernessMemory({resources}),searches:0},walk:async(_b,_m,goal)=>{t.destination=goal;return false;}};
 await explore(t,b,{pause(){}},{world:{bounds:[-50,50,-50,50],index:0}},null,null,null,()=>64,'wood');
 assert.ok(t.destination,'a reachable approach or frontier must be selected');assert.notEqual(b.blockAt(new Vec3(...t.destination).floored()).name,'oak_log');
 const first=t.destination.map(Math.floor).join(',');t.wilderness.searchPlanAt=0;await explore(t,b,{pause(){}},{world:{bounds:[-50,50,-50,50],index:0}},null,null,null,()=>64,'wood');assert.notEqual(t.destination.map(Math.floor).join(','),first,'do not immediately select the same rejected approach');
});

test('a precise waypoint crossed between decisions advances instead of turning back',()=>{
 const b=flat(),base=b.blockAt;b.entity.position=new Vec3(.1,64,.5);b.blockAt=p=>p.x===0&&p.y===64&&p.z===1?{name:'stone',position:p,boundingBox:'block',getProperties:()=>({})}:base(p);
 const nav=new WorldNavigation();let planned=nav.plan(b,[6.5,64.1,.5],{bounds:[-20,20,-20,20],now:1000});assert.equal(nav.path[0].centering,true);
 b.entity.position.x=.7;planned=nav.plan(b,[6.5,64.1,.5],{bounds:[-20,20,-20,20],now:1200});assert.ok(nav.path[0][0]>=1.5);assert.ok(planned.cue[0]>=1.5);assert.ok(!nav.path[0].centering);
});

test('an unfinished neighboring plot exits through its empty doorway instead of waiting inside',()=>{
 const b=flat(),own={x:0,y:64,z:10},other={x:0,y:64,z:0},nav=new WorldNavigation();b.entity.position=new Vec3(.75,64,-1.4);
 let plan=nav.plan(b,[.5,64.1,5.5],{plot:own,plots:[other,own],bounds:[-30,30,-30,30],now:1000});assert.deepEqual(nav.status.target,[.5,64.1,-4.5]);assert.equal(plan.arrived,false);assert.equal(plan.blocked,false);
 b.entity.position=new Vec3(.5,64,-4.5);plan=nav.plan(b,[.5,64.1,5.5],{plot:own,plots:[other,own],bounds:[-30,30,-30,30],now:2000});assert.equal(nav.exitPlot,null);assert.deepEqual(nav.status.target,[.5,64.1,5.5]);
});
