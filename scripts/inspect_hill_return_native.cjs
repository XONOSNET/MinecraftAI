// Terrain inspection and a survival walk from the reported stranded position.
const mineflayer=require('mineflayer'),fs=require('fs'),path=require('path'),Module=require('module');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),token=fs.readFileSync('data/api-token','utf8').trim();
const filename=path.resolve('controller/before_navigation.cjs'),before=new Module(filename,module);before.filename=filename;before.paths=Module._nodeModulePaths(path.dirname(filename));before._compile(require('child_process').execFileSync('git',['show','f1145b9:controller/field_navigation.js'],{encoding:'utf8'}),filename);
const after=require('../controller/field_navigation'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabTerrainCheck',version:'1.21.4'});
const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:false});b.on('physicsTick',()=>motor.tick());
async function post(d){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify({player:b.username,...d})});if(!r.ok)throw Error(await r.text());}
b.once('spawn',async()=>{const result={fixture:'Inspection and survival return from the five-block drop reported at the prepared camp; no terrain changes, no teleporting during the return.'};
 try{await wait(2500);await post({action:'gamemode',gamemode:'spectator'});await wait(500);await post({action:'teleport-coordinates',x:16466.68,y:65,z:16422.05});await wait(2500);
  const goal=[16457.5,70.1,16428.5];for(const [name,planner]of [['before',before.exports],['after',after]]){const at=Date.now(),r=planner.route(b,goal,80,8192,false,{reversible:true});result[name]={reached:r.reached||false,expanded:r.expanded,ms:Date.now()-at,path_length:r.path.length,endpoint:r.path.at(-1),min_y:Math.min(...r.path.map(v=>v[1])),max_y:Math.max(...r.path.map(v=>v[1]))};}
  await post({action:'gamemode',gamemode:'survival'});await wait(600);
  const t=new HutTeacher();Object.assign(t,{phase:'return_home',plot:{x:16457,y:70,z:16432},runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
  let lastAction=null;const started=Date.now();while(Date.now()-started<30000){await t.walk(b,motor,goal,{run:'fixture',world:{driver:'teacher',bounds:[16384,16512,16384,16512]}},async(_,d)=>{lastAction=d.teacher;return {action:d.teacher}},scan,tasks);if(Math.hypot(b.entity.position.x-goal[0],b.entity.position.z-goal[2])<.7&&Math.abs(b.entity.position.y-70)<.4)break;await wait(100);}
  motor.pause();result.walk={seconds:(Date.now()-started)/1000,position:b.entity.position.clone(),navigation:t.navigator.status,lastAction,motor:motor.status(),path:t.path.slice(0,4),yaw:b.entity.yaw};result.success=Math.hypot(b.entity.position.x-goal[0],b.entity.position.z-goal[2])<.7&&Math.abs(b.entity.position.y-70)<.4;
 }catch(e){result.error=e.stack;}
 finally{motor.pause();fs.writeFileSync('docs/hill-return-inspection.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
});setTimeout(()=>{b.quit();process.exit(1)},45000).unref();
