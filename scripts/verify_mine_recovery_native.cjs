// Disposable loopback Paper only. This replays the tool/lighting prerequisite loop.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync, writeFileSync, appendFileSync, readdirSync } = require('node:fs');
const { resolve, relative, join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const mineflayer = require('mineflayer');
const { Rcon } = require('rcon-client');
const { Vec3 } = require('vec3');

const arm = process.argv[2];
assert.ok(['baseline', 'candidate'].includes(arm), 'Specify baseline or candidate');
const source = resolve(arm === 'baseline' ? 'logs/mining-recovery-baseline/controller' : 'controller');
function verifyArchivedSource(){
  const root=resolve(source,'..'),commit='658c3c2';
  const expected=execFileSync('git',['ls-tree','-r','--name-only',commit,'controller','config'],{encoding:'utf8'}).trim().split('\n');
  const walk=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
    const file=join(folder,entry.name);return entry.isDirectory()?walk(file):[relative(root,file).replaceAll('\\','/')];
  });
  assert.deepEqual([...walk(join(root,'controller')),...walk(join(root,'config'))].sort(),expected.sort(),
    'archived source must contain exactly the published controller/config files');
  const hash=createHash('sha256');
  for(const file of expected){
    const actual=readFileSync(join(root,file),'utf8').replace(/\r\n/g,'\n');
    const published=execFileSync('git',['show',commit+':'+file],{encoding:'utf8'}).replace(/\r\n/g,'\n');
    assert.equal(actual,published,'archived source differs from the published baseline at '+file);
    hash.update(file);hash.update(actual);
  }
  return {commit,files:expected.length,canonical_sha256:hash.digest('hex')};
}
const provenance=arm==='baseline'?verifyArchivedSource():null;
if(process.argv.includes('--verify-source')){
  assert.ok(provenance,'Source verification applies to the archived baseline');
  console.log(JSON.stringify(provenance));process.exit(0);
}
const mine = require(source + '/staircase_mining');
const night = require(source + '/first_night');
const { HutTeacher, surface } = require(source + '/hut_teacher');
const { WorldTiming } = require(source + '/world_timing');
const inventory = require(source + '/inventory_sync');
const { createMotor } = require(source + '/locomotion');
const tasks = require(source + '/tasks');
const { scan } = require(source + '/perception');
const house = require(source + '/house');

const properties = readFileSync('logs/survival-paper-fixture/server.properties', 'utf8');
assert.match(properties, /^server-ip=127\.0\.0\.1\r?$/m);
assert.match(properties, /^server-port=25571\r?$/m);
assert.match(properties, /^rcon\.port=25572\r?$/m);
const password = properties.match(/^rcon\.password=(.+)\r?$/m)?.[1].trim();
assert.ok(password);
const username = 'LabMineRecovery';
const low = new Vec3(124, 158, 124);
const high = new Vec3(170, 184, 160);
const start = new Vec3(140.5, 180, 140.5);
const plot = { x:160, y:180, z:146 };
const count = (bot, name) => bot.inventory.items().filter(i => i.name === name).reduce((sum, item) => sum + item.count, 0);
const output = { arm, revision:require(source + '/controller_revision'), baseline_commit:'658c3c2', baseline_provenance:provenance,
  geometry:{ low:low.toArray(), high:high.toArray(), start:start.toArray(), dirt_bottom:174, stone_top:173, plot },
  fixture_supplies:{ wooden_pickaxe_damage:45, oak_log:8, oak_planks:8, stick:4 },
  transitions:[], digs:[], crafts:[], entries:[], interruptions:[], production_health:[] };
output.journal=`logs/mine-recovery-${arm}-${Date.now()}.jsonl`;
const journal=(event,data)=>appendFileSync(output.journal,JSON.stringify({event,at:Date.now(),...data})+'\n');
const pos = p => p.toArray().join(' ');

async function eachBand(command, bottom, top, block) {
  for(let y=bottom.y; y<=top.y; y+=16) {
    await command(`fill ${bottom.x} ${y} ${bottom.z} ${top.x} ${Math.min(y+15,top.y)} ${top.z} ${block}`);
  }
}
function verifyVolume(bot, expected) {
  for(let x=low.x; x<=high.x; x++) for(let z=low.z; z<=high.z; z++) for(let y=low.y; y<=high.y; y++) {
    assert.equal(bot.blockAt(new Vec3(x,y,z))?.name, expected, `fixture block ${x},${y},${z}`);
  }
}
async function loadedVolume(bot){
  const cells=[];
  for(let x=Math.floor(low.x/16);x<=Math.floor(high.x/16);x++)
    for(let z=Math.floor(low.z/16);z<=Math.floor(high.z/16);z++)cells.push(new Vec3(x*16,low.y,z*16));
  const deadline=Date.now()+10000;
  while(cells.some(p=>!bot.blockAt(p))&&Date.now()<deadline)await wait(100);
  assert.ok(cells.every(p=>bot.blockAt(p)),'all disposable volume chunks loaded before verification');
}
function snapshot(t, bot, started) {
  const m=t.wilderness.mine;
  return { elapsed_ms:Date.now()-started, phase:t.phase, mine_stage:m?.stage, mine_entry:m?.entry,
    mine_steps:m?.steps, mine_reason:m?.reason, position:bot.entity.position.toArray(), grounded:bot.entity.onGround,
    health:bot.health,food:bot.food,
    cobblestone:count(bot,'cobblestone'), torch:count(bot,'torch'), charcoal:count(bot,'charcoal'),
    pickaxes:bot.inventory.items().filter(i=>i.name.endsWith('_pickaxe')).map(i=>({name:i.name,damage:i.durabilityUsed,count:i.count})),
    recovery:t.wilderness.stoneRecovery?.need, tool_recovery:t.wilderness.toolRecovery?.stage, message:t.message,
    navigation:t.lastNavigation?{state:t.lastNavigation.state,target:t.lastNavigation.target,cue:t.lastNavigation.cue,
      controls:t.lastNavigation.motor_after?.controls}:null };
}

async function replay(bot, command, motor) {
  const t=new HutTeacher();
  const state={run:'native-mine-loop-'+arm,world:{mission:'first_night',first_night:{id:3,hostiles:true},driver:'teacher',
    bounds:[126,169,126,159],index:0,count:1,time_budget_seconds:3600}};
  let prepared=false, started=Date.now(), firstMine, sawBreak=false, interrupted=false, doneCount=0, actionStarted=null;
  const action=async(name,call)=>{
    actionStarted={name,at:Date.now(),phase:t.phase,mine_stage:t.wilderness?.mine?.stage};
    try{return await call();}finally{actionStarted=null;}
  };
  const activity=setInterval(()=>{
    if(actionStarted&&Date.now()-actionStarted.at>=3000)journal('pending_action',actionStarted);
  },3000);
  const original={ daylight:(await command('gamerule doDaylightCycle')).match(/(true|false)/)[1],
    spawning:(await command('gamerule doMobSpawning')).match(/(true|false)/)[1] };
  try {
    await command('gamemode spectator '+username);
    await command(`tp ${username} ${pos(start.offset(0,7,0))}`);
    await bot.waitForChunksToLoad();await loadedVolume(bot);verifyVolume(bot,'air');
    prepared=true;
    await command('gamerule doMobSpawning false'); await command('gamerule doDaylightCycle false'); await command('time set 6000');
    await eachBand(command,low,new Vec3(high.x,173,high.z),'stone');
    await eachBand(command,new Vec3(low.x,174,low.z),new Vec3(high.x,179,high.z),'dirt');
    await command(`setblock ${pos(house.point(plot,'table'))} crafting_table`);
    await command('clear '+username);
    await command(`give ${username} wooden_pickaxe[damage=45] 1`);
    for(const [name,n] of [['oak_log',8],['oak_planks',8],['stick',4]]) await command(`give ${username} ${name} ${n}`);
    await command(`tp ${username} ${pos(start)}`);await command('gamemode creative '+username);
    const footingDeadline=Date.now()+6000;
    while((!bot.entity.onGround||bot.entity.position.distanceTo(start)>.2)&&Date.now()<footingDeadline)await bot.waitForTicks(1);
    assert.ok(bot.entity.onGround&&bot.entity.position.distanceTo(start)<.2,'fixture reset has real grounded footing before survival');
    await command('effect clear '+username);
    await command(`effect give ${username} instant_health 1 4 true`);await command(`effect give ${username} saturation 1 4 true`);
    await bot.waitForTicks(22);await command('effect clear '+username);
    await command('gamemode survival '+username);
    await bot.waitForTicks(6); await inventory.sync(bot); await inventory.equip(bot,'wooden_pickaxe');
    assert.equal(bot.game.gameMode,'survival'); assert.equal(bot.entity.onGround,true); assert.equal(count(bot,'cobblestone'),0);
    assert.equal(count(bot,'torch'),0); assert.equal(count(bot,'wooden_pickaxe'),1);assert.equal(bot.health,20);assert.equal(bot.food,20);
    Object.assign(t,{run:state.run,phase:'night_stone',plot,table:house.point(plot,'table'),campPlots:[],milestones:['wooden_pickaxe'],
      started:Date.now(),lastProgress:Date.now(),timing:new WorldTiming(Date.now()),runtime:tasks.createRuntime(),
      path:[],resources:[],harvested:0});
    night.init(t,state.world);
    const craft=t.craft.bind(t);
    t.craft=async(...args)=>{const before=snapshot(t,bot,started); await craft(...args);await inventory.sync(bot);
      const result={name:args[1],before,after:snapshot(t,bot,started)};output.crafts.push(result);journal('craft',result);};
    const dig=bot.dig.bind(bot);
    bot.dig=async(block,...args)=>{
      const before={block:block.name,position:block.position.toArray(),tool:bot.heldItem?.name,damage:bot.heldItem?.durabilityUsed};
      const result=await dig(block,...args);await inventory.sync(bot);
      const resultRow={...before,after_tool:bot.heldItem?.name,after_damage:bot.heldItem?.durabilityUsed,confirmed:bot.blockAt(block.position)?.name};
      output.digs.push(resultRow);journal('dig',resultRow);
      return result;
    };
    const api=async(path,data)=>{if(path==='/step')return {action:data.teacher}; if(path==='/world/report')return {};throw Error('Unexpected fixture API '+path);};
    assert.equal(output.setup_deaths,0,'setup must not include a death before survival release');
    output.released_at=Date.now();output.survival_start={position:bot.entity.position.toArray(),grounded:bot.entity.onGround,health:bot.health,food:bot.food};
    started=Date.now();
    let signature='', healthAt=0;
    for(let tick=0; tick<4000 && Date.now()-started<9*60000; tick++) {
      assert.ok(bot.health>0,'the survival fixture bot remains alive');
      if(Date.now()>=healthAt){
        healthAt=Date.now()+10000;
        const response=await fetch('http://localhost:8000/fixture/health',{signal:AbortSignal.timeout(4000)});
        assert.equal(response.ok,true,'production health remains responsive');
        const health=await response.json();
        output.production_health.push({at:Date.now(),ram_percent:health.ram_percent,pid:health.server.pid,
          ready:health.server.ready,bots:health.server.bots_online,phase:health.world_training.session?.phase,
          learning_phase:health.world_learning.phase,mode:health.mode});
        assert.ok(health.ram_percent<89&&!health.stopped&&health.server.ready&&health.server.pid===output.production_paper_pid&&
          health.server.bots_online===8&&!['paused','stopping'].includes(health.world_learning.phase)&&health.mode!=='paused',
          'production headroom and lifecycle remain available');
      }
      t.message='';
      // A near-complete resource scan is an observation, not a supplied stone target.
      if(t.wilderness.mine?.stage==='done') {
        doneCount++;
        t.wilderness.stoneScan=Date.now();t.wilderness.stones=[];t.wilderness.stonePlanAt=Date.now()+500;
      }
      if(!await action('survival_interrupt',()=>night.interrupt(t,bot,motor,state,api,scan))) {
        await action('lesson_tick',()=>night.tick(t,bot,motor,state,api,scan,tasks,surface));
      }
      await action('inventory_sync',()=>inventory.sync(bot));
      const row=snapshot(t,bot,started), m=t.wilderness.mine;
      const entry=m?.entry?.join(',');
      if(entry && !output.entries.some(e=>e.join(',')===entry)) output.entries.push([...m.entry]);
      firstMine??=m?.entry?.slice();
      if(arm==='candidate'&&output.entries.length>1)throw Error('Candidate abandoned the recorded staircase before completing its resource objective');
      if(!count(bot,'wooden_pickaxe') && !count(bot,'stone_pickaxe'))sawBreak=true;
      // Interrupt a healthy candidate after its resumed mine has confirmed footing.
      if(arm==='candidate'&&!interrupted&&output.crafts.some(c=>c.name==='torch')&&m?.stage==='dig'&&m.steps>=10) {
        await require(source+'/mine_cover_exit').tick(t,bot,motor,state,api,scan,tasks,'retreat');
        interrupted=true;output.interruptions.push(snapshot(t,bot,started));
      }
      const key=[row.phase,row.mine_stage,row.mine_steps,row.mine_reason,row.recovery,row.tool_recovery,row.cobblestone,row.torch].join('|');
      if(key!==signature){output.transitions.push(row);journal('transition',row);signature=key;writeFileSync(`logs/mine-recovery-${arm}-progress.json`,JSON.stringify(row,null,2));}
      if(arm==='baseline'&&output.entries.length>=2&&m?.steps>=1&&m.entry.join(',')!==firstMine.join(',')) {
        output.terminal=row; output.loop_reproduced=true;break;
      }
      if(arm==='candidate'&&t.phase==='night_fuel') {
        output.terminal=row;output.passed=true;break;
      }
      await wait(60);
    }
    output.terminal??=snapshot(t,bot,started);
    output.saw_tool_break=sawBreak;output.first_entry=firstMine;output.done_visits=doneCount;
    if(arm==='baseline'){
      assert.equal(output.loop_reproduced,true,'return without a usable pick must clear the mine and select a second hole');
      assert.ok(output.transitions.some(r=>/No suitable pickaxe/.test(r.mine_reason||'')));
      assert.ok(output.digs.some(d=>d.tool==='wooden_pickaxe'&&d.block==='dirt'),'baseline spends a wooden pick on dirt');
    }else{
      assert.equal(output.passed,true,'candidate obtains the resource and advances the lesson');
      assert.ok(count(bot,'cobblestone')>=16);assert.equal(bot.entity.onGround,true);assert.equal(bot.entity.position.y,180);
      assert.deepEqual(output.entries,[firstMine],'all recoveries reuse the owned staircase');
      assert.ok(output.crafts.some(c=>c.name==='furnace'));assert.ok(output.crafts.some(c=>c.name==='torch'));
      assert.ok(output.crafts.some(c=>c.name.endsWith('_pickaxe')));assert.equal(interrupted,true);assert.equal(sawBreak,true);
      assert.ok(t.milestones.includes('quarry'));assert.equal(bot.health>0,true);
      assert.ok(!output.digs.some(d=>d.tool?.endsWith('_pickaxe')&&d.block==='dirt'),'candidate conserves the pickaxe on dirt');
      const full=t.wilderness.mine;
      const recorded={...full,path:full.path.slice(0,5).map(p=>p.slice()),supports:full.supports.slice(0,5).map(p=>p.slice()),
        steps:4,resume_count:0,stage:'done',recovery:'interrupted',coverExit:false,unsafe:false};
      assert.equal(mine.reusable(t,bot,state,recorded,'stone'),true,'unchanged native stairs can be revalidated');
      output.refusals={unsafe:!mine.reusable(t,bot,state,{...recorded,unsafe:true},'stone'),
        foreign_owner:!mine.reusable(t,bot,state,{...recorded,owner:'OtherFixture'},'stone')};
      const support=new Vec3(...recorded.path[3]).offset(0,-1,0),supportName=bot.blockAt(support).name;
      await command(`setblock ${pos(support)} air`);await bot.waitForTicks(3);
      output.refusals.changed_support=!mine.reusable(t,bot,state,recorded,'stone');
      await command(`setblock ${pos(support)} ${supportName}`);await bot.waitForTicks(3);
      assert.equal(mine.reusable(t,bot,state,recorded,'stone'),true,'restoring the same real support restores validation');
      const wet=new Vec3(...recorded.path[2]);
      await command(`setblock ${pos(wet)} water`);await bot.waitForTicks(3);
      output.refusals.flooded=!mine.reusable(t,bot,state,recorded,'stone');
      assert.ok(Object.values(output.refusals).every(Boolean));
    }
    output.milestones=t.milestones;output.final_inventory=bot.inventory.items().map(i=>({name:i.name,count:i.count,damage:i.durabilityUsed}));
  } catch(error){output.error=error.stack;throw error;} finally {
    clearInterval(activity);
    motor.pause();
    if(prepared){
      await command('gamemode spectator '+username);await command(`tp ${username} ${pos(start.offset(0,7,0))}`);await command('clear '+username);
      await eachBand(command,low,high,'air');await command(`kill @e[type=item,x=${low.x},y=${low.y},z=${low.z},dx=${high.x-low.x},dy=${high.y-low.y},dz=${high.z-low.z}]`);
      await command(`kill @e[type=experience_orb,x=${low.x},y=${low.y},z=${low.z},dx=${high.x-low.x},dy=${high.y-low.y},dz=${high.z-low.z}]`);
      await command('gamerule doDaylightCycle '+original.daylight);await command('gamerule doMobSpawning '+original.spawning);
      await loadedVolume(bot);verifyVolume(bot,'air');output.cleaned=true;
    }
  }
}
async function main(){
  const response=await fetch('http://localhost:8000/fixture/health',{signal:AbortSignal.timeout(4000)});
  assert.equal(response.ok,true,'production pre-release health remains responsive');
  const health=await response.json();output.production_paper_pid=health.server.pid;
  assert.ok(health.server.ready&&!health.server.busy&&health.server.bots_online===8&&!health.stopped&&health.ram_percent<89&&
    health.world_training.session?.phase==='running'&&!['paused','stopping'].includes(health.world_learning.phase)&&health.mode!=='paused',
    'production pre-release lifecycle and memory remain healthy');
  const rcon=await Rcon.connect({host:'127.0.0.1',port:25572,password,timeout:5000});
  const command=text=>rcon.send(text);
  assert.match(await command('list'),/^There are 0 of a max/);
  const bot=mineflayer.createBot({host:'127.0.0.1',port:25571,username,auth:'offline',version:'1.21.4'});
  const motor=createMotor(bot,{move:true,turn:true,jump:true,sprint:true});
  bot.on('physicsTick',()=>motor.tick());
  output.setup_deaths=0;
  bot.on('death',()=>{if(!output.released_at)output.setup_deaths++;});
  let ended=false;
  bot.on('end',()=>{ended=true;});
  inventory.attach(bot);require(source+'/resource_space').attach(bot);
  try{await once(bot,'spawn',{signal:AbortSignal.timeout(15000)});await replay(bot,command,motor);}
  catch(error){if(output.error&&output.error!==error.stack)output.cleanup_error=error.stack;else output.error=error.stack;process.exitCode=1;}
  finally{
    if(!ended){const closed=once(bot,'end',{signal:AbortSignal.timeout(5000)});bot.quit();await closed;}
    let roster;
    for(let attempt=0;attempt<20;attempt++){
      roster=await command('list');
      if(/^There are 0 of a max/.test(roster))break;
      await wait(100);
    }
    assert.match(roster,/^There are 0 of a max/);output.disconnected=true;await rcon.end();
  }
}
const deadline=setTimeout(()=>{output.error='Native mining fixture exceeded its eleven-minute process budget';
  console.log(JSON.stringify(output,null,2));process.exit(1);},11*60000);
main().catch(error=>{if(output.error)output.cleanup_error=error.stack;else output.error=error.stack;process.exitCode=1;}).finally(()=>{
  clearTimeout(deadline);console.log(JSON.stringify(output,null,2));setTimeout(()=>process.exit(process.exitCode||0),300);
});
