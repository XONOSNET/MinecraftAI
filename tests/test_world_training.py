from lab.world_training import WorldTraining


def fixture(tmp_path):
    commands=[];clock=[0];log=tmp_path/'console.log';log.write_text('')
    world=WorldTraining(tmp_path/'world.json',commands.append,log,lambda:clock[0])
    return world,commands,clock,log



def acknowledge_tile(world,clock,log):
    # Feed only real per-command successes, until this tile reaches cleanup.
    while world.job and world.job['phase']!='cleaning':
        if world.job['phase']=='waiting':
            with log.open('a') as stream:stream.write(f"Successfully cloned 4096 blocks\nSet [lab_world] for #world_ack to {world.job['serial']}\n")
        else:clock[0]+=.1
        world.tick()


def test_memory_hold_preserves_inflight_copy_and_excludes_wait_from_timeout(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0'])
    world.tick();clock[0]=1;world.tick()
    run=world.session['run'];job=world.job;queued=list(world.jobs);preloaded=world.preloaded
    world.session['progress']=12.5
    assert job['phase']=='waiting' and world.hold_preparation(run)
    sent=len(commands);clock[0]+=300
    log.write_text(f"Successfully cloned 4096 blocks\nSet [lab_world] for #world_ack to {job['serial']}\n")
    world.tick()
    assert len(commands)==sent and world.jobs==queued and world.preloaded is preloaded
    assert world.session['progress']==12.5 and world.saved['templates']=={}
    assert not world.resume_preparation('wrong-run')
    assert world.resume_preparation(run)
    world.tick()
    assert world.session['run']==run and world.job is job and job['phase']=='copying'
    assert world.session['copy_stats']['acknowledged']==1
    assert world.session['copy_stats']['max_ack_seconds']<1
    clock[0]+=.1;world.tick()
    assert job['next_y']==-32 and world.session['copy_stats']['sent']==2


def test_memory_hold_covers_fauna_ack_and_stop_revokes_resume(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start({'mission':'first_night','night_level':2},['LabAI0'])
    world.jobs=[];s=world.session
    s.update(fauna_queue=[],fauna_at=-5,fauna_ack=17,fauna_wait=0,fauna_log='')
    assert world.hold_preparation(s['run'])
    clock[0]=120;assert world.resume_preparation(s['run'])
    world.tick();assert s['active'] and s['fauna_wait']==120
    assert world.hold_preparation(s['run'])
    world.stop();assert not world.resume_preparation(s['run']) and 'memory_hold' not in s


def test_running_trials_cannot_resume_as_preparation(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0'])
    world.session.update(phase='running',trial_at=0)
    assert not world.hold_preparation(world.session['run'])


def test_world_protection_includes_zombie_villagers_and_keeps_tagged_combat_mobs(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0'])
    world.session.update(phase='running',trial_at=0);clock[0]=2;commands.clear();world.tick()
    sweeps=[c for c in commands if c.startswith('kill @e[type=minecraft:')]
    assert any('type=minecraft:zombie_villager,' in c for c in sweeps)
    assert any('type=minecraft:cave_spider,' in c for c in sweeps)
    assert all('tag=!lab_combat' in c and 'y=-64' in c and 'dy=383' in c for c in sweeps)
    assert all('x=16384' in c and 'z=16384' in c and 'dx=127' in c and 'dz=127' in c for c in sweeps)


def test_loop_restores_same_settings_after_batch_and_waits_for_all_bots(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start({'scenario':1,'size':256,'driver':'student','prepared':False},['LabAI0','LabAI1'])
    world.session['phase']='running';run=world.session['run']
    for name in world.session['bots']:world.report(name,dict(run=run,state='complete'))
    assert len(world.saved['history'])==1 and world.next_batch(['LabAI0','LabAI1']) is None
    clock[0]=11
    assert world.next_batch(['LabAI0']) is None
    settings=world.next_batch(['LabAI0','LabAI1'])
    assert settings==dict(scenario=1,size=256,driver='student',prepared=False,loop=True,mission='settlement',layout=0)
    world.saved['templates']['1-256']={}
    world.start(settings,['LabAI0','LabAI1'])
    assert world.session['phase']=='restoring' and world.session['round']==2 and world.session['run']!=run
    world.stop();clock[0]=50
    assert not world.session['loop'] and world.next_batch(['LabAI0','LabAI1']) is None


def test_timeout_records_results_and_repeats_but_copy_failure_does_not(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.session.update(phase='running',trial_at=0)
    clock[0]=1201;world.tick()
    assert world.session['phase']=='finished' and world.session['results']['LabAI0']['state']=='stopped'
    clock[0]+=11;assert world.next_batch(['LabAI0'])
    world.stop('Terrain copy failed.')
    assert world.next_batch(['LabAI0']) is None


def test_safety_deadline_preserves_slow_attempts_and_ranks_successes_first(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.saved['history']=[dict(scenario=0,size=128,driver='teacher',prepared=True,results={str(i):dict(state='complete',seconds=100) for i in range(12)})]
    world.start({},['LabAI0','LabAI1','LabAI2']);world.session.update(phase='running',trial_at=0)
    run=world.session['run'];assert world.session['time_budget_seconds']==1200
    world.report('LabAI0',dict(run=run,state='complete',seconds=120,timings={'activity_seconds':{'aligning':10}}))
    world.report('LabAI1',dict(run=run,state='complete',seconds=90))
    clock[0]=251;world.tick();assert world.session['active'] and 'LabAI2' not in world.session['results']
    clock[0]=1201;world.tick();s=world.session
    assert s['results']['LabAI2']['state']=='stopped' and 'time budget' in s['results']['LabAI2']['message']
    assert s['results']['LabAI1']['completion_rank']==1 and s['results']['LabAI0']['completion_rank']==2
    assert s['results']['LabAI0']['timings']['activity_seconds']['aligning']==10
    assert s['phase']=='finished' and s['loop']


def test_single_batch_option_and_round_counter_survive_history_limit(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.saved['round']=45
    world.start({'loop':False},['LabAI0']);world.session['phase']='running'
    world.report('LabAI0',dict(run=world.session['run'],state='complete'));clock[0]=20
    assert world.session['round']==46 and world.next_batch(['LabAI0']) is None


def test_copy_acknowledged_before_deployment_and_scoped_to_reserved_terrain(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start({'scenario':0,'size':128},['LabAI0']);world.tick();assert not world.assignment('LabAI0')
    clock[0]=1;world.tick();assert sum(c.startswith('clone ') for c in commands)==1
    for command in commands:
        if command.startswith('clone '):
            xyz=list(map(int,command.split()[1:10]));assert (xyz[3]-xyz[0]+1)*(xyz[4]-xyz[1]+1)*(xyz[5]-xyz[2]+1)<=4096
    acknowledge_tile(world,clock,log)
    assert world.job['phase']=='cleaning';clock[0]+=.3;world.tick();assert world.session['progress']>0;assert any('minecraft:glass' in c for c in commands)
    assert any(c.startswith('forceload remove') for c in commands)
    world.jobs=[];world.tick();assert world.session['phase']=='running';assert world.assignment('LabAI0')['world']['bounds']==[16384,16512,16384,16512]
    assert any(c.startswith('clear LabAI0') for c in commands)
    assert world.saved['templates']


def test_failed_copy_stops_without_deploying_and_template_not_marked_ready(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.tick();clock[0]=1;world.tick()
    log.write_text('That position is not loaded\nSet [lab_world] for #world_ack to 1\n');world.tick()
    assert not world.session['active'] and not world.saved['templates'];assert not any(c.startswith('tp ') and not c.endswith(' 0 181 0') for c in commands)


def test_native_menu_only_accepts_authorized_online_operators(tmp_path):
    world,commands,clock,log=fixture(tmp_path);clock[0]=2
    log.write_text('[00:10:00 INFO]: [xonosnet: Triggered [lab_world] (set value to 2)]\n[00:10:00 INFO]: [Stranger: Triggered [lab_world] (set value to 1)]\n[00:10:00 INFO]: <Stranger> [xonosnet: Triggered [lab_world] (set value to 4)]')
    assert world.ui(['xonosnet','Stranger'],['xonosnet'])==[('xonosnet',2)]
    world.menu('xonosnet');assert 'run_command' in commands[-1] and '/trigger lab_world set 2' in commands[-1]


def test_reset_uses_template_and_spawn_validation_rejects_out_of_bounds(tmp_path):
    import pytest
    world,commands,clock,log=fixture(tmp_path);world.saved['templates']['0-128']={};world.start({},['LabAI0'])
    assert world.jobs[0][0]==17408 and world.jobs[0][1]==16384
    world.session['phase']='running'
    with pytest.raises(ValueError):world.spawn('LabAI0',[0,64,0])
    world.spawn('LabAI0',[16448,64,16448]);assert any(c.startswith('tp LabAI0 16448 64 16448') for c in commands)
    world.stop();assert not world.assignment('LabAI0')

def test_prepared_camp_generates_harvestable_resources_once_without_inventory_grants(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},[f'LabAI{i}' for i in range(8)]);world.session['phase']='running'
    camp=world.camp('LabAI0',[16448.5,71.1,16448.5]);assert len(camp['plots'])==8 and all(len(trees)==8 for trees in camp['groves'])
    assert sum('minecraft:oak_log' in c for c in commands)==64
    assert not any(c.startswith('give ') for c in commands)
    before=len(commands);assert world.camp('LabAI1',[16448.5,71.1,16448.5])==camp;assert len(commands)==before
    for i,plot in enumerate(camp['plots']):
        assert len(camp['groves'][i])*6*4>=153  # Floor, shell, workbench and doors.
        for other in camp['plots'][i+1:]:
            assert max(abs(plot['x']-other['x']),abs(plot['z']-other['z']))>=10
        for trees in camp['groves']:
            assert all(abs(x-plot['x'])>3 or abs(z-plot['z'])>3 for x,y,z in trees)


def test_settlement_lessons_supply_real_trees_once_and_keep_doors_clear(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},[f'LabAI{i}' for i in range(8)]);world.session['phase']='running'
    camp=world.camp('LabAI0',[16448.5,70.1,16448.5]);assert len(world.session['lessons'])==6
    for i in range(8):
        trees=world.lesson_resources(f'LabAI{i}');plot=camp['plots'][i]
        assert len(trees)==2 and all(abs(z-plot['z'])==13 for x,y,z in trees)
        assert all(abs(x-16448)<=18 and abs(z-16448)<=18 for x,y,z in trees)
        before=len(commands);assert world.lesson_resources(f'LabAI{i}')==trees and len(commands)==before
    assert not any(c.startswith('give ') for c in commands)
    world.stop();world.start({'mission':'hut'},['LabAI0']);assert len(world.session['lessons'])==1


def test_prepared_reset_covers_camp_and_surrounding_chunks_with_bounded_clones(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.saved['templates']['0-128']={'camp_anchor':[16448,70,16448]}
    world.start({},['LabAI0']);s=world.session
    assert s['fast_reset'] and s['reset_area']==[16400,16496,16400,16496]
    assert s['copy_y']==[62,126] and len(world.jobs)==18
    assert sum(w*16*64 for _,_,_,w in world.jobs)==589824
    world.tick();clock[0]=1;world.tick()
    clones=[c for c in commands if c.startswith('clone ')]
    assert len(clones)==1
    xyz=list(map(int,clones[0].split()[1:10]));assert (xyz[3]-xyz[0]+1)*(xyz[4]-xyz[1]+1)*(xyz[5]-xyz[2]+1)==4096
    acknowledge_tile(world,clock,log)
    assert world.job['phase']=='cleaning';clock[0]+=.3;world.tick();assert world.session['active'] and world.job is None
    world.jobs=[];world.tick()
    assert world.saved['templates']['0-128']['camp_anchor']==[16448,70,16448]
    assert world.assignment('LabAI0')['world']['camp_anchor']==[16448,70,16448]


def test_existing_history_migrates_camp_anchor_but_raw_and_unknown_camps_restore_all(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.saved['templates']['0-128']={}
    world.start({},['LabAI0']);assert not world.session['fast_reset'] and len(world.jobs)==64
    world.stop()
    world.saved['history']=[dict(template='0-128',prepared=True,camp={'spawn':[16448.5,70.1,16448.5]})]
    world.start({},['LabAI0']);assert world.session['fast_reset']
    world.stop();world.start({'prepared':False},['LabAI0'])
    assert not world.session['fast_reset'] and len(world.jobs)==64 and world.session['copy_y']==[-64,192]


def test_stone_lessons_generate_bounded_real_quarries_once_per_bot(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start({'mission':'stone_age'},[f'LabAI{i}' for i in range(8)]);world.session['phase']='running'
    world.camp('LabAI0',[16448.5,70.1,16448.5]);assert len(world.session['lessons'])==12
    for i in range(8):
        quarry=world.quarry(f'LabAI{i}');assert len(quarry['blocks'])==16 and len(quarry['fuel'])==4
        assert all(16400<x<16496 and 16400<z<16496 for x,y,z in quarry['blocks']+quarry['fuel'])
        count=len(commands);assert world.quarry(f'LabAI{i}')==quarry and len(commands)==count
    assert sum('minecraft:stone' in c for c in commands)==8
    assert not any(c.startswith('give ') for c in commands)
    quarries=list(world.session['quarries'].values())
    for i,q in enumerate(quarries):
        for j,other in enumerate(quarries):
            if i==j:continue
            x,y,z=q['blocks'][0];left=x-3;right=x+7
            assert all(not (left<=fx<=right and z-4<=fz<=z+4) for fx,fy,fz in other['fuel'])


def test_terminal_reports_preserve_death_and_peak_resource_progress(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0','LabAI1']);world.session['phase']='running'
    run=world.session['run']
    world.report('LabAI0',dict(run=run,state='working',logs=10,blocks=12))
    world.report('LabAI0',dict(run=run,state='stopped',health=0,logs=0,blocks=1))
    world.report('LabAI0',dict(run=run,state='working',health=20,logs=1))
    result=world.session['results']['LabAI0']
    assert result['health']==0 and result['state']=='stopped'
    assert result['peak_logs']==10 and result['peak_blocks']==12


def test_restore_clears_embedded_and_high_items_while_each_tile_is_loaded(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.saved['templates']['0-128']={'camp_anchor':[16448,70,16448]}
    world.start({},['LabAI0']);world.tick();job=world.job.copy()
    clock[0]=1;world.tick()
    sweeps=[c for c in commands if c.startswith('kill @e[type=minecraft:item,')]
    assert len(sweeps)==2 and all('y=-64' in c and 'dy=383' in c and 'dx=31' in c and 'dz=15' in c for c in sweeps)
    assert commands.index(sweeps[0])<next(i for i,c in enumerate(commands) if c.startswith('clone '))
    acknowledge_tile(world,clock,log)
    assert world.job['phase']=='cleaning'
    assert not any(c.startswith('forceload remove') for c in commands)
    clock[0]+=.1;world.tick();assert world.job is not None
    clock[0]+=.2;world.tick();assert world.job is None
    assert sum(c.startswith('kill @e[type=minecraft:item,') for c in commands)==4
    assert commands[-3].startswith('kill @e[type=minecraft:item,')
    assert all(c.startswith('forceload remove') for c in commands[-2:])


def test_survey_spawn_switches_to_survival_only_after_teleport(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.session.update(phase='running',trial_at=0);commands.clear()
    world.camp('LabAI0',[16448.5,64.1,16448.5])
    assert world.assignment('LabAI0')['world']['camp_anchor']==[16448,64,16448]
    commands.clear()
    world.spawn('LabAI0',[16448.5,64.1,16448.5])
    assert commands[0].startswith('tp LabAI0 ') and commands[1]=='gamemode survival LabAI0'


def test_pipeline_warms_next_tile_without_copying_before_current_ack(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.tick()
    assert world.preloaded is not None
    assert len(world.tile_chunks(world.job)|world.tile_chunks(world.preloaded))==4
    clock[0]=1;world.tick();assert sum(c.startswith('clone ') for c in commands)==1
    clock[0]=1.1;world.tick();assert sum(c.startswith('clone ') for c in commands)==1
    acknowledge_tile(world,clock,log);first_count=sum(c.startswith('clone ') for c in commands)
    assert first_count==16
    clock[0]+=.3;world.tick();assert world.job is None
    before=clock[0];world.tick()
    assert world.job['phase']=='waiting' and world.job['at']==before
    assert sum(c.startswith('clone ') for c in commands)==first_count+1
    assert world.session['copy_stats']['sent']==17 and world.session['copy_stats']['acknowledged']==16


def test_pipeline_stop_releases_current_and_prefetched_chunks(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.tick()
    owned=world.tile_chunks(world.job)|world.tile_chunks(world.preloaded)
    commands.clear();world.stop()
    removed=set()
    for cmd in commands:
        if cmd.startswith('forceload remove '):
            _,_,x,z,x1,z1=cmd.split()
            removed.update((a//16,b//16) for a in range(int(x),int(x1)+1,16) for b in range(int(z),int(z1)+1,16))
    assert removed==owned and world.preloaded is None and world.job is None and world.jobs==[]


def test_pipeline_shared_snapshot_restore_tiles_are_not_preloaded(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0'])
    world.jobs=[(16384,17408,16384,16),(17408,16384,16384,16)];world.total=2
    world.tick();assert world.preloaded is None
    assert sum(c.startswith('forceload add') for c in commands)==2


def test_pipeline_bad_ack_releases_both_tiles_without_deploying_bots(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.tick()
    clock[0]=1;world.tick();log.write_text('Clone failed\nSet [lab_world] for #world_ack to 1\n')
    world.tick()
    assert world.session['phase']=='paused' and world.preloaded is None
    assert sum(c.startswith('forceload remove') for c in commands)==4
    assert not any(c.startswith('clear LabAI') for c in commands)


def test_pipeline_fast_reset_keeps_only_eight_chunks_loaded(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.saved['templates']['0-128']={'camp_anchor':[16448,70,16448]}
    world.start({},['LabAI0']);world.tick()
    assert len(world.tile_chunks(world.job)|world.tile_chunks(world.preloaded))==8


def test_copy_slice_ack_is_exact_and_cannot_queue_a_burst(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.tick();clock[0]=1;world.tick()
    log.write_text('Set [lab_world] for #world_ack to 10\n')
    world.tick();assert world.job['phase']=='waiting' and world.session['copy_stats']['acknowledged']==0
    with log.open('a') as stream:stream.write('Successfully cloned 4096 blocks\nSet [lab_world] for #world_ack to 1\n')
    world.tick();assert world.job['phase']=='copying'
    world.tick();assert sum(c.startswith('clone ') for c in commands)==1
    clock[0]+=.06;world.tick();assert sum(c.startswith('clone ') for c in commands)==2


def test_sliced_copy_covers_every_height_once_for_both_tile_widths(tmp_path):
    for fast in [False,True]:
        base=tmp_path/str(fast);base.mkdir();world,commands,clock,log=fixture(base)
        if fast:world.saved['templates']['0-128']={'camp_anchor':[16448,70,16448]}
        world.start({},['LabAI0']);low,high=world.session['copy_y'];world.tick();clock[0]=1;world.tick();acknowledge_tile(world,clock,log)
        intervals=[]
        for command in commands:
            if command.startswith('clone '):
                xyz=list(map(int,command.split()[1:10]));intervals.append((xyz[1],xyz[4]+1))
                assert (xyz[3]-xyz[0]+1)*(xyz[4]-xyz[1]+1)*(xyz[5]-xyz[2]+1)<=4096
        assert intervals[0][0]==low and intervals[-1][1]==high
        assert all(a[1]==b[0] for a,b in zip(intervals,intervals[1:]))


def test_stalled_slice_stops_without_queuing_more_clones_and_releases_prefetch(tmp_path):
    world,commands,clock,log=fixture(tmp_path);world.start({},['LabAI0']);world.tick();clock[0]=1;world.tick()
    clock[0]=22;world.tick();assert world.session['phase']=='paused'
    assert sum(c.startswith('clone ') for c in commands)==1
    assert sum(c.startswith('forceload remove') for c in commands)==4
