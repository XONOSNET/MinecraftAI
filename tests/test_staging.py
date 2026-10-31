import math
from lab.staging import StagingPad,build_commands,position,X,Y,Z,RADIUS
from lab.world_training import WorldTraining


def test_circle_has_full_support_rail_lights_and_separate_waiting_spots():
    blocks={}
    for command in build_commands():
        p=command.split()
        if p[0] not in ('fill','setblock'):continue
        start=list(map(int,p[1:4]));end=list(map(int,p[4:7])) if p[0]=='fill' else start;material=p[7] if p[0]=='fill' else p[4]
        for x in range(start[0],end[0]+1):
            for y in range(start[1],end[1]+1):
                for z in range(start[2],end[2]+1):blocks[x,y,z]=material
    for dx in range(-RADIUS,RADIUS+1):
        for dz in range(-RADIUS,RADIUS+1):
            d=dx*dx+dz*dz
            if d<=RADIUS**2:
                assert (X+dx,Y,Z+dz) in blocks and (X+dx,Y-1,Z+dz) in blocks
                if d>13**2:assert blocks[X+dx,Y+1,Z+dz]=='minecraft:cyan_stained_glass'
            else:assert (X+dx,Y,Z+dz) not in blocks
    points=[position(i) for i in range(8)]
    for i,(x,y,z) in enumerate(points):
        assert blocks[math.floor(x),Y,math.floor(z)]=='minecraft:sea_lantern'
        assert blocks[math.floor(x),Y+1,math.floor(z)]=='minecraft:cyan_carpet'
        assert all(math.dist((x,z),(p[0],p[2]))>4 for p in points[i+1:])


def test_loading_finishes_before_queued_bots_are_teleported_and_rebuilds_after_server_restart():
    commands=[];pad=StagingPad(commands.append);pad.park(['LabAI1','LabAI0']);assert not commands
    pad.tick(10,100);assert commands==[f'forceload add {X-RADIUS} {Z-RADIUS} {X+RADIUS} {Z+RADIUS}']
    pad.tick(10,101);assert not pad.ready
    pad.tick(10,102);assert pad.ready
    teleports=[c for c in commands if c.startswith('tp ')];assert len(teleports)==2 and '225.1' in teleports[0]
    commands.clear();pad.tick(10,103);assert not any(c.startswith('fill ') for c in commands)
    pad.tick(11,104);assert not pad.ready


def test_world_stop_and_failed_attempt_use_injected_sky_staging(tmp_path):
    commands=[];pad=StagingPad(commands.append);pad.tick(1,1);pad.tick(1,3);commands.clear()
    world=WorldTraining(tmp_path/'world.json',commands.append,tmp_path/'console.log',staging=pad)
    world.start({},['LabAI0']);world.session.update(phase='running',trial_at=0)
    world.report('LabAI0',dict(run=world.session['run'],state='stopped'))
    assert any(c.startswith('tp LabAI0 -153.5 225.1 160.5') for c in commands)
    assert 'gamemode survival LabAI0' in commands
    assert commands.index('gamemode survival LabAI0')>next(i for i,c in enumerate(commands) if c.startswith('tp LabAI0 '))
    assert not any(' 0 181 0' in c for c in commands)
