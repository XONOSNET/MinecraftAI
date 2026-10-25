from lab.curriculum import STAGES
from lab.tasks import task_spec, reset_commands, task_success


def test_only_stage_26_becomes_an_enclosed_cabin_with_a_real_door():
    assert STAGES[25]['name']=='Reach shelter through a doorway'
    for index,stage in enumerate(STAGES):
        if stage.get('task')!='shelter':continue
        task=task_spec(stage,123,0,False)
        assert task['enclosed']==(index==25)
        if index!=25:continue
        commands=reset_commands(task,'LabAI0')
        assert len(task['actual_doors'])==1 and not task['doors']
        assert sum('oak_door[' in c for c in commands)==2
        assert any('cobblestone' in c for c in commands)
        assert any('stone_bricks' in c for c in commands)
        assert any('lantern[hanging=true]' in c for c in commands)


def test_canopy_or_open_door_cannot_pass_the_enclosed_shelter_objective():
    task=task_spec(STAGES[25],1,0,True)
    metrics=dict(health=20,inside=True,y=181,distance=.5,sheltered=True)
    assert not task_success(task,metrics)
    assert not task_success(task,{**metrics,'shelter_secure':True,'shelter_seconds':1.9})
    assert task_success(task,{**metrics,'shelter_secure':True,'shelter_seconds':2})
    assert not task_success(task,{**metrics,'shelter_secure':True,'shelter_seconds':2,'health':10})
