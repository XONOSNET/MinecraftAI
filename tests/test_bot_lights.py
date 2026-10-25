from lab.bot_lights import BotLights


def test_lights_follow_only_fresh_lab_bots_and_do_not_overwrite_terrain():
    commands=[];clock=[100];lights=BotLights(commands.append,lambda:clock[0])
    agents={'LabAI0':dict(position=[-1.2,70,5.8],connected=True,last_seen=100),
            'LabAI1':dict(position=[2,70,5],connected=True,last_seen=80),
            'Xonosnet':dict(position=[1,70,5],connected=True,last_seen=100)}
    lights.tick(agents,True)
    assert lights.positions=={(-2,71,5)}
    assert any('positioned -2 71 5 if block ~ ~ ~ minecraft:air' in c for c in commands)
    assert any('run setblock ~ ~ ~ minecraft:light[level=14,waterlogged=false]' in c for c in commands)
    assert all('if block ~ ~ ~ minecraft:air' in c for c in commands if 'run setblock' in c and 'minecraft:light[' in c.split('run setblock')[-1])
    before=len(commands);clock[0]+=.3;lights.tick(agents,True);assert len(commands)==before
    agents['LabAI0']['position']=[0,70,5];clock[0]+=.3;lights.tick(agents,True)
    assert lights.positions=={(0,71,5)}
    assert any('tag=!lab_light_current' in c and 'minecraft:air' in c for c in commands)


def test_cleanup_disconnected_bots_reloaded_chunks_and_shutdown():
    commands=[];clock=[100];lights=BotLights(commands.append,lambda:clock[0])
    a={'LabAI0':dict(position=[0,70,0],connected=True,last_seen=100)}
    lights.tick(a,True);a['LabAI0']['connected']=False;clock[0]+=1;lights.tick(a,True)
    assert lights.positions==set()
    before=len(commands);clock[0]+=3;lights.tick(a,True);assert len(commands)>before
    lights.clear();assert lights.positions is None
    assert commands[-1].startswith('kill @e[type=minecraft:marker,tag=lab_bot_light')


def test_unavailable_server_invalid_positions_and_other_dimensions_are_ignored():
    commands=[];lights=BotLights(commands.append,lambda:100)
    lights.tick({},False);assert not commands
    lights.tick({'LabAI0':dict(position=[float('nan'),0,0],connected=True,last_seen=100),
                 'LabAI1':dict(position=[0,70,0],dimension='the_nether',connected=True,last_seen=100)},True)
    assert not any('summon' in c for c in commands)
