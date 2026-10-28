from lab.dashboard_state import world_view,learning_view,compact_status
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


def test_compact_poll_keeps_displayed_results_current_models_and_live_bot_details():
    payload=dict(run='live',activity=[dict(event='mode',details={'run':'prior'})],
        episodes=[dict(run=r) for r in ['live','prior','release2-trained','hidden']],
        world_learning=dict(history=list(range(40)),baseline={'completed':3}),
        curriculum=dict(run='auto',history=list(range(40)),stages=[dict(name='Combat',mobs=['husk'],task='combat',private_layout=list(range(100)))]),
        model_evolution=dict(current={'parameters':100,'training':{'samples':40}},skills=[{'skill':'combat'}],history=[dict(id=i,training={'large':True},evaluation={'accepted':False}) for i in range(60)]),
        agents={'LabAI0':{'position':[1,2,3]}},world_training={'session':{'results':{'LabAI0':{'phase':'gather'}}}})
    view=compact_status(payload)
    assert {r['run'] for r in view['episodes']}=={'live','prior','release2-trained'}
    assert len(view['world_learning']['history'])==12 and len(view['model_evolution']['history'])==20
    assert view['model_evolution']['current']==payload['model_evolution']['current']
    assert view['agents']==payload['agents'] and view['world_training']==payload['world_training']
    assert view['curriculum']['stages']==[dict(name='Combat',mobs=['husk'],task='combat')]
    assert 'training' not in view['model_evolution']['history'][0]
    assert len(payload['model_evolution']['history'])==60 and 'private_layout' in payload['curriculum']['stages'][0]


def test_historical_world_summaries_keep_only_fields_displayed_in_the_history_table():
    view=world_view(dict(name='Site',bots=['LabAI0'],results={'LabAI0':dict(state='complete',seconds=120,navigation={'large':'trace'},timings={'large':'trace'})}),summary=True)
    assert view['results']=={'LabAI0':dict(state='complete',seconds=120)}
