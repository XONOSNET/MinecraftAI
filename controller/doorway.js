// Hold one approach side through a narrow doorway; opening remains a policy action.
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function createDoorway(){
 let state=null,finished=new Set(),label=null;
 function reset(){state=null;finished.clear();label=null;}
 function update(base,sensed,p,yaw,now,permissions){
  const d=sensed.doorway;
  if(!state&&d&&!finished.has(d.id)&&permissions.move&&permissions.turn){state={...d,side:p[d.axis]<d.plane?-1:1,phase:'align',started:now};}
  if(!state){label=null;return null;}
  if(d?.id===state.id){state.open=d.open;if(d.open)state.center=d.center;}
  const cross=state.axis==='x'?'z':'x',offset=p[state.axis]-state.plane;
  const plan={forward:false,back:false,jump:false,sneak:false,yaw:0};
  if(now-state.started>12000){label='Recovering: doorway blocked; waiting for reset';return {...plan,label};}
  if(state.phase==='cross'&&offset*state.side< -1.05){finished.add(state.id);state=null;label=null;return null;}
  const lateral=Math.abs(p[cross]-state.center);
  const approach=state.plane+state.side*1.15;
  if(state.phase==='align'&&lateral<.075&&Math.abs(p[state.axis]-approach)<.18)state.phase='cross';
  let targetNormal=state.phase==='cross'?state.plane-state.side*1.3:approach;
  let dx=(state.axis==='x'?targetNormal:state.center)-p.x,dz=(state.axis==='z'?targetNormal:state.center)-p.z;
  let desired=Math.atan2(-dx,-dz);
  if(state.phase==='cross'&&state.open){
   if(lateral<.045)state.centering=false;
   else if(lateral>.075&&typeof sensed.canWalk==='function'&&!sensed.canWalk(desired,.35,1.49))state.centering=true;
   if(state.centering){
    dx=state.axis==='x'?0:state.center-p.x;dz=state.axis==='z'?0:state.center-p.z;
    desired=Math.atan2(-dx,-dz);
   }
  }
  const error=Math.abs(wrap(desired-yaw));plan.targetYaw=desired;
  if(state.phase==='cross'&&!state.open){label='Recovering: waiting for door to open';return {...plan,label};}
  label=state.centering?'Recovering: centering in doorway':state.phase==='cross'?'Recovering: crossing doorway':'Recovering: lining up doorway';
  // Stop to aim, then creep along one committed approach. Never chase the
  // opposite approach point after crossing the door plane.
  if(error<.12&&Math.hypot(dx,dz)>(state.centering?.03:.06)){
   const probe=state.centering?Math.min(.35,Math.hypot(dx,dz)):.35;
   if(typeof sensed.canWalk==='function'){
    if(sensed.canWalk(desired,probe,1.79))plan.forward=true;
    else if(sensed.canWalk(desired,probe,1.49)){plan.forward=true;plan.sneak=true;label='Recovering: crouching under low doorway';}
   }
   if(!plan.forward&&p.y>state.y+.2&&p.y<=state.y+1.05&&typeof sensed.canStepDown==='function'&&sensed.canStepDown(desired,.35)){
    // Sneaking deliberately prevents walking off edges. Release it only for
    // a fully probed one-block landing on the way to this lower doorway.
    plan.forward=true;plan.sneak=false;label='Recovering: stepping down to doorway';
   }
  }
  if(plan.forward)plan.moveTarget={x:p.x+dx,z:p.z+dz};
  return {...plan,label};
 }
 return {update,reset,active:()=>!!state,label:()=>label};
}
module.exports={createDoorway};
