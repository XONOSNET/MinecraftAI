import copy
import io
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from scripts import pilot_fixture_host as fixture


@pytest.fixture
def health(monkeypatch):
    sample = dict(server=dict(pid=123, ready=True, busy=False, desired_running=True,
                              error=None, bots_online=8), stopped=False, ram_percent=82,
                  performance=dict(persistence=dict(error=None, pending=0)),
                  world_training=dict(session=dict(phase='running')))
    monkeypatch.setattr(fixture.urllib.request, 'urlopen',
                        lambda *args, **kwargs: io.BytesIO(json.dumps(sample).encode()))
    monkeypatch.setattr(fixture.psutil, 'virtual_memory', lambda: SimpleNamespace(available=6*2**30))
    return sample


def test_capacity_is_separate_initial_and_ongoing_budget(health):
    health['ram_percent'] = 83.9
    assert fixture.production_health(initial=True)['server']['pid'] == 123
    health['ram_percent'] = 84
    with pytest.raises(RuntimeError, match='memory veto'):
        fixture.production_health(initial=True)
    assert fixture.production_health()['ram_percent'] == 84
    health['ram_percent'] = 89
    with pytest.raises(RuntimeError, match='memory veto'):
        fixture.production_health()


def test_five_gib_available_required_even_when_percentage_passes(health, monkeypatch):
    monkeypatch.setattr(fixture.psutil, 'virtual_memory', lambda: SimpleNamespace(available=5*2**30-1))
    with pytest.raises(RuntimeError, match='Five GiB'):
        fixture.production_health(initial=True)


@pytest.mark.parametrize('field,value', [('ready', False), ('busy', True),
                                       ('desired_running', False), ('bots_online', 7),
                                       ('error', 'save failed')])
def test_production_lifecycle_vetoes_private_fixture(health, field, value):
    health['server'][field] = value
    with pytest.raises(RuntimeError, match='lifecycle veto'):
        fixture.production_health()


@pytest.mark.parametrize('phase', ['restoring', 'snapshotting'])
def test_fixture_yields_compute_to_terrain_restoration(health, phase):
    health['world_training']['session']['phase'] = phase
    with pytest.raises(RuntimeError, match='compute window'):
        fixture.production_health()


def test_changed_paper_and_intentional_stop_are_respected(health):
    with pytest.raises(RuntimeError, match='identity changed'):
        fixture.production_health(expected_pid=999)
    health['stopped'] = True
    with pytest.raises(RuntimeError, match='lifecycle veto'):
        fixture.production_health()


def test_disposable_host_never_dispatches_continuing_world_commands(tmp_path):
    host = fixture.Host(tmp_path/'report.json', 60)
    called = []
    host.broker = SimpleNamespace(request=lambda payload: called.append(copy.deepcopy(payload)))
    with pytest.raises(HTTPException) as error:
        host.control(dict(action='create', world='lab_persistent_pilot'))
    assert error.value.status_code == 400
    assert called == []
    host.control(dict(action='create', world='lab_pilot_fixture_test'))
    assert host.loaded == {'lab_pilot_fixture_test'}
    host.control(dict(action='unload', world='lab_pilot_fixture_test'))
    assert host.loaded == set()


def test_hard_deadline_closes_only_private_job_and_signals_shutdown(tmp_path):
    host = fixture.Host(tmp_path/'report.json', 60)
    closed = []
    host.job = SimpleNamespace(close=lambda: closed.append(True))
    host.http = SimpleNamespace(should_exit=False)
    host.hard_deadline()
    assert closed == [True]
    assert host.stop_event.is_set()
    assert host.http.should_exit is True
