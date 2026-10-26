// Isolated granted survival fixture; no model or production reward writes.
const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3');
const inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),token=fs.readFileSync('data/api-token','utf8').trim();
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabFocusCheck',version:'1.21.4'});inventory.attach(b);
b.once('spawn',async()=>{
 const result={fixture:'Five stacked oak logs, real survival digging through world harvest controller; initial gaze deliberately stale.',passes:[]};
 try{
  await wait(2000);await post({action:'op',player:b.username});await wait(1000);
  for(const command of ['/clear @s','/gamemode survival @s','/give @s wooden_axe','/fill -19 181 16 -16 187 18 air','/fill -19 180 16 -16 180 18 stone','/fill -18 181 17 -18 185 17 oak_log']){b.chat(command);await wait(250);}
  await post({action:'deop',player:b.username});await post({action:'teleport-coordinates',player:b.username,x:-16.5,y:181,z:17.5});await wait(1200);await inventory.equip(b,'wooden_axe');
  const t=new HutTeacher();Object.assign(t,{phase:'gather',timing:new WorldTiming(Date.now()),runtime:tasks.createRuntime(),resources:[181,182,183,184,185].map(y=>new Vec3(-18,y,17))});
  const motor={pause(){b.clearControlStates();},lockLook(){},command(){throw Error('Fixture must select harvesting');}};
  for(let pass=0;pass<5;pass++){
   const target=t.resources.find(v=>b.blockAt(v)?.name==='oak_log'&&require('../controller/resource_target').harvestable(b,v));if(!target)throw Error('No reachable log at pass '+pass);
   await b.look(0,1.3,true);let observation;
   await t.harvest(b,motor,target,{run:'focus-native',world:{bounds:{min_x:-30,max_x:30,min_z:-30,max_z:30}}},async(path,data)=>{if(path!=='/step')throw Error(path);observation={aligned:Math.abs(data.obs[64])<.02,log_visible:data.hits.some(h=>h.name==='oak_log'&&h.position.equals(target)),pitch:b.entity.pitch};return {action:5};},scan,tasks);
   result.passes.push({y:target.y,removed:b.blockAt(target)?.name==='air',...observation});
  }
  result.final_pitch=b.entity.pitch;result.success=result.passes.length===5&&result.passes.every(p=>p.removed&&p.aligned&&p.log_visible)&&Math.abs(result.final_pitch)<.01;
 }catch(error){result.error=error.stack;}
 finally{
  await post({action:'op',player:b.username}).catch(()=>{});await wait(1000);b.chat('/fill -18 181 17 -18 185 17 air');await wait(250);await post({action:'deop',player:b.username}).catch(()=>{});
  fs.writeFileSync('docs/harvest-focus-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);
 }
});
setTimeout(async()=>{await post({action:'deop',player:b.username}).catch(()=>{});b.quit();process.exit(1);},60000).unref();
