import json
import math
import torch
from lab.config import AGENT_COUNT
from lab.model import Policy
from lab.skills import SkillBank, SKILL_INPUTS, SKILL_ACTIONS
from lab.tasks import EXTRA_STAGES, task_spec, reset_commands, arena_commands, task_success
from lab.curriculum import Curriculum

def test_skill_checkpoints_replay_and_rollback_never_change_navigation(tmp_path):
    nav=Policy();before={k:v.clone() for k,v in nav.state_dict().items()}
    bank=SkillBank(tmp_path/'data',tmp_path/'checkpoints');entry=bank.get('gathering',nav)
    assert entry['model'](torch.zeros(2,SKILL_INPUTS)).shape==(2,SKILL_ACTIONS)
    bank.save('gathering',champion=True)
    with torch.no_grad():entry['model'].net[2].bias.add_(5)
    bank.restore('gathering')
    assert all(torch.equal(v,nav.state_dict()[k]) for k,v in before.items())
    entry['samples'].append(([0.0]*SKILL_INPUTS,5));bank.save_replay('gathering');bank.save('gathering')
    loaded=SkillBank(tmp_path/'data',tmp_path/'checkpoints').get('gathering',nav)
    assert len(loaded['samples'])==1 and loaded['samples'][0][1]==5
    assert all(torch.equal(v,loaded['model'].state_dict()[k]) for k,v in entry['model'].state_dict().items())

def test_every_task_stays_in_its_own_lane_and_train_test_are_separate():
    for stage in EXTRA_STAGES:
        for index in range(AGENT_COUNT):
            for seed in range(10):
                task=task_spec(stage,seed,index,False);test=task_spec(stage,seed,index,True)
                assert test['center']-task['center']==160
                lo,hi,zlo,zhi=task['bounds']
                assert all(lo<p[0]<hi and zlo<p[2]<zhi for p in (task['start'],task['goal']))
                assert math.isfinite(task['yaw'])
                for cmd in reset_commands(task,f'LabAI{index}'):
                    assert '\n' not in cmd and 'Xonosnet' not in cmd

def test_construction_commands_fit_vanilla_fill_limits():
    for center in (320,480):
        for command in arena_commands(center):
            if command.startswith('fill '):
                p=list(map(int,command.split()[1:7]));assert math.prod(abs(p[i+3]-p[i])+1 for i in range(3))<=32768

def test_success_requires_real_objective_health_and_practice_bounds():
    basic={'health':20,'inside':True,'y':181,'distance':.5,'hazard_contacts':0}
    for stage in EXTRA_STAGES:
        task=task_spec(stage,1,0,False);m={**basic,'distance_3d':.5,'checkpoints':len(task['waypoints'])-1,'water_steps':10,'jumps':task.get('required_jumps',0),'wood':task['wood_target'],'food':20,'eaten':2,'hunger_observed':True,'coverage':task['coverage_target'],'sheltered':True,'doors_opened':len(task.get('actual_doors',[]))}
        if task['kind']=='expedition':m['y']=task['goal'][1]
        assert task_success(task,m)
        for bad in ({'health':0},{'inside':False},{'y':100}):assert not task_success(task,{**m,**bad})
        if task['kind']=='eat':assert not task_success(task,{**m,'eaten':0})
        if task['kind']=='gather':assert not task_success(task,{**m,'wood':0})
        if task['kind']=='shelter':assert not task_success(task,{**m,'sheltered':False})
        if task['kind']=='explore':assert not task_success(task,{**m,'coverage':1})
        if task['kind']=='hazard':assert not task_success(task,{**m,'hazard_contacts':1})

def test_navigation_completion_migrates_to_new_skills_without_losing_history(tmp_path):
    path=tmp_path/'state.json';history=[{'stage':3,'score':1,'cycle':8,'baseline':1,'accepted':True}]
    path.write_text(json.dumps({'enabled':False,'phase':'completed','stage':3,'streak':2,'history':history,'max_cycles':12}))
    c=Curriculum(path,{})
    assert c.state['stage']==0 and c.state['history'][0]['score']==history[0]['score'] and c.state['max_cycles']==112


def test_mineflayer_yaw_round_trip_matches_installed_protocol_conversion():
    from lab.tasks import minecraft_yaw
    for yaw in [-math.pi,-math.pi/2,0,math.pi/2,math.pi]:
        restored=math.pi-minecraft_yaw(yaw)*math.pi/180
        assert abs(math.atan2(math.sin(restored-yaw),math.cos(restored-yaw)))<1e-8


def test_skill_width_is_preserved_when_navigation_size_changes(tmp_path):
    bank=SkillBank(tmp_path/'data',tmp_path/'weights');bank.get('nutrition',Policy(64));bank.save('nutrition')
    reloaded=SkillBank(tmp_path/'data',tmp_path/'weights').get('nutrition',Policy(128))
    assert reloaded['model'].net[0].out_features==64


def test_skill_summary_migrates_existing_replay_without_loading_all_policies(tmp_path):
    import numpy as np
    root=tmp_path/'data';root.mkdir();np.savez(root/'nutrition.npz',obs=np.zeros((100,82)),actions=np.zeros(100,dtype=int))
    bank=SkillBank(root,tmp_path/'weights');assert bank.summary('nutrition')['samples']==100
    assert bank.entries=={} and (root/'nutrition.json').exists()


def test_three_log_task_uses_a_tree_column_so_drops_are_reachable_together():
    stage=next(s for s in EXTRA_STAGES if s['task']=='gather' and s['difficulty']==2)
    commands=reset_commands(task_spec(stage,1,0,False),'LabAI0')
    logs=[c.split() for c in commands if c.startswith('setblock')]
    assert len(logs)==3 and len({(c[1],c[3]) for c in logs})==1
    assert {int(c[2]) for c in logs}=={181,182,183}


def test_water_hazards_have_a_sealed_floor_beneath_the_source_blocks():
    stage=next(s for s in EXTRA_STAGES if s['task']=='hazard' and s['difficulty']==1)
    commands=reset_commands(task_spec(stage,1,0,False),'LabAI0');floor=commands[0].split()
    assert int(floor[2])==179 and int(floor[5])==180
    assert any('180' in c and c.endswith('minecraft:water') for c in commands)

def test_completed_catalogue_resumes_at_appended_stages_and_count_resets_streak(tmp_path):
    path=tmp_path/'state.json';history=[{'stage':15,'score':1}]
    path.write_text(json.dumps({'catalog_version':2,'enabled':False,'phase':'completed','stage':15,'history':history,'streak':2,'agent_count':5,'max_cycles':48}))
    state=Curriculum(path,{}).state
    assert state['stage']==0 and state['phase']=='paused' and state['streak']==0
    assert state['history'][0]['score']==history[0]['score'] and state['max_cycles']==112 and state['agent_count']==AGENT_COUNT

def test_largest_configured_arena_still_fits_fill_limit(monkeypatch):
    import lab.tasks as tasks
    monkeypatch.setattr(tasks,'LANE_END',114)
    for cmd in tasks.arena_commands(480):
        p=list(map(int,cmd.split()[1:7]))
        assert math.prod(abs(p[i+3]-p[i])+1 for i in range(3))<=32768

def test_full_replay_buffer_does_not_save_on_every_action(tmp_path,monkeypatch):
    bank=SkillBank(tmp_path/'data',tmp_path/'weights');entry=bank.get('exploration',Policy())
    entry['samples'].extend([([0.0]*82,0)]*15000)
    saved=[];monkeypatch.setattr(bank,'save_replay',lambda skill:saved.append(entry['count']))
    for _ in range(200):bank.record('exploration',[1.0]*82,1)
    assert len(entry['samples'])==15000 and saved==[100,200]

def test_larger_harvest_targets_fit_the_available_view_and_keep_drops_together():
    for stage in [s for s in EXTRA_STAGES if s.get('wood_target',0)>3]:
        task=task_spec(stage,1,0,False)
        blocks=[c.split() for c in reset_commands(task,'LabAI0') if c.startswith('setblock')]
        assert len(blocks)==task['wood_target']
        assert max(int(c[2]) for c in blocks)==183
        assert max(int(c[1]) for c in blocks)-min(int(c[1]) for c in blocks)==1

def test_terrain_layouts_are_seeded_bounded_and_include_real_elevation_changes():
    stages=[s for s in EXTRA_STAGES if s['skill']=='terrain'];assert len(stages)==8
    for stage in stages:
        for seed in range(20):
            task=task_spec(stage,seed,AGENT_COUNT-1,True)
            assert task==task_spec(stage,seed,AGENT_COUNT-1,True)
            xlo,xhi,zlo,zhi=task['bounds']
            for x1,y1,z1,x2,y2,z2,block in task['terrain_blocks']:
                assert xlo<=x1<=x2<=xhi and zlo<=z1<=z2<=zhi and 180<=y1<=y2<=185
            for p in task['waypoints']:assert xlo<p[0]<xhi and zlo<p[2]<zhi
    ridge=task_spec(stages[0],1,0,False)
    assert max(b[4] for b in ridge['terrain_blocks'])==183

def test_completed_32_stage_catalogue_migrates_to_terrain(tmp_path):
    path=tmp_path/'state';path.write_text(json.dumps({'catalog_version':3,'enabled':False,'phase':'completed','stage':31,'streak':2,'max_cycles':80}))
    c=Curriculum(path,{})
    assert c.state['stage']==0 and c.state['phase']=='paused' and c.state['max_cycles']==112


def test_advanced_courses_have_real_doors_and_require_observed_openings():
    from lab.advanced import ADVANCED_STAGES
    assert len(ADVANCED_STAGES)==30
    for i,stage in enumerate(ADVANCED_STAGES):
        task=task_spec(stage,123,0,True);commands=reset_commands(task,'LabAI0')
        assert all(task['bounds'][0]<p[0]<task['bounds'][1] and task['bounds'][2]<p[2]<task['bounds'][3] for p in task['waypoints'])
        if task['actual_doors']:
            assert any('oak_door[' in cmd and 'open=false' in cmd for cmd in commands)
            assert not task_success(task,{'health':20,'inside':True,'y':181,'distance':0,'hazard_contacts':0,'doors_opened':0})


def test_final_bridge_exit_door_aligns_with_bent_deck():
    from lab.advanced import ADVANCED_STAGES
    task=task_spec(ADVANCED_STAGES[19],123,0,True)
    assert task['actual_doors'][-1][1]==task['lane_z']+2


def test_bent_bridge_waypoints_keep_clear_of_open_door_leaf():
    from lab.advanced import ADVANCED_STAGES
    task=task_spec(ADVANCED_STAGES[19],123,0,True);door_x=task['actual_doors'][0][0]
    near=[point for point in task['waypoints'] if abs(point[0]-door_x)<=2]
    assert near and all(.3<point[2]-task['lane_z']<.8 for point in near)


def test_narrow_bridge_waypoints_and_goal_follow_deck_center():
    from lab.advanced import ADVANCED_STAGES
    task=task_spec(ADVANCED_STAGES[2],123,0,True)
    deck=next(b for b in task['terrain_blocks'] if b[-1]=='oak_planks')
    center=(deck[2]+deck[5]+1)/2
    assert all(p[2]==center for p in task['waypoints'])
    assert task['goal'][2]==center


def test_advanced_observation_migration_archives_only_incompatible_replay(tmp_path):
    import numpy as np
    root=tmp_path/'data';root.mkdir()
    np.savez(root/'advanced.npz',obs=np.zeros((100,82)),actions=np.zeros(100,dtype=int))
    bank=SkillBank(root,tmp_path/'weights');entry=bank.get('advanced',Policy())
    assert not entry['samples'] and len(list(root.glob('advanced-v1-*.npz')))==1
    entry['samples'].append(([0.0]*82,1));bank.save_replay('advanced');bank.save('advanced')
    loaded=SkillBank(root,tmp_path/'weights').get('advanced',Policy())
    assert len(loaded['samples'])==1 and loaded['samples'][0][1]==1


def test_bridge_routes_clear_open_door_leaves_before_centering_on_deck():
    from lab.advanced import ADVANCED_STAGES
    for stage in ADVANCED_STAGES:
        task=task_spec(stage,123,0,True)
        for x,z in task['actual_doors']:
            crossings=[]
            for a,b in zip(task['waypoints'],task['waypoints'][1:]):
                if a[0]<=x<=b[0] and b[0]>a[0]:
                    crossings.append(a[2]+(b[2]-a[2])*(x-a[0])/(b[0]-a[0]))
            assert crossings and all(abs(c-(z+.6))<.01 for c in crossings),stage['name']


def test_terrain_replay_migrates_without_changing_saved_weights(tmp_path):
    import numpy as np
    root=tmp_path/'data';root.mkdir();weights=tmp_path/'weights'
    bank=SkillBank(root,weights);entry=bank.get('terrain',Policy());bank.save('terrain')
    before={k:v.clone() for k,v in entry['model'].state_dict().items()}
    np.savez(root/'terrain.npz',obs=np.zeros((10,82)),actions=np.zeros(10,dtype=int),observation_version=1)
    bank=SkillBank(root,weights);loaded=bank.get('terrain',Policy())
    assert not loaded['samples'] and len(list(root.glob('terrain-v1-*.npz')))==1
    assert all(torch.equal(v,loaded['model'].state_dict()[k]) for k,v in before.items())
    loaded['samples'].append(([0.0]*82,0));bank.save_replay('terrain')
    assert len(SkillBank(root,weights).get('terrain',Policy())['samples'])==1


def test_ten_new_challenges_include_new_surfaces_and_bounded_geometry():
    from lab.advanced import ADVANCED_STAGES
    stages=ADVANCED_STAGES[20:];assert len(stages)==10
    materials=set()
    for stage in stages:
        task=task_spec(stage,123,0,True)
        assert task_success(task,{'health':20,'inside':True,'y':181,'distance':0,'hazard_contacts':0,'doors_opened':len(task['actual_doors'])})
        for x1,y1,z1,x2,y2,z2,block in task['terrain_blocks']:
            assert task['bounds'][0]<=x1<=x2<=task['bounds'][1]
            assert task['bounds'][2]<=z1<=z2<=task['bounds'][3]
            assert 180<=y1<=y2<=183
            materials.add(block)
    assert {'blue_ice','soul_sand','cobweb','mossy_cobblestone','magma_block'}<=materials
    assert len(task_spec(stages[5],123,0,True)['actual_doors'])==3
