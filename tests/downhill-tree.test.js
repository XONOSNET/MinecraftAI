const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{chooseTree}=require('../controller/tree_target'),{surface}=require('../controller/hut_teacher');
function hillside(cliff=false,base=80){
 const height=x=>cliff?(x<3?base:base-12):base-Math.min(12,Math.max(0,x));
 const tree=new Vec3(15,base-12,0),b={username:'downhill',players:{},game:{minY:-64},entity:{position:new Vec3(.5,base,.5),onGround:true},inventory:{items:()=>[]},blockAt(p){const q=p.floored(),name=q.equals(tree)?'oak_log':q.y<height(q.x)?'stone':'air';return {position:q,name,boundingBox:name==='air'?'empty':'block'};}};
 return {b,tree};
}
test('tree selection accepts a lower valley only with a climbable route',()=>{
 const {b,tree}=hillside(),result=chooseTree(b,[tree],null,surface,'downhill');
 assert.equal(result.key,'15,0');assert.equal(result.approach[1],68.1);
 const cliff=hillside(true);assert.equal(chooseTree(cliff.b,[cliff.tree],null,surface,'cliff').key,null);
});
test('exposed surfaces below sea level are eligible without searching through a roof',()=>{
 const {b,tree}=hillside(false,8);assert.equal(surface(b,14,0),-4);
 assert.equal(chooseTree(b,[tree],null,surface,'negative').key,'15,0');
 const original=b.blockAt;b.blockAt=p=>p.y===10?{position:p,name:'stone',boundingBox:'block'}:original(p);
 assert.equal(surface(b,14,0),11);
});
