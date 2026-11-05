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
    assert any('LabAI0' in c and 'Blocked' in c for c in commands)
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
    assert any('scoreboard players display name lab_row_0 lab_bots' in c for c in commands)
    assert sum(c.startswith('scoreboard players set lab_row_') for c in commands)==AGENT_COUNT
    assert not any('scoreboard players set "' in c for c in commands)
    now[0]+=2;commands.clear()
    tick('paused',{'job':{'status':'running','epoch':42,'epochs':100,'percent':40,'samples':1500,'phase':'learning'}})
    assert any('Training pass 42/100 | 58 left' in c for c in commands)
    assert 'bossbar set lab:observer_xonosnet_task value 40' in commands
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible']=='bossbar set lab:observer_xonosnet_state visible false'


def test_camera_uses_native_display_interpolation(tmp_path):
    commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'orbit'},['Xonosnet'])
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':{'connected':True,'last_seen':100,'entity_id':1}},True)
    assert any('summon minecraft:item_display' in c and 'teleport_duration:0' in c and 'Rotation:[' in c for c in commands)
    assert any('data merge entity' in c and 'teleport_duration:4' in c for c in commands)
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
    assert not any('~18s' in c and 'scoreboard players display name' in c for c in commands)


def test_world_stall_countdown_is_visible_and_not_shown_for_finished_bots(tmp_path):
    commands=[];now=[100];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    result={'state':'working','message':'Holding at unsafe drop','phase':'gather','stall_seconds_left':42}
    world={'phase':'running','round':1,'name':'Camp','message':'Testing','bots':['LabAI0'],'results':{'LabAI0':result}}
    a={'connected':True,'last_seen':100,'entity_id':1}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True,'evaluate',progress_context={'world':world})
    assert any('No progress: attempt ends in 42s' in c for c in commands)
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible']=='bossbar set lab:observer_xonosnet_state visible true'
    commands.clear();now[0]+=2;result['state']='complete';a['last_seen']=now[0]
    o.update_hud(o.sessions['Xonosnet'],a,'evaluate')
    assert not any('attempt ends in' in c for c in commands)
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible']=='bossbar set lab:observer_xonosnet_state visible false'


def test_world_shelter_watch_uses_third_bar_and_keeps_counting_after_morning(tmp_path):
    commands=[];now=[100];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    sleep={'status':'Morning verified','morning_seen':True,'watch_seconds_left':125,'watch_seconds_total':300,'watch_updated_at':100}
    result={'state':'working','phase':'night_hold','message':'Morning verified','wilderness':{'sleep':sleep}}
    world={'active':True,'phase':'running','round':1,'name':'Camp','message':'Testing','bots':['LabAI0'],'results':{'LabAI0':result}}
    a={'connected':True,'last_seen':100,'entity_id':1,'display_name':'CedarWren'}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True,'evaluate',progress_context={'world':world})
    cache=o.hud_commands['Xonosnet'];prefix='bossbar set lab:observer_xonosnet_state '
    assert 'CedarWren | Shelter watch | 2:05 remaining' in cache[prefix+'name']
    assert cache[prefix+'value']==prefix+'value 42'
    assert cache[prefix+'color']==prefix+'color purple'
    assert cache[prefix+'visible']==prefix+'visible true'
    # Interpolate the timestamped report rather than freezing between updates.
    now[0]=103;a['last_seen']=103;o.update_hud(o.sessions['Xonosnet'],a,'evaluate')
    assert '2:02 remaining' in cache[prefix+'name']
    now[0]=226;a['last_seen']=226;o.update_hud(o.sessions['Xonosnet'],a,'evaluate')
    assert cache[prefix+'visible']==prefix+'visible true'
    assert '0:00 | Morning verified' in cache[prefix+'name']
    assert cache[prefix+'value']==prefix+'value 0'
    # A confirmed completion, rather than the local timer, hides the bar.
    now[0]+=2;result.update(state='complete',phase='complete');o.update_hud(o.sessions['Xonosnet'],a,'evaluate')
    assert cache[prefix+'visible']==prefix+'visible false'


def test_selected_bot_vitals_survive_world_labels_and_switch_with_the_camera(tmp_path):
    now=[100.];o=Observers(tmp_path/'hud',lambda command:None,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    o.progress_context={'world':{'phase':'running','round':1,'name':'Camp','message':'Testing','bots':['LabAI0','LabAI1'],'results':{'LabAI0':{'phase':'night_stone','lesson':7,'lesson_total':19}}}}
    session=o.sessions['Xonosnet'];agent={'connected':True,'last_seen':100,'display_name':'CedarWren','health':17,'food':14}
    prefix='bossbar set lab:observer_xonosnet_task name'
    o.update_hud(session,agent,'evaluate')
    assert 'CedarWren | Lesson 7/19' in o.hud_commands['Xonosnet'][prefix]
    assert 'Health 85% | Food 70%' in o.hud_commands['Xonosnet'][prefix]
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible'].endswith(' false')
    now[0]+=2;session['target']='LabAI1'
    o.update_hud(session,dict(agent,last_seen=now[0],display_name='OakPanda',health=12.6,food=20),'evaluate')
    assert 'OakPanda' in o.hud_commands['Xonosnet'][prefix]
    assert 'Health 63% | Food 100%' in o.hud_commands['Xonosnet'][prefix]
    now[0]+=10;o.update_hud(session,agent,'evaluate')
    assert 'Health -- | Food --' in o.hud_commands['Xonosnet'][prefix]


@pytest.mark.parametrize('seconds,updated',[(0,100),(2,95)])
def test_shelter_watch_stays_visible_at_zero_while_waiting_for_dawn(tmp_path,seconds,updated):
    commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    sleep={'status':'Sleeping in home bed · waiting for morning','night_seen':True,'morning_seen':False,
           'watch_seconds_left':seconds,'watch_seconds_total':300,'watch_updated_at':updated}
    o.progress_context={'world':{'phase':'running','round':1,'name':'Camp','message':'Testing','bots':['LabAI0'],
        'results':{'LabAI0':{'phase':'night_hold','state':'working','wilderness':{'sleep':sleep}}}}}
    o.update_hud(o.sessions['Xonosnet'],{'connected':True,'last_seen':100,'entity_id':1},'evaluate')
    cache=o.hud_commands['Xonosnet'];prefix='bossbar set lab:observer_xonosnet_state '
    assert cache[prefix+'visible']==prefix+'visible true'
    assert cache[prefix+'color']==prefix+'color purple'
    assert cache[prefix+'value']==prefix+'value 0'
    assert '0:00' in cache[prefix+'name'] and 'waiting for morning' in cache[prefix+'name']


@pytest.mark.parametrize('phase,state,world_phase,mode,fresh',[
    ('complete','complete','running','evaluate',True),
    ('stopped','stopped','running','evaluate',True),
    ('night_food','working','running','evaluate',True),
    ('night_hold','working','restoring','evaluate',True),
    ('night_hold','working','running','paused',True),
    ('night_hold','working','running','evaluate',False),
])
def test_shelter_countdown_hides_when_not_actively_watching(tmp_path,phase,state,world_phase,mode,fresh):
    commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    result={'phase':phase,'state':state,'wilderness':{'sleep':{'watch_seconds_left':120,'watch_seconds_total':300}}}
    o.progress_context={'world':{'phase':world_phase,'progress':40,'round':1,'name':'Camp','message':'Testing','bots':['LabAI0'],'results':{'LabAI0':result}}}
    o.update_hud(o.sessions['Xonosnet'],{'connected':fresh,'last_seen':100,'entity_id':1},mode)
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible'].endswith(' false')


def test_shelter_countdown_updates_for_the_selected_bot_and_cleans_up(tmp_path):
    commands=[];now=[100];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    o.progress_context={'world':{'phase':'running','round':1,'name':'Camp','message':'Testing','bots':['LabAI0','LabAI1'],'results':{
        'LabAI0':{'phase':'night_hold','state':'working','wilderness':{'sleep':{'watch_seconds_left':60,'watch_seconds_total':300}}},
        'LabAI1':{'phase':'night_wool','state':'working'},
    }}}
    a={'connected':True,'last_seen':100,'entity_id':1};session=o.sessions['Xonosnet'];o.update_hud(session,a,'evaluate')
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible'].endswith(' true')
    session['target']='LabAI1';now[0]=102;a['last_seen']=102;o.update_hud(session,a,'evaluate')
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible'].endswith(' false')
    o.clear_hud(session);assert 'bossbar remove lab:observer_xonosnet_state' in commands


def test_camera_cycle_uses_interval_and_skips_offline_bots(tmp_path):
    now=[100.];commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'cycle','cycle_seconds':30},['Xonosnet'])
    agents={'LabAI0':{'connected':True,'last_seen':100,'entity_id':1},'LabAI2':{'connected':True,'last_seen':100,'entity_id':3}}
    tick=lambda:o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},agents,True)
    tick();assert o.sessions['Xonosnet']['target']=='LabAI0'
    now[0]=131
    for a in agents.values():a['last_seen']=131
    tick();assert o.sessions['Xonosnet']['target']=='LabAI2' and o.sessions['Xonosnet']['cycle_at']==161


def test_roster_highlight_tracks_camera_without_activity_change(tmp_path):
    import json
    now=[100.];commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'orbit','cycle_enabled':True,'cycle_seconds':30},['Xonosnet'])
    agents={f'LabAI{i}':{'connected':True,'last_seen':100,'entity_id':i+1,'display_name':name,'action':4} for i,name in enumerate(('AmberRobin','BirchBadger'))}
    def tick():o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},agents,True,'teacher')
    def row(index):
        prefix=f'scoreboard players display name lab_row_{index} lab_bots '
        return json.loads(next(c[len(prefix):] for c in reversed(commands) if c.startswith(prefix)))
    tick()
    assert row(0)['color']=='gold' and row(1)['color']=='aqua'
    commands.clear();now[0]=131
    for a in agents.values():a['last_seen']=131
    tick()
    assert o.sessions['Xonosnet']['target']=='LabAI1'
    assert row(0)['color']=='aqua' and row(1)['color']=='gold'
    assert row(1)['extra']==[{'text':': Wait','color':'white'}]
    # A manual switch also bypasses the normal one-second activity throttle.
    commands.clear();now[0]+=.1;o.sessions['Xonosnet'].update(target='LabAI0',cycle_at=200)
    tick()
    assert row(0)['color']=='gold' and row(1)['color']=='aqua'
    # Unchanged selection and activity do not resend scoreboard rows.
    commands.clear();now[0]+=2;tick()
    assert not any(c.startswith('scoreboard players display name') for c in commands)


def test_roster_highlights_only_online_enabled_observers(tmp_path):
    import json
    commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:100)
    for owner,target in [('Xonosnet','LabAI0'),('ViewerTwo','LabAI1'),('OfflineViewer','LabAI2'),('StoppedViewer','LabAI3')]:
        o.start({'player':owner,'target':target},[owner])
    o.sessions['StoppedViewer']['enabled']=False
    o.update_roster(['Xonosnet','ViewerTwo','StoppedViewer'],{},'paused')
    colors=[json.loads(c.split(' lab_bots ',1)[1])['color'] for c in commands if c.startswith('scoreboard players display name')]
    assert colors[:4]==['gold','gold','aqua','aqua']


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
    now=[100.];commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':view},['Xonosnet'])
    a={'connected':True,'last_seen':100,'entity_id':1,'position':[0,181,0],'run':'one','yaw':0}
    def tick():
        o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True)
        return [c for c in commands if 'run tp @e[tag=lab_camera_' in c][-1]
    initial=tick()
    a.update(yaw=math.pi,pitch=1.2)
    assert tick()==initial
    assert 'rotated as' not in initial and '^' not in initial
    a['position']=[0,181,1];now[0]+=.05
    tick();s=o.sessions['Xonosnet']
    assert s['travel_heading']==math.pi/2 and 0<s['camera_heading']<=.025
    for _ in range(100):now[0]+=.05;tick()
    assert s['camera_heading']==pytest.approx(math.pi/2,abs=.002)
    a['position']=[100,181,0];tick()
    assert s['camera_heading']==0  # Arena teleports are not movement bearings.


def test_native_roster_keeps_identity_metadata_out_of_labels(tmp_path):
    commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    a={'connected':True,'last_seen':100,'serial':'A0001','deaths':0,'action':0,'speed':0,'reset_seconds':15}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':a},True,'evaluate')
    labels=[c for c in commands if 'display name' in c or 'bossbar' in c]
    assert not any('A0001' in c or ' D0' in c or 'deaths' in c for c in labels)
    assert any('LabAI0' in c and 'Blocked' in c for c in labels)
    assert not any('~15s' in c for c in labels if 'display name' in c)


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
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_task value']=='bossbar set lab:observer_xonosnet_task value 33'
    assert 'bossbar set lab:observer_xonosnet_state value 50' in commands
    assert any('Route 50%' in c for c in commands)
    assert o.hud_commands['Xonosnet']['bossbar set lab:observer_xonosnet_state visible']=='bossbar set lab:observer_xonosnet_state visible true'


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
        assert math.dist(a,b)<.004


def test_action_camera_keeps_continuous_velocity_through_shots_and_loop():
    from lab.observers import action_pose
    import math
    epsilon=.001
    for distance,height in ((3,2),(7,4),(16,12)):
        for boundary in range(12,193,12):
            a=action_pose(distance,height,boundary-epsilon)[:3]
            b=action_pose(distance,height,boundary)[:3]
            c=action_pose(distance,height,boundary+epsilon)[:3]
            before=[(y-x)/epsilon for x,y in zip(a,b)]
            after=[(y-x)/epsilon for x,y in zip(b,c)]
            assert math.dist(before,after)<.003
            assert math.hypot(before[0],before[2])>.1


def test_camera_heading_eases_in_and_out_without_overshoot_or_long_wrap():
    from lab.observers import smooth_heading
    import math
    heading=velocity=0;steps=[]
    for _ in range(200):
        previous=heading;heading,velocity=smooth_heading(heading,math.pi/2,velocity,.05)
        steps.append(heading-previous)
        assert 0<=heading<=math.pi/2 and abs(velocity)<=.8
    assert steps[0]<steps[5] and steps[-1]<steps[5]/100
    assert heading==pytest.approx(math.pi/2,abs=.0001)
    wrapped,velocity=smooth_heading(math.pi-.02,-math.pi+.02,0,.05)
    assert math.pi-.02<wrapped<math.pi+.02
    assert smooth_heading(0,1,0,0)==(0,0)
    assert abs(smooth_heading(0,math.pi/2,0,30)[0])<=.2

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


def test_private_camera_adjustments_keep_subject_and_cycle_schedule_and_allow_one_block(tmp_path):
    import math
    from lab.observers import action_pose
    o=Observers(tmp_path/'camera',lambda c:None,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI3','view':'trail','distance':1,'cycle_enabled':True},['Xonosnet'])
    s=o.sessions['Xonosnet'];s['attached']=True;due=s['cycle_at']
    o.adjust('xonosnet','ArrowDown');assert s['distance']==1 and s['attached']
    o.adjust('Xonosnet','ArrowUp');assert s['distance']==2 and s['target']=='LabAI3'
    o.adjust('Xonosnet','ArrowLeft');assert s['height']==3
    o.adjust('Xonosnet','ArrowRight');assert s['height']==4
    o.adjust('Xonosnet','Enter');assert s['view']=='side' and not s['attached']
    assert s['cycle_at']==due and s['cycle_enabled']
    with pytest.raises(ValueError):o.adjust('Stranger','Enter')
    with pytest.raises(ValueError):o.adjust('Xonosnet','unsupported')
    assert math.hypot(*action_pose(1,4,0)[::2])>=1


def test_world_teacher_cycle_skips_removed_bots_immediately_and_holds_when_all_done(tmp_path):
    now=[100.];o=Observers(tmp_path/'camera',lambda c:None,lambda:now[0],settle_delay=0)
    s=o.start({'player':'Xonosnet','target':'LabAI0','cycle_enabled':True},['Xonosnet'])
    s=o.sessions['Xonosnet']
    agents={f'LabAI{i}':dict(connected=True,last_seen=100,entity_id=i+1,trial_completed=0,run='world-one') for i in range(3)}
    world=dict(active=True,phase='running',bots=['LabAI0','LabAI1'],results={})
    context={'run':'world-one','episodes':1,'world':world}
    def tick():
        for a in agents.values():a['last_seen']=now[0]
        o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},agents,True,'teacher',progress_context=context)
    # Exercise selection independently of HUD formatting and camera movement.
    o.update_hud=lambda *args:None;o.update_roster=lambda *args:None
    o.progress_context=context;o.camera_mode='teacher'
    assert o.cycle_candidates(s,agents)==['LabAI0','LabAI1']
    world['results']['LabAI0']={'state':'stopped'}
    tick();assert s['target']=='LabAI1'
    world['results']['LabAI1']={'state':'complete'};now[0]+=1
    tick();assert s['target']=='LabAI1' and s['cycle_waiting']
    assert o.next_bot('Xonosnet',agents)['target']=='LabAI1'
    world.update(active=True,phase='restoring',results={});assert not o.cycle_candidates(s,agents)
    world['phase']='running';now[0]+=1;tick()
    assert not s['cycle_waiting'] and s['target']=='LabAI0'


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


def test_first_night_header_distinguishes_restoration_from_a_zero_score():
    from lab.observers import first_night_label
    world={'night_level':0,'phase':'restoring','progress':75,'driver':'teacher','bots':['LabAI0']*8,'results':{}}
    label=first_night_label(world,{'completed':5,'bots':8})
    assert 'Restoring terrain 75%' in label and 'Last policy 5/8' in label
    assert '0/8 complete' not in label
    world.update(phase='running',results={'LabAI0':{'state':'complete'},'LabAI1':{'state':'stopped'}})
    assert 'Teacher: 1/8 complete, 1 stopped' in first_night_label(world)
    world['driver']='student'
    assert 'Policy: 1/8 complete' in first_night_label(world)


def test_trial_timer_uses_running_trial_start_and_freezes_when_finished():
    from lab.observers import trial_timer
    world={'phase':'running','trial_at':100,'started_at':0}
    assert trial_timer(world,100)=='00:00'
    assert trial_timer(world,159)=='00:59'
    assert trial_timer(world,3699)=='59:59'
    assert trial_timer(world,3700)=='01:00:00'
    assert trial_timer(world,3761)=='01:01:01'
    world.update(phase='finished',finished_at=3761)
    assert trial_timer(world,9000)=='01:01:01'
    world['phase']='restoring';assert trial_timer(world,9000) is None
    assert trial_timer({'phase':'running'},100) is None


def test_previous_policy_score_ignores_teacher_other_levels_and_assessments():
    from lab.observers import latest_policy_result
    base={'run':'policy','driver':'student','mission':'first_night','night_level':0,'bots':['LabAI0','LabAI1'],'results':{'LabAI0':{'state':'complete'},'LabAI1':{'state':'stopped'}}}
    history=[base,dict(base,driver='teacher'),dict(base,night_level=1),dict(base,assessment=True)]
    assert latest_policy_result(base,history)=={'completed':1,'bots':2,'run':'policy'}
    assert latest_policy_result(base,[]) is None


def test_camera_motion_continues_without_reentering_world_or_dashboard_tick(tmp_path):
    now=[100.];commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:now[0],settle_delay=0);o.external_motion=True
    o.start({'player':'Xonosnet','target':'LabAI0','view':'orbit'},['Xonosnet'])
    agent={'connected':True,'last_seen':100,'position':[0,65,0],'entity_id':1,'run':'same'}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':agent},True)
    commands.clear()
    # No calls to the maintenance tick while its work is slow.
    for _ in range(20):now[0]+=.05;o.move_cameras()
    assert len(commands)==20 and all('execute at LabAI0 run tp' in c for c in commands)
    assert len(set(commands))>1
    o.stop('Xonosnet',['Xonosnet']);commands.clear();o.move_cameras();assert not commands


def test_unchanged_hud_values_are_not_resent_every_second(tmp_path):
    now=[100.];commands=[];o=Observers(tmp_path/'hud',commands.append,lambda:now[0],settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    agent={'connected':True,'last_seen':100,'position':[0,65,0],'entity_id':1,'run':'same'}
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':agent},True)
    commands.clear();now[0]+=1.1;o.update_hud(o.sessions['Xonosnet'],agent,'paused')
    assert not any(c.startswith('bossbar ') for c in commands)


def test_manual_next_bot_preserves_view_and_does_not_enable_automatic_cycle(tmp_path):
    o=Observers(tmp_path/'camera',lambda c:None,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'orbit','cycle_enabled':False},['Xonosnet'])
    agents={f'LabAI{i}':dict(connected=True,last_seen=100,trial_completed=0) for i in range(3)}
    assert o.next_bot('Xonosnet',agents)['target']=='LabAI1'
    s=o.next_bot('Xonosnet',agents)
    assert s['target']=='LabAI2' and s['view']=='orbit' and s['cycle_enabled'] is False
    o.sessions['Xonosnet']['enabled']=False
    with pytest.raises(ValueError):o.next_bot('Xonosnet',agents)


def test_roster_stopped_bot_is_gray_even_when_watched(tmp_path):
    import json
    commands=[];o=Observers(tmp_path/'camera',commands.append,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0'},['Xonosnet'])
    o.progress_context={'world':{'phase':'running','results':{'LabAI0':{'state':'stopped','phase':'stopped'}}}}
    o.update_roster(['Xonosnet'],{'LabAI0':{'connected':True,'last_seen':100,'display_name':'AmberRobin'}},'teacher')
    prefix='scoreboard players display name lab_row_0 lab_bots '
    row=json.loads(next(c[len(prefix):] for c in reversed(commands) if c.startswith(prefix)))
    assert row['text']=='AmberRobin' and row['color']=='gray'
    o.progress_context['world']['results']['LabAI0']={'state':'working','phase':'gather'}
    o.roster_at=-10
    o.update_roster(['Xonosnet'],{'LabAI0':{'connected':True,'last_seen':100,'display_name':'AmberRobin'}},'teacher')
    row=json.loads(next(c[len(prefix):] for c in reversed(commands) if c.startswith(prefix)))
    assert row['color']=='gold'


def test_shoulder_halves_live_pitch_and_orbits_character_pivot(tmp_path):
    from lab.observers import shoulder_rotation
    move=camera_move('LabAI0','camera','shoulder',3,2,0,heading=99)
    assert 'positioned ~ ~1.600 ~ rotated as @e[tag=camera,limit=1] positioned ^-0.900 ^0 ^-3.000' in move
    commands=[];o=Observers(tmp_path/'shoulder',commands.append,lambda:100,settle_delay=0)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'shoulder','distance':3,'height':2},['Xonosnet'])
    o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},{'LabAI0':{'connected':True,'last_seen':100,'entity_id':42}},True)
    attach=next(i for i,c in enumerate(commands) if 'run spectate @e[tag=lab_camera_' in c)
    assert any('Rotation[1] float 0.0005' in c for c in commands[:attach])
    assert any('positioned ^-0.900 ^0 ^-3.000 run summon' in c for c in commands)
    commands.clear();o.external_motion=True
    o.motion_frames['Xonosnet']=('LabAI0','lab_camera_xonosnet','shoulder',3,2,100,0,100)
    o.move_cameras()
    assert commands==[*shoulder_rotation('LabAI0','lab_camera_xonosnet'),camera_move('LabAI0','lab_camera_xonosnet','shoulder',3,2,0)]
    assert 'anchored eyes' not in ''.join(commands)


def test_shoulder_replaces_stationary_slot_in_manual_view_cycle(tmp_path):
    o=Observers(tmp_path/'shoulder',lambda c:None,lambda:100)
    o.start({'player':'Xonosnet','target':'LabAI0','view':'first_person'},['Xonosnet'])
    assert o.adjust('Xonosnet','Enter')['view']=='shoulder'
    assert o.adjust('Xonosnet','ArrowRight')['height']==5
    assert o.adjust('Xonosnet','Enter')['view']=='trail'
    assert o.start({'player':'Xonosnet','target':'LabAI0','view':'stationary'},['Xonosnet'])['view']=='stationary'
