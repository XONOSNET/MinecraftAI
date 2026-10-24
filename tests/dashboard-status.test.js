const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync('lab/dashboard.html'));
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Function(script[1]);
const source=html.slice(html.indexOf('function describeLabActivity('),html.indexOf('function renderLabStatus('));
const describe=vm.runInNewContext(source+';describeLabActivity');
const status=(extra={})=>({mode:'evaluate',run:'current',server:{ready:true},evaluation:{expected_episodes:24},episodes:[{run:'old',episodes:24,successes:24},{run:'current',episodes:6,successes:5}],curriculum:{enabled:true,stage:0,stages:[{name:'Course'}],round:2,phase:'baseline',streak:1,run:'current'},...extra});
test('review explains teacher-free retest, current batch progress and round',()=>{const v=describe(status());assert.equal(v.title,'Reviewing learned skills');assert.match(v.copy,/without teacher control/);assert.match(v.context,/Review 2.*Stage 1 \/ 1/);assert.equal(v.progress,25);assert.match(v.detail,/6 \/ 24.*5 passed.*1 \/ 2/)});
test('initial baseline and candidate test have different explanations',()=>{const s=status();s.curriculum.round=0;assert.equal(describe(s).title,'Testing the saved model');s.curriculum.phase='evaluating';assert.equal(describe(s).title,'Testing the newly trained model');assert.match(describe(s).copy,/restores regressions/)});
test('training overrides evaluation and reports epoch progress',()=>{const v=describe(status({training_job:{status:'running',epoch:40,epochs:100,percent:40}}));assert.equal(v.progress,40);assert.match(v.copy,/Bots wait/);assert.match(v.detail,/40 \/ 100/)});
test('teacher collection and reference do not claim neural learning',()=>{const s=status({mode:'teacher'});Object.assign(s.curriculum,{collected:750,active_examples:1500});assert.equal(describe(s).progress,50);assert.match(describe(s).copy,/next training phase/);s.mode='heuristic';assert.equal(describe(s).title,'Watching the teacher reference')});
test('paused, failed, server and restore conditions explain waiting',()=>{assert.equal(describe(status({mode:'paused'})).title,'Lab paused');assert.equal(describe(status({mode:'paused',training_job:{status:'failed',error:'Failure'}})).tone,'error');assert.equal(describe(status({server:{ready:false}})).title,'Waiting for the Minecraft server');const s=status();s.curriculum.restore_pending=true;assert.equal(describe(s).title,'Restoring the protected model')});
test('manual practice uses selected course, not saved autonomous stage',()=>{const s=status({practice:{stage:1}});Object.assign(s.curriculum,{enabled:false,stages:[{name:'Saved'},{name:'Selected'}]});const v=describe(s);assert.match(v.context,/Stage 2 \/ 2.*Selected/);assert.equal(v.title,'Testing learned behavior')});
test('connection loss clears progress and stale course',()=>{const v=describe(null);assert.equal(v.tone,'error');assert.equal(v.progress,undefined);assert.equal(v.context,undefined);assert.match(v.copy,/unavailable/)});

test('automatic recovery is distinguished from a manual pause',()=>{
 const s=status({mode:'paused'});s.curriculum.phase='health_wait';s.curriculum.message='Memory recovering';
 const v=describe(s);assert.equal(v.title,'Waiting for automatic recovery');assert.match(v.copy,/30 seconds/);
});
