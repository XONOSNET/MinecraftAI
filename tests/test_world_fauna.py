from lab.world_fauna import fauna_commands
from test_world_training import fixture


def test_walked_pastures_require_real_bounded_nearby_roads_outside_houses():
    from lab.world_fauna import walked_pastures
    session=dict(bounds=[0,160,0,160],camp=dict(spawn=[80,65,80],plots=[dict(x=80,z=80)]),results={
        'LabAI0':dict(wilderness=dict(memory=dict(roads=[[100.5,65.1,80.5],[101.5,65.1,80.5],[110.5,65.1,80.5],
            [80.5,65.1,80.5],[140.5,65.1,80.5],[120.5,100.1,80.5],[float('nan'),65,90]])))})
    points=walked_pastures(session)
    assert (140,65,80) in points and (110,65,80) in points
    assert any(p[1]==100 for p in points), 'real explored elevations are not restricted to camp height'
    assert all(p[0]!=80 for p in points)
    session['camp']={};assert walked_pastures(session)==points


def test_walked_sheep_replenishment_keeps_population_and_successful_wave_caps():
    from lab.world_fauna import replenish_commands
    commands=replenish_commands([0,160,0,160],[],0,dict(sheep=24),[(20,65,20),(30,66,30),(40,65,40)])
    summons=[c for c in commands if 'run summon' in c]
    assert len(summons)==27
    assert sum('positioned over' not in c for c in summons)==3
    assert all('matches ..1 if score #fauna_sheep lab_world matches ..23' in c for c in summons)
    assert all('unless entity @a[distance=..8]' in c and 'unless entity @e[type=minecraft:sheep,distance=..6]' in c for c in summons)
    assert all(c.count('#minecraft:animals_spawnable_on')==1 and 'Age:0' in c for c in summons)
    assert sum('tag=lab_refill_new' in c and 'execute store result' in c for c in commands)==27
    assert not any('store success' in c for c in commands)


def test_active_natural_trial_uses_reported_walked_pastures(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night',night_level=1),['LabAI0'])
    world.session.update(phase='running',trial_at=0,camp=dict(spawn=[16440,65,16440],plots=[dict(x=16440,z=16440)]),
                         results={'LabAI0':dict(wilderness=dict(memory=dict(roads=[[16460.5,65.1,16440.5]])))})
    commands.clear();clock[0]=30;world.tick()
    assert any('positioned 16460.5 65 16440.5' in c and 'run summon minecraft:sheep' in c for c in commands)
    assert world.session['fauna_replenishment']['sheep_placement']=='walked grass candidates'
    assert world.session['fauna_replenishment']['walked_pastures']==1


def test_unprepared_wilderness_uses_reported_roads_and_keeps_births_outside_reported_houses(tmp_path):
    from lab.world_fauna import walked_pastures,house_plots
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night',night_level=3),['LabAI0'])
    world.session.update(phase='running',trial_at=0,results={'LabAI0':dict(plot=dict(x=16460,y=65,z=16440),wilderness=dict(memory=dict(roads=[[16460.5,65.1,16440.5],[16460.5,65.1,16464.5]])))})
    assert not world.session.get('camp')
    assert house_plots(world.session)==[dict(x=16460,y=65,z=16440)]
    assert walked_pastures(world.session)==[(16460,65,16464)]
    commands.clear();clock[0]=30;world.tick()
    assert world.session['fauna_replenishment']['walked_pastures']==1
    summons=[c for c in commands if 'run summon minecraft:sheep' in c]
    assert any('positioned 16460.5 65 16464.5' in c for c in summons)
    assert not any('positioned 16460.5 65 16440.5' in c for c in summons)
    assert all('matches ..7 if score #fauna_sheep lab_world matches ..31' in c for c in summons)


def test_replenishment_is_bounded_surface_checked_and_avoids_house_plots():
    from lab.world_fauna import replenish_commands
    commands=replenish_commands([0,128,0,128],[dict(x=10,z=10)],0,dict(sheep=24,cow=12))
    summons=[c for c in commands if 'run summon' in c]
    assert len(summons)==26
    assert all('positioned over motion_blocking_no_leaves' in c and 'unless entity @a[distance=..8]' in c for c in summons)
    assert all('if block ~ ~1 ~ minecraft:air' in c for c in summons)
    assert all(c.count('#minecraft:animals_spawnable_on')==(1 if 'summon minecraft:sheep' in c else 5) for c in summons)
    assert all('positioned 10.5 0 10.5' not in c for c in summons)
    assert 'matches ..23' in summons[0] and 'Color:0b' in summons[0]
    assert any('x=0,y=-64,z=0,dx=127,dy=383,dz=127' in c for c in commands)
    assert replenish_commands([0,128,0,128],[],1,dict(sheep=24))!=replenish_commands([0,128,0,128],[],0,dict(sheep=24))


def test_periodic_fauna_runs_only_during_active_natural_training_with_a_cooldown(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start(dict(mission='first_night',night_level=1),['LabAI0'])
    world.session.update(phase='running',trial_at=0);commands.clear()
    clock[0]=29;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)
    clock[0]=30;world.tick();assert sum('lab_replenished_fauna' in c for c in commands)==30
    commands.clear();clock[0]=89;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)
    clock[0]=90;world.tick();assert sum('lab_replenished_fauna' in c for c in commands)==30
    assert world.session['fauna_replenishment']['waves']==2
    assert world.session['fauna_replenishment']['caps']['sheep']==32
    assert world.session['fauna_replenishment']['sheep_births_per_wave']==8
    commands.clear();world.session['assessment']=True;clock[0]=300;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)
    world.session.update(assessment=False,active=False);clock[0]=500;world.tick();assert not any('lab_replenished_fauna' in c for c in commands)


def test_larger_sheep_waves_keep_both_population_and_per_wave_guards():
    import pytest
    from lab.world_fauna import replenish_commands
    roads=[(20+i*8,65,30) for i in range(20)]
    commands=replenish_commands([0,256,0,128],[],0,dict(sheep=32),roads,sheep_births=8)
    births=[c for c in commands if 'run summon minecraft:sheep' in c]
    assert len(births)==40 and sum('positioned over' not in c for c in births)==16
    assert all('matches ..7 if score #fauna_sheep lab_world matches ..31' in c for c in births)
    for invalid in [0,33,True,2.5]:
        with pytest.raises(ValueError):replenish_commands([0,128,0,128],[],0,dict(sheep=32),sheep_births=invalid)

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


def test_sheep_birth_counts_require_server_acknowledgement(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start(dict(mission='first_night',night_level=1),['LabAI0'])
    world.session.update(phase='running',trial_at=0);clock[0]=30;world.tick()
    refill=world.session['fauna_replenishment'];assert refill['pending_counts'] and 'last_sheep_spawned' not in refill
    log.write_text('#fauna_wave_sheep has 2 [lab_world]\n#fauna_sheep has 14 [lab_world]\n')
    clock[0]=31;world.tick();assert refill['last_sheep_spawned']==2 and refill['total_sheep_spawned']==2 and refill['loaded_sheep']==14
    clock[0]=32;world.tick();assert refill['total_sheep_spawned']==2
    clock[0]=150;world.tick();clock[0]=166;world.tick();assert 'timed out' in refill['count_error']


def test_pasture_sampling_spreads_across_large_explored_site():
    from lab.world_fauna import walked_pastures
    roads=[[x+.5,65.1,z+.5] for x in range(8,248,4) for z in range(8,248,16)]
    session=dict(bounds=[0,256,0,256],camp=dict(spawn=[128,65,128],plots=[]),results={
        'LabAI0':dict(wilderness=dict(memory=dict(roads=roads[:512]))),
        'LabAI1':dict(wilderness=dict(memory=dict(roads=roads[512:])))})
    points=walked_pastures(session)
    assert len(points)<=128 and min(p[0] for p in points)<20 and max(p[0] for p in points)>230
    assert min(p[2] for p in points)<20 and max(p[2] for p in points)>230
