// Run after python -m scripts.build_survival_fixture. No live policy/reward writes.
const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3'),inventory=require('../controller/inventory_sync'),survival=require('../controller/survival'),{HutTeacher,blueprint}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{scan}=require('../controller/perception'),house=require('../controller/house'),tasks=require('../controller/tasks'),{createMotor}=require('../controller/locomotion');
const fixture=JSON.parse(fs.readFileSync('logs/survival-fixture.json','utf8')),token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),homesteadOnly=process.argv.includes('--homestead-only'),navigationOnly=process.argv.includes('--navigation-only');
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSurvivalChk',version:'1.21.4'});inventory.attach(b);
const result={fixture:'Isolated stone-base continuation: actual staircase descent/ascent, coal and eight iron ore mined/smelted, iron tools, sheep shearing, bed, food cooking/storage, armor crafting and controlled home defense.',grants:['Starting stone base, stone tools and furnace','24 additional iron ingots for armor to shorten fixture smelting; production must mine/smelt all 32'],phases:[]};let changed=false,finished=false;
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(70);}await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;b.clearControlStates();if(changed)await commands(['kill @e[tag=lab_world_LabSurvivalChk]','kill @e[tag=lab_home_LabSurvivalChk]','kill @e[type=item,x=-108,y=163,z=-145,dx=48,dy=20,dz=73]','fill -108 164 -145 -60 171 -72 air','fill -108 172 -145 -60 179 -72 air']).catch(()=>{});await post({action:'deop',player:b.username}).catch(()=>{});fs.writeFileSync(navigationOnly?'docs/navigation-native.json':homesteadOnly?'docs/homestead-native.json':'docs/survival-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{let motor;
 try{
  await wait(2000);await post({action:'gamemode',player:b.username,gamemode:'spectator'});await post({action:'teleport-coordinates',player:b.username,x:-82,y:182,z:-97});await wait(2500);
  if(process.argv.includes('--replace-fixture')){changed=true;await commands(['kill @e[tag=lab_world_LabSurvivalChk]','kill @e[tag=lab_home_LabSurvivalChk]','fill -108 164 -145 -60 171 -72 air','fill -108 172 -145 -60 179 -72 air']);}
  // Only use empty sky: cleanup must never erase existing blocks.
  for(let x=-108;x<=-60;x++)for(let z=-145;z<=-72;z++)for(let y=164;y<=179;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture sky volume is not empty at '+[x,y,z]);
  changed=true;const p=fixture.plot;
  const setup=[...fixture.setup,...blueprint(p).map(q=>`setblock ${q.x} ${q.y} ${q.z} ${q.table?'crafting_table':'oak_planks'}`),`setblock ${p.x} ${p.y} ${p.z-3} oak_door[facing=north,half=lower]`,`setblock ${p.x} ${p.y+1} ${p.z-3} oak_door[facing=north,half=upper]`,`setblock ${p.x+2} ${p.y} ${p.z+2} chest`,`setblock ${p.x-2} ${p.y} ${p.z+2} furnace`,'clear @s','gamemode survival @s','give @s stone_pickaxe','give @s stone_axe','give @s iron_ingot 24','effect give @s saturation 1 5 true','effect give @s instant_health 1 5 true'];
  const mode=setup.indexOf('gamemode survival @s');setup.splice(mode,0,`tp @s ${p.x+.5} ${p.y} ${p.z+.5}`);
  setup.push('fill -108 164 -145 -60 171 -72 sea_lantern replace grass_block','fill -108 164 -145 -60 171 -72 sea_lantern replace stone','kill @e[type=creeper,x=-108,y=164,z=-145,dx=48,dy=20,dz=73]');
  if(homesteadOnly){result.fixture='Isolated homestead and defense continuation from granted iron tools';result.grants=['Completed stone base','Iron pickaxe, shears, sword, 25 ingots, eight planks and six coal'];setup.push('give @s iron_pickaxe','give @s shears','give @s iron_sword','give @s iron_ingot 1','give @s oak_planks 8','give @s coal 6');}
  for(let i=0;i<setup.length;i++)setup[i]=setup[i].replace('minecraft:grass_block','minecraft:sea_lantern').replace('minecraft:stone','minecraft:sea_lantern');
  await commands(setup);await post({action:'teleport-coordinates',player:b.username,x:p.x+.5,y:p.y,z:p.z+.5});await wait(1200);
  const t=new HutTeacher();Object.assign(t,{phase:'survival_setup',run:'survival-native',plot:p,table:house.point(p,'table'),runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),milestones:[],path:[],resources:[]});
  if(homesteadOnly){t.phase='survival_sheep_trip';t.survival={station:fixture.station,smelted:32,combat:{},sheared:new Set()};}
  motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
  const state={run:'survival-native',world:{bounds:[-146,-18,-160,-32],driver:'teacher',mission:'home_defense'}};
  const api=async(path,d)=>{
   if(path==='/step')return {action:navigationOnly&&d.teacher===3?0:d.teacher};
   if(path!=='/world/survival')throw Error(path);
   if(d.action==='station')return {...fixture.station,iron_target:8};
   if(d.action==='home'){await commands(fixture.home_commands);result.home_registered=true;return fixture.home;}
   if(d.action==='threat'){await commands(fixture.threat_commands);return fixture.threat;}
   if(d.action==='cleanup')return {};
   throw Error(d.action);
  };
  if(navigationOnly){
   result.fixture='Real door exit to resources behind home and mine staircase ascent/descent; simulated forward intentions replace jump choices to test shared auto-step.';result.routes=[];
   const {WorldNavigation}=require('../controller/world_navigation');
   async function leg(phase,until,position){
    motor.pause();if(position){await post({action:'teleport-coordinates',player:b.username,x:position[0],y:position[1],z:position[2]});await wait(700);}
    t.navigator=new WorldNavigation();t.phase=phase;t.path=[];const start=Date.now();while(t.phase!==until){if(Date.now()-start>45000)throw Error('Navigation fixture stalled: '+phase+' '+t.message);await survival.tick(t,b,motor,state,api,scan,tasks);if(Date.now()-(result.routePulse||0)>3000){result.routePulse=Date.now();console.log(JSON.stringify({phase:t.phase,p:b.entity.position,cue:t.path?.[0],message:t.message}));}await wait(100);}motor.pause();result.routes.push({phase,seconds:Math.round((Date.now()-start)/100)/10,position:b.entity.position.clone()});
   }
   t.survival={station:{...fixture.station,logs:[[p.x+2,p.y,p.z+6]]},combat:{},sheared:new Set()};
   await leg('survival_wood_trip','survival_wood',[p.x+.5,p.y,p.z+.5]);t.survival.station=fixture.station;await leg('survival_wood_trip','survival_wood');await leg('survival_wood','survival_wood_craft');
   state.world.driver='student';await leg('survival_mine_up','survival_mine_return',fixture.station.bottom);
   await leg('survival_mine_down','survival_coal');result.success=result.routes.length===5;result.health=b.health;return;
  }
  const deadline=Date.now()+540000;
  while(t.phase!=='complete'){
   if(Date.now()>deadline)throw Error('Fixture deadline at '+t.phase);
   if(b.health<=0)throw Error('Fixture player died');
   if(result.phases.at(-1)?.phase!==t.phase){result.phases.push({phase:t.phase,seconds:Math.round((Date.now()-(result.started||=Date.now()))/1000)});console.log(t.phase);}
   await survival.tick(t,b,motor,state,api,scan,tasks);if(Date.now()-(result.pulse||0)>10000){result.pulse=Date.now();console.log(JSON.stringify({phase:t.phase,p:b.entity.position,cue:t.path?.[0],message:t.message,motor:motor.status()}));}await wait(100);
  }
  result.milestones=t.milestones;result.home=t.home;result.health=b.health;result.success=t.milestones.includes('home_safe')&&t.milestones.includes('defended')&&t.milestones.includes('armor')&&t.milestones.includes('cooked')&&t.milestones.includes('bed_home');
 }catch(e){result.error=e.stack;result.position=b.entity?.position;result.inventory=b.inventory?.items().map(i=>[i.name,i.count]);}
 finally{motor?.pause();await finish();}
});
setTimeout(async()=>{result.error='Hard native verification timeout';await finish();},600000).unref();
