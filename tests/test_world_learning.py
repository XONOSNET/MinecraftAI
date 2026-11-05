from lab.world_learning import WorldLearning,measured_trial,select_world


class Lab:
    def __init__(self):
        self.world=None;self.job={'status':'idle'};self.weights=1;self.protected=1;self.restores=0;self.counts={'expedition':0,'gathering':0,'shelter':0};self.runs=[];self.reviews=[];self.switched=[];self.ready=True
    def begin(self,options):
        self.world=dict(run='world-'+str(len(self.runs)),active=True,phase='running',bots=['LabAI0','LabAI1'],results={},lessons=['hut'],**options);self.runs.append(options.copy());return {'session':self.world}
    def stop(self):
        if self.world:self.world.update(active=False,phase='paused')
    def protect(self):self.protected=self.weights
    def restore(self):self.weights=self.protected;self.restores+=1
    def train(self,skill):self.weights+=1;self.job=dict(status='running',id='job-'+skill);return {'job':self.job}
    def finish(self,complete=0):
        self.world.update(active=False,phase='finished',results={f'LabAI{i}':dict(state='complete' if i<complete else 'stopped',milestones=['hut'] if i<complete else [],health=20,seconds=100,lesson_total=1) for i in range(2)})
    def hooks(self):return dict(begin=self.begin,stop_world=self.stop,counts=lambda:self.counts.copy(),protect=self.protect,restore=self.restore,train=self.train,job=lambda:self.job,ready=lambda:self.ready,world=lambda:self.world,cancel=lambda:None,review=self.reviews.append,switch=self.switched.append)


def fixture(tmp_path):
    lab=Lab();clock=[100];manager=WorldLearning(tmp_path/'learn.json',lab.hooks(),lambda:clock[0]);manager.start(dict(scenario=0,size=128,mission='settlement',prepared=True,auto_progress=True));return manager,lab,clock


def reach_candidate(m,lab):
    m.tick();lab.finish(0);m.tick();assert m.state['phase']=='demonstrating'
    lab.counts.update(expedition=100,gathering=80);lab.finish(2);m.tick();assert m.state['phase']=='training' and m.state['restore_pending']
    lab.job['status']='completed';m.tick();lab.job['status']='completed';m.tick();assert m.state['phase']=='evaluating'


def test_trial_start_clock_is_recorded_and_mismatched_conditions_cannot_promote_a_model():
    baseline=measured_trial(dict(bots=['LabAI0'],results={},start_time_of_day=0))
    assert baseline['start_time_of_day']==0
    candidate={**baseline,'completed':1,'progress':1.,'start_time_of_day':13000}
    accepted,reason=select_world(baseline,candidate)
    assert not accepted and 'start time changed' in reason
    assert select_world(baseline,{**candidate,'start_time_of_day':0})[0]


def test_replay_is_captured_after_baseline_before_teacher_can_overwrite_it(tmp_path):
    m,lab,clock=fixture(tmp_path);m.tick();seen=[]
    def capture():
        seen.append((m.state['phase'],lab.world['driver']))
        return {'expedition':{'cycle':m.state['round'],'samples':15000}}
    m.h['snapshot_replay']=capture
    lab.finish(2);m.tick()
    assert seen==[('baseline','student')]
    assert m.state['phase']=='demonstrating' and m.state['replay_reference']['expedition']['samples']==15000


def test_behavior_changes_wait_until_next_cycle_and_revision_guards_selection(tmp_path):
    m,lab,clock=fixture(tmp_path);revision={'revision':'first','config':{'global':{},'bots':{},'version':1}}
    m.h['behavior']=lambda:revision
    m.tick();assert lab.runs[0]['behavior_snapshot']['revision']=='first'
    revision['revision']='second';lab.finish(0);m.tick()
    assert lab.runs[1]['behavior_snapshot']['revision']=='first'
    lab.counts.update(expedition=100,gathering=80);lab.finish(2);m.tick()
    lab.job['status']='completed';m.tick();lab.job['status']='completed';m.tick()
    assert lab.runs[2]['behavior_snapshot']['revision']=='first'
    lab.finish(2);m.tick();clock[0]+=11;m.tick();m.tick()
    assert lab.runs[-1]['behavior_snapshot']['revision']=='second'
    before=measured_trial(dict(bots=['LabAI0'],results={},behavior_snapshot={'revision':'first'}))
    after={**before,'behavior_revision':'second'}
    accepted,reason=select_world(before,after)
    assert not accepted and 'Behavior settings changed' in reason


def test_full_loop_uses_distinct_teacher_layout_and_paired_student_layout_and_accepts(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab)
    assert [r['driver'] for r in lab.runs]==['student','teacher','student']
    assert lab.runs[0]['layout']==lab.runs[2]['layout']!=lab.runs[1]['layout']
    lab.finish(2);m.tick();assert m.state['history'][-1]['accepted'] and not m.state['restore_pending'] and lab.restores==0
    clock[0]+=11;m.tick();m.tick();assert m.state['phase']=='baseline' and m.state['round']==2


def test_earlier_replay_regression_rejects_even_a_better_world_candidate(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab)
    m.state['training_results']=[{'replay_guard_passed':False}]
    lab.finish(2);m.tick()
    assert not m.state['history'][-1]['accepted'] and lab.restores==1
    assert 'Earlier replay' in m.state['history'][-1]['reason']


def test_stop_waits_for_saving_then_restores_before_switching_modes(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab)
    lab.job['status']='running';m.stop({'mode':'basics'});m.tick();assert not lab.switched and not lab.restores
    lab.job['status']='completed';m.tick();assert lab.restores==1 and lab.weights==1 and lab.switched==[{'mode':'basics'}]


def test_restart_restores_unvalidated_bundle_before_starting_another_test(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab)
    recovered=WorldLearning(m.path,lab.hooks(),lambda:clock[0]);assert recovered.state['phase']=='recovering'
    recovered.tick();assert lab.restores==1 and recovered.state['phase']=='waiting'
    recovered.suspend('memory');assert recovered.state['recovery_cause']=='memory' and '84%' in recovered.state['message']
    recovered.suspend();assert recovered.state['recovery_cause']=='server' and 'Minecraft' in recovered.state['message']


def test_memory_preparation_resumes_same_candidate_without_restoring_weights(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab)
    run=m.state['run'];round=m.state['round'];weights=lab.weights
    m.h['hold_preparation']=lambda requested:requested==run
    resumed=[];m.h['resume_preparation']=lambda requested:resumed.append(requested) or True
    assert m.suspend('memory')
    lab.ready=False;m.tick();assert not resumed and m.state['phase']=='recovering'
    lab.ready=True;m.tick()
    assert resumed==[run] and m.state['phase']=='evaluating'
    assert m.state['run']==run and m.state['round']==round
    assert lab.weights==weights and lab.restores==0 and m.state['restore_pending']
    lab.finish(0);m.tick();assert lab.restores==1


def test_server_restart_or_lost_preparation_discards_memory_continuation(tmp_path):
    for server_restart in (False,True):
        root=tmp_path/str(server_restart);root.mkdir()
        m,lab,clock=fixture(root);reach_candidate(m,lab)
        m.h['hold_preparation']=lambda run:True
        m.h['resume_preparation']=lambda run:False
        assert m.suspend('memory')
        if server_restart:m.suspend('server')
        m.tick();assert m.state['phase']=='waiting' and lab.restores==1


def test_service_restart_never_uses_persisted_memory_continuation(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab)
    m.h['hold_preparation']=lambda run:True
    m.h['resume_preparation']=lambda run:True
    m.suspend('memory')
    recovered=WorldLearning(m.path,lab.hooks(),lambda:clock[0])
    recovered.tick();assert lab.restores==1 and recovered.state['phase']=='waiting'


def test_user_stop_during_memory_hold_never_resumes_trial(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab)
    m.h['hold_preparation']=lambda run:True
    resumed=[];m.h['resume_preparation']=lambda run:resumed.append(run) or True
    m.suspend('memory');m.stop();m.tick();m.tick()
    assert not resumed and not m.state['enabled'] and m.state['phase']=='paused'
    assert lab.restores==1 and not lab.world['active']


def test_failed_training_and_absent_fresh_examples_never_replace_champion(tmp_path):
    m,lab,clock=fixture(tmp_path);m.tick();lab.finish(0);m.tick();lab.finish(0);m.tick()
    assert m.state['phase']=='cooldown' and lab.weights==1
    clock[0]+=11;m.tick();m.tick();lab.finish(0);m.tick();lab.counts['expedition']+=100;lab.finish(1);m.tick()
    lab.job.update(status='failed',error='test failure');
    try:m.tick()
    except RuntimeError as error:m.fail(error)
    m.tick();assert m.state['phase']=='paused' and lab.weights==1


def test_success_and_health_outweigh_speed_and_zero_progress_does_not_win():
    baseline=dict(bots=8,completed=4,unsafe=0,progress=.5,median_seconds=100)
    assert not select_world(baseline,{**baseline,'completed':3,'median_seconds':1})[0]
    assert not select_world(baseline,{**baseline,'completed':5,'unsafe':1})[0]
    assert select_world(baseline,{**baseline,'completed':5,'median_seconds':1000})[0]
    assert not select_world({**baseline,'completed':0,'progress':0},{**baseline,'completed':0,'progress':0})[0]


def test_sustained_student_success_advances_the_mission(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab);m.state['streak']=1;lab.finish(2);m.tick()
    assert m.state['options']['mission']=='stone_age'


def test_survival_tiers_unlock_only_after_reliable_student_cycles(tmp_path):
    for current,expected in [('stone_age','iron_age'),('iron_age','homestead'),('homestead','home_defense')]:
        root=tmp_path/current;root.mkdir();m,lab,clock=fixture(root)
        m.state['options']['mission']=current;reach_candidate(m,lab);m.state['streak']=1;lab.finish(2);m.tick()
        assert m.state['options']['mission']==expected
    root=tmp_path/'not_ready';root.mkdir();m,lab,clock=fixture(root)
    m.state['options']['mission']='stone_age';reach_candidate(m,lab);lab.finish(1);m.tick()
    assert m.state['options']['mission']=='stone_age'


def test_world_combat_demonstrations_join_protected_training_bundle(tmp_path):
    m,lab,clock=fixture(tmp_path);m.tick();lab.finish(0);m.tick()
    lab.counts['combat']=50;lab.finish(2);m.tick()
    assert m.state['training_skill']=='combat' and m.state['restore_pending']
    lab.job['status']='completed';m.tick();assert m.state['phase']=='evaluating'
    lab.finish(0);m.tick();assert lab.restores==1 and not m.state['restore_pending']


def survey_failure(lab):
    lab.finish(0)
    for row in lab.world['results'].values():row.update(failure_category='site_unavailable',message='survey: No safe natural spawn found. Try another site.')

def test_unusable_survey_site_is_skipped_without_training_or_scoring(tmp_path):
    m,lab,clock=fixture(tmp_path);m.state['options'].update(mission='first_night',night_level=1,scenario=8)
    m.tick();survey_failure(lab);m.tick()
    assert m.state['phase']=='cooldown' and m.state['options']['scenario']==0 and m.state['options']['night_level']==1
    assert lab.job['status']=='idle' and not lab.reviews and not m.state['history']
    clock[0]+=11;m.tick();m.tick();assert lab.runs[-1]['scenario']==0

def test_unusable_candidate_restores_protected_weights_before_changing_sites(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab);survey_failure(lab);m.tick()
    assert lab.restores==1 and lab.weights==lab.protected and m.state['restore_pending'] is False
    assert not lab.reviews and m.state['phase']=='cooldown'

def test_real_skill_failures_and_partial_survey_failures_are_not_skipped(tmp_path):
    m,lab,clock=fixture(tmp_path);m.tick();survey_failure(lab)
    lab.world['results']['LabAI0'].update(failure_category='stalled',message='gather: Could not reach wood')
    m.tick();assert m.state['phase']=='demonstrating'

def test_all_nine_unusable_training_sites_stop_without_visiting_held_out_sites(tmp_path):
    m,lab,clock=fixture(tmp_path);m.state['options'].update(mission='first_night',night_level=1,scenario=8)
    m.state['unusable_sites']={'first_night-1-128':list(range(8))};m.tick();survey_failure(lab)
    import pytest
    with pytest.raises(RuntimeError,match='No usable dry spawn'):m.tick()
    assert not lab.reviews and lab.weights==1


def test_transport_failure_retries_same_site_without_promoting_or_rejecting_weights(tmp_path):
    m,lab,clock=fixture(tmp_path);reach_candidate(m,lab);lab.finish(1)
    lab.world['results']['LabAI1']['failure_category']='infrastructure';m.tick()
    assert m.state['phase']=='cooldown' and lab.restores==1 and lab.weights==lab.protected
    assert not lab.reviews and not m.state['history'] and m.state['options']['scenario']==0


def test_three_transport_failed_comparisons_stop_instead_of_looping_forever(tmp_path):
    m,lab,clock=fixture(tmp_path);m.tick();lab.finish(0)
    lab.world['results']['LabAI0']['failure_category']='infrastructure';m.state['infrastructure_failures']=2
    import pytest
    with pytest.raises(RuntimeError,match='three comparisons'):m.tick()
    assert not lab.reviews


def test_setup_death_and_failed_plot_survey_skip_site_together_without_scoring(tmp_path):
    from test_world_training import fixture as world_fixture
    m,lab,clock=fixture(tmp_path);m.state['options'].update(mission='first_night',night_level=3,scenario=3)
    m.tick();run=lab.world['run']
    world,commands,timer,log=world_fixture(tmp_path);world.start({},['LabAI0','LabAI1'])
    world.session.update(run=run,phase='running')
    world.record_death('LabAI0',run)
    world.report('LabAI1',dict(run=run,state='stopped',phase='stopped',failure_category='site_unavailable',message='survey: No separate flat 7 x 7 build site'))
    lab.world=world.session;m.tick()
    assert m.state['phase']=='cooldown' and m.state['options']['scenario']==4
    assert m.state['options']['night_level']==3
    assert not lab.reviews and not m.state['history'] and lab.job['status']=='idle'
