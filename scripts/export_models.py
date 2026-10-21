"""Export and verify current policies with the supported torch.export format."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import torch
from lab.model import Policy
results=[]
for name in ('tiny','small','medium'):
 saved=torch.load(f'checkpoints/{name}.pt',weights_only=True);m=Policy(saved['width']);m.load_state_dict(saved['model']);m.eval();x=torch.zeros(1,70)
 p=f'checkpoints/{name}-inference.pt2';torch.export.save(torch.export.export(m,(x,)),p)
 restored=torch.export.load(p).module()
 with torch.no_grad():torch.testing.assert_close(m(x),restored(x))
 results.append({'size':name,'format':'torch.export','bytes':Path(p).stat().st_size,'roundtrip':'passed'})
Path('docs/export-check.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
