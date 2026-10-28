from test_world_training import fixture
from lab.camp_layout import clear_areas
from lab.world_fauna import fauna_extend_commands


def test_existing_core_is_restored_while_only_unused_ring_is_snapshotted(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.saved['templates']['2-128']={'camp_anchor':[24618,65,16480],'fauna_snapshot':True}
    world.start(dict(mission='first_night',night_level=1,scenario=2),['LabAI0'])
    assert world.session['bounds']==[24560,24720,16368,16528]
    assert world.session['core_bounds']==[24576,24704,16384,16512]
    snapshots=[j for j in world.jobs if j[0]<j[1]];restores=[j for j in world.jobs if j[0]>j[1]]
    assert len(snapshots)==36 and len(restores)==100
    assert all(not (24576<=x<24704 and 16384<=z<16512) for x,d,z,w in snapshots)
    assert world.session['camp_anchor']==[24618,65,16480]


def test_saved_extended_trial_restores_every_tile_without_recapturing(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.saved['templates']['0-128']={'resource_margin':16}
    world.start(dict(mission='first_night',night_level=1),['LabAI0'])
    assert len(world.jobs)==100 and all(a>b for a,b,z,w in world.jobs)
    assert world.session['copy_y']==[-64,192] and not world.session['fast_reset']


def test_supported_training_keeps_original_resource_layout(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start(dict(mission='first_night',night_level=0),['LabAI0'])
    assert world.session['bounds']==[16384,16512,16384,16512]
    assert len(world.jobs)==64 and 'resource_policy' not in world.session


def test_natural_camp_preserves_groves_and_clears_houses_and_walkable_access(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start(dict(mission='first_night',night_level=1),[f'LabAI{i}' for i in range(8)])
    world.session['phase']='running';commands.clear();camp=world.camp('LabAI0',[16448,65,16448])
    assert camp['preserve_groves'] and all(not g for g in camp['groves'])
    assert not any('minecraft:oak_log' in c or c.startswith('give ') for c in commands)
    areas=clear_areas(16448,65,16448,camp['plots'])
    cells={(x,z) for a,b,c,d,y in areas for x in range(a,b+1) for z in range(c,d+1)}
    assert len(cells)<700 # Former blanket clearing removed 2025 columns.
    for p in camp['plots']:
        assert all((p['x']+dx,p['z']+dz) in cells for dx in range(-3,4) for dz in range(-3,4))
        assert (p['x'],p['z']-5) in cells
    assert (16448,16448) in cells


def test_ring_fauna_capture_is_guarded_separate_and_never_overwrites_core():
    commands=fauna_extend_commands([-16,144,-16,144],[0,128,0,128],'0-128')
    assert all('sites.s0_128_ring16' in c for c in commands)
    assert all('unless data storage' in c for c in commands[:-1])
    assert commands[-1].endswith('Saved set value 1b')
    assert all(' set from ' not in c for c in commands)


def test_extended_fauna_restore_preserves_original_core_and_restores_ring(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.saved['templates']['0-128']={'fauna_snapshot':True}
    world.start(dict(mission='first_night',night_level=1),['LabAI0']);world.prepare_fauna()
    q=world.session['fauna_queue'];assert world.session['fauna_split_ring']
    assert any('sites.s0_128.cow' in c and 'Pos set from storage' in c for c in q)
    assert any('sites.s0_128_ring16.cow' in c and 'Pos set from storage' in c for c in q)
    assert not any('sites.s0_128 set value' in c for c in q)
    assert sum(c.startswith('kill ') for c in q)==5 # No second kill after core respawn.


def test_core_and_ring_animals_have_distinct_restoration_tags():
    from lab.world_fauna import fauna_commands
    core=fauna_commands([0,128,0,128],'0-128',False)
    ring=fauna_commands([-16,144,-16,144],'0-128-ring16',False)
    assert any('lab_fauna_0_128_cow_0' in c for c in core)
    assert any('lab_fauna_0_128_ring16_cow_0' in c for c in ring)
    assert not any('lab_fauna_0_128_cow_0' in c for c in ring)
