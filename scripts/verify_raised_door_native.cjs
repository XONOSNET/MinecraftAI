// Physical route reproduction with saved neighboring-player perception.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),{HutTeacher}=require('../controller/hut_teacher'),{createMotor}=require('../controller/locomotion'),{WorldTiming}=require('../controller/world_timing'),{WorldNavigation}=require('../controller/world_navigation'),{scan,proximity}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabRouteCheck',version:'1.21.4'}),result={read_only:true,fixture:'Saved raised house entry; geometry teacher intentions through the shared route motor. No learning API writes or terrain edits.',cases:[]};let motor=null;
b.on('physicsTick',()=>motor?.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);}throw Error('Observer unavailable');}
b.once('spawn',async()=>{try{
 await wait(1800);const ledge=process.argv.includes('--ledge'),snapshot=JSON.parse(fs.readFileSync(ledge?'logs/raised-door-paused.json':'logs/raised-door-before.json','utf8')),session=snapshot.world_training.session;
 if(ledge)result.fixture='Saved stone ledge; geometry teacher intentions with the recorded neighboring-player position. No learning API writes or terrain edits.';
 for(const name of ledge?['LabAI2']:['LabAI7']){
  motor?.pause();motor=null;survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});const saved=session.results[name].navigation,p=new Vec3(...saved.position);
  await admin({action:'teleport-coordinates',x:p.x,y:p.y,z:p.z});await wait(1200);survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(350);await b.look(saved.yaw,0,true);
  const proxy=Object.create(b);proxy.players=Object.fromEntries((saved.nearby_players||[]).map((q,i)=>['ReplayOther'+i,{username:'ReplayOther'+i,gamemode:0,entity:{id:100000+i,position:new Vec3(...q)}}]));
  motor=createMotor(proxy,{move:true,turn:true,jump:true,sprint:true});
  const t=new HutTeacher();Object.assign(t,{phase:session.results[name].phase,plot:session.results[name].plot,campPlots:session.camp.plots,navigator:new WorldNavigation(),runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
  const blocks=[];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=2;dy++){const v=p.floored().offset(dx,dy,dz),q=b.blockAt(v);blocks.push({p:[v.x,v.y,v.z],name:q?.name,shapes:q?.shapes});}
  const state={run:'diagnostic-only',world:{bounds:session.bounds,driver:'student'}},api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected write');return {action:data.teacher};},goal=saved.target;
  const at=Date.now();let arrived=false;while(Date.now()-at<12000&&!arrived){arrived=await t.walk(proxy,motor,goal,state,api,scan,tasks)===true;await wait(50);}
  motor.pause();result.cases.push({source:name,start:saved.position,goal,neighbors:saved.nearby_players,arrived,seconds:(Date.now()-at)/1000,position:b.entity.position.clone(),navigation:t.lastNavigation,blocks});
 }
 result.success=result.cases.every(c=>c.arrived);
 }catch(error){result.error=error.stack;}finally{
 motor?.pause();motor=null;survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});survey.release(b);
 const filename=process.argv.includes('--ledge')?'docs/stone-ledge-native.json':process.argv.includes('--before')?'docs/raised-door-before.json':'docs/raised-door-native.json';fs.writeFileSync(filename,JSON.stringify(result,null,2));console.log(JSON.stringify({success:result.success,error:result.error,cases:result.cases.map(({blocks,navigation,...c})=>({...c,motor:navigation?.motor_after,cue:navigation?.cue}))}));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);
 }});setTimeout(()=>{b.quit();process.exit(1);},90000).unref();
