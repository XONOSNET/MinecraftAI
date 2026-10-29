const test=require('node:test'),assert=require('node:assert/strict'),{createGuard}=require('../controller/controller_guard');
test('a pending native action retires its connection when a new assignment arrives',()=>{
 const retired=[];const g=createGuard(r=>retired.push(r));g.begin();g.check({run:'world-new'},'world-old');g.check({run:'world-new'},'world-old');assert.equal(retired.length,1);assert.equal(g.closed(),true);
});
test('completed actions and ordinary long smelting do not trigger the native-action deadline',()=>{
 let now=0;const retired=[],g=createGuard(r=>retired.push(r),{clock:()=>now});g.begin();now=90000;g.check({run:'world-a'},'world-a');assert.equal(retired.length,0);g.end();now=999999;g.check(null,'world-a');assert.equal(retired.length,0);
 g.begin();now+=180001;g.check(null,'world-a');assert.equal(retired.length,1);
});
