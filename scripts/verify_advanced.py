import argparse,json,time,urllib.request
from pathlib import Path
base='http://127.0.0.1:8000';token=Path('data/api-token').read_text().strip()
def get():return json.load(urllib.request.urlopen(base+'/status',timeout=5))
def post(path,body):return json.load(urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Lab-Token':token}),timeout=30))
parser=argparse.ArgumentParser();parser.add_argument('--start',type=int,default=41);parser.add_argument('--end',type=int,default=60);parser.add_argument('--output',default='docs/advanced-teacher-check.json');args=parser.parse_args()
assert 41<=args.start<=args.end<=len(get()['curriculum']['stages'])
assert not get()['curriculum']['enabled'],'Pause autonomy before reference verification'
results=[]
for stage in range(args.start-1,args.end):
 while len(get()['agents'])<8:time.sleep(2)
 r=post('/curricula/practice/'+str(stage),{'driver':'teacher'});deadline=time.time()+180
 print('START',stage+1,r['stage']['name'],flush=True)
 while time.time()<deadline:
  s=get();row=next((x for x in s['episodes'] if x['run']==r['run']),None)
  if row and row['episodes']>=24:
   results.append({'stage':stage+1,'name':r['stage']['name'],'passed':row['successes'],'total':row['episodes']});print(json.dumps(results[-1]),flush=True);break
  time.sleep(2)
 else:
  post('/control/paused',{});raise RuntimeError(f'Teacher trials timed out on stage {stage+1}')
 Path(args.output).write_text(json.dumps(results,indent=2),encoding='utf-8')
 if results[-1]['passed']<20:
  post('/control/paused',{});raise RuntimeError(f'Teacher feasibility gate failed on stage {stage+1}')
post('/control/paused',{})
