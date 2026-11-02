import importlib.util


def loader():
    spec=importlib.util.spec_from_file_location('deferred_rollout','scripts/deploy_controller_after_comparison.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def test_rollout_requires_completed_same_comparison_and_no_active_attempt():
    ready=loader().ready
    s={'world_learning':{'enabled':True,'restore_pending':False,'phase':'baseline','history':[{'candidate':{'run':'expected'}}]},'world_training':{'session':{'phase':'restoring'}}}
    assert ready(s,'expected')
    assert not ready(s,'other')
    s['world_training']['session']['phase']='running';assert not ready(s,'expected')
    s['world_training']['session']['phase']='restoring';s['world_learning']['enabled']=False;assert not ready(s,'expected')
    s['world_learning']['enabled']=True;s['world_learning']['restore_pending']=True;assert not ready(s,'expected')
    s['world_learning']['restore_pending']=False;s['world_learning']['phase']='evaluating';assert not ready(s,'expected')


def test_round_rollout_waits_for_the_completed_comparison_and_never_restarts_live_attempts():
    ready=loader().ready
    s={'world_learning':{'enabled':True,'restore_pending':False,'phase':'baseline','history':[{'round':197}]},'world_training':{'session':{'phase':'restoring'}}}
    assert ready(s,'round:197')
    assert not ready(s,'round:198')
    s['world_training']['session']['phase']='running';assert not ready(s,'round:197')
    s['world_training']['session']['phase']='restoring';s['world_learning']['enabled']=False;assert not ready(s,'round:197')


def test_rollout_detects_source_edits_without_tracking_models_or_runtime_data(tmp_path):
    module=loader();module.ROOT=tmp_path
    (tmp_path/'controller').mkdir();(tmp_path/'config').mkdir();(tmp_path/'data').mkdir()
    source=tmp_path/'controller/index.js';source.write_text('version one')
    before=module.source_digest()
    (tmp_path/'data/private-model').write_text('runtime only');assert module.source_digest()==before
    source.write_text('version two');assert module.source_digest()!=before
