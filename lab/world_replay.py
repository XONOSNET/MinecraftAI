"""Balance fresh demonstrations with earlier replay; hold back earlier examples."""
import random


def prepare_replay(observations,fresh_count,seed=0):
    rng=random.Random(seed);fresh_count=min(len(observations),max(0,int(fresh_count)));cut=len(observations)-fresh_count
    validation_ids=set(rng.sample(range(cut),min(512,cut//5)))
    validation=[row for i,row in enumerate(observations[:cut]) if i in validation_ids]
    earlier=[row for i,row in enumerate(observations[:cut]) if i not in validation_ids]
    fresh=observations[cut:]
    if not fresh:raise ValueError('Fresh world demonstrations are required.')
    target=min(4000,max(2000,len(fresh)))
    selected=rng.sample(earlier,min(target,len(earlier)))
    new=rng.sample(fresh,min(target,len(fresh)))
    if len(new)<len(selected):new+=rng.choices(fresh,k=len(selected)-len(new))
    selected+=new;rng.shuffle(selected)
    return selected,validation,dict(fresh_world_examples=fresh_count,retained_examples=len(earlier),validation_examples=len(validation))
