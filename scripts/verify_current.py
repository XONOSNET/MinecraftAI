import sys,time,json,shutil,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import torch
from lab.model import Policy
from scripts.experiment import call,status

PREFIX='release2-'
def evaluate(mode,name):
 run=PREFIX+name;call('/control/'+mode,{'run':run});deadline=time.time()+240
 while time.time()<deadline:
  rows=[r for r in status()['episodes'] if r['run']==run]
  if rows and rows[0]['episodes']>=15:print(json.dumps(rows[0]),flush=True);return
  time.sleep(2)
 raise RuntimeError('Evaluation timeout '+run)
if __name__=='__main__':
 if any(r['run'].startswith(PREFIX) for r in status()['episodes']):raise RuntimeError('Use a fresh prefix for a new experiment')
 call('/control/paused');call('/control/checkpoint')
 shutil.copy2('checkpoints/tiny.pt','checkpoints/tiny-calibration.pt')
 torch.manual_seed(42);m=Policy();opt=torch.optim.Adam(m.parameters(),lr=.003)
 torch.save({'model':m.state_dict(),'optimizer':opt.state_dict(),'width':128,'seed':42},'checkpoints/tiny.pt')
 call('/control/load',{'size':'tiny'});evaluate('untrained','untrained')
 # Reuse genuine eye-height live demonstrations already collected in this world.
 print(json.dumps(call('/control/train')),flush=True);evaluate('evaluate','trained')
 call('/control/paused');subprocess.run([sys.executable,'scripts/compare_models.py'],check=True)
 for size in ('tiny','small','medium'):
  call('/control/load',{'size':size});evaluate('evaluate',size)
 evaluate('heuristic','heuristic');evaluate('random','random')
 call('/control/paused');call('/control/load',{'size':'tiny'});call('/control/checkpoint');call('/control/timing')
 subprocess.run([sys.executable,'scripts/report.py'],check=True)
 print('Verified experiment complete',flush=True)
