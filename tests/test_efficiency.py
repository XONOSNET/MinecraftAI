from lab.efficiency import compare_candidate,completion_timing


def timing(seconds):return completion_timing([seconds]*4,4)


def test_speed_never_outweighs_success_and_missing_timing_is_not_a_loss():
    assert not compare_candidate(.8,.7,timing(1),timing(100))[0]
    assert compare_candidate(.7,.8,timing(100),timing(1))[0]
    assert not compare_candidate(.8,.8,timing(20),timing(10))[0]
    assert compare_candidate(.8,.8,timing(10),timing(20))[0]
    assert compare_candidate(.8,.8,{},timing(10))[0]
    assert completion_timing([10,None,float('nan')],3)['median_success_seconds'] is None
    before={**timing(10),'successful_case_seconds':{'LabAI0:1':10}}
    after={**timing(20),'successful_case_seconds':{'LabAI1:1':20}}
    assert compare_candidate(.8,.8,after,before)[0]
