const config=require('../config/house.json'),{Vec3}=require('vec3');
function point(plot,key){const v=config[key];return new Vec3(plot.x+v[0],plot.y+v[1],plot.z+v[2]);}
function blueprint(plot){
 const {x,y,z}=plot,r=config.radius,h=config.wall_height,f=config.floor_radius,blocks=[];
 for(let dx=-f;dx<=f;dx++)for(let dz=-f;dz<=f;dz++)blocks.push({x:x+dx,y:y-1,z:z+dz,floor:true});
 for(let dy=0;dy<h;dy++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)if((Math.abs(dx)===r||Math.abs(dz)===r)&&!(dx===0&&dz===-r&&dy<2))blocks.push({x:x+dx,y:y+dy,z:z+dz,table:dx===config.table[0]&&dy===0&&dz===config.table[2]});
 for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)blocks.push({x:x+dx,y:y+h,z:z+dz});
 return blocks;
}
module.exports={config,point,blueprint,total:blueprint({x:0,y:0,z:0}).length};
