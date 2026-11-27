'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const mf=require('mineflayer'),{Vec3}=require('vec3');
const burrow=require('../controller/emergency_burrow'),bootstrap=require('../pilot/burrow_bootstrap.cjs');
const observation=require('../pilot/neutral_spiders.cjs'),inventory=require('../controller/inventory_sync');
const {HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing');
const {WorldStall}=require('../controller/world_stall');
const output=path.resolve(process.argv[2]),channel=path.resolve(process.argv[3]);
if(!output.startsWith(path.resolve('logs')+path.sep)||!channel.startsWith(output+path.sep))throw Error('Private fixture paths required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={complete:false,scenarios:[],started_at:Date.now(),setup_is_autonomous_achievement:false};
let bot,motor;
const items=()=>Object.fromEntries(bot.inventory.items().map(i=>[i.name,bot.inventory.items().filter(x=>x.name===i.name).reduce((n,x)=>n+x.count,0)]));
const pose=()=>({position:bot.entity.position.toArray(),grounded:bot.entity.onGround,health:bot.health,food:bot.food,items:items()});
async function until(check,ms,label){const end=Date.now()+ms;while(Date.now()<end){const value=await check();if(value)return value;await sleep(100);}throw Error('Timed out: '+label);}
async function host(action,extra={}){
 const id=crypto.randomUUID().replaceAll('-',''),tmp=path.join(channel,id+'.tmp');
 fs.writeFileSync(tmp,JSON.stringify({id,action,...extra}));fs.renameSync(tmp,path.join(channel,id+'.request.json'));
 return until(()=>{try{const s=JSON.parse(fs.readFileSync(path.join(channel,id+'.response.json'),'utf8'));if(s.id!==id)return false;if(!s.ok)throw Error(s.error);return s;}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return false;throw e;}},25000,'private '+action);
}
const state={run:'pilot-burrow-native',world:{mission:'first_night',bounds:[-16,16,-16,16],first_night:{hostiles:true},min_y:60}};
const api=async(route,payload)=>route==='/step'?{action:payload.teacher}:{ok:true};
const scan=require('../controller/perception').scan,tasks=require('../controller/tasks');
function teacher(){
 const t=new HutTeacher();Object.assign(t,{run:state.run,phase:'night_burrow',plot:{x:22,y:80,z:22},campPlots:[],milestones:[],started:Date.now(),lastProgress:Date.now(),last:bot.entity.position.clone(),travelled:0,
  timing:new WorldTiming(),stall:new WorldStall(),runtime:tasks.createRuntime(),wilderness:{burrow:{feet:[0,80,0],cap:[0,80,0],lip:[-1,80,0],cap_name:'dirt',lip_name:'dirt',stage:'hidden',resume:'gather',shellVerified:true,progressAt:Date.now()}}});return t;
}
async function setup(name){
 motor.pause();await host('setup',{scenario:name});await sleep(800);await inventory.sync(bot);
 await until(()=>bot.entity.onGround&&Math.abs(bot.entity.position.y-(['aggressive','calm_close_combat','surface_bootstrap'].includes(name)?80:78))<.1,5000,'grounded '+name);
 return teacher();
}
async function stageCheck(name,fn){const row={name,started_at:Date.now()};report.scenarios.push(row);try{await fn(row);row.passed=true;}catch(e){row.passed=false;row.error=e.stack||e.message;row.pose=bot?.entity?pose():null;}finally{row.finished_at=Date.now();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}}
function spider(){return Object.values(bot.entities).filter(e=>e.isValid!==false&&['spider','cave_spider'].includes(e.name)&&e.metadata?.[9]!==0&&e.position.distanceTo(bot.entity.position)<16).sort((a,b)=>b.id-a.id)[0];}
async function hidden(t){await burrow.tick(t,bot,motor,state,api,scan,tasks);assert.equal(t.wilderness.burrow?.stage,'hidden');assert.equal(bot.blockAt(new Vec3(0,80,0)).name,'dirt');assert.equal(burrow.sealed(bot,t.wilderness.burrow),true);}
(async()=>{
 try{
  report.sources=Object.fromEntries(['pilot/burrow_bootstrap.cjs','pilot/local_bootstrap.cjs',
   'scripts/verify_pilot_burrow_recovery.py','scripts/verify_pilot_burrow_recovery.cjs'].map(file=>
   [file,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(file))).digest('hex')]));
  bot=mf.createBot({host:'127.0.0.1',port:25571,username:'PilotTest01',auth:'offline',version:'1.21.4'});
  inventory.attach(bot);require('../controller/resource_space').attach(bot);observation.attach(bot);
  motor=require('../controller/locomotion').createMotor(bot,{...require('../config/permissions.json'),attack:true,break_blocks:true,place_blocks:true,inventory:true});
  bot.on('physicsTick',()=>motor.tick());bot.on('error',e=>{report.client_error=e.message;});
  await until(()=>bot.entity&&bot.game,15000,'native spawn');await sleep(1000);
  await stageCheck('existing helper refuses the matched neutral spider; opt-in exits and resumes gathering',async row=>{
   const t=await setup('neutral');const e=await until(()=>spider(),5000,'native spider');
   await until(()=>observation.assess(bot,e,new Vec3(.5,80,.5)).neutral,5000,'bright native calm observation');
   row.initial=pose();row.observation=observation.assess(bot,e,new Vec3(.5,80,.5));
   const hook=bot.labPersistentNeutralSpider;delete bot.labPersistentNeutralSpider;
   try{for(let i=0;i<8;i++){await hidden(t);await sleep(150);}}finally{bot.labPersistentNeutralSpider=hook;}
   row.baseline={stage:t.wilderness.burrow.stage,message:t.message,pose:pose()};
   const at=Date.now(),stages=[];
   while(t.wilderness.burrow&&Date.now()-at<30000){await burrow.tick(t,bot,motor,state,api,scan,tasks);stages.push({at:Date.now(),stage:t.wilderness.burrow?.stage,position:bot.entity.position.toArray(),climb:t.wilderness.burrow?.climbAttempt});await sleep(100);}
   assert.equal(t.wilderness.burrow,null);assert.equal(t.phase,'gather');assert.ok(bot.entity.position.y>=80);assert.equal(bot.game.gameMode,'survival');assert.deepEqual(t.milestones,[]);
   row.exit_ms=Date.now()-at;row.exit=pose();row.stages=stages;
   const before=(items().oak_log||0),target=new Vec3(-6,80,0),goal=[-4.5,80.1,.5];
   await until(async()=>{const arrived=await t.walk(bot,motor,goal,state,api,scan,tasks);await sleep(100);return arrived===true;},20000,'checked route to interrupted wood work');
   motor.pause();await inventory.equip(bot,'wooden_axe');await bot.lookAt(target.offset(.5,.5,.5),true);await bot.dig(bot.blockAt(target),true);
   await until(async()=>{await t.walk(bot,motor,[-5.5,80.1,.5],state,api,scan,tasks);return (items().oak_log||0)>before;},12000,'real resumed log pickup');
   motor.pause();row.resumed=pose();assert.ok((items().oak_log||0)>before);assert.equal(bot.health,20);
  });
  // Vanilla weather commands do not reliably deliver rain in this custom
  // fixture realm. Weather refusal is covered by observation unit regressions.
  for(const name of ['night','close','cave'])await stageCheck(name+' retains sealed cover',async row=>{
   const t=await setup(name);await until(()=>spider(),5000,'safety mob');if(name==='rain')await until(()=>bot.isRaining,5000,'native rain');
   for(let i=0;i<4;i++){await hidden(t);await sleep(150);}
   row.observations=observation.report(bot,new Vec3(.5,80,.5));row.result=pose();row.message=t.message;
  });
  await stageCheck('native aggressive spider retains sealed cover',async row=>{
   const t=await setup('aggressive');const e=await until(()=>spider(),5000,'aggressive spider');
   await until(()=>((e.metadata?.[15]||0)&4)!==0,12000,'native aggressive metadata');
   row.before_freeze=observation.assess(bot,e,new Vec3(.5,80,.5));await host('freeze-aggressive');await sleep(500);
   assert.ok((e.metadata?.[15]||0)&4,'Native aggression must remain present');
   for(let i=0;i<3;i++){await hidden(t);await sleep(150);}
   row.observation=observation.assess(bot,e,new Vec3(.5,80,.5));row.result=pose();
  });
  await stageCheck('legacy close-spider provocation is replaced by native nonaggression',async row=>{
   const defense=require('../controller/survival_defense');
   let t=await setup('calm_close_combat');t.phase='gather';t.wilderness.burrow=null;
   let e=await until(()=>spider(),5000,'calm close combat mob');
   await until(()=>observation.assess(bot,e).calm,5000,'native calm close disposition');
   const calm=bot.labPersistentCalmSpider,attack=bot.attack;let requests=0;
   bot.attack=function(...args){requests++;return attack.apply(this,args);};
   const before=e.metadata?.[9];delete bot.labPersistentCalmSpider;
   try{await until(async()=>{await defense.tick(t,bot,motor,state,api,scan);await sleep(150);return e.metadata?.[9]<before;},10000,'legacy native attack confirmation');}
   finally{bot.labPersistentCalmSpider=calm;motor.pause();}
   row.legacy={attack_requests:requests,health_before:before,health_after:e.metadata?.[9]};
   t=await setup('calm_close_combat');t.phase='gather';t.wilderness.burrow=null;
   e=await until(()=>spider(),5000,'reset calm close combat mob');
   await until(()=>observation.assess(bot,e).calm,5000,'reset native calm disposition');
   requests=0;const reset=e.metadata?.[9];
   try{for(let i=0;i<6;i++){assert.equal(await defense.tick(t,bot,motor,state,api,scan),false);await sleep(150);}}
   finally{bot.attack=attack;motor.pause();}
   assert.equal(requests,0);assert.equal(e.metadata?.[9],reset);
   row.candidate={attack_requests:requests,health_before:reset,health_after:e.metadata?.[9],observation:observation.assess(bot,e)};
  });
  await stageCheck('real pre-torch table, axe and pick from bare stock while sealed; clear exit still works afterward',async row=>{
   const t=await setup('bootstrap');row.initial=pose();const at=Date.now();
   assert.equal(items().wooden_axe||0,0);assert.equal(items().wooden_pickaxe||0,0);assert.equal(items().crafting_table||0,0);
   while(!(items().wooden_pickaxe>0&&items().wooden_axe>0)&&Date.now()-at<60000){await burrow.tick(t,bot,motor,state,api,scan,tasks);await bootstrap.tick(t,bot,motor);await sleep(150);}
   assert.ok(items().wooden_pickaxe>0);assert.ok(items().wooden_axe>0);assert.deepEqual(t.milestones,[]);assert.equal(burrow.sealed(bot,t.wilderness.burrow),true);
   assert.equal(bot.blockAt(new Vec3(...t.wilderness.burrow.workspace.floor)).name,'crafting_table');row.result=pose();row.workspace=t.wilderness.burrow.workspace;row.bootstrap=t.wilderness.burrow.pilotBootstrap;
   assert.ok((items().acacia_planks||0)<7);assert.ok((items().stick||0)<4);
   await host('daylight');await sleep(700);const exitAt=Date.now();
   while(t.wilderness.burrow&&Date.now()-exitAt<30000){await burrow.tick(t,bot,motor,state,api,scan,tasks);await sleep(100);}
   assert.equal(t.wilderness.burrow,null);assert.equal(t.phase,'gather');assert.ok(bot.entity.position.y>=80);
   row.exit_after_bootstrap=pose();
  });
  await stageCheck('daylight surface workbench and axe consume real raw logs before further gathering',async row=>{
   const localBootstrap=require('../pilot/local_bootstrap.cjs');
   const t=await setup('surface_bootstrap');t.phase='gather';t.wilderness.burrow=null;
   row.initial=pose();assert.equal(items().wooden_axe||0,0);assert.equal(items().wooden_pickaxe||0,0);
   assert.equal(items().crafting_table||0,0);assert.equal(items().oak_log,3);
   const at=Date.now();row.steps=[];
   while(!(items().wooden_axe>0)&&Date.now()-at<60000){
    const handled=await localBootstrap.tick(t,bot,motor,state,{now:Date.now()});
    row.steps.push({at:Date.now(),handled,pose:pose(),message:t.message,workbench:t.wilderness.pilotWorkbench});
    assert.ok(t.wilderness.burrow==null);await sleep(150);
   }
   assert.ok(items().wooden_axe>0);assert.ok((items().oak_log||0)<3);assert.deepEqual(t.milestones,[]);
   assert.equal(bot.health,20);assert.equal(bot.game.gameMode,'survival');
   const table=t.wilderness.pilotWorkbench;assert.ok(table?.position);
   assert.equal(bot.blockAt(new Vec3(...table.position)).name,'crafting_table');
   row.result=pose();row.workbench=table;
  });
  report.complete=report.scenarios.every(s=>s.passed);
  if(!report.complete){report.error='One or more independent native checks failed';process.exitCode=1;}
 }catch(e){report.error=e.stack||e.message;process.exitCode=1;}
 finally{motor?.pause();bot?.quit('Private burrow verification complete');await sleep(500);report.finished_at=Date.now();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:report.complete,error:report.error,scenarios:report.scenarios.map(s=>({name:s.name,passed:s.passed,error:s.error}))}));setTimeout(()=>process.exit(process.exitCode||0),300);}
})().catch(e=>{console.error(e);process.exitCode=1;});
const timer=setTimeout(()=>{report.error='Native fixture actor deadline';motor?.pause();bot?.quit();process.exit(1);},450000);timer.unref();
