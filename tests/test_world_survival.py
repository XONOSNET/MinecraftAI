import pytest
from lab.world_training import WorldTraining
from lab.world_survival import MISSION_LESSONS

def setup(tmp_path,mission='homestead',count=8):
    commands=[];world=WorldTraining(tmp_path/'world.json',commands.append,tmp_path/'console.log')
    world.start({'mission':mission},[f'LabAI{i}' for i in range(count)])
    world.session['phase']='running';world.camp('LabAI0',[16448.5,70.1,16448.5])
    return world,commands

def call(world,name='LabAI0',action='station',**kw):
    return world.survival(dict(agent=name,run=world.session['run'],action=action,**kw),'Named bot')

def test_all_survival_stations_have_separate_real_resources_and_reversible_depth(tmp_path):
    world,commands=setup(tmp_path);stations=[call(world,f'LabAI{i}') for i in range(8)]
    positions=set()
    for s in stations:
        assert len(s['ores'])==40 and len(s['coal'])==8 and len(s['logs'])==4
        assert all(abs(a[1]-b[1])==1 for a,b in zip(s['stairs'],s['stairs'][1:]))
        assert s['stairs'][0][1]-s['stairs'][-1][1]==5
        for p in s['ores']+s['coal']+s['logs']:
            assert tuple(p) not in positions;positions.add(tuple(p))
            assert 16400<p[0]<16496 and 16400<p[2]<16496 and 64<=p[1]<=74
    before=len(commands);assert call(world)==stations[0] and len(commands)==before
    assert sum('summon minecraft:sheep' in c for c in commands)==24
    assert not any(c.startswith('give ') for c in commands)

def test_survival_requires_prepared_camp_and_current_run(tmp_path):
    world,commands=setup(tmp_path)
    with pytest.raises(ValueError):world.survival(dict(agent='LabAI0',run='stale',action='station'),'name')
    with pytest.raises(ValueError):call(world,action='threat')
    world.stop()
    with pytest.raises(ValueError):world.start({'mission':'homestead','prepared':False},['LabAI0'])

def test_bed_home_uses_server_block_guard_and_own_hut_then_allows_owned_threat(tmp_path):
    world,commands=setup(tmp_path,'home_defense');plot=world.session['camp']['plots'][0]
    with pytest.raises(ValueError):call(world,action='home',position=[plot['x']+8,70,plot['z']])
    position=[plot['x']+1,70,plot['z']-1];home=call(world,action='home',position=position)
    assert home['position']==position and world.saved['homes']['LabAI0']['owner']=='Named bot'
    spawn=[c for c in commands if 'run spawnpoint' in c]
    assert len(spawn)==1 and 'if block' in spawn[0] and 'minecraft:white_bed' in spawn[0]
    assert any('item_display' in c and 'minecraft:white_bed' in c for c in commands)
    threat=call(world,action='threat');n=len(commands)
    assert call(world,action='threat')==threat and len(commands)==n
    assert any('summon minecraft:husk' in c and '"lab_combat"' in c and 'lab_world_LabAI0' in c for c in commands)
    world.report('LabAI0',dict(run=world.session['run'],state='stopped'))
    assert 'kill @e[tag=lab_world_LabAI0]' in commands

def test_advanced_resets_cover_outer_mine_and_increase_time_budget(tmp_path):
    world,commands=setup(tmp_path);world.stop();world.saved['templates']['0-128']['camp_anchor']=[16452,70,16452]
    world.start({'mission':'homestead'},['LabAI0']);s=world.session
    assert s['reset_area'][2]<=16452-44 and s['reset_area'][3]>=16452+44
    assert s['copy_y'][0]<=64 and s['time_budget_seconds']==2400
    assert len(MISSION_LESSONS['iron_age'])==20 and len(MISSION_LESSONS['homestead'])==26 and len(MISSION_LESSONS['home_defense'])==29

def test_catch_floor_extends_beyond_every_deposit_and_has_side_walls(tmp_path):
    world,commands=setup(tmp_path,count=1);s=call(world);bottom=min(p[1] for p in s['ores']);floor=bottom-1
    fills=[]
    for c in commands:
        parts=c.split()
        if parts[0]=='fill' and parts[-1]=='minecraft:stone':fills.append([int(v) for v in parts[1:7]])
    covers=lambda x,y,z:any(a<=x<=d and b<=y<=e and c<=z<=f for a,b,c,d,e,f in fills)
    for x,y,z in s['ores']+s['coal']:
        assert all(covers(x+dx,floor,z+dz) for dx in (-1,0,1) for dz in (-1,0,1))
    center=s['stairs'][0][0]-.5;z=s['ores'][0][2]
    assert covers(center-6,bottom+1,z) and covers(center+5,bottom+1,z)

def test_every_defense_threat_spawns_outside_all_eight_huts(tmp_path):
    world,commands=setup(tmp_path,'home_defense')
    plots=world.session['camp']['plots']
    for i,p in enumerate(plots):
        name=f'LabAI{i}';call(world,name,'home',position=[p['x']+1,p['y'],p['z']-1])
        threat=call(world,name,'threat');x,y,z=threat['spawn']
        assert not any(abs(x-(q['x']+.5))<=2 and abs(z-(q['z']+.5))<=2 for q in plots)
