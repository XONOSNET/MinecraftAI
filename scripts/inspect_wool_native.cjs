// Isolated sky fixture; verifies server selectors, heightmap syntax and caps.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabWoolCensus',version:'1.21.4'}),result={fixture:'Read-only sheep census and loaded-terrain route checks from camp; no livestock or learning changes'},messages=[];
b.on('messagestr',s=>messages.push(s));
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Observer unavailable');}
async function cmd(c){b.chat('/'+c);await wait(180);}
const count=()=>Object.values(b.entities).filter(e=>['sheep','cow','pig','chicken'].includes(e.name)&&e.isValid!==false&&e.position.y>=239&&e.position.y<248).length;
b.once('spawn',async()=>{try{
 await wait(1500);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:24640,y:100,z:16448});await wait(1800);await admin({action:'op'});await wait(800);
 const area='x=24560,y=-64,z=16368,dx=159,dy=255,dz=159';
 for(const selector of [`type=sheep,${area}`,`type=sheep,${area},nbt={Age:0,Color:0b,Sheared:0b}`,`type=cow,${area}`])await cmd('execute if entity @e['+selector+']');
 await cmd('execute as @e[type=sheep,'+area+'] run data get entity @s');await wait(500);
 result.loaded=Object.values(b.entities).filter(e=>e.name==='sheep').map(e=>({id:e.id,position:e.position,metadata:e.metadata}));result.messages=messages;result.read_only=true;
 const {Vec3}=require('vec3'),{route}=require('../controller/field_navigation'),{approaches}=require('../controller/first_night'),livestock=require('../controller/first_night_livestock');
 const proxy=Object.create(b);proxy.entity={...b.entity,position:new Vec3(24618.5,65,16480.5),onGround:true};proxy.players={};result.camp_geometry=[];
 const candidates=JSON.parse(fs.readFileSync('logs/walked-pasture-production-candidates.json','utf8'));
 result.pasture_checks=candidates.map(([x,y,z])=>({p:[x,y,z],grass:[[0,0],[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>['grass_block','mycelium','podzol','coarse_dirt','rooted_dirt','dirt','moss_block','pale_moss_block'].includes(b.blockAt(new Vec3(x+dx,y-1,z+dz))?.name)),air:[0,1].every(dy=>b.blockAt(new Vec3(x,y+dy,z))?.name==='air')}));

 for(const e of Object.values(b.entities).filter(e=>livestock.whiteSheep(b,e))){
  const goals=approaches(proxy,{position:e.position.floored()},[24560,24720,16368,16528]).sort((a,c)=>new Vec3(...a).distanceTo(proxy.entity.position)-new Vec3(...c).distanceTo(proxy.entity.position)).slice(0,4);
  let goal,details=[];for(const g of goals){const plan=route(proxy,g,192,32768,true,{bounds:[24560,24720,16368,16528],reversible:true});details.push({goal:g,reached:plan.reached,expanded:plan.expanded,budget:plan.budget_exhausted,end:plan.path.at(-1)});if(plan.reached){goal=g;break;}}
  result.camp_geometry.push({id:e.id,position:e.position,reachable:!!goal,goal,details});
 }

 }catch(error){result.error=error.stack;}finally{await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('logs/wool-census.json',JSON.stringify(result,null,2));console.log(JSON.stringify({error:result.error,tracked_sheep:result.loaded?.length,counts:result.messages?.filter(s=>s.startsWith('Test passed')),camp_geometry:result.camp_geometry.map(c=>({reachable:c.reachable})),valid_walked_pastures:result.pasture_checks.filter(p=>p.grass&&p.air).map(p=>p.p)}));setTimeout(()=>process.exit(result.error?1:0),200);}});setTimeout(()=>{b.quit();process.exit(1);},30000).unref();
