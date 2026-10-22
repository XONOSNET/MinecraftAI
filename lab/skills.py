"""Independent small policies and replay buffers for survival skills."""
from collections import deque
from pathlib import Path
import os
import json
import time
import numpy as np
import torch
from .model import Policy
from .tasks import SKILLS

SKILL_INPUTS=82
SKILL_ACTIONS=7

class SkillBank:
    def __init__(self,root='data/skills',checkpoints='checkpoints/skills'):
        self.root=Path(root);self.checkpoints=Path(checkpoints);self.entries={}
        self.root.mkdir(parents=True,exist_ok=True);self.checkpoints.mkdir(parents=True,exist_ok=True)
    def get(self,skill,navigation):
        if skill not in SKILLS or skill=='navigation':raise ValueError('Unknown independent skill')
        if skill in self.entries:return self.entries[skill]
        path=self.checkpoints/(skill+'.pt')
        saved=torch.load(path,weights_only=True) if path.exists() else None
        width=saved['width'] if saved else navigation.net[0].out_features
        policy=Policy(width,inputs=SKILL_INPUTS,actions=SKILL_ACTIONS)
        if saved:policy.load_state_dict(saved['model'])
        else:
            with torch.no_grad():
                policy.net[0].weight.zero_();policy.net[0].weight[:,:70].copy_(navigation.net[0].weight)
                policy.net[0].bias.copy_(navigation.net[0].bias)
                policy.net[2].weight[:4].copy_(navigation.net[2].weight);policy.net[2].bias[:4].copy_(navigation.net[2].bias)
                policy.net[2].weight[4:].zero_();policy.net[2].bias[4:].fill_(-2)
        optimizer=torch.optim.Adam(policy.parameters(),lr=.003)
        if saved:optimizer.load_state_dict(saved['optimizer'])
        samples=deque(maxlen=15000);replay=self.root/(skill+'.npz')
        if replay.exists():
            with np.load(replay) as data:samples.extend(zip(data['obs'].tolist(),data['actions'].tolist()))
        entry={'model':policy,'optimizer':optimizer,'samples':samples,'count':0};self.entries[skill]=entry;return entry
    def payload(self,entry):
        return {'model':entry['model'].state_dict(),'optimizer':entry['optimizer'].state_dict(),'width':entry['model'].net[0].out_features,'inputs':SKILL_INPUTS,'actions':SKILL_ACTIONS}
    def save(self,skill,champion=False):
        path=self.checkpoints/(skill+('-champion' if champion else '')+'.pt');tmp=path.with_suffix('.tmp')
        torch.save(self.payload(self.entries[skill]),tmp);os.replace(tmp,path);self.metadata(skill);return str(path)
    def restore(self,skill):
        path=self.checkpoints/(skill+'-champion.pt')
        if not path.exists():raise RuntimeError('Protected skill checkpoint is missing')
        saved=torch.load(path,weights_only=True);entry=self.entries[skill]
        entry['model'].load_state_dict(saved['model']);entry['optimizer'].load_state_dict(saved['optimizer']);self.save(skill)
    def save_replay(self,skill):
        samples=self.entries[skill]['samples'];path=self.root/(skill+'.npz');tmp=path.with_suffix('.tmp')
        if not samples:return
        with tmp.open('wb') as stream:np.savez_compressed(stream,obs=np.asarray([s[0] for s in samples],dtype=np.float32),actions=np.asarray([s[1] for s in samples]))
        os.replace(tmp,path);self.metadata(skill)

    def metadata(self,skill):
        entry=self.entries[skill];path=self.root/(skill+'.json');tmp=path.with_suffix('.meta.tmp')
        tmp.write_text(json.dumps({'samples':len(entry['samples']),'parameters':entry['model'].parameters_count,'updated_at':time.time()}),encoding='utf-8');os.replace(tmp,path)
    def summary(self,skill):
        if skill in self.entries:
            entry=self.entries[skill];return {'samples':len(entry['samples']),'parameters':entry['model'].parameters_count}
        path=self.root/(skill+'.json')
        if path.exists():return json.loads(path.read_text(encoding='utf-8'))
        replay=self.root/(skill+'.npz')
        if replay.exists():
            with np.load(replay) as data:count=len(data['actions'])
            checkpoint=self.checkpoints/(skill+'.pt')
            width=torch.load(checkpoint,weights_only=True)['width'] if checkpoint.exists() else 128
            summary={'samples':count,'parameters':(SKILL_INPUTS+1)*width+(width+1)*SKILL_ACTIONS}
            tmp=path.with_suffix('.meta.tmp');tmp.write_text(json.dumps(summary),encoding='utf-8');os.replace(tmp,path);return summary
        return {'samples':0,'parameters':None}
