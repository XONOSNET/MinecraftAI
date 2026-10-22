import pytest
from lab.observers import Observers, VIEWS, camera_move
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
    assert any('summon minecraft:armor_stand' in c for c in commands)
    o.stop('Xonosnet',['Xonosnet'])
    assert 'execute as Xonosnet run spectate' in commands
    assert 'gamemode creative Xonosnet' in commands
    assert any('lab_return_xonosnet' in c and 'run tp Xonosnet' in c for c in commands)

@pytest.mark.parametrize('view',['first_person','trail','side','overhead','orbit'])
def test_same_entity_teleport_moves_viewer_then_waits_before_camera_attachment(tmp_path,view):
    now=[100.0];commands=[];o=Observers(tmp_path/'state',commands.append,lambda:now[0])
    o.start({'player':'Xonosnet','target':'LabAI0','view':view},['Xonosnet'])
    agents={'LabAI0':{'connected':True,'last_seen':100,'entity_id':42,'dimension':'overworld','run':'one','position':[464,181,0]}}
    tick=lambda:o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':now[0]}},agents,True)
    tick();assert o.sessions['Xonosnet']['status']=='transferring'
    assert 'tp Xonosnet LabAI0' in commands and not any(c.startswith('spectate ') or 'run spectate @e' in c for c in commands)
    now[0]+=1;tick();assert o.sessions['Xonosnet']['attached']
    commands.clear();agents['LabAI0']['position']=[304,181,0]
    tick();assert o.sessions['Xonosnet']['status']=='transferring'
    assert 'tp Xonosnet LabAI0' in commands
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
    assert c.state['phase']=='collecting'

def test_stationary_view_stays_at_viewer_and_can_switch_targets(tmp_path):
    commands=[];o=Observers(tmp_path/'state',commands.append,lambda:100,settle_delay=0)
    agents={name:{'connected':True,'last_seen':100,'entity_id':i} for i,name in enumerate(('LabAI0','LabAI1'))}
    for target in agents:
        o.start({'player':'Xonosnet','target':target,'view':'stationary'},['Xonosnet'])
        o.tick(['Xonosnet'],{'Xonosnet':{'mode':1,'seen':100}},agents,True)
        assert not any(c==f'tp Xonosnet {target}' for c in commands)
        assert any('execute at Xonosnet run summon minecraft:armor_stand' in c for c in commands)
        assert any(f'~ ~ ~ facing entity {target} eyes' in c for c in commands)
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
    assert any('LabAI0: Blocked / no movement' in c for c in commands)
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
