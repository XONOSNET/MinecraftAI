import argparse,json,time,urllib.request
from pathlib import Path
base='http://127.0.0.1:8000';token=Path('data/api-token').read_text().strip()
def get():return json.load(urllib.request.urlopen(base+'/status',timeout=10))
def post(path,data={}):return json.load(urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Lab-Token':token}),timeout=30))
p=argparse.ArgumentParser();p.add_argument('--start',type=int,default=71);p.add_argument('--end',type=int,default=120);p.add_argument('--trials',type=int,default=1);p.add_argument('--keep-going',action='store_true');p.add_argument('--only-legacy',default='');p.add_argument('--required-rate',type=float,default=.8);p.add_argument('--output',default='docs/expedition-teacher-check.json');args=p.parse_args()
output=Path(args.output);results=json.loads(output.read_text()) if output.exists() else []
assert not get()['curriculum']['enabled']
deadline=time.time()+120
while get()['server']['bots_online']<8:
 if time.time()>deadline:raise RuntimeError('Bots did not reconnect')
 time.sleep(1)
while not post('/curricula/prepare')['ready']:
 if time.time()>deadline:raise RuntimeError('Practice preparation timed out')
 time.sleep(1)
catalog=get()['curriculum']['stages']
for old in results:
 match=next((i for i,s in enumerate(catalog) if s['name']==old['name']),None)
 if match is not None:old.update(stage=match+1,legacy_stage=catalog[match]['legacy_stage'],id=catalog[match]['id'])
output.write_text(json.dumps(results,indent=2),encoding='utf-8')
for number in range(args.start,args.end+1):
 if args.only_legacy and number not in set(map(int,args.only_legacy.split(','))):continue
 index=next(i for i,s in enumerate(catalog) if s['legacy_stage']==number)
 if any(r['name']==catalog[index]['name'] and r['passed']>=r['total']*args.required_rate and r['total']>=8*args.trials for r in results):continue
 post('/control/paused')
 for i in range(8):post('/admin/action',{'action':'teleport-coordinates','player':'LabAI'+str(i),'x':300,'y':181,'z':i*12+.5})
 time.sleep(4 if results and results[-1]['passed']<results[-1]['total']*.8 else 1)
 r=post('/curricula/practice/'+str(index),{'driver':'teacher','episodes_per_agent':args.trials});print('START',index+1,r['stage']['name'],flush=True);deadline=time.time()+180
 while time.time()<deadline:
  s=get();row=next((v for v in s['episodes'] if v['run']==r['run']),None)
  if row and row['episodes']>=8*args.trials:break
  time.sleep(1)
 else:post('/control/paused');raise RuntimeError('Timeout on '+str(index+1))
 result={'stage':index+1,'legacy_stage':number,'id':catalog[index]['id'],'name':r['stage']['name'],'passed':row['successes'],'total':row['episodes'],'mean_steps':row['mean_steps']};results=[v for v in results if v['name']!=result['name']]+[result];results.sort(key=lambda v:v['stage']);output.write_text(json.dumps(results,indent=2),encoding='utf-8');print(json.dumps(result),flush=True)
 if result['passed']<result['total']*args.required_rate:
  print([(n,a.get('position'),a.get('action'),a.get('metrics')) for n,a in list(s['agents'].items())[:2]],flush=True);post('/control/paused')
  if not args.keep_going:raise RuntimeError('Teacher course needs repair')
post('/control/paused')
