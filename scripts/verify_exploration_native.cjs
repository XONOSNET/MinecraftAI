// Read-only frontier and exposed-stone checks on the current natural site.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),{surface}=require('../controller/hut_teacher'),{Exploration,release}=require('../controller/exploration'),resources=require('../controller/resource_scan');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabExploreCheck',version:'1.21.4'}),result={read_only:true,cases:[]};
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);}throw Error('Observer unavailable');}
b.once('spawn',async()=>{try{
 await wait(1800);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});
 const snapshot=JSON.parse(fs.readFileSync('logs/resource-overhaul-before.json','utf8')),s=snapshot.world_training.session,world={bounds:[s.bounds[0]-16,s.bounds[1]+16,s.bounds[2]-16,s.bounds[3]+16],index:0,run:'diagnostic-only',plots:s.camp.plots};
 for(const pos of [[24618.5,65,16480.5],[24590.5,64,16440.5],[24660.5,67,16500.5]]){
  await admin({action:'teleport-coordinates',x:pos[0],y:pos[1],z:pos[2]});await wait(1300);
  const e=new Exploration();for(let dx=-12;dx<=12;dx+=12)for(let dz=-12;dz<=12;dz+=12)e.finish(b,'wood',[pos[0]+dx,pos[1],pos[2]+dz]);
  const at=performance.now();let goal=null;for(let i=0;i<5&&!goal;i++)goal=await e.choose(b,world,surface,[],'wood');
  const stoneAt=performance.now(),stones=await resources.stone(b,{bounds:world.bounds});
  result.cases.push({position:pos,goal,frontier_ms:Math.round(stoneAt-at),routes_tested:e.tests,stone_candidates:stones.length,stone_scan_ms:Math.round(performance.now()-stoneAt),distance:goal?Math.round(Math.hypot(goal[0]-pos[0],goal[2]-pos[2])):null});release(b.username);
 }
 result.success=result.cases.every(c=>c.goal&&c.distance>12);
 }catch(error){result.error=error.stack;}finally{
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});survey.release(b);fs.writeFileSync('docs/resource-exploration-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);
 }});setTimeout(()=>{b.quit();process.exit(1);},60000).unref();
