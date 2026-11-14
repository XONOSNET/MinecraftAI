import asyncio
import json
from types import SimpleNamespace

from fastapi import FastAPI
import pytest

from lab.fixture_health import HOST, PATH, PROTOCOL, fixture_health, fixture_health_router
from lab.server_control import ServerControl


def fixture_sources(**overrides):
    process = SimpleNamespace(pid=816, poll=lambda: None)
    sources = dict(
        process=lambda: process,
        ready_seen=lambda: True,
        lifecycle=lambda: dict(phase='online', busy=False, desired_running=True, error=None),
        agents=lambda: [{'last_seen': 93, 'connected': True}] * 7 + [
            {'last_seen': 93}, {'last_seen': 92}, {'last_seen': 100, 'connected': False}],
        memory=lambda: 79.3,
        persistence=lambda: dict(pending=3, capacity=2048, error=None),
        world=lambda: dict(run='world-7', phase='restoring', progress=27, private_history=[]),
        learning=lambda: dict(phase='baseline', round=21, phase_at=90.5, run='world-7', restore_pending=False),
        mode=lambda: 'evaluate',
        stopped=lambda: False,
        clock=lambda: 100,
    )
    return {**sources, **overrides}


def test_snapshot_uses_the_owned_process_and_exact_heartbeat_predicate():
    state = fixture_health(**fixture_sources())
    assert state['protocol'] == PROTOCOL and state['sampled_at_ms'] == 100_000
    assert state['server'] == dict(pid=816, ready=True, phase='online', busy=False, desired_running=True,
                                   error=None, bots_online=8)
    assert state['performance']['persistence'] == dict(pending=3, capacity=2048, error=None)
    assert state['world_training']['session'] == dict(run='world-7', phase='restoring', progress=27)
    assert state['world_learning']['phase_at'] == 90.5 and state['stopped'] is False


def test_unknown_ready_and_stopped_or_busy_state_are_reported():
    state = fixture_health(**fixture_sources(
        lifecycle=lambda: dict(phase='saving', busy=True, desired_running=False, error=None),
        ready_seen=lambda: False, stopped=lambda: True,
        persistence=lambda: dict(pending=8, capacity=2048, error='write failed')))
    assert state['stopped'] is True
    assert state['server']['ready'] is False and state['server']['pid'] is None
    assert state['server']['bots_online'] == 0
    assert state['server']['busy'] is True and state['server']['desired_running'] is False
    assert state['performance']['persistence']['error'] == 'write failed'


@pytest.mark.parametrize('change', ('replacement', 'lifecycle', 'stop'))
def test_snapshot_rejects_concurrent_process_or_lifecycle_changes(change):
    source = fixture_sources()
    if change == 'replacement':
        sequence = iter([source['process'](), SimpleNamespace(pid=817, poll=lambda: None)])
        source['process'] = lambda: next(sequence)
    elif change == 'lifecycle':
        current = source['lifecycle']()
        sequence = iter([current, {**current, 'busy': True}])
        source['lifecycle'] = lambda: next(sequence)
    else:
        sequence = iter([False, True])
        source['stopped'] = lambda: next(sequence)
    with pytest.raises(RuntimeError, match='lifecycle changed'):
        fixture_health(**source)


@pytest.mark.parametrize('override', (
    dict(memory=lambda: float('nan')),
    dict(persistence=lambda: dict(pending=0, capacity=2048)),
    dict(persistence=lambda: dict(pending=-1, capacity=2048, error=None)),
))
def test_malformed_safety_telemetry_fails_closed(override):
    with pytest.raises(RuntimeError, match='invalid fixture health telemetry'):
        fixture_health(**fixture_sources(**override))


def test_lifecycle_flags_do_not_call_process_or_console_readiness():
    def unexpected():
        pytest.fail('Lifecycle flag sampling must not consult the console or process')

    control = ServerControl(unexpected, unexpected, unexpected, unexpected, unexpected)
    assert control.fixture_lifecycle()['busy'] is False
    control._update(busy=True, phase='saving', started_at=123)
    assert control.fixture_lifecycle()['busy'] is True
    assert control.fixture_lifecycle()['started_at'] == 123


def get(app, peer='127.0.0.1', host=HOST):
    scope = dict(type='http', method='GET', scheme='http', http_version='1.1', path=PATH,
                 client=(peer, 40000), headers=[(b'host', host.encode())], query_string=b'')
    messages = []

    async def receive():
        return {'type': 'http.request', 'body': b'', 'more_body': False}

    async def send(message):
        messages.append(message)

    asyncio.run(app(scope, receive, send))
    return messages[0], json.loads(messages[1]['body'])


def test_isolated_asgi_route_serves_direct_request_and_rejects_lan_proxy():
    app = FastAPI()
    app.include_router(fixture_health_router(lambda: fixture_health(**fixture_sources())))
    headers, body = get(app)
    assert headers['status'] == 200 and body['server']['pid'] == 816
    assert (b'cache-control', b'no-store') in headers['headers']
    assert get(app, host='127.0.0.1:8000')[0]['status'] == 404
    assert get(app, peer='192.168.1.43')[0]['status'] == 404


def test_isolated_asgi_route_returns_service_unavailable_for_lifecycle_race():
    def sample():
        raise RuntimeError('Minecraft lifecycle changed during the fixture health sample')

    app = FastAPI()
    app.include_router(fixture_health_router(sample))
    headers, body = get(app)
    assert headers['status'] == 503 and 'lifecycle changed' in body['detail']
