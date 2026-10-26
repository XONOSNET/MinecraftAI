import json
from lab.realistic import REALISTIC_STAGES, spec
from lab.curriculum import STAGES, STAGES_V9, Curriculum
from lab.tasks import reset_commands, task_success


def test_twenty_realistic_courses_are_safe_bounded_and_progressive():
    assert len(REALISTIC_STAGES)==20 and len(STAGES)==150
    assert [s['tier'] for s in STAGES]==sorted(s['tier'] for s in STAGES)
    assert len({s['id'] for s in STAGES})==len(STAGES)
    for stage in REALISTIC_STAGES:
        for seed in (1,123,789):
            task=spec(stage,seed,7,True)
            assert len(task['waypoints'])>=4
            for p in [task['start'],*task['waypoints']]:
                assert task['bounds'][0]<p[0]<task['bounds'][1] and task['bounds'][2]<p[2]<task['bounds'][3]
                assert task['y_min']<p[1]<task['y_max']
            for b in task['terrain_blocks']:
                assert all(b[i]<=b[i+3] for i in range(3)),b
                assert (b[3]-b[0]+1)*(b[4]-b[1]+1)*(b[5]-b[2]+1)<=32768
            assert spec(stage,seed,7,False)['center']==320
            assert any('fill ' in c for c in reset_commands(task,'LabAI7'))
    assert sum(bool(s['features'].get('houses')) for s in REALISTIC_STAGES)>=6
    assert sum(bool(s['features'].get('lava')) for s in REALISTIC_STAGES)>=5
    assert sum(bool(s['features'].get('gaps')) for s in REALISTIC_STAGES)>=4


def test_realistic_success_checks_jumps_and_route_without_hazard_contact():
    task=spec(next(s for s in REALISTIC_STAGES if s['features'].get('gaps')),1,0,True)
    good=dict(health=20,inside=True,y=task['goal'][1],distance_3d=.5,checkpoints=len(task['waypoints'])-1,hazard_contacts=0,jumps=1)
    assert task_success(task,good)
    for bad in [dict(jumps=0),dict(checkpoints=0),dict(hazard_contacts=1),dict(health=17)]:assert not task_success(task,{**good,**bad})


def test_v9_progress_and_history_remain_on_the_same_courses(tmp_path):
    old=next(i for i,s in enumerate(STAGES_V9) if s['name']=='Waterfall summit expedition 5')
    p=tmp_path/'state';p.write_text(json.dumps(dict(catalog_version=9,stage=old,enabled=False,round=8,history=[dict(stage=old,score=1)],learning_rate_scales={str(old):.5},recovery_target=old)))
    s=Curriculum(p,{}).state
    assert STAGES[s['stage']]['name']=='Waterfall summit expedition 5' and s['round']==8
    assert STAGES[s['history'][0]['stage']]['name']=='Waterfall summit expedition 5'
    assert s['learning_rate_scales'][str(s['stage'])]==.5 and s['recovery_target']==s['stage']


def test_lava_buildings_use_nonflammable_materials_and_sealed_lanes():
    for stage in REALISTIC_STAGES:
        if not stage['features'].get('lava'):continue
        task=spec(stage,123,0,True)
        assert any(b[-1]=='lava' for b in task['terrain_blocks'])
        assert not any('planks' in b[-1] or 'log' in b[-1] for b in task['terrain_blocks'])
        for b in task['terrain_blocks']:assert -5<=b[2]<=b[5]<=5
