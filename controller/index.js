const mineflayer=require('mineflayer');const {scan}=require('./perception');
const tasks=require('./tasks');const {ownOxygen}=require('./air');
const fs=require('fs');const token=fs.readFileSync('data/api-token','utf8').trim();
const permissions=JSON.parse(fs.readFileSync('config/permissions.json','utf8'));
const curriculumPermissions=JSON.parse(fs.readFileSync('config/curriculum-permissions.json','utf8'));
const agentConfig=JSON.parse(fs.readFileSync('config/agents.json','utf8'));if(!Number.isInteger(agentConfig.count)||agentConfig.count<1||agentConfig.count>10)throw Error('Agent count must be 1-10');
const {applyMotion,pauseMotion}=require('./motion');
const {randomUUID}=require('crypto');
const bots=[];let quitting=false;
async function api(path,data){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();}
async function spawn(i){if(quitting)return;try{const status=await(await fetch('http://127.0.0.1:8000/status',{signal:AbortSignal.timeout(2000)})).json();if(status.server&&!status.server.ready){setTimeout(()=>spawn(i),2000);return;}}catch{setTimeout(()=>spawn(i),2000);return;}if(quitting)return;const name='LabAI'+i;const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline',version:'1.21.4',respawn:true});bots[i]=b;let tick=0,busy=false,goal=null,lastDistance=null,steps=0,phase='',episode=0,task=null,runtime=tasks.createRuntime(),readyAt=0,lastMetrics=null,activity='Connecting',decisionMs=250,lastDecisionAt=0;
 b.labOxygen=20;b._client.on('entity_metadata',packet=>{b.labOxygen=ownOxygen(packet,b.entity?.id,b.labOxygen);});
 b.on('spawn',()=>{api('/agent-life',{agent:name,event:'spawn',id:randomUUID()}).catch(e=>console.error(name,e.message));goal=null;lastDistance=null;console.log(JSON.stringify({event:'spawn',name}));});
 const write=b._client.write.bind(b._client);b._client.write=(packet,data)=>{if(['position','position_look','look'].includes(packet)&&Object.values(data).some(v=>typeof v==='number'&&!Number.isFinite(v)))console.error('INVALID_PACKET',name,packet,JSON.stringify(data),JSON.stringify({yaw:b.entity?.yaw,pitch:b.entity?.pitch,velocity:b.entity?.velocity}));return write(packet,data);};
 b.on('error',e=>console.error(name,e.message));b.on('kicked',r=>console.error(name,JSON.stringify(r),JSON.stringify({position:b.entity?.position,yaw:b.entity?.yaw,pitch:b.entity?.pitch,velocity:b.entity?.velocity})));
 function interrupted(reason){if(goal&&!quitting){api('/episode',{agent:name,run:phase,success:false,steps,distance:lastDistance,reason,task:task?.kind,metrics:lastMetrics||{health:0}}).catch(e=>console.error(name,e.message));goal=null;}}
 b.on('death',()=>{api('/agent-life',{agent:name,event:'death',id:randomUUID()}).catch(e=>console.error(name,e.message));interrupted('death');});
 b.on('end',()=>{interrupted('disconnect');api('/agent-disconnected',{agent:name}).catch(()=>{});console.log(name,'disconnected');if(!quitting)setTimeout(()=>spawn(i),5000);});
 b.on('physicsTick',async()=>{if(++tick%(task?.kind==='expedition'?2:5)||busy||!b.entity)return;busy=true;try{
 const heartbeat=()=>({agent:name,index:i,episode,position:[b.entity.position.x,b.entity.position.y,b.entity.position.z],health:b.health,food:b.food,entity_id:b.entity.id,dimension:b.game.dimension,activity,reset_seconds:goal?Math.ceil(Math.max(0,(task?.max_steps||120)-steps)*decisionMs/1000):null,reset_steps_left:goal?Math.max(0,(task?.max_steps||120)-steps):null,speed:Math.hypot(b.entity.velocity.x,b.entity.velocity.z)*20,players:Object.values(b.players).map(p=>({name:p.username,mode:p.gamemode}))});
 let state=await api('/assignment',heartbeat());
 if(phase!==state.run){episode=0;state=await api('/assignment',heartbeat());}
 if(state.mode==='paused'){activity='Waiting for next learning phase';pauseMotion(b,permissions);goal=null;return;}
 if(Date.now()<readyAt){activity='Loading arena / settling after teleport';b.clearControlStates();return;}
 const finishedTask=task&&lastMetrics&&tasks.reached(task,lastMetrics);
 const failedTask=task&&lastMetrics&&tasks.failed(task,lastMetrics);
 const escaped=task&&lastMetrics&&(!lastMetrics.inside||(lastMetrics.y<(task.y_min??176)||lastMetrics.y>(task.y_max??186)));
 if(phase!==state.run||!goal||steps>=(task?.max_steps||120)||(!task&&lastDistance!==null&&lastDistance<1.25)||finishedTask||failedTask||escaped||b.health<=0){
  if(goal&&phase===state.run){
   await api('/episode',{agent:name,run:phase,success:lastDistance!==null&&lastDistance<1.25&&b.health>0&&Math.abs(b.entity.position.y-goal[1])<1.5,steps,distance:lastDistance,task:task?.kind,metrics:lastMetrics||{health:0}});
   state=await api('/assignment',heartbeat());
   if(state.mode==='paused'){activity='Waiting for next learning phase';pauseMotion(b,permissions);goal=null;return;}
  }
  phase=state.run;episode++;steps=0;lastDecisionAt=0;decisionMs=250;goal=state.goal;lastDistance=null;task=state.task||null;runtime=tasks.createRuntime();lastMetrics=null;
  activity='Resetting task / teleporting';b.clearControlStates();
  await api('/reset',{agent:name,position:state.start,yaw:state.yaw,run:phase});b.clearControlStates();readyAt=Date.now()+(task?.reset_wait||.2)*1000;return;
 }
 const decisionAt=performance.now();if(lastDecisionAt)decisionMs=.8*decisionMs+.2*(decisionAt-lastDecisionAt);lastDecisionAt=decisionAt;
 const p=b.entity.position;const dx=goal[0]-p.x,dz=goal[2]-p.z;const distance=Math.hypot(dx,dz);
 const cue=task?tasks.navigationCue(b,task,runtime):goal;
 const desired=Math.atan2(-(cue[0]-p.x),-(cue[2]-p.z));const angle=Math.atan2(Math.sin(desired-b.entity.yaw),Math.cos(desired-b.entity.yaw));
 const t=performance.now(),s=scan(b);let obs=[...s.pooled,Math.sin(angle),Math.cos(angle),Math.min(distance/32,1),b.health/20,b.food/20,b.entity.onGround?1:0];
 let teacher=Math.abs(angle)>.18?(angle>0?1:2):0;let sensed=null;
 if(task){sensed=tasks.observeTask(b,task,s,runtime);lastMetrics=sensed.metrics;obs.push(...sensed.extra);teacher=tasks.teacherAction(b,task,sensed,runtime,angle);if(task.kind==='explore'||task.kind==='eat'){obs[64]=0;obs[65]=1;obs[66]=0;}}
 const reward=lastDistance===null?0:Math.max(-1,Math.min(1,lastDistance-distance))-.01;
 const res=await api('/step',{agent:name,run:phase,obs,teacher,reward,position:[p.x,p.y,p.z],health:b.health,food:b.food,hits:s.hits,perception_ms:performance.now()-t,steps,goal,task:task?.kind,metrics:lastMetrics});
 runtime.lastAction=res.action;
 applyMotion(b,res.action,permissions,task);activity=['Moving forward','Turning left to align','Turning right to align','Jumping forward','Policy chose to wait','Gathering wood','Eating'][res.action]||'Waiting';if(task?.kind==='expedition')activity=['Moving','Aligning left','Aligning right','Swimming / climbing forward','Waiting','Ascending','Descending'][res.action];if(task?.kind==='advanced'&&res.action===5)activity='Opening door';
 if((res.action===1||res.action===2)&&permissions.turn)await b.look(b.entity.yaw+(res.action===1?1:-1)*(task?.kind==='expedition'?.08:task?.kind==='advanced'?.12:.22),0,true);

 if(task&&task.kind!=='expedition'&&[5,6].includes(res.action))await tasks.interact(b,task,sensed,runtime,res.action,curriculumPermissions);
 lastDistance=distance;steps++;
 }catch(e){activity='Controller error: '+e.message.slice(0,100);b.clearControlStates();console.error(name,e.message);}finally{busy=false;}});
}
for(let i=0;i<agentConfig.count;i++)setTimeout(()=>spawn(i),i*1200);
function stop(){quitting=true;for(const b of bots)if(b)b.quit('Laboratory shutdown');setTimeout(()=>process.exit(0),1000);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);



