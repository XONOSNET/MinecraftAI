"""Read-only JSON-lines inference for native policy regression fixtures."""
import json
import sys
import torch
from lab.model import Policy

torch.set_num_threads(1)
saved=torch.load('checkpoints/skills/expedition.pt',map_location='cpu',weights_only=True)
weights=saved['model'];width,inputs=weights['net.0.weight'].shape;actions=weights['net.2.weight'].shape[0]
model=Policy(width,inputs=inputs,actions=actions);model.load_state_dict(weights);model.eval()
for line in sys.stdin:
    with torch.inference_mode():action=int(model(torch.tensor(json.loads(line),dtype=torch.float32)).argmax())
    print(json.dumps({'action':action}),flush=True)
