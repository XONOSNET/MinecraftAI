from lab.world_training import WorldTraining


def fixture(tmp_path):
    commands=[];clock=[0];log=tmp_path/'console.log';log.write_text('')
    world=WorldTraining(tmp_path/'world.json',commands.append,log,lambda:clock[0])
    return world,commands,clock,log


def test_copy_acknowledged_before_deployment_and_scoped_to_reserved_terrain(tmp_path):
    world,commands,clock,log=fixture(tmp_path)
    world.start({'scenario':0,'size':128},['LabAI0']);world.tick();assert not world.assignment('LabAI0')
    clock[0]=1;world.tick();assert sum(c.startswith('clone ') for c in commands)==4
    for command in commands:
        if command.startswith('clone '):
            xyz=list(map(int,command.split()[1:10]));assert (xyz[3]-xyz[0]+1)*(xyz[4]-xyz[1]+1)*(xyz[5]-xyz[2]+1)<=32768
    log.write_text(('Successfully cloned 16384 blocks\n'*4)+'Set [lab_world] for #world_ack to 1\n')
    world.tick();assert world.session['progress']>0;assert any('minecraft:glass' in c for c in commands)
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
    camp=world.camp('LabAI0',[16448.5,71.1,16448.5]);assert len(camp['plots'])==8 and all(len(trees)==4 for trees in camp['groves'])
    assert sum('minecraft:oak_log' in c for c in commands)==32
    assert not any(c.startswith('give ') for c in commands)
    before=len(commands);assert world.camp('LabAI1',[16448.5,71.1,16448.5])==camp;assert len(commands)==before
