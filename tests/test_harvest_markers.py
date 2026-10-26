import pytest
from lab.harvest_markers import HarvestMarkers,validate_intent


def fixture(tmp_path):
    commands=[];now=[100]
    v=HarvestMarkers(tmp_path/'markers.json',commands.append,clock=lambda:now[0])
    intent={'run':'world-test','position':[3,70,4],'block':'oak_log','kind':'approach','seen':100}
    agents={'LabAI0':{'connected':True,'last_seen':100,'harvest_intent':intent,'display_name':'Cedar'}}
    session={'run':'world-test','active':True,'phase':'running','bots':['LabAI0'],'bounds':[0,20,0,20],'results':{}}
    return v,commands,now,agents,session


def test_live_target_block_and_beam_move_and_change_mining_color(tmp_path):
    v,commands,now,agents,session=fixture(tmp_path);v.tick(session,agents,True)
    summons=[c for c in commands if 'run summon ' in c]
    assert len(summons)==2
    assert all('if block 3 70 4 minecraft:oak_log' in c and 'block_display 3.000 70.000 4.000' in c for c in summons)
    assert 'scale:[1.02f,1.02f,1.02f]' in summons[1] and 'Cedar' in summons[0]
    total=len(commands);now[0]+=.21;v.tick(session,agents,True)
    assert len(commands)==total+1 and 'unless block' in commands[-1]
    agents['LabAI0']['harvest_intent'].update(position=[4,70,4],kind='mining');now[0]+=.21;v.tick(session,agents,True)
    assert any(c.startswith('tp ') and c.endswith('4.000 70.000 4.000') for c in commands)
    assert 'lime_stained_glass' in commands[-1] and 'Mining' in commands[-1]
    session['results']['LabAI0']={'state':'complete'};now[0]+=.21;v.tick(session,agents,True)
    assert not v.live and commands[-1].startswith('kill ')


def test_stale_trial_report_is_never_used_as_a_target(tmp_path):
    v,commands,now,agents,session=fixture(tmp_path)
    session['results']['LabAI0']={'state':'working','harvest_target':[10,70,10]}
    agents['LabAI0']['harvest_intent']=None;v.tick(session,agents,True)
    assert not v.live and not any('summon' in c for c in commands)


def test_stale_intent_is_removed_even_with_fresh_bot_heartbeat(tmp_path):
    v,commands,now,agents,session=fixture(tmp_path);v.tick(session,agents,True)
    now[0]+=2.1;agents['LabAI0']['last_seen']=now[0];v.tick(session,agents,True)
    assert not v.live and commands[-1].startswith('kill ')
    v.configure({'enabled':False});assert not HarvestMarkers(v.path,commands.append).settings['enabled']
    with pytest.raises(ValueError):v.configure({'enabled':'yes'})
    v.tick(session,agents,False);v.tick(session,agents,True)
    assert commands[-1]=='kill @e[type=minecraft:block_display,tag=lab_harvest_target]'


@pytest.mark.parametrize('change',[{'run':'old-run'},{'kind':'walking'},{'block':'air'},
    {'position':[3.5,70,4]},{'position':[999,70,4]},{'position':[float('nan'),70,4]}])
def test_invalid_intents_are_rejected(tmp_path,change):
    _,_,_,agents,session=fixture(tmp_path)
    assert validate_intent({**agents['LabAI0']['harvest_intent'],**change},session,'LabAI0',100) is None
