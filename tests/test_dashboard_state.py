from lab.dashboard_state import world_view,learning_view
from fastapi.responses import JSONResponse

def test_dashboard_omits_private_training_data_without_mutating_live_state():
    memory={'resources':[{'kind':'wool','position':[10,64,10]}]}
    state={'run':'one','memory_snapshot':{'bot':memory},'quarries':{'ore':list(range(1000))},
           'results':{'LabAI0':{'state':'working','phase':'night_wool','navigation':{'rpc_ms':2000},
                      'wilderness':{'priority':'wool','memory':memory}}}}
    view=world_view(state)
    assert 'memory_snapshot' not in view and 'quarries' not in view
    assert view['results']['LabAI0']['navigation']['rpc_ms']==2000
    assert view['results']['LabAI0']['wilderness']=={'priority':'wool'}
    view['results']['LabAI0']['phase']='changed'
    assert state['results']['LabAI0']['phase']=='night_wool'
    assert state['results']['LabAI0']['wilderness']['memory'] is memory

def test_direct_response_is_frozen_before_background_state_changes():
    state={'results':{'LabAI0':{'state':'working','seconds':1}}}
    response=JSONResponse(world_view(state))
    state['results']['LabAI1']={'state':'stopped'}
    assert b'LabAI1' not in response.body
    assert world_view(None) is None

def test_learning_dashboard_preserves_comparisons_without_landmark_copies():
    state={'enabled':True,'baseline':{'completed':2},'history':[{'accepted':False}],
           'memory_snapshot':{'huge':'private'},'behavior_snapshot':{'revision':'saved'}}
    view=learning_view(state)
    assert set(view)=={'enabled','baseline','history'}
    view['history'].clear()
    assert len(state['history'])==1
