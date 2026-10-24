from lab.curriculum import Curriculum, STAGES

class World:
    def __init__(self):
        self.time=0;self.count=0;self.model=1;self.champion=1;self.problem=None
        self.job={'status':'idle'};self.score=15;self.restores=0
    def protect(self):self.champion=self.model
    def restore(self):self.model=self.champion;self.restores+=1
    def train(self):self.model+=1;self.job={'status':'running'}
    def hooks(self):
        return {'pause':lambda:None,'cancel':lambda:None,'job':lambda:self.job,
                'mode':lambda *args:None,'protect':self.protect,'restore':self.restore,
                'results':lambda run:{'episodes':15,'successes':self.score},'count':lambda:self.count,
                'train':self.train,'health':lambda:self.problem,'event':lambda result:None}

def cycle(c,w,before=15,after=15):
    c.tick();assert c.state['phase']=='baseline'
    w.score=before;c.tick();assert c.state['phase']=='collecting'
    w.count+=1500;c.tick();assert c.state['phase']=='training'
    w.job={'status':'completed'};c.tick();assert c.state['phase']=='evaluating'
    w.score=after;c.tick()

def test_promotes_only_after_two_passing_comparisons(tmp_path):
    w=World();c=Curriculum(tmp_path/'state.json',w.hooks(),lambda:w.time);c.start()
    cycle(c,w,12,14);assert c.state['stage']==0 and c.state['streak']==1
    cycle(c,w,13,14);assert c.state['stage']==0 and c.state['streak']==1
    c.tick();w.score=14;c.tick();assert c.state['stage']==1 and c.state['streak']==0
    assert w.restores==0 and len(c.state['history'])==3

def test_regression_restores_champion_and_training_is_not_restored_early(tmp_path):
    w=World();c=Curriculum(tmp_path/'state.json',w.hooks(),lambda:w.time);c.start()
    cycle(c,w,13,10)
    assert w.model==1 and w.restores==1 and not c.state['history'][-1]['accepted']

def test_pause_waits_for_training_before_restore_and_restart_recovers(tmp_path):
    w=World();w.score=10;path=tmp_path/'state.json';c=Curriculum(path,w.hooks(),lambda:w.time);c.start()
    c.tick();c.tick();w.count=1500;c.tick();assert w.model==2
    c.pause();c.tick();assert w.model==2
    w.job={'status':'cancelled'};c.tick();assert w.model==1 and not c.state['restore_pending']
    c.start();c.tick();c.tick();w.count+=1500;c.tick();w.job={'status':'completed'}
    recovered=Curriculum(path,w.hooks(),lambda:w.time);recovered.tick()
    assert w.model==1 and recovered.state['phase']=='baseline'

def test_resource_failure_and_time_budget_pause(tmp_path):
    w=World();c=Curriculum(tmp_path/'state.json',w.hooks(),lambda:w.time);c.start();c.tick()
    w.problem='Low memory';c.tick();assert not c.state['enabled']
    w.problem=None;c.start();c.state['continuous']=False;w.time=6*3600+1;c.tick();assert not c.state['enabled']

def test_curriculum_completes_and_does_not_repeat_forever(tmp_path):
    w=World();c=Curriculum(tmp_path/'state.json',w.hooks(),lambda:w.time);c.start()
    c.state['max_cycles']=len(STAGES)*2+1;c.state['continuous']=False
    for _ in range(len(STAGES)*2):
        c.tick();w.score=15;c.tick()
    assert c.state['phase']=='completed' and not c.state['enabled'] and c.state['stage']==len(STAGES)-1


def test_routes_stay_inside_courses_are_reproducible_and_difficulty_increases():
    import math
    from lab.curriculum import sample_route, STAGES
    for level,stage in enumerate(STAGES[:4]):
        for seed in range(100):
            start,goal,yaw=sample_route(level,seed,80)
            assert (start,goal,yaw)==sample_route(level,seed,80)
            distance=math.hypot(goal[0]-start[0],goal[2]-start[2])
            assert stage['min_distance']-1e-8<=distance<=stage['max_distance']+1e-8
            assert all(abs(p[0]-80)<17 and abs(p[2])<17 for p in (start,goal))
    assert sample_route(0,1,80)!=sample_route(0,500001,80)


def test_train_and_test_seed_namespaces_stay_separate_across_cycles():
    from lab.curriculum import route_seed
    train={route_seed(cycle,agent,episode,False) for cycle in range(12) for agent in range(5) for episode in range(100)}
    test={route_seed(cycle,agent,episode,True) for cycle in range(12) for agent in range(5) for episode in range(3)}
    assert not train.intersection(test)
    assert route_seed(1,0,0,True)==route_seed(1,0,0,True)


def test_waits_for_arena_preparation_before_creating_a_test_run(tmp_path):
    w=World();hooks=w.hooks();hooks['prepare']=lambda:False
    c=Curriculum(tmp_path/'state.json',hooks,lambda:w.time);c.start();c.tick()
    assert c.state['phase']=='waiting' and 'seed' not in c.state
    hooks['prepare']=lambda:True;c.tick();assert c.state['phase']=='baseline'


def test_passing_saved_model_advances_on_two_distinct_fresh_seeds_without_training(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start();c.state['stage']=24
    c.tick();seed1=c.state['seed'];c.tick()
    assert c.state['stage']==24 and c.state['streak']==1 and w.model==1 and w.count==0
    c.tick();seed2=c.state['seed'];c.tick()
    assert seed1!=seed2 and c.state['stage']==25 and w.model==1 and w.job['status']=='idle'
    assert all(r['kind']=='saved_model_validation' for r in c.state['history'])


def test_saved_validation_failure_resets_streak_and_collects_examples(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start()
    c.tick();c.tick();assert c.state['streak']==1
    c.tick();w.score=10;c.tick()
    assert c.state['streak']==0 and c.state['phase']=='collecting'


def test_three_variable_rejected_candidates_stop_instead_of_repeating(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start();c.state['continuous']=False
    for score in (2,11,6):cycle(c,w,13,score)
    assert not c.state['enabled'] and w.model==1 and w.restores==3
    assert 'No useful model progress' in c.state['message']


def test_continuous_curriculum_reviews_after_last_stage_and_renews_session(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start()
    c.state.update(stage=len(STAGES)-1,streak=1)
    c.tick();c.tick()
    assert c.state['enabled'] and c.state['stage']==0 and c.state['round']==1
    w.time=6*3600+1;c.tick();assert c.state['enabled']


def test_old_completed_catalogue_unlocks_twenty_new_stages(tmp_path):
    import json
    path=tmp_path/'state';path.write_text(json.dumps({'catalog_version':4,'phase':'completed','stage':39,'enabled':False}))
    c=Curriculum(path,World().hooks())
    assert len(STAGES)==150 and c.state['stage']==0 and c.state['phase']=='paused'


def test_continuous_plateau_recovers_without_discarding_champion(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start();c.state['stage']=42
    for score in (2,7,3):cycle(c,w,10,score)
    assert c.state['enabled'] and c.state['stage']==41 and c.state['learning_rate_scales']['42']==.5
    assert w.model==1 and w.restores==3


def test_completed_sixty_stage_catalogue_continues_at_new_challenges(tmp_path):
    import json
    path=tmp_path/'state';path.write_text(json.dumps({'catalog_version':5,'phase':'completed','stage':59,'enabled':False,'history':[{'stage':59,'score':1}]}))
    c=Curriculum(path,{})
    assert len(STAGES)==150 and c.state['stage']==0 and c.state['phase']=='paused'
    assert c.state['catalog_version']==11 and c.state['history'][0]['score']==1
    assert STAGES[c.state['history'][0]['stage']]['name']=='Advanced bridge door gauntlet'


def test_reorder_preserves_course_identity_history_and_rate_scales(tmp_path):
    import json
    path=tmp_path/'state';path.write_text(json.dumps({'catalog_version':6,'stage':36,'enabled':True,'streak':1,'learning_rate_scales':{'36':.5},'history':[{'stage':36,'score':.9,'accepted':True}]}))
    c=Curriculum(path,{})
    assert not c.state['enabled'] and c.state['stage']==0 and c.state['phase']=='paused'
    row=c.state['history'][0];assert STAGES[row['stage']]['name']=='Navigate a boulder slalom'
    assert row['legacy_stage']==37 and c.state['learning_rate_scales'][str(row['stage'])]==.5
    c.state['stage']=12;c.save();assert Curriculum(path,{}).state['stage']==12
    assert len({s['id'] for s in STAGES})==150
    assert [s['tier'] for s in STAGES]==sorted(s['tier'] for s in STAGES)
    names=[s['name'] for s in STAGES]
    assert names.index('Cross slowing soul sand')<names.index('Two doors and a narrow bridge')
    assert names.index('Open a wooden door')<names.index('Three alternating wooden doors')
    assert names.index('Wide bridge over water')<names.index('Cross a slippery ice bridge')

def test_temporary_health_pressure_recovers_automatically_without_overriding_manual_pause(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start();c.tick()
    w.problem='System memory is above 88%.';c.tick()
    assert c.state['enabled'] and c.state['phase']=='health_wait'
    w.time=300;c.tick();assert c.state['enabled']
    w.problem=None;c.tick();w.time+=29;c.tick();assert c.state['phase']=='health_wait'
    w.time+=1;c.tick();assert c.state['phase']=='recovering'
    c.tick();assert c.state['phase']=='baseline'
    w.problem='Waiting for all 8 bots to connect.';c.tick();assert c.state['phase']=='health_wait'
    c.pause();w.problem=None;w.time+=100;c.tick();assert not c.state['enabled']


def test_recovery_waits_for_cancelled_training_to_restore_the_champion(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start();cycle_start=c.state['stage']
    c.state.update(phase='training',restore_pending=True);w.job={'status':'running'};w.model=2
    c.hold('System memory is above 88%.');c.tick();assert w.restores==0
    w.job={'status':'cancelled'};c.tick();assert w.restores==1 and w.model==w.champion
    assert c.state['stage']==cycle_start and c.state['enabled']


def test_critical_disk_failure_still_requires_attention(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start();c.tick()
    w.problem='Less than 2 GiB of disk space remains.';c.tick();assert not c.state['enabled']

def test_overnight_reviews_and_session_renewals_keep_running(tmp_path):
    w=World();c=Curriculum(tmp_path/'state',w.hooks(),lambda:w.time);c.start()
    for _ in range(300):
        c.tick();assert c.state['phase']=='baseline'
        c.tick();w.time+=240
    assert w.time==20*3600 and c.state['enabled'] and c.state['round']==1
    assert c.state['cycle']==300 and len(c.state['history'])<=100
    assert w.time-c.state['started_at']<6*3600
