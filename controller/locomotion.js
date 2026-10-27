// Decode policy intentions into independent held controls and 20 Hz aiming.
const {applyMotion,pauseMotion}=require('./motion');
const {Vec3}=require('vec3');
const {sprintIntent,basicSprintSafe,flatSprintPath,routeRunway}=require('./sprint');
const {createRecovery}=require('./recovery');
const {createDoorway}=require('./doorway');
const {proximity}=require('./perception');
const space=require('./resource_space');
const {forBot}=require('./behavior');
const {corridorDistance}=require('./world_navigation');
const {createStrafe,safe:strafeSafe}=require('./strafe');
const {standable}=require('./field_navigation');
function routeProbe(position,focus,fallback){return focus?Math.min(fallback,Math.max(.1,Math.hypot(focus[0]-position.x,focus[2]-position.z))):fallback;}
function safeAutoStep(bot,task,plan,angle){
 if(!task?.auto_step||!task.strict_ground||!plan.forward||plan.back||plan.sneak||bot.entity.onGround!==true||Math.abs(angle)>.2)return false;
 const q=task.waypoints?.[0],p=bot.entity.position;if(!q)return false;
 const rise=q[1]-p.y,adjacent=Math.abs(Math.floor(q[0])-Math.floor(p.x))+Math.abs(Math.floor(q[2])-Math.floor(p.z))===1;
 if(rise<.6||rise>1.2||!adjacent||Math.hypot(q[0]-p.x,q[2]-p.z)>1.5||!standable(bot,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])))return false;
 const over=bot.blockAt(p.floored().offset(0,2,0));return !!over&&over.boundingBox==='empty';
}
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
 const recovery=createRecovery(()=>forBot(bot)),doorway=createDoorway(),strafe=createStrafe(bot);
 let plan=null,targetYaw=null,expires=0,last=clock(),paused=true,lookLocked=false,stalled=false,lastSafetyAt=-Infinity,groundSafe=true,lastSprintSafetyAt=-Infinity,sprintSafe=false;
 function clear(){recovery.reset();doorway.reset();strafe.reset();bot.labRecovering=false;bot.labAvoiding=false;bot.setControlState('back',false);plan=null;targetYaw=null;paused=true;stalled=false;pauseMotion(bot,permissions);}
 return {
  command(action,task,sensed,angle){
   if(!Number.isFinite(angle)||!Number.isFinite(bot.entity?.yaw)){clear();return 'Waiting for valid orientation';}
   stalled=false;
   if(legacy){applyMotion(bot,action,permissions,task);return null;}
   plan=motorPlan(action,permissions,task,{...sensed,inWater:!!bot.entity?.isInWater},angle,!!bot.getControlState('forward'));
   const focus=(task?.navigation_lock||task?.center_route)&&sensed?.focusPoint&&[0,1,2,3].includes(action)?sensed.focusPoint:null;
   // Face the planned corridor before trying to move. A wall in the old
   // viewing direction is not evidence that the new corridor requires backing.
   if(focus&&Math.abs(angle)>.35){plan.forward=false;plan.jump=false;}
   // At an alignment point the next leg may turn or climb. Probe the body
   // corridor to that point, not through the wall beyond the upcoming turn.
   if(focus&&task.center_route&&Math.hypot(focus[0]-bot.entity.position.x,focus[2]-bot.entity.position.z)<.8&&Math.abs(focus[1]-bot.entity.position.y)<.4&&Math.abs(angle)<.35&&sensed?.canWalk?.(bot.entity.yaw+angle,routeProbe(bot.entity.position,focus,.75))){recovery.reset();sensed={...sensed,wallAhead:false};}
   const rise=task?.strict_ground&&task.waypoints?.length?task.waypoints[0][1]-bot.entity.position.y:0;
   const autoStep=permissions.jump&&safeAutoStep(bot,task,plan,angle);
   if(autoStep){plan.jump=true;plan.label='Stepping up the verified route';}
   // A verified ascending waypoint is a step, even when the longer wall probe
   // also sees the next terrace. Execute a chosen jump without backing away.
   if((action===3||autoStep)&&permissions.jump&&rise>.6&&rise<1.2&&Math.abs(angle)<.35){recovery.reset();sensed={...sensed,wallAhead:false};}
   const lateral=permissions.move?strafe.choose(action,task,sensed,angle,plan,clock()):null;
   if(lateral?.pure){plan.forward=false;plan.yaw=0;recovery.reset();}
   const passage=doorway.update(plan,sensed||{},bot.entity.position,bot.entity.yaw,clock(),permissions);
   if(passage){recovery.reset();plan=passage;}
   else{
   plan=recovery.update(plan,{...sensed,inWater:!!bot.entity.isInWater,inLava:!!bot.entity.isInLava},bot.entity.position,bot.entity.yaw,clock(),permissions,angle,task?.bounds);
   }
   bot.labRecovering=recovery.active();bot.labAvoiding=recovery.remembering();
   if(lateral&&!passage&&!recovery.active()){plan.side=lateral.side;plan.label=lateral.label;plan.strafeTask=task;}
   if(focus&&!passage&&!recovery.active()){
    plan.focusPoint=focus;plan.preciseFocus=!!task?.center_route;plan.arrivalDistance=task?.center_route ? .08 : .22;plan.label=Math.abs(angle)>.35?'Acquiring locked route heading':'Following locked route';
    if(lateral)plan.label=lateral.label;
   }
   if(task?.safe_walk){
    // A committed doorway may need a short back-off to its alignment point.
    // Its own probes still enforce clearance; the route corridor points inward.
    plan.safeWalk=true;plan.strictGround=!!task.strict_ground;plan.corridor=passage?null:task.route_corridor||null;
    const rise=(task.waypoints?.[0]?.[1]??bot.entity.position.y)-bot.entity.position.y;
    const plannedStep=rise>.6&&rise<1.2&&Math.abs(angle)<.35;
    plan.descent=plan.strictGround&&rise<-.6&&rise> -1.2&&Math.abs(angle)<.35;
    if(!plannedStep)plan.jump=false;
    if(plannedStep&&plan.jump)plan.stepLevel=task.waypoints[0][1];
    if(plan.forward&&bot.entity.onGround!==false&&typeof sensed?.canStepDown==='function'&&!(plan.strictGround&&!plan.descent&&sensed.canWalk?sensed.canWalk(bot.entity.yaw,routeProbe(bot.entity.position,task?.center_route?focus:null,.75)):sensed.canStepDown(bot.entity.yaw,plan.descent ? .35 : .75))&&!(plan.jump&&plannedStep)){
     plan.forward=false;plan.label='Holding: blocked ground or unsafe drop ahead';
    }
   }
   plan.avoidPlayers=!!task?.avoid_players;plan.levelLook=!!task?.quick_look;
   plan.yawRate=task?.quick_look?forBot(bot).walk_yaw_deg_per_sec*Math.PI/180:Math.PI;
   if(plan.forward&&sensed?.crouchClearance){plan.sneak=true;plan.jump=false;plan.label='Crouching under low clearance';}
   if(autoStep&&plan.jump&&plan.forward)plan.label='Stepping up the verified route';
   plan.sprint=!plan.side&&!plan.descent&&sprintIntent(bot,permissions,task,plan,sensed,angle,!!bot.getControlState('sprint'));
   plan.sprintTask=task;lastSprintSafetyAt=-Infinity;
   if(plan.sprint)plan.label='Sprinting on clear ground';
   targetYaw=Number.isFinite(plan.targetYaw)?plan.targetYaw:plan.yaw?bot.entity.yaw+plan.yaw:null;expires=clock()+1000;paused=false;
   return plan.label;
  },
  pause:clear,
  passageActive:()=>doorway.active(),
  status(){return stalled?'Waiting for policy response':doorway.active()?doorway.label():recovery.active()?recovery.label():plan?.side&&(bot.getControlState('left')||bot.getControlState('right'))?plan.label:plan?.sprint&&bot.getControlState('sprint')?'Sprinting on clear ground':null;},
  diagnostic(){return {label:plan?.label||null,paused,expired:!paused&&clock()>expires,ground_safe:groundSafe,precise_focus:!!plan?.preciseFocus,recovering:recovery.active(),doorway:doorway.active(),controls:Object.fromEntries(['forward','back','left','right','jump','sneak','sprint'].map(k=>[k,!!bot.getControlState(k)]))};},
  lockLook(value){lookLocked=value;},
  tick(){
   if(legacy||!bot.entity)return;
   const now=clock(),dt=Math.max(.01,Math.min(.1,(now-last)/1000));last=now;
   if(paused||now>expires){if(!paused){clear();stalled=true;}else pauseMotion(bot,permissions);applyPose(bot,!!bot.getControlState('sneak'));return;}
   let forward=!!plan.forward;
   // Policy replies can arrive late; recheck support while holding an intention.
   if(forward&&plan.safeWalk&&bot.blockAt&&bot.entity.onGround!==false&&!(plan.stepLevel&&bot.entity.position.y<plan.stepLevel-.3)){
    if(now-lastSafetyAt>=100){const local=proximity(bot,{recovery:false}),distance=plan.descent ? .35 : routeProbe(bot.entity.position,plan.preciseFocus?plan.focusPoint:null,Math.max(.75,Math.hypot(bot.entity.velocity?.x||0,bot.entity.velocity?.z||0)*3+.35));groundSafe=plan.strictGround&&!plan.descent?local.canWalk(bot.entity.yaw,distance):local.canStepDown(bot.entity.yaw,distance);lastSafetyAt=now;}
    if(!groundSafe){forward=false;plan.label='Holding: blocked ground or unsafe drop ahead';}
   }
   if(plan.strictGround&&plan.back&&bot.blockAt&&bot.entity.onGround!==false&&!proximity(bot,{recovery:false}).canWalk(bot.entity.yaw+Math.PI,.75)){plan.back=false;plan.label='Holding: unsafe ground behind me';}
   if(plan.corridor?.length>1&&forward){
    const p=bot.entity.position,q={x:p.x-Math.sin(bot.entity.yaw)*.7,z:p.z-Math.cos(bot.entity.yaw)*.7};
    if(corridorDistance(q,plan.corridor)>.65){forward=false;plan.label='Aligning with the verified route';}
   }
   if(plan.focusPoint){
    const dx=plan.focusPoint[0]-bot.entity.position.x,dz=plan.focusPoint[2]-bot.entity.position.z,d=Math.hypot(dx,dz);
    targetYaw=d>.18?Math.atan2(-dx,-dz):null;
    const v=bot.entity.velocity,approaching=v?Math.max(0,(v.x*dx+v.z*dz)/Math.max(.001,d)):0;
    // Brake before a precise cell center. Residual velocity otherwise carries
    // the body past it between policy replies and starts a turn-back loop.
    if(d<=(plan.arrivalDistance||.22)||plan.preciseFocus&&d<approaching*2.4+.04||targetYaw!==null&&Math.abs(wrap(targetYaw-bot.entity.yaw))>.35)forward=false;
   }
   if(forward&&plan.moveTarget&&bot.entity.position){
    const dx=plan.moveTarget.x-bot.entity.position.x,dz=plan.moveTarget.z-bot.entity.position.z,d=Math.hypot(dx,dz),v=bot.entity.velocity;
    const approaching=v?Math.max(0,(v.x*dx+v.z*dz)/Math.max(.001,d)):0;
    // Brake close to the alignment target without using the crouch pose as a speed limiter.
    if(d<.035||d<approaching*2.4+.04)forward=false;
   }
   if(plan.avoidPlayers){
    const p=bot.entity.position,others=space.players(bot),clear=sign=>space.stepClear(p,{x:p.x-sign*Math.sin(bot.entity.yaw)*.7,y:p.y,z:p.z-sign*Math.cos(bot.entity.yaw)*.7},others,forBot(bot).player_clearance);
    if(forward&&!clear(1)){forward=false;plan.label='Waiting for nearby player to clear the route';}
    if(plan.back&&!clear(-1))plan.back=false;
   }
   const side=!lookLocked&&plan.side&&strafeSafe(bot,plan.strafeTask,plan.side,forward,!!plan.back)?plan.side:0;
   for(const [control,wanted] of [['forward',forward],['back',!!plan.back],['left',side>0],['right',side<0],['jump',!!plan.jump],['sneak',!!plan.sneak]])if(!!bot.getControlState(control)!==wanted)bot.setControlState(control,wanted);
   if(plan.sprint&&now-lastSprintSafetyAt>=100){sprintSafe=flatSprintPath(bot,plan.sprintTask)&&(!bot.blockAt||proximity(bot,{recovery:false}).canWalk(bot.entity.yaw,3,1.79));lastSprintSafetyAt=now;}
   const travelSafe=!plan.sprintTask?.travel_sprint||bot.food>=12&&routeRunway(bot,plan.sprintTask)>=4;
   const sprint=!!plan.sprint&&sprintSafe&&travelSafe&&forward&&!lookLocked&&now<=expires-750&&basicSprintSafe(bot);
   if(!!bot.getControlState('sprint')!==sprint)bot.setControlState('sprint',sprint);
   applyPose(bot,!!plan.sneak);
   if((targetYaw!==null||plan.levelLook&&Math.abs(bot.entity.pitch)>.01)&&!lookLocked&&permissions.turn){
    const delta=targetYaw===null?0:wrap(targetYaw-bot.entity.yaw),step=Math.sign(delta)*Math.min(Math.abs(delta),(plan.yawRate||Math.PI)*dt);
    const currentPitch=Number.isFinite(bot.entity.pitch)?bot.entity.pitch:0;
    const pitch=plan.levelLook?currentPitch-Math.sign(currentPitch)*Math.min(Math.abs(currentPitch),Math.PI*dt):0;
    if(Math.abs(delta)>.002||Math.abs(bot.entity.pitch-pitch)>.002)Promise.resolve(bot.look(bot.entity.yaw+step,pitch,true)).catch(()=>clear());
    else targetYaw=null;
   }
  }
 };
}
module.exports={motorPlan,createMotor,applyPose,safeAutoStep};
