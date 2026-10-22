import json
import math
import torch
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
        for index in range(5):
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
        task=task_spec(stage,1,0,False);m={**basic,'wood':task['wood_target'],'food':20,'eaten':2,'hunger_observed':True,'coverage':task['coverage_target'],'sheltered':True}
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
    assert c.state['stage']==4 and c.state['history']==history and c.state['max_cycles']==48


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
