import sys,time,json,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.experiment import call,status

def evaluate(mode,run):
 call('/control/'+mode,{'run':run});deadline=time.time()+240
 while time.time()<deadline:
  rows=[r for r in status()['episodes'] if r['run']==run]
  if rows and rows[0]['episodes']>=15:print(json.dumps(rows[0]),flush=True);return
  time.sleep(2)
 raise RuntimeError('Evaluation timeout '+run)
if __name__=='__main__':
 if '--resume' not in sys.argv:
  if any(r['run'].startswith('release-') for r in status()['episodes']):raise RuntimeError('Release IDs already exist; use a new run prefix before repeating')
  call('/control/new-policy')
  evaluate('untrained','release-untrained')
 call('/control/teacher',{'run':'release-teacher'});deadline=time.time()+300
 while status()['samples']<1500:
  if time.time()>deadline:raise RuntimeError('Demonstration timeout')
  time.sleep(2)
 print(json.dumps(call('/control/train')),flush=True)
 evaluate('evaluate','release-trained')
 call('/control/paused')
 subprocess.run([sys.executable,'scripts/compare_models.py'],check=True)
 for size in ('tiny','small','medium'):
  call('/control/load',{'size':size});evaluate('evaluate','release-'+size)
 evaluate('heuristic','release-heuristic')
 evaluate('random','release-random')
 call('/control/paused');call('/control/load',{'size':'tiny'});call('/control/checkpoint');call('/control/timing')
 subprocess.run([sys.executable,'scripts/report.py'],check=True)
 print('Release experiment complete',flush=True)
