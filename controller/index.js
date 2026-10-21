const mineflayer=require('mineflayer');const {scan}=require('./perception');
const fs=require('fs');const token=fs.readFileSync('data/api-token','utf8').trim();
const permissions=JSON.parse(fs.readFileSync('config/permissions.json','utf8'));
const bots=[];let quitting=false;
async function api(path,data){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();}
function spawn(i){if(quitting)return;const name='LabAI'+i;const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline',version:'1.21.4',respawn:true});bots[i]=b;let tick=0,busy=false,goal=null,lastDistance=null,steps=0,phase='',episode=0;
 b.on('spawn',()=>{goal=null;lastDistance=null;console.log(JSON.stringify({event:'spawn',name}));});
 const write=b._client.write.bind(b._client);b._client.write=(packet,data)=>{if(['position','position_look','look'].includes(packet)&&Object.values(data).some(v=>typeof v==='number'&&!Number.isFinite(v)))console.error('INVALID_PACKET',name,packet,JSON.stringify(data),JSON.stringify({yaw:b.entity?.yaw,pitch:b.entity?.pitch,velocity:b.entity?.velocity}));return write(packet,data);};
 b.on('error',e=>console.error(name,e.message));b.on('kicked',r=>console.error(name,JSON.stringify(r),JSON.stringify({position:b.entity?.position,yaw:b.entity?.yaw,pitch:b.entity?.pitch,velocity:b.entity?.velocity})));
 function interrupted(reason){if(goal&&!quitting){api('/episode',{agent:name,run:phase,success:false,steps,distance:lastDistance,reason}).catch(e=>console.error(name,e.message));goal=null;}}
 b.on('death',()=>interrupted('death'));
 b.on('end',()=>{interrupted('disconnect');console.log(name,'disconnected');if(!quitting)setTimeout(()=>spawn(i),5000);});
 b.on('physicsTick',async()=>{if(++tick%5||busy||!b.entity)return;busy=true;try{
 const heartbeat=()=>({agent:name,index:i,episode,position:[b.entity.position.x,b.entity.position.y,b.entity.position.z],health:b.health,food:b.food});
 let state=await api('/assignment',heartbeat());
 if(phase!==state.run){episode=0;state=await api('/assignment',heartbeat());}
 if(state.mode==='paused'){b.clearControlStates();goal=null;return;}
 if(phase!==state.run||!goal||steps>=120||(lastDistance!==null&&lastDistance<1.25)||b.health<=0){
  if(goal&&phase===state.run)await api('/episode',{agent:name,run:phase,success:lastDistance!==null&&lastDistance<1.25&&b.health>0&&Math.abs(b.entity.position.y-goal[1])<1.5,steps,distance:lastDistance});
  phase=state.run;episode++;steps=0;goal=state.goal;lastDistance=null;
  await api('/reset',{agent:name,position:state.start,yaw:state.yaw});b.clearControlStates();return;
 }
 const p=b.entity.position;const dx=goal[0]-p.x,dz=goal[2]-p.z;const distance=Math.hypot(dx,dz);
 const desired=Math.atan2(-dx,-dz);const angle=Math.atan2(Math.sin(desired-b.entity.yaw),Math.cos(desired-b.entity.yaw));
 const t=performance.now(),s=scan(b);const obs=[...s.pooled,Math.sin(angle),Math.cos(angle),Math.min(distance/32,1),b.health/20,b.food/20,b.entity.onGround?1:0];
 const teacher=Math.abs(angle)>.18?(angle>0?1:2):0;
 const reward=lastDistance===null?0:Math.max(-1,Math.min(1,lastDistance-distance))-.01;
 const res=await api('/step',{agent:name,run:phase,obs,teacher,reward,position:[p.x,p.y,p.z],health:b.health,food:b.food,hits:s.hits,perception_ms:performance.now()-t,steps,goal});
 b.clearControlStates();if(res.action===0&&permissions.move)b.setControlState('forward',true);
 if((res.action===1||res.action===2)&&permissions.turn)await b.look(b.entity.yaw+(res.action===1?.22:-.22),0,true);
 if(res.action===3&&permissions.move&&permissions.jump){b.setControlState('forward',true);b.setControlState('jump',true);}
 lastDistance=distance;steps++;
 }catch(e){b.clearControlStates();console.error(name,e.message);}finally{busy=false;}});
}
for(let i=0;i<5;i++)setTimeout(()=>spawn(i),i*1200);
function stop(){quitting=true;for(const b of bots)if(b)b.quit('Laboratory shutdown');setTimeout(()=>process.exit(0),1000);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);



