// Decode policy intentions into independent held controls and 20 Hz aiming.
const {applyMotion,pauseMotion}=require('./motion');
const {Vec3}=require('vec3');
const {sprintIntent,basicSprintSafe}=require('./sprint');
const {createRecovery}=require('./recovery');
const {createDoorway}=require('./doorway');
function applyPose(bot,wantsCrouch){
 if(!bot.physics||!bot.entity?.position||!bot.blockAt)return;
 const p=bot.entity.position;let ceiling=false;
 for(let x=Math.floor(p.x-.29);x<=Math.floor(p.x+.29);x++)for(let z=Math.floor(p.z-.29);z<=Math.floor(p.z+.29);z++)
  for(let y=Math.floor(p.y+1.49);y<=Math.floor(p.y+1.79);y++){
   const b=bot.blockAt(new Vec3(x,y,z));
   if(!b){ceiling=true;continue;}
   const shapes=b.shapes||(b.boundingBox==='block'?[[0,0,0,1,1,1]]:[]);
   if(shapes.some(a=>x+a[0]<p.x+.29&&x+a[3]>p.x-.29&&z+a[2]<p.z+.29&&z+a[5]>p.z-.29&&y+a[1]<p.y+1.79&&y+a[4]>p.y+1.5))ceiling=true;
  }
 const crouch=wantsCrouch||ceiling;
 // The bundled physics simulator otherwise uses a fixed standing collision box.
 bot.physics.playerHeight=crouch?1.5:1.8;bot.entity.height=bot.physics.playerHeight;bot.entity.eyeHeight=crouch?1.27:1.62;
 if(!!bot.getControlState('sneak')!==crouch)bot.setControlState('sneak',crouch);
 // 1.21.4 has the input packet, but still requires the pose entity action.
 if(bot.labCrouchPose!==crouch&&bot._client&&bot.version==='1.21.4'){
  bot._client.write('entity_action',{entityId:bot.entity.id,actionId:crouch?'start_sneaking':'stop_sneaking',jumpBoost:0});bot.labCrouchPose=crouch;
 }
}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function motorPlan(action,permissions,task,sensed,angle,traveling=false){
 if(task?.kind==='combat'){
  const turn=action===1||action===2;
  return {forward:!!permissions.move&&(action===0||turn&&Math.abs(angle)<.65&&sensed?.distance>2.7&&!sensed?.frontBlocked),
   back:!!permissions.move&&action===3&&!!sensed?.rearSafe,jump:false,sneak:false,
   yaw:turn&&permissions.turn?(action===1?1:-1)*Math.min(.8,Math.abs(angle)):0,label:null};
 }
 const turning=action===1||action===2;
 const steering=turning&&permissions.turn;
 const safe=!!sensed&&!sensed.frontHazard&&!sensed.headBlocked&&!sensed.frontBlocked;
 const walkingTurn=steering&&safe&&(!(sensed.leftUnsafe&&sensed.rightUnsafe)||Math.abs(angle)<.15)&&Math.abs(angle)<.95&&(traveling||Math.abs(angle)<.55);
 const door=action===5&&(task?.kind==='advanced'||task?.enclosed===true)&&!!sensed?.door&&!sensed?.closeShelterDoor;
 return {forward:!!permissions.move&&(action===0||action===3&&!!permissions.jump||walkingTurn||door&&!sensed?.frontHazard),
  jump:!!permissions.jump&&(action===3||task?.kind==='expedition'&&(action===5||turning&&!!sensed?.inWater)),
  sneak:!!permissions.jump&&task?.kind==='expedition'&&action===6,
  yaw:steering?(action===1?1:-1)*Math.min(.95,Math.max(.035,Math.abs(angle))):0,
  label:door?'Opening door while walking':walkingTurn?(action===1?'Steering left while walking':'Steering right while walking'):turning?'Turning to align':null};
}
function createMotor(bot,permissions,{clock=()=>Date.now(),legacy=false}={}){
 const recovery=createRecovery(),doorway=createDoorway();
 let plan=null,targetYaw=null,expires=0,last=clock(),paused=true,lookLocked=false,stalled=false;
 function clear(){recovery.reset();doorway.reset();bot.labRecovering=false;bot.labAvoiding=false;bot.setControlState('back',false);plan=null;targetYaw=null;paused=true;stalled=false;pauseMotion(bot,permissions);}
 return {
  command(action,task,sensed,angle){
   if(!Number.isFinite(angle)||!Number.isFinite(bot.entity?.yaw)){clear();return 'Waiting for valid orientation';}
   stalled=false;
   if(legacy){applyMotion(bot,action,permissions,task);return null;}
   plan=motorPlan(action,permissions,task,{...sensed,inWater:!!bot.entity?.isInWater},angle,!!bot.getControlState('forward'));
   const passage=doorway.update(plan,sensed||{},bot.entity.position,bot.entity.yaw,clock(),permissions);
   if(passage){recovery.reset();plan=passage;}
   else{
   plan=recovery.update(plan,{...sensed,inWater:!!bot.entity.isInWater,inLava:!!bot.entity.isInLava},bot.entity.position,bot.entity.yaw,clock(),permissions,angle,task?.bounds);
   }
   bot.labRecovering=recovery.active();bot.labAvoiding=recovery.remembering();
   if(plan.forward&&sensed?.crouchClearance){plan.sneak=true;plan.jump=false;plan.label='Crouching under low clearance';}
   plan.sprint=sprintIntent(bot,permissions,task,plan,sensed,angle,!!bot.getControlState('sprint'));
   if(plan.sprint)plan.label='Sprinting on clear ground';
   targetYaw=Number.isFinite(plan.targetYaw)?plan.targetYaw:plan.yaw?bot.entity.yaw+plan.yaw:null;expires=clock()+1000;paused=false;
   return plan.label;
  },
  pause:clear,
  status(){return stalled?'Waiting for policy response':doorway.active()?doorway.label():recovery.active()?recovery.label():plan?.sprint&&bot.getControlState('sprint')?'Sprinting on clear ground':null;},
  lockLook(value){lookLocked=value;},
  tick(){
   if(legacy||!bot.entity)return;
   const now=clock(),dt=Math.max(.01,Math.min(.1,(now-last)/1000));last=now;
   if(paused||now>expires){if(!paused){clear();stalled=true;}else pauseMotion(bot,permissions);applyPose(bot,!!bot.getControlState('sneak'));return;}
   let forward=!!plan.forward;
   if(forward&&plan.moveTarget&&bot.entity.position){
    const dx=plan.moveTarget.x-bot.entity.position.x,dz=plan.moveTarget.z-bot.entity.position.z,d=Math.hypot(dx,dz),v=bot.entity.velocity;
    const approaching=v?Math.max(0,(v.x*dx+v.z*dz)/Math.max(.001,d)):0;
    // Brake close to the alignment target without using the crouch pose as a speed limiter.
    if(d<.035||d<approaching*2.4+.04)forward=false;
   }
   for(const control of ['forward','back','jump','sneak'])if(!!bot.getControlState(control)!==(control==='forward'?forward:!!plan[control]))bot.setControlState(control,control==='forward'?forward:!!plan[control]);
   const sprint=!!plan.sprint&&forward&&!lookLocked&&now<=expires-750&&basicSprintSafe(bot);
   if(!!bot.getControlState('sprint')!==sprint)bot.setControlState('sprint',sprint);
   applyPose(bot,!!plan.sneak);
   if(targetYaw!==null&&!lookLocked&&permissions.turn){
    const delta=wrap(targetYaw-bot.entity.yaw),step=Math.sign(delta)*Math.min(Math.abs(delta),Math.PI*dt);
    if(Math.abs(delta)>.002)Promise.resolve(bot.look(bot.entity.yaw+step,0,true)).catch(()=>clear());
    else targetYaw=null;
   }
  }
 };
}
module.exports={motorPlan,createMotor,applyPose};
