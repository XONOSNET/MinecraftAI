import math
from lab.protection import PracticeProtection,roof_commands,sweep_commands

def test_practice_protection_runs_without_active_training_and_builds_high_cover():
    commands=[];p=PracticeProtection(commands.append)
    p.tick(1,100)
    assert any('forceload add' in c for c in commands)
    assert any('minecraft:phantom' in c for c in commands)
    assert not p.roof_ready
    commands.clear();p.tick(1,104)
    assert p.roof_ready and all(c in commands for c in roof_commands())
    commands.clear();p.tick(1,106)
    assert any('phantom' in c for c in commands) and not any(c.startswith('fill') for c in commands)

def test_protection_is_scoped_above_survival_ground_and_excludes_camera_entities():
    for command in sweep_commands()+sweep_commands(True):
        assert 'y=175' in command and 'dx=56' in command
        assert not any(t in command for t in ('armor_stand','marker','player','item'))
    for command in roof_commands():
        p=list(map(int,command.split()[1:7]));assert p[1]==p[4]==224
        assert math.prod(abs(p[i+3]-p[i])+1 for i in range(3))<=32768

def test_hostile_variants_are_removed_without_removing_intended_combat_mobs():
    commands=sweep_commands()
    for mob in ('zombie','zombie_villager','cave_spider','stray','bogged'):
        assert any(f'type=minecraft:{mob},' in c for c in commands)
    assert all('tag=!lab_combat' in c for c in commands)
