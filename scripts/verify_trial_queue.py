import json,time,urllib.request
from pathlib import Path
base='http://127.0.0.1:8000';token=Path('data/api-token').read_text().strip()
def get(path='/status'):return json.load(urllib.request.urlopen(base+path,timeout=15))
def post(path,data=None):return json.load(urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(data or {}).encode(),headers={'Content-Type':'application/json','X-Lab-Token':token}),timeout=20))
state=get();catalog=get('/trials')['catalogue'];assert len(catalog)==150
before=state['curriculum'];assert not before['enabled']
items=[]
for name,driver in [('Short routes','student'),('Equip a wooden sword','teacher')]:
    trial=next(row for row in catalog if row['name']==name)
    items.append(post('/trials/queue',{'stage_id':trial['id'],'driver':driver})['item'])
post('/autonomy/start');seen=set();deadline=time.time()+160
while time.time()<deadline:
    state=get();q=state['curriculum']['trials']
    active=q.get('active')
    if active and active['id'] not in seen:
        seen.add(active['id']);print('QUEUED START '+active['name']+' '+active['driver'],flush=True)
    history={row['id']:row for row in q['history']}
    if all(item['id'] in history for item in items):break
    time.sleep(.4)
else:raise RuntimeError('Queued batch verification timed out')
post('/autonomy/pause')
state=get();assert state['curriculum']['stage']==before['stage']
assert state['curriculum']['streak']==before['streak']
results=[history[item['id']] for item in items]
assert all(r['status']=='completed' and r['episodes']==24 for r in results)
proof={'catalogue_count':len(catalog),'returned_stage':before['stage']+1,'preserved_streak':before['streak'],'results':results}
Path('docs/trial-queue-native.json').write_text(json.dumps(proof,indent=2),encoding='utf-8')
print(json.dumps(proof),flush=True)
