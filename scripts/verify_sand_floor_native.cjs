// Isolated survival fixture: replace beach foundation tiles, then remove all fixture blocks.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),{once}=require('events');
const {HutTeacher}=require('../controller/hut_teacher'),inventory=require('../controller/inventory_sync');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const plot={x:-800,y:211,z:-800},q=new Vec3(-799,210,-800),result={cases:[]};let changed=false;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSandFloor',auth:'offline',version:'1.21.4'});inventory.attach(b);b.on('error',console.error);
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const error=await r.text();if(!error.includes('not online')||i===11)throw Error(error);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(150);}}finally{await admin({action:'deop'});await wait(300);}}
async function main(){try{
 await once(b,'spawn');await wait(2000);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-800,y:219,z:-800});await wait(2000);
 for(let x=-805;x<=-795;x++)for(let z=-805;z<=-795;z++)for(let y=208;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','owned fixture volume must be empty');
 changed=true;await commands(['fill -805 208 -805 -795 208 -795 stone','fill -805 209 -805 -795 210 -795 sand','fill -802 210 -802 -798 210 -798 oak_planks','clear @s','give @s oak_planks 8','tp @s -799.5 211 -799.5']);
 for(const material of ['sand','red_sand','gravel']){
  await commands([`setblock ${q.x} ${q.y} ${q.z} ${material}`]);await admin({action:'gamemode',gamemode:'survival'});await wait(500);
  const t=new HutTeacher();Object.assign(t,{phase:'floor',plot,campPlots:[plot]});const started=Date.now();
  await t.buildFloor(b,{pause(){}},{world:{bounds:[-810,-790,-810,-790]}});
  const actual=b.blockAt(q)?.name;assert.equal(actual,'oak_planks');assert.equal(b.game.gameMode,'survival');assert.equal(b.health,20);
  result.cases.push({material,actual,seconds:(Date.now()-started)/1000});
 }
 result.passed=true;
}finally{
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});
 if(changed)await commands(['kill @e[type=item,x=-805,y=208,z=-805,dx=10,dy=8,dz=10]','fill -805 208 -805 -795 216 -795 air']);
 await admin({action:'gamemode',gamemode:'survival'}).catch(()=>{});await admin({action:'deop'}).catch(()=>{});result.cleaned=true;b.quit();
 fs.writeFileSync('logs/sand-floor-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
const timer=setTimeout(()=>{b.quit();process.exitCode=1;},90000);
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timer);setTimeout(()=>process.exit(process.exitCode||0),300);});
