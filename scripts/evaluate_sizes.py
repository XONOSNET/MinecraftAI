import sys,time,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.experiment import call,status

def evaluate(mode,run):
    call('/control/'+mode,{'run':run})
    deadline=time.time()+240
    while time.time()<deadline:
        rows=[r for r in status()['episodes'] if r['run']==run]
        if rows and rows[0]['episodes']>=15:
            print(json.dumps(rows[0]),flush=True);return
        time.sleep(3)
    raise RuntimeError('Evaluation timeout: '+run)

if __name__=='__main__':
    for size in ('small','medium'):
        print(call('/control/load',{'size':size}),flush=True)
        evaluate('evaluate','size-'+size+'-valid-001')
    evaluate('heuristic','heuristic-valid-001')
    evaluate('random','random-valid-001')
    call('/control/paused');call('/control/load',{'size':'tiny'});call('/control/checkpoint')
