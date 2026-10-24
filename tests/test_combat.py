from lab.combat import COMBAT_STAGES, success
from lab.curriculum import Curriculum, STAGES
from lab.tasks import task_spec, reset_commands
from lab.protection import sweep_commands
import json


def test_combat_catalogue_appends_without_reordering_existing_courses(tmp_path):
    assert len(STAGES)==150 and len(COMBAT_STAGES)==10
    assert all(s['skill']=='combat' for s in STAGES[140:])
    assert [s['name'] for s in STAGES[140:]]==[s['name'] for s in COMBAT_STAGES]
    p=tmp_path/'state.json';p.write_text(json.dumps(dict(catalog_version=10,stage=70,enabled=False,phase='paused',round=9)))
    c=Curriculum(p,{});assert c.state['stage']==70 and c.state['round']==9
    p.write_text(json.dumps(dict(catalog_version=10,stage=139,enabled=False,phase='completed')))
    c=Curriculum(p,{});assert c.state['stage']==140 and c.state['phase']=='paused'


def test_only_tagged_contained_monsters_survive_protection():
    assert all('tag=!lab_combat' in command for command in sweep_commands())
    for stage in COMBAT_STAGES:
        task=task_spec(stage,123,0,True);commands=reset_commands(task,'LabAI0')
        summons=[c for c in commands if c.startswith('summon ')]
        assert len(summons)==len(stage['mobs'])
        assert all('lab_combat_LabAI0' in c and 'PersistenceRequired:1b' in c for c in summons)
        assert any('185' in c and c.endswith('minecraft:glass') for c in commands)
        assert 'kill @e[tag=lab_combat_LabAI0]' in commands
        assert any(c==f"give LabAI0 minecraft:{stage['weapon']} 1" for c in commands)


def test_combat_success_requires_equipment_actual_kills_and_survival():
    task=task_spec(COMBAT_STAGES[-1],1,0,False)
    m=dict(health=8,inside=True,y=181,weapon_equipped=True,armor_equipped=True,shield_equipped=True,kills=3,hits=9)
    assert success(task,m)
    for changes in (dict(kills=2),dict(hits=0),dict(weapon_equipped=False),dict(armor_equipped=False),dict(shield_equipped=False),dict(health=0),dict(inside=False)):
        assert not success(task,{**m,**changes})


def test_combat_model_is_small_and_does_not_mutate_navigation(tmp_path):
    import torch
    from lab.model import Policy
    from lab.skills import SkillBank
    nav=Policy();before={k:v.clone() for k,v in nav.state_dict().items()}
    entry=SkillBank(tmp_path/'data',tmp_path/'checkpoints').get('combat',nav)
    assert entry['model'].parameters_count==11527
    assert entry['model'](torch.zeros(1,82)).shape==(1,7)
    assert all(torch.equal(v,nav.state_dict()[k]) for k,v in before.items())
