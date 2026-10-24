"""Paired-seed native trial comparison; never trains or edits policy weights."""
import argparse,json,time,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--profile',required=True);p.add_argument('--driver',default='teacher');p.add_argument('--courses',nargs='+',default=['Open a wooden door','Cross a narrow raised bridge','Steep scree staircase','Jump a lava fissure']);args=p.parse_args()
base='http://127.0.0.1:8000';token=Path('data/api-token').read_text().strip()
def get():return json.load(urllib.request.urlopen(base+'/status',timeout=15))
def post(path,data=None):
 request=urllib.request.Request(base+path,data=json.dumps(data or {}).encode(),headers={'Content-Type':'application/json','X-Lab-Token':token})
 return json.load(urllib.request.urlopen(request,timeout=30))
assert not get()['curriculum']['enabled']
deadline=time.time()+120
while get()['server']['bots_online']<8 or not post('/curricula/prepare')['ready']:
 if time.time()>deadline:raise RuntimeError('Lab did not become ready')
 time.sleep(1)
results=[]
for course in args.courses:
 post('/control/paused');state=get()
 if course=='navigation':
  assignment=post('/control/evaluate');run=get()['run'];expected=24
 else:
  index=next(i for i,s in enumerate(state['curriculum']['stages']) if s['name']==course)
  assignment=post('/curricula/practice/'+str(index),{'driver':args.driver,'episodes_per_agent':1,'seed':20261024});run=assignment['run'];expected=8
 print('START',args.profile,args.driver,course,flush=True);started=time.monotonic();deadline=started+240;moving=active=0
 while time.monotonic()<deadline:
  state=get();row=next((r for r in state['episodes'] if r['run']==run),None)
  for a in state['agents'].values():
   if a.get('run')==run and a.get('trial_completed',0)<(3 if course=='navigation' else 1):
    active+=1;moving+=a.get('speed',0)>.25
  if row and row['episodes']>=expected:break
  time.sleep(.5)
 else:raise RuntimeError('Native test timed out: '+course)
 result=dict(course=course,driver=args.driver,seed=20261024,run=run,mean_seconds=row.get('mean_seconds'),passed=row['successes'],total=row['episodes'],seconds=round(time.monotonic()-started,2),mean_steps=row['mean_steps'],moving_fraction=round(moving/max(1,active),3))
 results.append(result);print(json.dumps(result),flush=True)
 Path('docs/locomotion-'+args.profile+'-'+args.driver+'.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
post('/control/paused')
