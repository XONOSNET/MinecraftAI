const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('lab/brain.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function viewer(saved){
 const nodes=new Map(),intervals=new Map(),timeouts=new Map(),storage=new Map(),events={};let next=0,requests=0,aborted=0;
 if(saved!==undefined)storage.set('minecraft-ai-brain-disabled',saved);
 const canvas={clearRect(){},setTransform(){},fillText(){}},get=id=>{
  if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',setAttribute(name,value){this[name]=value;},replaceChildren(){},addEventListener(){},getContext:()=>canvas,getBoundingClientRect:()=>({width:900,height:480})});return nodes.get(id);
 };
 const context={document:{getElementById:get,hidden:false},window:{addEventListener:(name,callback)=>events[name]=callback},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},devicePixelRatio:1,AbortController,console,
  setInterval:(fn,ms)=>{const id=++next;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),setTimeout:fn=>{const id=++next;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),
  fetch:(_url,{signal})=>{requests++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(Object.assign(Error('aborted'),{name:'AbortError'}));},{once:true}));}};
 vm.runInNewContext(script,context);
 return {nodes,get,intervals,timeouts,storage,events,requests:()=>requests,aborted:()=>aborted};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('off stops rendering and polling, aborts pending work, and persists across reload',async()=>{
 const v=viewer();assert.equal(v.intervals.size,2);assert.equal(v.requests(),1);
 v.get('power').onclick();await settle();
 assert.equal(v.intervals.size,0);assert.equal(v.timeouts.size,0);assert.equal(v.aborted(),1);
 assert.equal(v.get('stage').hidden,true);assert.equal(v.get('state').textContent,'Brain viewer off');
 assert.equal(v.storage.get('minecraft-ai-brain-disabled'),'true');
 const reloaded=viewer('true');assert.equal(reloaded.intervals.size,0);assert.equal(reloaded.requests(),0);
 reloaded.get('power').onclick();assert.equal(reloaded.intervals.size,2);assert.equal(reloaded.requests(),1);assert.equal(reloaded.get('stage').hidden,false);
 reloaded.get('power').onclick();await settle();
});
test('saved off preference from another tab stops this viewer without changing training',async()=>{
 const v=viewer();v.storage.set('minecraft-ai-brain-disabled','true');v.events.storage({key:'minecraft-ai-brain-disabled'});await settle();
 assert.equal(v.intervals.size,0);assert.equal(v.aborted(),1);assert.equal(v.requests(),1);assert.equal(v.get('power').textContent,'Turn brain on');
});
