// Hold one approach side through a narrow doorway; opening remains a policy action.
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function doorwayDescriptor(bot,block,goal){
 if(!block?.name.endsWith('_door')||!goal)return null;
 const properties=block.getProperties(),p=bot.entity.position,axis=['north','south'].includes(properties.facing)?'z':'x',cross=axis==='x'?'z':'x';
 const plane=block.position[axis]+.5,offset=p[axis]-plane,remaining=goal[axis==='x'?0:2]-plane;
 if(Math.abs(p.y-block.position.y)>1.1||Math.abs(offset)>=3.5||Math.abs(p[cross]-block.position[cross]-.5)>=2.5||offset*remaining>=0)return null;
 const panel=(block.shapes||[])[0];let center=block.position[cross]+.5;
 if(properties.open&&panel){const low=panel[cross==='x'?0:2],high=panel[cross==='x'?3:5];if(high-low<.3)center=block.position[cross]+(low<.5?(high+1)/2:low/2);}
 return {id:`${block.position.x},${block.position.y},${block.position.z}`,axis,plane,center,open:!!properties.open,y:block.position.y};
}
function createDoorway(){
 let state=null,finished=new Set(),label=null;
 function reset(){state=null;finished.clear();label=null;}
 function update(base,sensed,p,yaw,now,permissions){
  const d=sensed.doorway;
  // The checked route owns the climb onto a raised porch. Door alignment
  // cannot walk through a one-block riser and would otherwise cancel its jump.
  const entry=d||state;
  if(entry&&(Math.abs(p.y-entry.y)>.4||sensed.onGround===false)){state=null;label=null;return null;}
  // Let the checked route reach the door aisle first. Starting from a diagonal
  // can send the alignment shortcut through a neighboring house wall.
  const inAisle=d&&Math.abs(p[d.axis==='x'?'z':'x']-d.center)<.65;
  if(!state&&d&&inAisle&&!finished.has(d.id)&&permissions.move&&permissions.turn){state={...d,side:p[d.axis]<d.plane?-1:1,phase:'align',started:now};}
  if(!state){label=null;return null;}
  if(d?.id===state.id){state.open=d.open;if(d.open)state.center=d.center;state.descent=!!d.descent;}
  const cross=state.axis==='x'?'z':'x',offset=p[state.axis]-state.plane;
  // A checked climb can land directly on the threshold. Once centered in an
  // open doorway, continue across rather than backing off to an alignment
  // point that may be a block lower than the porch.
  if(state.open&&state.phase==='align'&&offset*state.side<1.1&&(sensed.enclosedShelter||Math.abs(p[cross]-state.center)<.2))state.phase='cross';
  const plan={forward:false,back:false,jump:false,sneak:false,yaw:0};
  if(now-state.started>(sensed.enclosedShelter?20000:12000)){label='Recovering: doorway blocked; waiting for reset';return {...plan,label};}
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
  plan.descent=state.phase==='cross'&&state.open&&!!state.descent&&!state.centering;
  // Stop to aim, then creep along one committed approach. Never chase the
  // opposite approach point after crossing the door plane.
  if(error<.12&&Math.hypot(dx,dz)>(state.centering?.03:.06)){
   const probe=state.centering?Math.min(.35,Math.hypot(dx,dz)):.35;
   if(typeof sensed.canWalk==='function'){
    if(sensed.canWalk(desired,probe,1.79))plan.forward=true;
    else if(sensed.canWalk(desired,probe,1.49)){plan.forward=true;plan.sneak=true;label='Recovering: crouching under low doorway';}
   }
   if(!plan.forward&&(plan.descent||p.y>state.y+.2&&p.y<=state.y+1.05)&&typeof sensed.canStepDown==='function'&&sensed.canStepDown(desired,.35)){
    // Sneaking deliberately prevents walking off edges. Release it only for
    // a fully probed one-block landing on the way to this lower doorway.
    plan.forward=true;plan.sneak=false;label=plan.descent?'Recovering: stepping down from doorway':'Recovering: stepping down to doorway';
   }
  }
  if(plan.forward)plan.moveTarget={x:p.x+dx,z:p.z+dz};
  return {...plan,label};
 }
 return {update,reset,active:()=>!!state,label:()=>label};
}
module.exports={createDoorway,doorwayDescriptor};
