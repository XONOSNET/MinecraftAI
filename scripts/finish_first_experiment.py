import json,time,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.experiment import call,status
while status()['samples']<1500:time.sleep(3)
print(json.dumps(call('/control/train')),flush=True)
call('/control/evaluate',{'run':'trained-valid-001'})
while True:
 rows=[r for r in status()['episodes'] if r['run']=='trained-valid-001']
 if rows and rows[0]['episodes']>=rows[0].get('expected_episodes',15):break
 time.sleep(3)
call('/control/paused');print(json.dumps(status()['episodes']),flush=True)
