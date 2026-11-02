// End only physically stationary attempts without material/lesson progress.
// Searching slowly across terrain remains unrestricted by this timer.
function progressSignature(t,stock){return [t.phase,t.wilderness?.burrow?.stage||'',t.built,t.harvested,t.constructionCleared,t.entranceCleared,t.milestones.length,stock].join('|');}
class WorldStall {
 constructor(seconds=90){this.limit=seconds;this.anchor=null;this.signature=null;this.since=0;}
 update(position,signature,now){
  if(!this.anchor||signature!==this.signature||Math.hypot(position.x-this.anchor.x,position.z-this.anchor.z)>.9){
   this.anchor={x:position.x,z:position.z};this.signature=signature;this.since=now;
  }
  const idle=Math.max(0,(now-this.since)/1000);
  return {idle_seconds:Math.floor(idle),stall_seconds_left:idle>=15?Math.max(0,Math.ceil(this.limit-idle)):null,expired:idle>=this.limit};
 }
}
module.exports={WorldStall,progressSignature};
