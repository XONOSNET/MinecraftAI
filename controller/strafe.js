// Shared motor assistance. Existing neural action IDs and checkpoints stay valid.
const {proximity}=require('./perception'),{corridorDistance}=require('./world_navigation'),space=require('./resource_space'),{forBot}=require('./behavior');
function safe(bot,task,side,forward=false,back=false){
 if(!bot.blockAt||bot.entity.onGround!==true||bot.entity.isInWater||bot.entity.isInLava)return false;
 const yaw=bot.entity.yaw,p=bot.entity.position,local=proximity(bot,{recovery:false}),sideYaw=yaw+side*Math.PI/2;
 if(!local.canWalk(sideYaw,.65))return false;
 const ahead=Number(forward)-Number(back),heading=yaw+Math.atan2(side,ahead||0);
 if(!local.canWalk(heading,.7))return false;
 const q={x:p.x-Math.sin(heading)*.7,y:p.y,z:p.z-Math.cos(heading)*.7},b=task?.bounds;
 if(b&&(q.x<=b[0]+.4||q.x>=b[1]-.4||q.z<=b[2]+.4||q.z>=b[3]-.4))return false;
 if(task?.route_corridor?.length>1&&corridorDistance(q,task.route_corridor)>.6)return false;
 return space.stepClear(p,q,space.players(bot),forBot(bot).player_clearance);
}
function createStrafe(bot){
 let side=[...(bot.username||'bot')].reduce((n,c)=>n+c.charCodeAt(0),0)%2?1:-1,heldUntil=0,wallUntil=0,cooldown=0,origin=null;
 return {
  reset(){heldUntil=0;wallUntil=0;cooldown=0;origin=null;},
  choose(action,task,sensed,angle,base,now){
   if(!bot.entity?.position||!bot.blockAt)return null;
   const rules=forBot(bot),rise=(task?.waypoints?.[0]?.[1]??bot.entity.position.y)-bot.entity.position.y;
   if(rules.strafe_enabled<.5||base.jump||base.sneak||Math.abs(rise)>.4||sensed?.door||sensed?.doorway||sensed?.crouchClearance||sensed?.climbing)return null;
   if(task?.kind==='combat'){
    if(![0,1,2,3,4,6].includes(action)||!sensed.enemy||!sensed.sight||sensed.distance<1.5||sensed.distance>4.5||Math.abs(angle)>.65)return null;
    if(now>=heldUntil){if(!safe(bot,task,side,base.forward,base.back))side=-side;heldUntil=now+rules.strafe_hold_ms;}
    return safe(bot,task,side,base.forward,base.back)?{side,label:'Circling the monster'}:null;
   }
   if(![0,1,2].includes(action)||sensed?.cueDistance<.75)return null;
   if(sensed?.wallAhead&&Math.abs(angle)<.4){
    if(wallUntil&&now<wallUntil&&origin&&Math.hypot(bot.entity.position.x-origin.x,bot.entity.position.z-origin.z)<.6)return safe(bot,task,side)?{side,pure:true,label:'Sidestepping around the obstacle'}:null;
    if(now<cooldown)return null;
    side=angle===0?side:Math.sign(angle);if(!safe(bot,task,side))side=-side;
    if(safe(bot,task,side)){origin={...bot.entity.position};wallUntil=now+rules.strafe_hold_ms;cooldown=wallUntil+1500;return {side,pure:true,label:'Sidestepping around the obstacle'};}
    return null;
   }
   if(Math.abs(angle)<rules.strafe_angle_deg*Math.PI/180||Math.abs(angle)>1.1)return null;
   const direction=Math.sign(angle);
   return safe(bot,task,direction,base.forward,base.back)?{side:direction,label:direction>0?'Strafing left to align':'Strafing right to align'}:null;
  }
 };
}
module.exports={createStrafe,safe};
