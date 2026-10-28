"""Small detached dashboard views; private replay/landmark data stays in storage."""
import copy

PRIVATE_WORLD_KEYS={'memory_snapshot','behavior_snapshot','fauna_queue','fauna_log','lesson_resources','quarries','survival_stations','livestock_refills','released_livestock'}

def world_view(session,summary=False):
    if session is None:return None
    if summary:
        fields=('run','round','name','driver','mission','night_level','prepared','bots')
        return dict({k:copy.deepcopy(session[k]) for k in fields if k in session},results={name:{k:row[k] for k in ('state','seconds') if k in row} for name,row in session.get('results',{}).items()})
    result={k:copy.deepcopy(v) for k,v in session.items() if k not in PRIVATE_WORLD_KEYS and k!='results'}
    result['results']={}
    for name,row in session.get('results',{}).items():
        result['results'][name]={k:copy.deepcopy(v) for k,v in row.items() if k!='wilderness'}
        if isinstance(row.get('wilderness'),dict):
            result['results'][name]['wilderness']={k:copy.deepcopy(v) for k,v in row['wilderness'].items() if k!='memory'}
    return result

def learning_view(state):
    return {k:copy.deepcopy(v) for k,v in state.items() if k not in ('memory_snapshot','behavior_snapshot')}


def compact_status(payload):
    """Bound live polls while retaining current bots, models and displayed results."""
    result=dict(payload)
    wanted={payload.get('run'),payload.get('curriculum',{}).get('run'),'release2-trained','release2-untrained','release2-random'}
    wanted.update(e.get('details',{}).get('run') for e in payload.get('activity',[]) if e.get('event')=='mode')
    result['episodes']=[r for r in payload.get('episodes',[]) if r.get('run') in wanted]
    result['world_learning']=dict(payload['world_learning'],history=payload['world_learning'].get('history',[])[-12:])
    c=payload['curriculum'];fields=('name','tier','tier_name','skill','task','mobs')
    result['curriculum']=dict(c,history=c.get('history',[])[-12:],stages=[{k:s[k] for k in fields if k in s} for s in c.get('stages',[])])
    e=payload['model_evolution']
    result['model_evolution']=dict(e,history=[{k:v for k,v in row.items() if k not in ('training','fingerprint','architecture','checkpoint_bytes','weight_bytes','parameters')} for row in e.get('history',[])[:20]])
    return result
