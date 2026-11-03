// Disposable sky fixture; no supplies or edits in production training terrain.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3'),clearance=require('../controller/construction_clearance');
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabFlowerTest',auth:'offline',version:'1.21.4'}),token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={diagnostic_only:true};let changed=false;
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const message=await r.text();if(!message.includes('not online')||i===11)throw Error(message);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(700);}}finally{await admin({action:'deop'});await wait(500);}}
(async()=>{try{
 await once(b,'spawn');await wait(1500);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1399.5,y:214,z:-1399.5});await wait(1600);
 if(process.argv.includes('--cleanup')){changed=true;return;}
 for(let x=-1403;x<=-1397;x++)for(let z=-1403;z<=-1397;z++)for(let y=210;y<=213;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture starts empty');
 changed=true;const flowers=[['white_tulip',2,0],['pink_tulip',-2,0],['red_tulip',0,2],['orange_tulip',0,-2]];
 await commands(['fill -1403 210 -1403 -1397 210 -1397 dirt',...flowers.map(([name,dx,dz])=>`setblock ${-1400+dx} 211 ${-1400+dz} ${name}`),'tp @s -1399.5 211 -1399.5']);await admin({action:'gamemode',gamemode:'survival'});await b.waitForTicks(5);
 const t={phase:'clear_plot',plot:{x:-1400,y:211,z:-1400},campPlots:[]};
 for(const [name,dx,dz] of flowers){const q=new Vec3(-1400+dx,211,-1400+dz);assert.equal(b.blockAt(q)?.name,name);assert.equal(await clearance.clear(t,b,b.blockAt(q)),true);assert.equal(b.blockAt(q)?.name,'air');}
 assert.equal(t.constructionCleared,4);report.passed=true;report.removed=4;report.health=b.health;
 }catch(error){report.error=error.stack;process.exitCode=1;}finally{
 b.clearControlStates();await admin({action:'gamemode',gamemode:'creative'});
 if(changed){await commands(['fill -1403 210 -1403 -1397 213 -1397 air','kill @e[type=item,x=-1403,y=-64,z=-1403,dx=6,dy=384,dz=6]','clear @s']);for(let x=-1403;x<=-1397;x++)for(let z=-1403;z<=-1397;z++)for(let y=210;y<=213;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');}
 await admin({action:'deop'});report.cleaned=true;b.quit();fs.writeFileSync('logs/plot-flowers-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }})().then(()=>setTimeout(()=>process.exit(process.exitCode||0),200)).catch(error=>{console.error(error);b.quit();process.exit(1)});
