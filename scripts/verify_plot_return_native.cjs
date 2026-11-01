// Real survival navigation back from a wood trip, followed by actual leaf clearing.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),{once}=require('events');
const {HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion');
const inventory=require('../controller/inventory_sync'),clearing=require('../controller/plot_clearance'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-900,y:211,z:-900},leaf=new Vec3(-899,212,-900),result={};let changed=false,motor,t;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabPlotReturn',auth:'offline',version:'1.21.4'});inventory.attach(b);b.on('error',console.error);b.on('physicsTick',()=>motor?.tick());
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const error=await r.text();if(!error.includes('not online')||i===11)throw Error(error);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(150);}}finally{await admin({action:'deop'});await wait(300);}}
async function main(){try{
 await once(b,'spawn');await wait(2000);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-870,y:220,z:-900});await wait(2500);
 for(let x=-907;x<=-831;x++)for(let z=-907;z<=-893;z++)for(let y=209;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture volume must be empty');
 changed=true;await commands(['fill -907 210 -907 -831 210 -893 grass_block','setblock -899 212 -900 oak_leaves[persistent=true]','tp @s -839.5 211 -899.5']);await admin({action:'gamemode',gamemode:'survival'});await wait(600);
 motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});t=new HutTeacher();Object.assign(t,{plot,campPlots:[plot],phase:'clear_plot',afterPlotClear:'floor',runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),lastProgress:Date.now()});
 const state={run:'diagnostic-plot-return',world:{bounds:[-910,-828,-910,-890],driver:'teacher'}},api=async(path,data)=>{assert.equal(path,'/step');return {action:data.teacher};};
 const started=Date.now();result.start=b.entity.position.clone();let done=false;
 while(Date.now()-started<60000&&!done){done=await clearing.tick(t,b,motor,state,api,scan,tasks);await wait(60);}
 motor.pause();result.seconds=(Date.now()-started)/1000;result.position=b.entity.position.clone();result.block=b.blockAt(leaf)?.name;result.health=b.health;result.mode=b.game.gameMode;
 assert.equal(done,true,'return and plot clearing completed');assert.equal(result.block,'air');assert.equal(result.health,20);assert.equal(result.mode,'survival');assert.ok(result.position.distanceTo(result.start)>50);result.passed=true;
}catch(error){result.error=error.message;result.position=b.entity.position.clone();result.navigation=t?.lastNavigation;result.clearing=t?.plotClearing;throw error;}finally{
 motor?.pause();await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});
 if(changed)await commands(['kill @e[type=item,x=-907,y=209,z=-907,dx=76,dy=7,dz=14]','fill -907 209 -907 -831 216 -893 air']);
 await admin({action:'gamemode',gamemode:'survival'}).catch(()=>{});await admin({action:'deop'}).catch(()=>{});result.cleaned=true;b.quit();fs.writeFileSync('logs/plot-return-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
const timer=setTimeout(()=>{motor?.pause();b.quit();process.exitCode=1;},120000);
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timer);setTimeout(()=>process.exit(process.exitCode||0),300);});
