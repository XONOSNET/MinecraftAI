const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {normalizeFixtureHealth,sampleFixtureHealth}=require('../scripts/combat_fixture_health.cjs');

function snapshot(now=Date.now()){
 return {protocol:'fixture-health-v1',sampled_at_ms:now,stopped:false,ram_percent:75,
  server:{pid:123,ready:true,busy:false,desired_running:true,error:null,bots_online:8},
  performance:{persistence:{pending:3,capacity:2048,error:null}},
  world_training:{session:{phase:'restoring'}},world_learning:{phase:'baseline'}};
}

test('narrow health confirms server identity, ready roster, RAM, persistence, and a fresh sample',()=>{
 const now=1800000000000;
 const good=snapshot(now);
 assert.deepEqual(normalizeFixtureHealth(good,123,now),{
  sampled_at_ms:now,pid:123,ready:true,busy:false,bots_online:8,ram_percent:75,
  persistence_error:null,persistence_pending:3,world_phase:'restoring',learning:'baseline',
 });
 for(const sampled_at_ms of [now-5001,now+101,null]){
  assert.match(normalizeFixtureHealth({...good,sampled_at_ms},123,now).unavailable,/stale/);
 }
 assert.match(normalizeFixtureHealth({...good,protocol:'old'},123,now).unavailable,/invalid|Invalid/);
 assert.match(normalizeFixtureHealth(good,321,now).unavailable,/Unhealthy/);
 assert.match(normalizeFixtureHealth(good,undefined,now).unavailable,/Unhealthy/);
});

test('missing or unhealthy fixture telemetry fails closed',()=>{
 const now=1800000000000;
 const good=snapshot(now);
 const withServer=fields=>({...good,server:{...good.server,...fields}});
 const withBacklog=fields=>({...good,performance:{persistence:{...good.performance.persistence,...fields}}});
 const rejected=[...[
  {ready:false},{busy:true},{desired_running:false},{error:'stop failed'},{bots_online:7},
  {ready:undefined},{busy:undefined},{desired_running:undefined},{error:undefined},{bots_online:'8'},
 ].map(withServer),...[
  {error:'persistence failed'},{error:undefined},{pending:undefined},{pending:-1},{capacity:0},
 ].map(withBacklog),{...good,stopped:true},{...good,stopped:undefined},{...good,ram_percent:86},
 {...good,ram_percent:-1},{...good,ram_percent:'75'},{...good,server:null},{...good,performance:null}];
 for(const state of rejected)assert.match(normalizeFixtureHealth(state,123,now).unavailable,/Unhealthy/);
});

test('narrow request remains loopback-only and distinguishes transient timeouts',async t=>{
 let respond=(_,res)=>res.end(JSON.stringify(snapshot()));
 const paths=[];
 const server=http.createServer((req,res)=>{
  paths.push([req.url,req.headers.host]);
  respond(req,res);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const request=http.request;
 t.mock.method(http,'request',(options,receive)=>{
  assert.equal(options.hostname,'127.0.0.1');
  assert.equal(options.port,8000);
  return request({...options,port:server.address().port},receive);
 });
 assert.equal((await sampleFixtureHealth(1000,123)).pid,123);
 assert.deepEqual(paths,[['/fixture/health','localhost:8000']]);
 respond=(_,res)=>{res.writeHead(302,{Location:'/elsewhere'});res.end();};
 assert.equal((await sampleFixtureHealth(1000,123)).unavailable,'HTTP 302');
 assert.equal(paths.length,2);
 respond=(_,res)=>{res.writeHead(503);res.end();};
 assert.equal((await sampleFixtureHealth(1000,123)).unavailable,'HTTP 503');
 respond=(_,res)=>res.end('invalid JSON');
 assert.equal((await sampleFixtureHealth(1000,123)).unavailable,'SyntaxError');
 respond=(_,res)=>res.end('x'.repeat(4097));
 assert.match((await sampleFixtureHealth(1000,123)).unavailable,/4096 bytes/);
 respond=(_,res)=>{res.writeHead(200);res.write('{');};
 assert.equal((await sampleFixtureHealth(50,123)).unavailable,'TimeoutError');
});
