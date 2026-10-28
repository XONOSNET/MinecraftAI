import copy
import pytest
from lab.first_night import profile,clean_memory,readiness
from test_world_training import fixture
from test_world_learning import Lab
from lab.world_learning import WorldLearning

def test_first_night_support_removes_stations_then_camp_then_hostile_sweep(tmp_path):
    for level in range(4):
        (tmp_path/str(level)).mkdir()
        world,commands,clock,log=fixture(tmp_path/str(level))
        world.start(dict(mission='first_night',night_level=level),['LabAI0'])
        s=world.session;s.update(phase='running',trial_at=0)
        assert s['prepared']==(level<2) and not s['fast_reset'] and s['time_budget_seconds']==3600
        assert len(s['lessons'])==19
        if s['prepared']:
            camp=world.camp('LabAI0',[16448,70,16448])
            assert bool(camp['groves'][0])==(level==0)
            assert any(c.startswith('summon minecraft:cow') for c in commands)==(level==0)
            if level==1:
                assert world.lesson_resources('LabAI0')==[]
                with pytest.raises(ValueError,match='cannot create'):world.quarry('LabAI0')
        commands.clear();clock[0]=2;world.tick()
        assert any('type=minecraft:zombie,' in c for c in commands)==(level<3)
        assert world.assignment('LabAI0')['world']['first_night']['id']==level

def test_reserved_assessments_require_student_and_never_persist_memory(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    with pytest.raises(ValueError,match='reserved'):world.start(dict(mission='first_night',scenario=9),['LabAI0'])
    with pytest.raises(ValueError,match='student'):world.start(dict(mission='first_night',scenario=9,assessment=True),['LabAI0'])
    world.start(dict(mission='first_night',scenario=9,assessment=True,driver='student'),['LabAI0'])
    world.session.update(phase='running',trial_at=0)
    assert world.assignment('LabAI0')['world']['memory']=={}
    world.report('LabAI0',dict(run=world.session['run'],state='complete',health=20,wilderness=dict(memory={'resources':[{'kind':'home','position':[53300,70,16448]}]})))
    assert not world.saved.get('first_night_memory')
    assert readiness(world.saved['history'])['completed']==1

def test_memory_rejects_bad_coordinates_and_caps_size():
    bounds=[0,128,0,128]
    m=clean_memory(dict(resources=[{'kind':'wood','position':[10,64,10]},{'kind':'wood','position':[500,64,10]},{'kind':'food','position':[10,float('nan'),10]}],roads=[[10.5,64.1,10.5],[11.5,64.1,10.5]],edges=[['10,64,10','11,64,10'],['10,64,10','999,64,10']]),bounds)
    assert len(m['resources'])==1 and len(m['edges'])==1
    assert clean_memory({'roads':None,'resources':'bad','edges':None},bounds)==dict(resources=[],roads=[],edges=[])
    assert len(clean_memory({'roads':[[10.5,64.1,10.5]]*1000},bounds)['roads'])==512
    with pytest.raises(ValueError):profile(True)

def test_cycle_freezes_landmark_memory_for_baseline_teacher_and_candidate(tmp_path):
    lab=Lab();memory={'0-128':{'LabAI0':{'resources':[]}}};hooks=lab.hooks();hooks['memory']=lambda:copy.deepcopy(memory)
    manager=WorldLearning(tmp_path/'learn.json',hooks)
    manager.start(dict(mission='first_night',scenario=0,size=128,night_level=0,auto_progress=True))
    manager.tick();baseline=copy.deepcopy(lab.runs[-1]['memory_snapshot']);memory['0-128']['LabAI0']['resources'].append('changed')
    lab.finish(0);manager.tick();assert lab.runs[-1]['memory_snapshot']==baseline
    lab.counts.update(expedition=100,gathering=100);lab.finish(2);manager.tick()
    lab.job['status']='completed';manager.tick();lab.job['status']='completed';manager.tick()
    assert lab.runs[-1]['memory_snapshot']==baseline

def test_first_night_repetition_keeps_support_and_assessment_settings(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night',night_level=2),['LabAI0']);world.session.update(phase='running',trial_at=0)
    world.report('LabAI0',dict(run=world.session['run'],state='complete'));clock[0]=11
    result=world.next_batch(['LabAI0']);assert result['night_level']==2 and result['assessment'] is False


def test_supported_livestock_is_bounded_guarded_and_has_enough_food(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night',night_level=0),['LabAI0']);s=world.session;s.update(phase='running',trial_at=0)
    world.camp('LabAI0',[16448,70,16448])
    assert sum(c.startswith('summon minecraft:cow') for c in commands)==4
    commands.clear();request=dict(agent='LabAI0',run=s['run'],resource='wool')
    result=world.livestock(request);assert result['remaining']==3 and not result['exhausted']
    assert len(commands)==1 and commands[0].startswith('execute unless entity @e[type=minecraft:sheep,')
    assert 'name=FirstNightLabAI0' in commands[0] and 'Color:0b' in commands[0] and 'give ' not in commands[0]
    clock[0]=10;result=world.livestock(request);assert result['cooldown_seconds']==20 and len(commands)==1
    for now in (31,62,93):clock[0]=now;world.livestock(request)
    clock[0]=124;assert world.livestock(request)['exhausted'] and len(commands)==4
    assert world.livestock(dict(request,resource='food'))['remaining']==3


@pytest.mark.parametrize('level',[1,2,3])
def test_natural_first_night_never_replaces_livestock(tmp_path,level):
    world,commands,clock,log=fixture(tmp_path);world.start(dict(mission='first_night',night_level=level),['LabAI0'])
    world.session.update(phase='running',camp={'plots':[{'x':16448,'y':70,'z':16448}]})
    commands.clear()
    with pytest.raises(ValueError,match='only available'):world.livestock(dict(agent='LabAI0',run=world.session['run'],resource='wool'))
    assert not commands


def test_livestock_rejects_stale_runs_unknown_agents_assessments_and_resources(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start(dict(mission='first_night',night_level=0),['LabAI0']);s=world.session;s.update(phase='running')
    world.camp('LabAI0',[16448,70,16448]);request=dict(agent='LabAI0',run=s['run'],resource='food');commands.clear()
    for change in ({'agent':'Xonosnet'},{'run':'old'},{'resource':'diamond'}):
        with pytest.raises(ValueError):world.livestock(dict(request,**change))
    s['assessment']=True
    with pytest.raises(ValueError):world.livestock(request)
    assert not commands


def test_wool_sightings_survive_bounded_memory_cleanup():
    memory=clean_memory({'resources':[{'kind':'wool','position':[10,64,10]},
                                    {'kind':'wool','position':[500,64,10]}]},[0,128,0,128])
    assert memory['resources']==[{'kind':'wool','position':[10,64,10]}]
