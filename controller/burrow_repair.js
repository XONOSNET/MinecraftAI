// Restore only a previously verified refuge shell. No supplies or lesson credit.
const {Vec3}=require('vec3'),inventory=require('./inventory_sync'),space=require('./resource_space');
function stable(b){
 const p=b.entity.position,floor=b.blockAt(new Vec3(Math.floor(p.x),Math.floor(p.y)-1,Math.floor(p.z)));
 return b.health>0&&b.entity.onGround===true&&!b.entity.isInWater&&!b.entity.isInLava&&floor?.boundingBox==='block'&&require('./emergency_burrow').SOLID.has(floor.name)&&!floor.getProperties?.().waterlogged;
}
function safeCell(t,b,q,state){
 const refuge=require('./emergency_burrow'),bounds=state.world.bounds;
 if(!stable(b)||!refuge.openCell(b.blockAt(q))||q.x<bounds[0]+1||q.x>=bounds[1]-1||q.z<bounds[2]+1||q.z>=bounds[3]-1)return false;
 if((t.campPlots||[]).some(h=>Math.abs(q.x-h.x)<=4&&Math.abs(q.z-h.z)<=4))return false;
 if(!space.clearOfPlayers(b,q.offset(.5,.5,.5),1))return false;
 for(const [x,y,z] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
  const block=b.blockAt(q.offset(x,y,z));if(!block||refuge.DANGER.has(block.name)||block.name.endsWith('_concrete_powder')||block.getProperties?.().waterlogged)return false;
 }
 return true;
}
function pocketFace(b,feet,q){
 const face=new Vec3(feet.x-q.x,0,feet.z-q.z),eye=b.entity.position.offset(0,b.entity.eyeHeight??1.62,0);
 for(const height of [.8,.5,.2]){
  const point=q.offset(.5+face.x*.5,height,.5+face.z*.5),ray=point.minus(eye),distance=ray.norm();
  if(distance>4.2||distance<.01)continue;
  const hit=b.world?.raycast(eye,ray.scaled(1/distance),distance+.02);
  if(hit?.position?.equals(q))return point;
 }
 return null;
}
async function repair(t,b,motor,s,problem,state){
 const refuge=require('./emergency_burrow'),now=Date.now(),feet=new Vec3(...s.feet),q=new Vec3(...problem.position);
 const ownedRoof=q.equals(new Vec3(...s.cap))&&s.stage==='hidden';
 const shell=Math.abs(q.x-feet.x)<=1&&Math.abs(q.z-feet.z)<=1&&q.y>=feet.y-4&&q.y<feet.y&&!(q.x===feet.x&&q.z===feet.z&&q.y>feet.y-3);
 if(!s.shellVerified||(!ownedRoof&&!shell)||!problem.patchable||!safeCell(t,b,q,state))return false;
 // Stay inside the exact verified shaft; no improvised tunnelling or blind exits.
 const p=b.entity.position;if(Math.abs(p.x-feet.x-.5)>.3||Math.abs(p.z-feet.z-.5)>.3)return false;
 const recovery=s.shellRecovery;
 if(!recovery||recovery.status==='Shell restored and rechecked')s.shellRecovery={at:now,attempts:0,status:'Checking the damaged refuge'};
 const r=s.shellRecovery;if(now-r.at>15000||r.attempts>=6){r.status='Bounded repair exhausted';return false;}
 const refs=require('./placement_reference').references(b,q,{visibleOnly:true}).filter(ref=>refuge.SOLID.has(ref.block.name)&&!ref.block.getProperties?.().waterlogged);
 if(!refs.length){r.status='No visible supporting face for repair';return false;}
 if(await refuge.defendOpening(t,b,motor,s,q)){r.status='Defending the breach before repairing';return true;}
 await inventory.sync(b);
 const pick=()=>b.inventory.items().find(i=>['dirt','coarse_dirt','rooted_dirt'].includes(i.name)&&i.count>0);
 let item=pick();
 if(!item){
  // Reuse the existing capped side-pocket rule; the outer shell remains closed.
  if(Math.round(p.y)===feet.y-2&&!s.repairNotch){
   const pocket=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>feet.offset(x,-2,z)).find(cell=>refuge.safeNotch(b,feet,cell)&&refuge.EARTH.has(b.blockAt(cell)?.name)&&b.canDigBlock?.(b.blockAt(cell))&&require('./resource_target').withinReach(b,cell)&&pocketFace(b,feet,cell));
   if(pocket){
    motor.pause();motor.lockLook(true);
    try{
     await b.lookAt(pocketFace(b,feet,pocket));
     if(!stable(b)||!refuge.safeNotch(b,feet,pocket)||!refuge.EARTH.has(b.blockAt(pocket)?.name)||!pocketFace(b,feet,pocket))return false;
     await b.dig(b.blockAt(pocket),'ignore');
    }finally{motor.lockLook(false);}
    if(!refuge.openCell(b.blockAt(pocket)))return false;
    s.repairNotch=pocket.toArray();t.lastProgress=s.progressAt=Date.now();r.status='Collecting real dirt from a closed side pocket';return true;
   }
  }
  r.status='Waiting for a real repair dirt pickup';t.message='Emergency refuge repair: '+r.status;return true;
 }
 const ref=refs[r.attempts%refs.length];r.attempts++;
 motor.pause();motor.lockLook(true);
 try{
  await inventory.equip(b,item.name,{synced:true});await b.lookAt(ref.point);
  if(!safeCell(t,b,q,state)||!require('./placement_reference').references(b,q,{visibleOnly:true}).some(v=>v.key===ref.key&&v.block.name===ref.block.name))return false;
  try{await b._placeBlockWithOptions(ref.block,ref.face,{forceLook:'ignore',swingArm:'right',delta:ref.delta});}
  catch(error){if(!/Server refused|Server did not answer|blockUpdate.*timeout/i.test(error.message))throw error;}
 }finally{motor.lockLook(false);}
 if(b.blockAt(q)?.name!==item.name){r.status='Retrying a refused repair face';t.message='Emergency refuge repair: '+r.status;return true;}
 // Confirmed placements are progress, not failed retries. Keep the original
 // 15-second recovery deadline across every breach in this damaged shell.
 r.attempts=0;
 s.shellRepairs=(s.shellRepairs||0)+1;t.lastProgress=s.progressAt=Date.now();r.status='Placed real dirt; rechecking refuge safety';t.message='Patched the damaged refuge shell; rechecking before waiting';return true;
}
module.exports={repair,safeCell,stable,pocketFace};
