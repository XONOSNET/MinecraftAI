const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync('lab/dashboard.html'));
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Function(script[1]);
const source=html.slice(html.indexOf('function describeLabActivity('),html.indexOf('function renderLabStatus('));
const describe=vm.runInNewContext(source+';describeLabActivity');
test('world timing separates phase duration, alignment and first pickup',()=>{
 const start=html.indexOf('function worldTimingText('),end=html.indexOf('function renderWorld(',start);
 const format=vm.runInNewContext(html.slice(start,end)+';worldTimingText');
 assert.match(format({seconds:90,timings:{phase_seconds:{gather:80},activity_seconds:{aligning:12},first_log_seconds:8,turn_reversals:4,target_switches:2}}),/Total 90 s.*Gathering 80 s.*Aligning 12 s.*First log 8 s.*Turn reversals 4/);
 assert.match(format({seconds:2}),/First log —/);
});
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

const botActivitySource=html.slice(html.indexOf('function botActivity('),html.indexOf('let observerInitializedFor='));
const describeBot=vm.runInNewContext(botActivitySource+';botActivity',{Date,activeJob:()=>false});
test('combat activity respects missing telemetry, pauses, completion and action meanings',()=>{
 assert.match(describeBot({mode:'paused'},undefined),/Offline/);
 const a={skill:'combat',connected:true,last_seen:Date.now()/1000,action:6,trial_completed:0};
 assert.match(describeBot({mode:'paused',curriculum:{}},a),/Paused/);
 assert.equal(describeBot({mode:'teacher'},a),'Attacking monster');
 a.trial_completed=3;assert.match(describeBot({mode:'evaluate'},a),/Trials finished/);
});

test('queued teacher and policy batches describe measurement rather than automatic training',()=>{
 const s=status();s.curriculum.phase='queued_teacher';s.mode='teacher';
 assert.equal(describe(s).title,'Running a queued teacher demonstration');assert.match(describe(s).copy,/does not update weights/);
 s.curriculum.phase='queued_test';s.mode='evaluate';assert.equal(describe(s).title,'Running a queued neural test');
});
const trialFilterSource=html.slice(html.indexOf('function trialMatches('),html.indexOf('function showTrial('));
const matchTrial=vm.runInNewContext(trialFilterSource+';trialMatches');
test('catalogue search matches numbers and concrete mechanics while respecting skill filter',()=>{
 const trial={number:49,name:'Three alternating wooden doors',skill:'advanced',tier_name:'Terrain',description:'Door course',details:['Door count: 3']};
 assert.equal(matchTrial(trial,'49','advanced'),true);assert.equal(matchTrial(trial,'DOOR COUNT','advanced'),true);assert.equal(matchTrial(trial,'doors','combat'),false);
});

const modelHelpers=html.slice(html.indexOf('function modelRole('),html.indexOf('function renderModels('));
const helpers=vm.runInNewContext(modelHelpers+';({modelRole,modelLayerCounts})');
test('model collection explains all twelve specialists and counts real layer shapes',()=>{
 const nav=helpers.modelLayerCounts({architecture:[70,128,4]});
 const specialist=helpers.modelLayerCounts({architecture:[82,128,7]});
 assert.equal(nav.reduce((a,b)=>a+b,0),9604);
 assert.equal(specialist.reduce((a,b)=>a+b,0),11527);
 assert.equal(nav.reduce((a,b)=>a+b,0)+11*specialist.reduce((a,b)=>a+b,0),136401);
 for(const skill of ['navigation','traversal','hazards','exploration','gathering','nutrition','shelter','integration','terrain','advanced','expedition','combat'])assert.notEqual(helpers.modelRole(skill),'Task-specific action selection');
 assert.match(html,/Combined learned parameters/);
 assert.match(html,/Bots share these weights/);
 assert.match(html,/individual spatial memory stores/);
});

test('specialist cards show all roles and individual counts immediately below combined totals',()=>{
 class Node{constructor(){this.children=[];this.style={};this.textContent='';}replaceChildren(){this.children=[];}append(...nodes){this.children.push(...nodes);}}
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const code=html.slice(html.indexOf('function modelBytes('),html.indexOf('function renderAgents('));
 const render=vm.runInNewContext(code+';renderModels',{document:{createElement:()=>new Node()},$:get,text:(id,value)=>{get(id).textContent=value;},fmt:n=>Number(n).toLocaleString('en-US'),duration:()=>''});
 const skills=['navigation','traversal','hazards','exploration','gathering','nutrition','shelter','integration','terrain','advanced','expedition','combat'].map((skill,i)=>({skill,name:'Test',revision:1,id:i,parameters:i?11527:9604,architecture:i?[82,128,7]:[70,128,4],weight_bytes:4*(i?11527:9604)}));
 render({model_evolution:{current:skills[0],skills,total_parameters:136401,total_weight_bytes:545604,version_count:12,history:[]}});
 assert.equal(get('model-specialist-cards').children.length,12);assert.equal(get('model-collection-metrics').children[0].children[0].textContent,'136,401');
 const nav=get('model-specialist-cards').children.find(card=>card.children[0].textContent==='Navigation');assert.equal(nav.children[1].textContent,'9,604');assert.match(nav.children[3].textContent,/obstacle avoidance/);
});
