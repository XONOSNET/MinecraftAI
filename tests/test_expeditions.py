from lab.expeditions import EXPEDITION_STAGES,spec
from lab.curriculum import STAGES
from lab.tasks import reset_commands,task_success

def test_fifty_expeditions_are_bounded_and_fill_commands_fit():
    assert len(EXPEDITION_STAGES)==50 and len(STAGES)==150
    assert len({s['id'] for s in STAGES})==len(STAGES)
    for stage in EXPEDITION_STAGES:
        t=spec(stage,123,7,True)
        assert t['goal']!=t['start'] and len(t['waypoints'])>0
        for p in [t['start'],*t['waypoints']]:
            assert t['bounds'][0]<p[0]<t['bounds'][1] and t['bounds'][2]<p[2]<t['bounds'][3]
            assert t['y_min']<p[1]<t['y_max']
        for cmd in reset_commands(t,'LabAI7'):
            if cmd.startswith('fill '):
                a=list(map(int,cmd.split()[1:7]));assert all(a[i]<=a[i+3] for i in range(3))
                assert (a[3]-a[0]+1)*(a[4]-a[1]+1)*(a[5]-a[2]+1)<=32768
        assert spec(stage,123,7,True)['center']-spec(stage,123,7,False)['center']==160

def test_success_requires_real_height_checkpoints_and_water_experience():
    t=spec(EXPEDITION_STAGES[25],123,0,True)
    m=dict(health=20,inside=True,y=t['goal'][1],distance_3d=.5,checkpoints=len(t['waypoints'])-1,hazard_contacts=0,water_steps=10)
    assert task_success(t,m)
    for bad in [dict(y=181),dict(distance_3d=5),dict(checkpoints=0),dict(water_steps=0),dict(health=0),dict(hazard_contacts=1)]:assert not task_success(t,{**m,**bad})


def test_new_abilities_are_introduced_before_old_final_gauntlets():
    names=[s['name'] for s in STAGES]
    assert names.index('Swimming basics 1')<names.index('Advanced bridge door gauntlet')
    assert names.index('Ladder ascent 1')<names.index('Waterfall ascent 5')
    assert names.index('Cave navigation 1')<names.index('Flooded cave 5')
    assert names.index('Elevated catwalk 1')<names.index('Turning catwalk 5')
    assert [s['tier'] for s in STAGES]==sorted(s['tier'] for s in STAGES)

def test_v8_history_migrates_by_identity_without_enabling_training(tmp_path):
    import json
    from lab.curriculum import Curriculum,STAGES_V8
    path=tmp_path/'state';old=next(i for i,s in enumerate(STAGES_V8) if s['name']=='Cross a narrow raised bridge')
    path.write_text(json.dumps({'catalog_version':8,'stage':old,'enabled':False,'history':[{'stage':old,'score':.9}]}))
    state=Curriculum(path,{}).state
    assert not state['enabled'] and STAGES[state['stage']]['name']=='Cross a narrow raised bridge'
    assert STAGES[state['history'][0]['stage']]['name']=='Cross a narrow raised bridge'


def test_waterfalls_are_top_fed_falling_water():
    for stage in EXPEDITION_STAGES:
        if stage['expedition'] in ('waterfall','summit'):
            t=spec(stage,123,0,True)
            assert any(b[-1]=='water[level=8]' for b in t['terrain_blocks'])
            assert any(b[-1]=='water' and b[1]==b[4] for b in t['terrain_blocks'])
