import torch
from lab.brain import BrainView
from lab.model import Policy


def test_viewer_uses_the_actual_forward_pass_without_changing_actions_or_weights():
    now=[100.0];view=BrainView(lambda:now[0]);policy=Policy(inputs=82,actions=7)
    obs=torch.linspace(-1,1,82);before={k:v.clone() for k,v in policy.state_dict().items()}
    with torch.no_grad():
        expected=policy(obs)
        assert view.request('LabAI0') is None
        actual=view.infer(policy,obs,agent='LabAI0',skill='expedition',run='test',mode='teacher')
    assert torch.equal(actual,expected)
    view.applied('LabAI0',4);frame=view.request('LabAI0')
    assert frame['returned_action']==4
    assert frame['policy_action']==int(expected.argmax())
    assert frame['hidden']==torch.tanh(policy.net[0](obs)).tolist()
    assert len(frame['inputs'])==82 and len(frame['hidden'])==128 and len(frame['scores'])==7
    for layer,source,target,weight in frame['edges']:
        assert weight==float(policy.net[layer*2].weight[target,source].detach())
    assert len(frame['edges'])==128*3+7*8
    for k,v in policy.state_dict().items():assert torch.equal(v,before[k])


def test_telemetry_is_demand_driven_throttled_and_expires():
    now=[100.0];view=BrainView(lambda:now[0]);policy=Policy();obs=torch.zeros(70)
    args=dict(agent='LabAI0',skill='navigation',run='test',mode='evaluate')
    with torch.no_grad():
        view.infer(policy,obs,**args)
        assert not view.frames
        view.request('LabAI0');view.infer(policy,obs,**args);view.applied('LabAI0',1)
        now[0]+=.1;view.infer(policy,obs+1,**args);view.applied('LabAI0',2)
        assert view.frames['LabAI0']['at']==100 and view.frames['LabAI0']['returned_action']==1
        now[0]+=.5;view.infer(policy,obs+1,**args);view.applied('LabAI0',2)
        assert view.frames['LabAI0']['inputs']==(obs+1).tolist()
        now[0]+=6;assert not view.wanted('LabAI0')
        view.infer(policy,obs,**args);assert view.frames['LabAI0']['at']==100.6
    assert view.request('LabAI1') is None
    assert 'LabAI0' not in view.watch


def test_snapshots_are_copies_and_separate_bots_do_not_share_activations():
    view=BrainView();policy=Policy();view.request('LabAI0');view.request('LabAI1')
    with torch.no_grad():
        for n,value in [('LabAI0',0),('LabAI1',1)]:
            view.infer(policy,torch.full((70,),float(value)),agent=n,skill='navigation',run='r',mode='evaluate')
    frame=view.request('LabAI0');frame['inputs'][0]=99
    assert view.request('LabAI0')['inputs'][0]==0
    assert view.request('LabAI1')['inputs'][0]==1
