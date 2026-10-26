const schema=require('../config/behavior-schema.json');
const defaults=Object.freeze(Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,v.default])));
function apply(bot,settings){
 if(!settings){bot.labBehavior=null;return;}
 const values={};
 for(const [key,field] of Object.entries(schema)){
  const v=settings.values?.[key];
  if(typeof v!=='number'||!Number.isFinite(v)||v<field.min||v>field.max)throw Error('Invalid behavior rule '+key);
  values[key]=v;
 }
 bot.labBehavior={revision:settings.revision,values:Object.freeze(values)};
}
const forBot=bot=>bot?.labBehavior?.values||defaults;
module.exports={apply,forBot,defaults};
