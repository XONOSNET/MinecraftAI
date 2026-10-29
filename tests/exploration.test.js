const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{Exploration,release}=require('../controller/exploration');
function bot(name='explore'){return {username:name,players:{},entity:{position:new Vec3(.5,64,.5),onGround:true},blockAt(p){const q=p.floored();return {position:q,name:q.y<64?'stone':'air',boundingBox:q.y<64?'block':'empty'};}};}
const world={bounds:[-80,80,-80,80],index:0,run:'survey-test'};

test('remembered wool is checked before unknown terrain even after repeated visits',async()=>{
 const b=bot('wool-memory'),e=new Exploration(),known=[24.5,64.1,.5];
 for(let i=0;i<20;i++){e.observe(new Vec3(24.5,64,.5));e.observe(new Vec3(.5,64,.5));}
 const goal=await e.choose(b,world,()=>64,[known],'wool');assert.deepEqual([...goal],known);release(b.username);
 e.finish(b,'wool',known);const next=await e.choose(b,world,()=>64,[known],'wool');assert.notDeepEqual([...next],known);release(b.username);
});
test('survey goes beyond depleted local patches into farther loaded terrain',async()=>{
 const b=bot(),e=new Exploration();
 for(let x=-20;x<=20;x+=12)for(let z=-20;z<=20;z+=12)e.finish(b,'wood',[x,64,z]);
 const g=await e.choose(b,world,()=>64,[],'wood');assert.ok(g);assert.ok(Math.hypot(g[0],g[2])>20);assert.ok(g[0]>-77&&g[0]<76);release(b.username);
});
test('shared search reservations spread independent bots across different patches',async()=>{
 const a=bot('exploreA'),b=bot('exploreB'),ea=new Exploration(),eb=new Exploration();
 const x=await ea.choose(a,world,()=>64,[],'wood'),y=await eb.choose(b,world,()=>64,[],'wood');
 assert.ok(Math.hypot(x[0]-y[0],x[2]-y[2])>=12);release(a.username);release(b.username);
});
test('failed destinations rotate out, so later planning checks the next candidates',async()=>{
 const b=bot(),e=new Exploration();const first=await e.choose(b,world,()=>64,[],'stone');e.reject(b,first);
 const second=await e.choose(b,world,()=>64,[],'stone');assert.notDeepEqual(first,second);release(b.username);
});
test('unknown terrain and private houses never become survey goals',async()=>{
 const b=bot(),e=new Exploration();assert.equal(await e.choose(b,world,()=>null,[],'wood'),null);
 const g=await e.choose(b,{...world,plots:[{x:-2,z:-2}]},()=>64,[],'wood');assert.ok(Math.abs(g[0]+1.5)>=4.5||Math.abs(g[2]+1.5)>=5.5);release(b.username);
});
test('coverage records actual cell transitions and retains a bounded scalar report',()=>{
 const e=new Exploration();e.observe(new Vec3(0,64,0));e.observe(new Vec3(1,64,1));assert.equal(e.visits.size,1);
 e.observe(new Vec3(13,64,0));assert.equal(e.visits.size,2);const s=e.snapshot(new Vec3(13,64,0),{x:0,z:0});assert.equal(s.visited_cells,2);assert.equal(s.home_distance,13);assert.equal(s.goal,null);
});
