import threading
import pytest
from lab.jobs import TrainingJobs, TrainingCancelled


def test_progress_is_readable_while_training_and_duplicate_jobs_are_rejected():
    jobs=TrainingJobs();ready=threading.Event();release=threading.Event()
    def work(progress,cancel):
        progress(phase='learning',epoch=25,epochs=100,percent=25)
        ready.set()
        assert release.wait(3)
        return {'version':'test-checkpoint'}
    jobs.start(work,samples=3000)
    try:
        assert ready.wait(3)
        state=jobs.snapshot()
        assert state['status']=='running'
        assert state['percent']==25 and state['samples']==3000
        with pytest.raises(RuntimeError):jobs.start(work)
    finally:release.set()
    assert jobs.wait()['result']=={'version':'test-checkpoint'}
    assert jobs.snapshot()['status']=='completed'
    assert jobs.snapshot()['percent']==100


def test_cancel_and_failure_are_reported_and_allow_another_run():
    jobs=TrainingJobs();ready=threading.Event()
    def cancel_work(progress,cancel):
        ready.set()
        assert cancel.wait(3)
        jobs.begin_saving()
    jobs.start(cancel_work)
    assert ready.wait(3) and jobs.cancel()
    assert jobs.wait()['status']=='cancelled'
    def failing_work(progress,cancel):raise OSError('Checkpoint disk is unavailable')
    jobs.start(failing_work)
    result=jobs.wait()
    assert result['status']=='failed'
    assert result['error']=='Checkpoint disk is unavailable'
    assert not jobs.running


def test_saving_checkpoint_cannot_be_cancelled_halfway():
    jobs=TrainingJobs();ready=threading.Event();release=threading.Event()
    def work(progress,cancel):
        progress(phase='saving',percent=97);ready.set()
        assert release.wait(3)
        assert not cancel.is_set()
        return {'saved':True}
    jobs.start(work)
    try:
        assert ready.wait(3)
        assert jobs.cancel() is False
    finally:release.set()
    assert jobs.wait()['status']=='completed'
