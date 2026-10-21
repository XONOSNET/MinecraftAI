"""Train three parameter budgets on the same recorded live demonstrations."""
import sys,time,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np,torch
from lab.model import Policy

def main():
 torch.set_num_threads(4);data=np.load('data/demonstrations.npz');x=torch.tensor(data['obs'],dtype=torch.float32);y=torch.tensor(data['actions'],dtype=torch.long);results=[]
 for name,width in [('tiny',128),('small',1333),('medium',13333)]:
  torch.manual_seed(42);m=Policy(width);opt=torch.optim.Adam(m.parameters(),lr=.003);t=time.time()
  for epoch in range(30):
   for ix in torch.randperm(len(y)).split(128):
    loss=torch.nn.functional.cross_entropy(m(x[ix]),y[ix]);opt.zero_grad();loss.backward();opt.step()
  torch.save({'model':m.state_dict(),'optimizer':opt.state_dict(),'width':width,'seed':42},f'checkpoints/{name}.pt')
  torch.jit.trace(m.eval(),x[:1]).save(f'checkpoints/{name}-inference.ts')
  with torch.no_grad():
   t0=time.perf_counter()
   for _ in range(100):m(x[:1])
   latency=(time.perf_counter()-t0)*10
  results.append({'size':name,'width':width,'parameters':m.parameters_count,'epochs':30,'samples':len(y),'training_seconds':time.time()-t,'final_loss':float(loss.detach()),'checkpoint_bytes':Path(f'checkpoints/{name}.pt').stat().st_size,'single_inference_ms':latency})
  print(json.dumps(results[-1]),flush=True)
 Path('data/model-comparison.json').write_text(json.dumps(results,indent=2))
if __name__=='__main__':main()
