import pytest
from lab.observers import Observers, VIEWS, camera_move, viewer_transfer, camera_spawn
from lab.config import AGENT_COUNT, validate_agents
from lab.curriculum import Curriculum

def test_count_validation():
    assert validate_agents({'count':8,'episodes_per_agent':3})==(8,3)
    for count in (0,11,True,2.5,'8'):
        with pytest.raises(ValueError):validate_agents({'count':count,'episodes_per_agent':3})

def test_spectator_follows_respawn_and_restores_original_mode(tmp_path):
    commands=[];o=Observers(tmp_path/'observer.json',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':f'LabAI{AGENT_COUNT-1}','view':'trail'},['Xonosnet'])
    agents={f'LabAI{AGENT_COUNT-1}':{'entity_id':42,'connected':True,'last_seen':100,'dimension':'overworld'}}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},agents,True)
    assert o.sessions['Xonosnet']['status']=='following'
    assert commands.count('gamemode spectator Xonosnet')==2
    assert any('summon minecraft:marker' in c for c in commands)
    assert any('spectate @e[tag=lab_camera_xonosnet' in c for c in commands)
    commands.clear();agents[f'LabAI{AGENT_COUNT-1}']['entity_id']=43
    o.tick(['Xonosnet'],{},agents,True)
    assert any('summon minecraft:item_display' in c for c in commands)
    o.stop('Xonosnet',['Xonosnet'])
    assert 'execute as Xonosnet run spectate' in commands
    assert 'gamemode creative Xonosnet' in commands
    assert any('lab_return_xonosnet' in c and 'run tp Xonosnet' in c for c in commands)

@pytest.mark.parametrize('view',['first_person','trail','side','overhead','orbit','action'])
def test_same_entity_teleport_moves_viewer_then_waits_before_camera_attachment(tmp_path,view):
    now=[100.0];commands=[];o=Observers(tmp_path/'state',commands.append,lambda:now[0])
    o.start({'player':'Xonosnet','target':'LabAI0','view':view},['Xonosnet'])
    agents={'LabAI0':{'connected':True,'last_seen':100,'entity_id':42,'dimension':'overworld','run':'one','position':[464,181,0]}}
    tick=lambda:o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},agents,True)
    tick();assert o.sessions['Xonosnet']['status']=='transferring'
    assert any(('tp Xonosnet LabAI0'==c if view=='first_person' else 'run tp Xonosnet' in c and 'facing ~ ~0.9 ~' in c) for c in commands) and not any(c.startswith('spectate ') or 'run spectate @e' in c for c in commands)
    now[0]+=1;tick();assert o.sessions['Xonosnet']['attached']
    commands.clear();agents['LabAI0']['position']=[304,181,0]
    tick();assert o.sessions['Xonosnet']['status']=='transferring'
    assert any(('tp Xonosnet LabAI0'==c if view=='first_person' else 'run tp Xonosnet' in c and 'facing ~ ~0.9 ~' in c) for c in commands)
    assert not any(c.startswith('spectate ') or 'run spectate @e' in c for c in commands)
    now[0]+=1;tick();assert o.sessions['Xonosnet']['attached']
    commands.clear();agents['LabAI0']['position'][0]+=.5;tick()
    assert 'tp Xonosnet LabAI0' not in commands
    assert o.sessions['Xonosnet']['saved_mode']==1 and o.sessions['Xonosnet']['return_created']

def test_stationary_camera_does_not_relocate_on_arena_transfer(tmp_path):
    commands=[];o=Observers(tmp_path/'state',commands.append,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'stationary'},['Xonosnet'])
    agents={'LabAI0':{'connected':True,'last_seen':100,'entity_id':42,'position':[464,181,0],'run':'one'}}
    tick=lambda:o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},agents,True)
    tick();commands.clear();agents['LabAI0'].update(position=[304,181,0],run='two');tick()
    assert not any(c.startswith('tp Xonosnet') or 'summon' in c for c in commands)
    assert o.sessions['Xonosnet']['attached']

def test_offline_stop_restores_when_player_returns_after_restart(tmp_path):
    commands=[];path=tmp_path/'observer.json';o=Observers(path,commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    agents={'LabAI0':{'connected':True,'last_seen':100,'entity_id':4}}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':0,'seen':100}},agents,True)
    o.stop('Xonosnet',[])
    restarted=Observers(path,commands.append,lambda:100,settle_delay=0)
    commands.clear();restarted.tick(['Xonosnet'],{},agents,True)
    assert 'gamemode survival Xonosnet' in commands
    assert restarted.sessions['Xonosnet']['saved_mode'] is None

def test_camera_requests_are_validated_and_all_views_have_safe_commands(tmp_path):
    o=Observers(tmp_path/'state',lambda c:None)
    for bad in ({'player':'Xonosnet\nstop'},{'target':'@a'},{'distance':float('nan')},{'height':50},{'view':'bad'}):
        with pytest.raises(ValueError):o.start({'player':'Xonosnet','target':'LabAI0',**bad},['Xonosnet'])
    for view in VIEWS:
        if view!='first_person':assert '\n' not in camera_move('LabAI0','lab_camera_xonosnet',view,7,4,10)

def test_eight_agents_wait_for_all_twenty_four_episodes(tmp_path):
    from test_curriculum import World
    w=World();hooks=w.hooks();hooks['expected_episodes']=lambda:24
    rows={'episodes':15,'successes':15};hooks['results']=lambda run:rows
    c=Curriculum(tmp_path/'state',hooks,lambda:0);c.start();c.tick();c.tick()
    assert c.state['phase']=='baseline'
    rows.update(episodes=24,successes=24);c.tick()
    assert c.state['phase']=='waiting' and c.state['streak']==1

def test_stationary_view_stays_at_viewer_and_can_switch_targets(tmp_path):
    commands=[];o=Observers(tmp_path/'state',commands.append,lambda:100,settle_delay=0)
    agents={name:{'connected':True,'last_seen':100,'entity_id':i} for i,name in enumerate(('LabAI0','LabAI1'))}
    for target in agents:
        o.start({'player':'Xonosnet','target':target,'view':'stationary'},['Xonosnet'])
        o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},agents,True)
        assert not any(c==f'tp Xonosnet {target}' for c in commands)
        assert any('execute at Xonosnet run summon minecraft:item_display' in c for c in commands)
        assert any(f'execute at {target} run rotate' in c and 'facing ~ ~0.9 ~' in c for c in commands)
    commands.clear();o.stop('Xonosnet',[],ready=False)
    assert commands==[] and not o.sessions['Xonosnet']['enabled']
    o.tick(['Xonosnet'],{},agents,True)
    assert 'gamemode creative Xonosnet' in commands


def test_personal_hud_reports_real_actions_throttles_and_cleans_up(tmp_path):
    now=[100.0];commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    agent={'connected':True,'last_seen':100,'entity_id':42,'position':[0,181,0],'goal':[3,181,4],'action':3,'health':18,'food':16,'simulation':'Ridge'}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':agent},True,'evaluate')
    assert any('Jumping forward' in c and 'Goal 5.0 blocks' in c for c in commands)
    assert 'bossbar set lab:observer_xonosnet_state players Xonosnet' in commands
    assert not any('@a' in c for c in commands if c.startswith('bossbar'))
    commands.clear();o.tick(['Xonosnet'],{}, {'LabAI0':agent},True,'evaluate')
    assert not any(c.startswith('bossbar') for c in commands)
    now[0]+=2;o.tick(['Xonosnet'],{}, {'LabAI0':agent},True,'paused')
    assert any('Movement paused' in c for c in commands)
    commands.clear();o.stop('Xonosnet',['Xonosnet'])
    assert 'bossbar remove lab:observer_xonosnet_state' in commands


def test_missing_bot_hud_never_reports_stale_action(tmp_path):
    commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    o.tick(['Xonosnet'],{}, {'LabAI0':{'connected':False,'action':3}},True,'teacher')
    assert any('Waiting for bot telemetry' in c for c in commands)
    assert not any('Jumping forward' in c for c in commands)


def test_roster_updates_activity_and_removes_when_no_viewers(tmp_path):
    now=[100.0];commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    agents={'LabAI0':{'connected':True,'last_seen':100,'action':0,'speed':0,'entity_id':1}}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},agents,True,'teacher')
    assert any('LabAI0: Blocked' in c for c in commands)
    assert 'scoreboard objectives setdisplay sidebar lab_bots' in commands
    commands.clear();now[0]+=2;o.tick([],{},agents,True)
    assert 'scoreboard objectives remove lab_bots' in commands


def test_pause_reason_and_goal_bar_progress(tmp_path):
    now=[100.0];commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    a={'connected':True,'last_seen':100,'entity_id':1,'position':[0,181,0],'goal':[10,181,0],'steps':1,'run':'test'}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True,'evaluate')
    commands.clear();now[0]+=2;a.update(position=[5,181,0],steps=2)
    o.tick(['Xonosnet'],{}, {'LabAI0':a},True,'evaluate')
    assert 'bossbar set lab:observer_xonosnet_task value 50' in commands
    now[0]+=2;o.tick(['Xonosnet'],{}, {'LabAI0':a},True,'paused',pause_reason='Saving checkpoint (97%)')
    assert any('Saving checkpoint (97%)' in c for c in commands)


def test_trial_and_training_pass_counters_and_named_roster(tmp_path):
    now=[100.0];commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    a={'connected':True,'last_seen':100,'entity_id':1,'trial_completed':1}
    tick=lambda mode,ctx:o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True,mode,progress_context=ctx)
    tick('evaluate',{'episodes':3})
    assert any('Trial 2/3 | 2 left' in c for c in commands)
    assert any('scoreboard players display name LabAI0 lab_bots' in c for c in commands)
    assert sum(c.startswith('scoreboard players set LabAI') for c in commands)==AGENT_COUNT
    assert not any('scoreboard players set "' in c for c in commands)
    now[0]+=2;commands.clear()
    tick('paused',{'job':{'status':'running','epoch':42,'epochs':100,'percent':40,'samples':1500,'phase':'learning'}})
    assert any('Training pass 42/100 | 58 left' in c for c in commands)
    assert 'bossbar set lab:observer_xonosnet_task value 40' in commands
    assert 'bossbar set lab:observer_xonosnet_state visible false' in commands


def test_camera_uses_native_display_interpolation(tmp_path):
    commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'orbit'},['Xonosnet'])
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':{'connected':True,'last_seen':100,'entity_id':1}},True)
    assert any('summon minecraft:item_display' in c and 'teleport_duration:0' in c and 'Rotation:[' in c for c in commands)
    assert any('data merge entity' in c and 'teleport_duration:3' in c for c in commands)
    assert not any('armor_stand' in c for c in commands)


@pytest.mark.parametrize('view',['trail','side','overhead','orbit','action'])
def test_angled_transfer_and_spawn_start_outside_target_head(view):
    transfer=viewer_transfer('Xonosnet','LabAI0',view,7,4,8)
    spawn=camera_spawn('Xonosnet','LabAI0','camera',view,7,4,8)
    assert 'run tp Xonosnet' in transfer and 'facing ~ ~0.9 ~' in transfer
    assert transfer!='tp Xonosnet LabAI0'
    assert ' positioned ' in spawn and 'run summon minecraft:item_display' in spawn


def test_curriculum_stage_header_matches_dashboard(tmp_path):
    commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':{'connected':True,'last_seen':100,'entity_id':1}},True,'teacher',progress_context={'stage':25,'stages':40,'stage_name':'Harvest four logs'})
    assert any('Stage 25 of 40 | Harvest four logs' in c for c in commands)
    assert 'bossbar set lab:observer_xonosnet_stage value 60' in commands
    o.stop('Xonosnet',['Xonosnet'])
    assert 'bossbar remove lab:observer_xonosnet_stage' in commands


def test_trial_reset_estimate_in_personal_hud_and_roster(tmp_path):
    commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    a={'connected':True,'last_seen':100,'entity_id':1,'reset_seconds':18,'reset_steps_left':60}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True,'evaluate')
    assert any('Reset ~18s (60 steps left)' in c for c in commands)
    assert any('~18s' in c and 'scoreboard players display name' in c for c in commands)


def test_camera_cycle_uses_interval_and_skips_offline_bots(tmp_path):
    now=[100.];commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'cycle','cycle_seconds':30},['Xonosnet'])
    agents={'LabAI0':{'connected':True,'last_seen':100,'entity_id':1},'LabAI2':{'connected':True,'last_seen':100,'entity_id':3}}
    tick=lambda:o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},agents,True)
    tick();assert o.sessions['Xonosnet']['target']=='LabAI0'
    now[0]=131
    for a in agents.values():a['last_seen']=131
    tick();assert o.sessions['Xonosnet']['target']=='LabAI2' and o.sessions['Xonosnet']['cycle_at']==161


@pytest.mark.parametrize('view',['orbit','side','trail','overhead','first_person','stationary','action'])
def test_bot_cycling_is_independent_of_view(tmp_path,view):
    o=Observers(tmp_path/'camera',lambda cmd:None,lambda:100)
    session=o.start({'player':'Xonosnet','target':'LabAI0','view':view,'cycle_enabled':True},['Xonosnet'])
    assert session['view']==view and session['cycle_enabled'] and session['cycle_seconds']==30


@pytest.mark.parametrize('view',['trail','side','overhead','orbit','stationary','action'])
def test_angled_cameras_aim_at_fixed_torso_height(view):
    command=camera_move('LabAI0','camera',view,7,4,3)
    assert command.endswith('facing ~ ~0.9 ~') and ' eyes' not in command
    if view=='stationary':assert 'run rotate' in command


@pytest.mark.parametrize('view',['side','trail'])
def test_camera_bearing_ignores_head_and_tracks_travel(tmp_path,view):
    import math
    commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':view},['Xonosnet'])
    a={'connected':True,'last_seen':100,'entity_id':1,'position':[0,181,0],'run':'one','yaw':0}
    def tick():
        o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True)
        return [c for c in commands if 'run tp @e[tag=lab_camera_' in c][-1]
    initial=tick()
    a.update(yaw=math.pi,pitch=1.2)
    assert tick()==initial
    assert 'rotated as' not in initial and '^' not in initial
    a['position']=[0,181,1]
    tick();s=o.sessions['Xonosnet']
    assert s['travel_heading']==math.pi/2 and 0<s['camera_heading']<=.025
    for _ in range(70):tick()
    assert s['camera_heading']==pytest.approx(math.pi/2)
    a['position']=[100,181,0];tick()
    assert s['camera_heading']==0  # Arena teleports are not movement bearings.


def test_native_roster_keeps_identity_metadata_out_of_labels(tmp_path):
    commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    a={'connected':True,'last_seen':100,'serial':'A0001','deaths':0,'action':0,'speed':0,'reset_seconds':15}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True,'evaluate')
    labels=[c for c in commands if 'display name' in c or 'bossbar' in c]
    assert not any('A0001' in c or ' D0' in c or 'deaths' in c for c in labels)
    assert any('LabAI0: Blocked ~15s' in c for c in labels)


@pytest.mark.parametrize('view',['trail','side','overhead','orbit','action'])
def test_camera_spawns_with_torso_facing_rotation_before_attachment(tmp_path,view):
    from lab.observers import camera_rotation
    import math
    yaw,pitch=camera_rotation(view,7,4,0)
    assert 0<pitch<=90
    assert pitch==pytest.approx(90 if view=='overhead' else math.degrees(math.atan2(2.7 if view=='action' else 3.1,7)))
    spawn=camera_spawn('Xonosnet','LabAI0','camera',view,7,4,0)
    assert f'Rotation:[{yaw:.5f}f,{pitch:.5f}f]' in spawn
    commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':view},['Xonosnet'])
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':{'connected':True,'last_seen':100,'entity_id':1}},True)
    attach=next(i for i,c in enumerate(commands) if 'run spectate @e[tag=lab_camera_' in c)
    smooth=next(i for i,c in enumerate(commands) if 'data merge entity' in c)
    assert smooth<attach


def test_route_bar_and_trial_batch_bar_use_different_progress(tmp_path):
    now=[100.];commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    a={'connected':True,'last_seen':100,'position':[0,181,0],'goal':[10,181,0],'run':'one','steps':0,'trial_completed':1}
    def tick():o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},{'LabAI0':a},True,'evaluate',progress_context={'episodes':3})
    tick();commands.clear();now[0]+=2;a.update(position=[5,181,0],steps=1);tick()
    assert 'bossbar set lab:observer_xonosnet_task value 33' in commands
    assert 'bossbar set lab:observer_xonosnet_state value 50' in commands
    assert any('Route 50%' in c for c in commands)
    assert 'bossbar set lab:observer_xonosnet_state visible true' in commands


def test_reference_header_tracks_live_course_instead_of_saved_review_stage():
    from lab.observers import observer_progress
    stages=[{'name':f'Course {i+1}'} for i in range(70)]
    state={'stage':36,'round':1,'enabled':False,'phase':'paused','examples_per_cycle':1500}
    context=observer_progress(state,stages,'heuristic',{'stage':63},{},3)
    assert context['stage']==64 and context['stage_name']=='Course 64' and context['label']=='Teacher reference'
    state['enabled']=True
    context=observer_progress(state,stages,'evaluate',{'stage':63},{},3)
    assert context['stage']==37 and context['label']=='Review 1'


def test_action_camera_is_continuous_bounded_and_cycles_all_shots():
    import math
    from lab.observers import action_pose,ACTION_SHOTS,camera_rotation
    seen=set()
    for step in range(1921):
        t=step*.05;x,y,z,shot=action_pose(7,4,t);seen.add(shot)
        assert 3-1e-8<=math.hypot(x,z)<=16 and 2<=y<=12
        assert camera_rotation('action',7,4,t)[1]>0
        if step:
            assert math.dist((x,y,z),previous)<.1
        previous=(x,y,z)
    assert seen=={s[0] for s in ACTION_SHOTS}
    for boundary in range(12,193,12):
        a=action_pose(7,4,boundary-.001)[:3];b=action_pose(7,4,boundary+.001)[:3]
        assert math.dist(a,b)<.001

def test_active_cycle_skips_finished_and_holds_last_bot(tmp_path):
    now=[100.];o=Observers(tmp_path/'camera',lambda c:None,lambda:now[0],settle_delay=0)
    s=o.start({'player':'Xonosnet','target':'LabAI0','cycle_enabled':True},['Xonosnet'])
    assert s['active_only'] is True
    agents={f'LabAI{i}':dict(connected=True,last_seen=100,entity_id=i+1,trial_completed=0,run='one') for i in range(3)}
    def tick():
        for a in agents.values():a['last_seen']=now[0]
        o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},agents,True,'evaluate',progress_context={'run':'one','episodes':3})
    tick();agents['LabAI0']['trial_completed']=3
    now[0]+=1;tick()
    assert o.sessions['Xonosnet']['target']=='LabAI1'  # no 30-second wait after finishing
    agents['LabAI1']['trial_completed']=3;now[0]+=1;tick()
    s=o.sessions['Xonosnet'];assert s['target']=='LabAI2'
    s['attached']=True
    agents['LabAI2']['trial_completed']=3;now[0]+=31;tick()
    assert s['target']=='LabAI2' and s['cycle_waiting'] and s['attached']
    assert o.next_bot('Xonosnet',agents)['target']=='LabAI2'  # Space also holds
    agents['LabAI0']['trial_completed']=0;now[0]+=1;tick()
    assert s['target']=='LabAI0' and not s['cycle_waiting']


def test_cycle_single_candidate_keeps_camera_attachment(tmp_path):
    o=Observers(tmp_path/'camera',lambda c:None,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0','cycle_enabled':True},['Xonosnet'])
    s=o.sessions['Xonosnet'];s['attached']=True
    o.progress_context={'episodes':1,'run':'test'};o.camera_mode='evaluate'
    agents={'LabAI0':dict(connected=True,last_seen=100,run='test',trial_completed=0)}
    o.next_bot('Xonosnet',agents)
    assert s['attached'] and s['target']=='LabAI0'
    agents['LabAI0']['trial_completed']=1
    assert not o.cycle_candidates(s,agents)


def test_active_filter_opt_out_and_teacher_collection(tmp_path):
    o=Observers(tmp_path/'camera',lambda c:None,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0','cycle_enabled':True,'active_only':False},['Xonosnet'])
    s=o.sessions['Xonosnet'];o.progress_context={'episodes':1}
    agents={'LabAI0':dict(connected=True,last_seen=100,trial_completed=1)}
    assert o.cycle_candidates(s,agents)==['LabAI0']
    s['active_only']=True
    assert not o.cycle_candidates(s,agents)
    o.camera_mode='teacher'
    assert o.cycle_candidates(s,agents)==['LabAI0']
    with pytest.raises(ValueError):o.start({'player':'Xonosnet','target':'LabAI0','active_only':'yes'},['Xonosnet'])


def test_active_filter_ignores_old_run_and_rejoins_new_run(tmp_path):
    o=Observers(tmp_path/'camera',lambda c:None,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0','cycle_enabled':True},['Xonosnet'])
    o.progress_context={'run':'new','episodes':3};o.camera_mode='evaluate'
    agents={'LabAI0':dict(connected=True,last_seen=100,run='old',trial_completed=0)}
    assert not o.cycle_candidates(o.sessions['Xonosnet'],agents)
    agents['LabAI0']['run']='new'
    assert o.cycle_candidates(o.sessions['Xonosnet'],agents)==['LabAI0']
