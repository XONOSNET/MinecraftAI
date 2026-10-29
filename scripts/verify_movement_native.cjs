// Isolated native movement/harvest fixture. Never writes production learning data.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{WorldNavigation}=require('../controller/world_navigation'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks'),{standingTarget}=require('../controller/tree_target');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabMotionCheck',version:'1.21.4'}),result={fixture:'Isolated lit terraces and four real oak logs; no production resources or learning writes.'};inventory.attach(b);const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Diagnostic unavailable');}
async function cmd(c){b.chat('/'+c);await wait(250);}
b.once('spawn',async()=>{let built=false;try{
 await wait(1300);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-80.5,y:180,z:158.5});await wait(1200);
 for(let x=-88;x<=-55;x++)for(let y=176;y<=185;y++)for(let z=150;z<=168;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(700);built=true;
 for(const c of ['fill -88 176 150 -55 176 168 sea_lantern','fill -88 177 150 -79 179 168 stone','fill -78 177 150 -76 178 168 stone','fill -75 177 150 -73 177 168 stone','fill -65 177 158 -65 180 158 oak_log','clear @s','give @s stone_axe','give @s oak_planks 2'])await cmd(c);
 await admin({action:'deop'});survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(500);await b.look(-Math.PI/2,0,true);
 const t=new HutTeacher();Object.assign(t,{phase:'gather',plot:null,campPlots:[],runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),navigator:new WorldNavigation(),resources:[177,178,179,180].map(y=>new Vec3(-65,y,158)),started:Date.now(),lastProgress:Date.now(),milestones:[]});
 const state={run:'motion-diagnostic',world:{bounds:[-90,-53,148,170],driver:'teacher'}},api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected diagnostic write');return {action:data.teacher};};
 const positions=[],at=Date.now();let arrived=false;while(!arrived&&Date.now()-at<35000){positions.push([b.entity.position.x,b.entity.position.y,b.entity.position.z]);if(process.argv.includes('--trace'))(result.trace??=[]).push({p:b.entity.position.clone(),cue:t.lastNavigation?.cue,motor:motor.diagnostic(),nav:t.navigator.status});arrived=await t.walk(b,motor,[-67.5,177.1,158.5],state,api,scan,tasks)===true;await wait(50);}motor.pause();
 result.descent={arrived,seconds:(Date.now()-at)/1000,backtracks:positions.slice(1).filter((p,i)=>p[0]<positions[i][0]-.08).length,start:positions[0],end:b.entity.position.clone()};
 if(!arrived)throw Error('Terrace route did not finish: '+t.message);
 const stance=b.entity.position.clone(),mined=[];for(let i=0;i<4;i++){
  const target=standingTarget(b,t.resources.filter(v=>b.blockAt(v)?.name==='oak_log'));if(!target)throw Error('Next log not harvestable from retained footing');
  await t.harvest(b,motor,target,state,api,scan,tasks);if(b.blockAt(target)?.name!=='air')throw Error('Native log removal did not verify');mined.push([target.x,target.y,target.z]);
 }
 result.harvest={removed:mined,displacement:b.entity.position.distanceTo(stance)};
 await t.place(b,{x:-70,y:177,z:158},'oak_planks');result.placement={verified:b.blockAt(new Vec3(-70,177,158))?.name==='oak_planks'};
 result.success=arrived&&result.descent.backtracks===0&&mined.length===4&&result.harvest.displacement<.3&&result.placement.verified;
}catch(e){result.error=e.stack;}finally{
 motor.pause();survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(700);await cmd('kill @e[type=item,x=-88,y=176,z=150,dx=33,dy=10,dz=18]');await cmd('fill -88 176 150 -55 185 168 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/movement-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
}});
