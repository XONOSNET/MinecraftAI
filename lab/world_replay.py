"""Balance fresh demonstrations with earlier replay; hold back earlier examples."""
import random
from pathlib import Path
import os
import numpy as np


def prepare_replay(observations,fresh_count,seed=0,reference=None):
    rng=random.Random(seed);fresh_count=min(len(observations),max(0,int(fresh_count)));cut=len(observations)-fresh_count
    # Freeze history before the teacher starts. Its bounded live deque may be
    # entirely overwritten by a long demonstration, leaving no history here.
    history=list(reference) if reference is not None else observations[:cut]
    validation_ids=set(rng.sample(range(len(history)),min(512,len(history)//5)))
    validation=[row for i,row in enumerate(history) if i in validation_ids]
    earlier=[row for i,row in enumerate(history) if i not in validation_ids]
    fresh=observations[cut:]
    if not fresh:raise ValueError('Fresh world demonstrations are required.')
    target=min(4000,max(2000,len(fresh)))
    selected=rng.sample(earlier,min(target,len(earlier)))
    new=rng.sample(fresh,min(target,len(fresh)))
    if len(new)<len(selected):new+=rng.choices(fresh,k=len(selected)-len(new))
    selected+=new;rng.shuffle(selected)
    return selected,validation,dict(fresh_world_examples=fresh_count,retained_examples=len(earlier),validation_examples=len(validation))


class ReplayReference:
    """Derived, cycle-bound replay snapshots; original demonstrations stay intact."""
    def __init__(self,root):
        self.root=Path(root)

    def path(self,skill):
        if skill not in ('expedition','gathering','shelter','combat'):raise ValueError('Unknown world skill')
        return self.root/(skill+'.npz')

    def capture(self,skill,cycle,rows):
        self.root.mkdir(parents=True,exist_ok=True);path=self.path(skill);tmp=path.with_suffix('.tmp')
        with tmp.open('wb') as stream:
            np.savez_compressed(stream,cycle=int(cycle),obs=np.asarray([r[0] for r in rows],dtype=np.float32),actions=np.asarray([r[1] for r in rows],dtype=np.int64))
        os.replace(tmp,path)
        return dict(cycle=int(cycle),samples=len(rows))

    def load(self,skill,cycle):
        path=self.path(skill)
        if not path.exists():raise ValueError('Missing pre-teacher replay reference for '+skill)
        with np.load(path,allow_pickle=False) as saved:
            if int(saved['cycle'])!=int(cycle):raise ValueError('Stale pre-teacher replay reference for '+skill)
            return list(zip(saved['obs'].tolist(),saved['actions'].tolist()))
