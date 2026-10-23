// Protocol 1.21.4 common entity metadata slot 1 is air supply in ticks.
// Mineflayer may report another entity's breath; policy inputs must use only our player.
function ownOxygen(packet,entityId,previous=20){
 if(entityId===undefined||packet.entityId!==entityId)return previous;
 const entry=packet.metadata.find(m=>m.key===1&&Number.isFinite(m.value));
 return entry?Math.max(0,Math.min(20,Math.round(entry.value/15))):previous;
}
module.exports={ownOxygen};
