from lab.world_fauna import fauna_commands
from test_world_training import fixture

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
