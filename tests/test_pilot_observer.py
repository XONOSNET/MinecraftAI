import json

import pytest

from scripts import observe_persistent_pilot as observer


def status(*, ticks=0, enabled=True, world='world-a'):
    return dict(identity='HomeAI01', world_name='lab_persistent_pilot',
                world_uuid=world, enabled=enabled, connected=True,
                state=dict(demo=dict(active_ticks=ticks), metrics={}))


def configure(monkeypatch, tmp_path, samples):
    monkeypatch.setattr(observer, 'ROOT', tmp_path)
    monkeypatch.setattr(observer.time, 'sleep', lambda _: None)
    stream = iter(samples)
    def read(url):
        assert url == 'http://127.0.0.1:8100/status'
        item = next(stream)
        if isinstance(item, Exception):
            raise item
        return item
    monkeypatch.setattr(observer, 'fetch', read)
    return tmp_path/'logs'/'observation'


def test_seven_days_requires_connected_tick_evidence(monkeypatch, tmp_path):
    output = configure(monkeypatch, tmp_path, [status(ticks=168000)])
    report = observer.observe(output, hours=.001, interval=5)
    assert report['complete'] is True
    assert report['actual_active_days'] == 7
    assert report['world_uuid'] == 'world-a'
    assert report['human_interventions'] == 0


def test_operator_pause_stops_observer_without_changing_the_pilot(monkeypatch, tmp_path):
    output = configure(monkeypatch, tmp_path, [status(ticks=1200, enabled=False)])
    report = observer.observe(output, hours=.001, interval=5)
    assert report['complete'] is False
    assert report['samples'] == 1
    assert 'intentionally paused' in report['stop_reason']


def test_new_world_is_not_stitched_into_same_demonstration(monkeypatch, tmp_path):
    output = configure(monkeypatch, tmp_path, [status(ticks=10000), status(ticks=168000, world='world-b')])
    with pytest.raises(RuntimeError, match='UUID changed'):
        observer.observe(output, hours=.001, interval=5)
    report = json.loads((output/'report.json').read_text())
    assert report['complete'] is False
    assert report['world_uuid'] == 'world-a'
    assert 'UUID changed' in report['error']


def test_transient_read_failure_is_counted_and_never_triggers_rescue(monkeypatch, tmp_path):
    output = configure(monkeypatch, tmp_path, [OSError('temporary timeout'), status(enabled=False)])
    report = observer.observe(output, hours=.001, interval=5)
    assert report['request_failures'] == 1
    assert report['samples'] == 1
    assert report['complete'] is False
