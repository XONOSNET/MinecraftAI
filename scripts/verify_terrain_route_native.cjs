// Read-only live survey check. No terrain, inventory or model changes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),{HutTeacher}=require('../controller/hut_teacher');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabNavCheck',version:'1.21.4'}),result={fixture:'Read-only hover survey above the reported ocean site; return to the existing staging pad afterward'};
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const message=await r.text();if(!message.includes('not online'))throw Error(message);await wait(500);}throw Error('Temporary observer was not listed online');}
let finished=false;
async function finish(){if(finished)return;finished=true;survey.release(b);fs.writeFileSync(process.argv.includes('--steps-only')?'docs/overnight-step-route-native.json':'docs/overnight-terrain-route-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 survey.hold(b);await wait(1800);await admin({action:'gamemode',gamemode:'spectator'});
 const {createMotor}=require('../controller/locomotion'),{WorldNavigation}=require('../controller/world_navigation'),{WorldTiming}=require('../controller/world_timing'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
 const snapshot=JSON.parse(fs.readFileSync('logs/overnight-20261028-0157.json','utf8')),rows=snapshot.world_training.session.results;
 const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());result.fixture='Reproduce three teacher ground-safety holds on their original natural terrain; diagnostic player only, no terrain edits or learning writes';result.cases=[];
 for(const name of (process.argv.includes('--steps-only')?['LabAI0','LabAI7']:['LabAI5','LabAI3','LabAI6'])){
  const saved=rows[name].navigation,p=new Vec3(...saved.position),goal=name==='LabAI7'?saved.target:saved.cue;
  await admin({action:'gamemode',gamemode:'spectator'});survey.hold(b);await admin({action:'teleport-coordinates',x:p.x,y:p.y,z:p.z});await wait(1400);survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(300);
  const t=new HutTeacher();Object.assign(t,{phase:'gather',plot:null,campPlots:[],navigator:new WorldNavigation(),runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
  const state={run:'diagnostic-only',world:{bounds:[24576,24704,16384,16512],driver:'teacher'}},api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected training write');return {action:data.teacher};};
  const at=Date.now();let arrived=false;while(Date.now()-at<(name==='LabAI7'?35000:12000)&&!arrived){arrived=await t.walk(b,motor,goal,state,api,scan,tasks)===true;await wait(50);}
  motor.pause();result.cases.push({source:name,start:saved.position,goal,arrived,seconds:(Date.now()-at)/1000,position:b.entity.position.clone(),navigation:t.lastNavigation});
 }
 await admin({action:'gamemode',gamemode:'spectator'});survey.hold(b);await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5});await wait(500);survey.release(b);await admin({action:'gamemode',gamemode:'survival'});result.success=result.cases.every(c=>c.arrived);
 }catch(error){result.error=error.stack;}finally{await finish();}});
setTimeout(()=>{result.error='Survey verification deadline';finish();},90000).unref();
