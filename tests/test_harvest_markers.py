import pytest
from lab.harvest_markers import HarvestMarkers


def test_target_columns_follow_selection_and_cleanup(tmp_path):
    commands=[];now=[100]
    v=HarvestMarkers(tmp_path/'markers.json',commands.append,clock=lambda:now[0])
    agents={'LabAI0':{'connected':True,'last_seen':100}}
    session={'active':True,'bounds':[0,20,0,20],'results':{'LabAI0':{'state':'working','harvest_target':[3,70,4]}}}
    v.tick(session,agents,True)
    assert len(v.live)==1 and 'summon minecraft:block_display 3.500 71.000 4.500' in commands[-1]
    assert 'scale:[0.12f,12f,0.12f]' in commands[-1] and 'setblock' not in commands[-1]
    total=len(commands);now[0]+=.6;v.tick(session,agents,True);assert len(commands)==total
    session['results']['LabAI0']['harvest_target']=[4,70,4];now[0]+=.6;v.tick(session,agents,True)
    assert commands[-1].startswith('tp ') and '4.500 71.000 4.500' in commands[-1]
    session['results']['LabAI0']['state']='complete';now[0]+=.6;v.tick(session,agents,True)
    assert not v.live and commands[-1].startswith('kill ')


def test_toggle_stale_invalid_and_restart_cleanup(tmp_path):
    commands=[];now=[100];path=tmp_path/'markers.json'
    v=HarvestMarkers(path,commands.append,clock=lambda:now[0])
    agents={'LabAI0':{'connected':True,'last_seen':100}}
    session={'active':True,'bounds':[0,20,0,20],'results':{'LabAI0':{'state':'working','harvest_target':[3,70,4]}}}
    v.tick(session,agents,True);now[0]+=6;v.tick(session,agents,True);assert not v.live
    agents['LabAI0']['last_seen']=106;session['results']['LabAI0']['harvest_target']=[999,70,4]
    now[0]+=.6;v.tick(session,agents,True);assert not v.live
    v.configure({'enabled':False});assert not HarvestMarkers(path,commands.append).settings['enabled']
    with pytest.raises(ValueError):v.configure({'enabled':'yes'})
    v.tick(session,agents,False);v.tick(session,agents,True)
    assert commands[-1]=='kill @e[type=minecraft:block_display,tag=lab_harvest_target]'
