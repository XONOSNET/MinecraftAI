import pytest
from lab.curriculum import Curriculum, STAGES
from lab.trial_catalogue import catalogue


class World:
    def __init__(self):self.now=100;self.rows={'episodes':0,'successes':0};self.job={'status':'idle'};self.modes=[];self.problem=None;self.prepared=True
    def hooks(self):return {'pause':lambda:None,'cancel':lambda:None,'job':lambda:self.job,'mode':lambda *args:self.modes.append(args),'protect':lambda:None,'restore':lambda:None,'results':lambda run:self.rows,'count':lambda:0,'train':lambda:None,'health':lambda:self.problem,'prepare':lambda:self.prepared,'expected_episodes':lambda:24,'event':lambda r:None}


def build(tmp_path):
    w=World();c=Curriculum(tmp_path/'curriculum.json',w.hooks(),lambda:w.now);return c,w


def test_catalogue_covers_every_stable_id_with_concrete_descriptions():
    rows=catalogue(STAGES);assert len(rows)==150 and len({r['id'] for r in rows})==150
    assert all(r['description'] and r['objective'] and r['details'] for r in rows)
    door=next(r for r in rows if r['name']=='Three alternating wooden doors')
    assert 'Door count: 3' in door['details']
    combat=rows[-1];assert any('zombie' in x and 'skeleton' in x for x in combat['details'])
    rows[0]['definition']['name']='Changed';assert STAGES[0]['name']!='Changed'


def test_queue_runs_at_boundary_and_restores_stage_and_confirmation_streak(tmp_path):
    c,w=build(tmp_path);c.start();c.state.update(stage=9,streak=1)
    c.tick();assert c.state['phase']=='baseline'
    c.trials.enqueue(STAGES[0]['id'],'student');c.tick();assert c.state['phase']=='baseline'
    w.rows={'episodes':24,'successes':24};c.tick()
    assert c.state['stage']==10  # Normal promotion finishes before queued work.
    c.tick();assert c.state['phase']=='queued_test' and c.state['stage']==0
    c.tick();assert c.state['stage']==10 and c.state['phase']=='waiting'
    assert c.state['streak']==0 and len(c.state['history'])==1
    assert c.state['trial_history'][0]['successes']==24


def test_teacher_queue_persists_and_restart_repeats_without_promotion(tmp_path):
    c,w=build(tmp_path);c.start();c.state.update(stage=12,streak=1)
    item=c.trials.enqueue(STAGES[5]['id'],'teacher');c.tick()
    assert c.state['phase']=='queued_teacher' and w.modes[-1][0]=='teacher'
    c.pause();assert c.state['queued_active']['id']==item['id']
    c2=Curriculum(c.path,w.hooks(),lambda:w.now);c2.start();c2.tick()
    assert c2.state['phase']=='queued_teacher'
    w.rows={'episodes':24,'successes':20};c2.tick()
    assert c2.state['stage']==12 and c2.state['streak']==1
    assert c2.state['history']==[] and c2.state['trial_history'][0]['driver']=='teacher'


def test_queue_edits_validate_fifo_and_do_not_interrupt_training(tmp_path):
    c,w=build(tmp_path)
    a=c.trials.enqueue(STAGES[0]['id'],'student');b=c.trials.enqueue(STAGES[1]['id'],'teacher')
    c.trials.reorder([b['id'],a['id']]);assert c.trials.snapshot()['queue'][0]['id']==b['id']
    with pytest.raises(ValueError):c.trials.reorder([a['id'],a['id']])
    with pytest.raises(ValueError):c.trials.enqueue([], 'student')
    with pytest.raises(ValueError):c.trials.enqueue('missing', 'student')
    with pytest.raises(ValueError):c.trials.enqueue(STAGES[0]['id'], 'invalid')
    c.start();c.state['phase']='training';w.job={'status':'running'}
    c.tick();assert not c.state.get('queued_active')
    c.trials.remove(a['id']);c.trials.clear();assert not c.trials.snapshot()['queue']


def test_queued_timeout_returns_to_curriculum_without_claiming_success(tmp_path):
    c,w=build(tmp_path);c.start();c.state.update(stage=3,streak=1)
    c.trials.enqueue(STAGES[0]['id'],'student');c.tick();w.now+=601;c.tick()
    assert c.state['stage']==3 and c.state['streak']==1
    assert c.state['trial_history'][-1]['status']=='timed out'


def test_queue_survives_resource_hold_and_waits_for_arena_preparation(tmp_path):
    c,w=build(tmp_path);c.start();c.trials.enqueue(STAGES[0]['id'],'student');c.tick()
    w.problem='System memory is above 88%.';c.tick();assert c.state['phase']=='health_wait'
    w.problem=None;c.tick();w.now+=30;c.tick();assert c.state['phase']=='recovering'
    w.prepared=False;c.tick();assert c.state['phase']=='recovering'
    w.prepared=True;c.tick();assert c.state['phase']=='queued_test'
