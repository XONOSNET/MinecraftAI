"""Small detached dashboard views; private replay/landmark data stays in storage."""
import copy

PRIVATE_WORLD_KEYS={'memory_snapshot','behavior_snapshot','fauna_queue','fauna_log','lesson_resources','quarries','survival_stations','livestock_refills','released_livestock'}

def world_view(session):
    if session is None:return None
    result={k:copy.deepcopy(v) for k,v in session.items() if k not in PRIVATE_WORLD_KEYS and k!='results'}
    result['results']={}
    for name,row in session.get('results',{}).items():
        result['results'][name]={k:copy.deepcopy(v) for k,v in row.items() if k!='wilderness'}
        if isinstance(row.get('wilderness'),dict):
            result['results'][name]['wilderness']={k:copy.deepcopy(v) for k,v in row['wilderness'].items() if k!='memory'}
    return result

def learning_view(state):
    return {k:copy.deepcopy(v) for k,v in state.items() if k not in ('memory_snapshot','behavior_snapshot')}
