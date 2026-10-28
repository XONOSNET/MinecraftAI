from lab.world_fauna import fauna_commands
from test_world_training import fixture


def test_replenishment_is_bounded_surface_checked_and_avoids_house_plots():
    from lab.world_fauna import replenish_commands
    commands=replenish_commands([0,128,0,128],[dict(x=10,z=10)],0,dict(sheep=24,cow=12))
    assert len(commands)==8
    assert all('execute store result score' in commands[i] for i in range(0,8,2))
    summons=commands[1::2]
    assert all('positioned over motion_blocking_no_leaves' in c and 'unless entity @a[distance=..8]' in c for c in summons)
    assert all(c.count('#minecraft:animals_spawnable_on')==5 and 'if block ~ ~1 ~ minecraft:air' in c for c in summons)
    assert all('positioned 10.5 0 10.5' not in c for c in summons)
    assert 'matches ..23' in summons[0] and 'Color:0b' in summons[0]
    assert 'x=0,y=-64,z=0,dx=127,dy=383,dz=127' in commands[0]
    assert replenish_commands([0,128,0,128],[],1,dict(sheep=24))!=replenish_commands([0,128,0,128],[],0,dict(sheep=24))


def test_periodic_fauna_runs_only_during_active_natural_training_with_a_cooldown(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night',night_level=1),['LabAI0'])
    world.session.update(phase='running',trial_at=0);commands.clear()
    clock[0]=29;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)
    clock[0]=30;world.tick();assert sum('lab_replenished_fauna' in c for c in commands)==8
    commands.clear();clock[0]=149;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)
    clock[0]=150;world.tick();assert sum('lab_replenished_fauna' in c for c in commands)==8
    assert world.session['fauna_replenishment']['waves']==2
    commands.clear();world.session['assessment']=True;clock[0]=300;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)
    world.session.update(assessment=False,active=False);clock[0]=500;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)

def test_fauna_restores_original_positions_without_reusing_entity_uuids():
    capture=fauna_commands([0,128,0,128],'1-128',True)
    assert len(capture)==6 and 'append from entity @s' in capture[1]
    restore=fauna_commands([0,128,0,128],'1-128',False)
    summons=[c for c in restore if ' run summon ' in c]
    assert len(summons)==160 and all('execute if data storage' in c for c in summons)
    assert all('UUID' not in c for c in restore)
    assert any('Pos set from storage' in c for c in restore)
    assert any('Color set from storage' in c for c in restore)
    assert all('tag=!lab_world_survival' in c for c in restore if c.startswith('kill'))

def test_fauna_acknowledgement_precedes_deployment_and_releases_loads(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night'),['LabAI0'])
    assert not world.prepare_fauna() and any(c.startswith('forceload add') for c in commands)
    clock[0]=3;assert not world.prepare_fauna();assert not world.prepare_fauna()
    log.write_text('Set [lab_world] for #world_ack to 1\n')
    assert world.prepare_fauna() and world.session['fauna_ready']
    assert world.saved['templates']['0-128']['fauna_snapshot']
    assert commands[-1].startswith('forceload remove')

def test_cancel_during_fauna_restore_releases_whole_site(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night'),['LabAI0']);world.prepare_fauna();world.stop()
    assert 'forceload remove 16384 16384 16511 16511' in commands
