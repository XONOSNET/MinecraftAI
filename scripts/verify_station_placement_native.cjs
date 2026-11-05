// Diagnostic build only; all navigation and leaf clearing are real survival actions.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-500,y:211,z:-500},result={fixture:'Return from out-of-reach mining stance, approach a real support and place furnace in survival. No learning writes.'};
const doorTest=process.argv.includes('--snow-door'),material=doorTest?'oak_door':'furnace';
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabStationTest',version:'1.21.4'});inventory.attach(b);let changed=false,finished=false,motor;
async function post(data){for(let n=0;n<8;n++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)return r.json();if(n===7)throw Error(await r.text());await wait(500);}}
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(100);}await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;motor?.pause();try{await post({action:'teleport-coordinates',player:b.username,x:-153.5,y:225.1,z:160.5});if(changed)await commands(['kill @e[type=item,x=-507,y=209,z=-510,dx=14,dy=8,dz=17]','fill -507 209 -510 -493 217 -493 air']);await post({action:'deop',player:b.username});result.cleaned=true;}catch(e){result.cleanup_error=e.message;result.success=false;}fs.writeFileSync(doorTest?'logs/snow-door-native.json':'logs/station-placement-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 await wait(1500);await post({action:'gamemode',player:b.username,gamemode:'creative'});await post({action:'teleport-coordinates',player:b.username,x:-500,y:220,z:-500});await wait(1800);
 for(let x=-507;x<=-493;x++)for(let z=-510;z<=-493;z++)for(let y=209;y<=217;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Diagnostic volume not empty');
 changed=true;await commands(['fill -507 209 -510 -493 209 -493 grass_block','fill -503 210 -503 -497 210 -497 oak_planks','clear @s','give @s '+material+' 1','tp @s -501.52 211 -502.52']);
 await post({action:'gamemode',player:b.username,gamemode:'survival'});await wait(600);
 const t=new HutTeacher();Object.assign(t,{plot,campPlots:[plot],phase:'furnace'});const q=new Vec3(-498,211,-500),state={world:{bounds:[-507,-493,-510,-493]}};
 if(doorTest)await commands([`setblock ${q.x} ${q.y} ${q.z} snow[layers=1]`]);
 const support=require('../controller/placement_reference'),station=require('../controller/station_placement');
 if(support.reference(b,q))throw Error('Fixture must begin outside support reach');
 result.walks=0;motor={pause(){b.clearControlStates();}};
 t.walk=async(_bot,_motor,goal)=>{
  result.walks++;const end=Date.now()+10000;
  while(Date.now()<end){const d=new Vec3(...goal).minus(b.entity.position);if(Math.hypot(d.x,d.z)<.16){motor.pause();await wait(300);return true;}await b.look(Math.atan2(-d.x,-d.z),0,true);b.setControlState('forward',true);await wait(50);}
  motor.pause();return false;
 };
 result.fixture=doorTest?'Survival snow clearing and door placement from an out-of-reach stance':result.fixture;result.initial=b.entity.position.toArray();const start=Date.now();let placed=false;
 for(let i=0;i<12&&!placed;i++){placed=await station.place(t,b,motor,q,material,state);await wait(200);}
 result.final=b.entity.position.toArray();result.seconds=(Date.now()-start)/1000;result.material=material;result.block=b.blockAt(q)?.name;result.health=b.health;result.mode=b.game.gameMode;
 result.success=placed&&result.walks>0&&result.block===material&&b.health===20&&b.game.gameMode==='survival';

}catch(e){result.error=e.stack;result.success=false;}finally{await finish();}});
b.on('kicked',reason=>{result.error='Disconnected: '+JSON.stringify(reason);result.success=false;finish();});setTimeout(()=>{result.error='Native test deadline';result.success=false;finish();},160000).unref();
