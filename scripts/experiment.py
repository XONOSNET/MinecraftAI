import json,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TOKEN=(ROOT/'data/api-token').read_text().strip()
def call(path,data=None):
    request=urllib.request.Request('http://127.0.0.1:8000'+path,data=json.dumps(data or {}).encode(),headers={'Content-Type':'application/json','X-Lab-Token':TOKEN},method='POST')
    with urllib.request.urlopen(request,timeout=240) as r:return json.load(r)
def status():
    with urllib.request.urlopen('http://127.0.0.1:8000/status',timeout=10) as r:return json.load(r)
if __name__=='__main__':
    # Fresh runs evaluate the currently loaded checkpoint; initial baseline is only valid before training.
    tag=str(int(time.time()))
    for phase in ('untrained','random'):
        run=call('/control/'+phase,{'run':phase+'-'+tag})['run']
        deadline=time.time()+240
        while time.time()<deadline:
            s=status();rows=[r for r in s['episodes'] if r['run']==run]
            if rows and rows[0]['episodes']>=rows[0].get('expected_episodes',15):break
            time.sleep(5)
        else:raise RuntimeError('Evaluation timed out: '+run)
    call('/control/teacher',{'run':'teacher-'+tag})
    deadline=time.time()+300
    while status()['samples']<2000:
        if time.time()>deadline:raise RuntimeError('Teacher collection timed out')
        time.sleep(5)
    result=call('/control/train');print(json.dumps(result,indent=2))
    run=call('/control/evaluate',{'run':'trained-'+tag})['run']
    deadline=time.time()+240
    while time.time()<deadline:
        rows=[r for r in status()['episodes'] if r['run']==run]
        if rows and rows[0]['episodes']>=rows[0].get('expected_episodes',15):break
        time.sleep(5)
    else:raise RuntimeError('Trained evaluation timed out')
    call('/control/paused');call('/control/checkpoint')
    (ROOT/'data/experiment-status.json').write_text(json.dumps(status(),indent=2))
