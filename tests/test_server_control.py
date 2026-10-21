import threading
from lab.server_control import ServerControl


def test_stop_stays_stopped_and_restart_keeps_status_available():
    state={'alive':True,'ready':True,'saves':0,'stops':0,'starts':0}
    gate=threading.Event();started=threading.Event()
    def prepare():state['saves']+=1
    def stop():
        started.set();assert gate.wait(3)
        state.update(alive=False,ready=False);state['stops']+=1
    def launch():state.update(alive=True,ready=True);state['starts']+=1
    controller=ServerControl(launch,stop,prepare,lambda:state['alive'],lambda:state['ready'])
    controller.request('stop')
    try:
        assert started.wait(3)
        current=controller.snapshot()
        assert current['busy'] and current['phase']=='stopping'
        assert current['desired_running'] is False
        try:controller.request('restart');assert False,'Concurrent restart was accepted'
        except RuntimeError:pass
    finally:gate.set()
    result=controller.wait(3)
    assert result['phase']=='stopped' and not result['alive']
    assert not result['desired_running']
    controller.request('start');result=controller.wait(3)
    assert result['ready'] and state['starts']==1
    controller.request('restart');result=controller.wait(3)
    assert result['ready'] and state['starts']==2 and state['stops']==2
    assert state['saves']==3


def test_failed_start_is_visible_and_a_later_start_can_recover():
    state={'alive':False,'fail':True}
    def launch():
        if state['fail']:raise OSError('Port is occupied')
        state['alive']=True
    controller=ServerControl(launch,lambda:None,lambda:None,lambda:state['alive'],lambda:state['alive'])
    controller.request('start');result=controller.wait(3)
    assert result['phase']=='failed' and 'Port is occupied' in result['error']
    state['fail']=False
    controller.request('start');result=controller.wait(3)
    assert result['phase']=='online' and result['ready'] and not result['error']
