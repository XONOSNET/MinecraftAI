import asyncio
import json
from pathlib import Path
import threading
import time
from types import SimpleNamespace

from fastapi import FastAPI, Header, HTTPException
import pytest

from lab.pilot_gateway import (EVENTS, LIVE_WORLD, PilotBroker, build_command,
                               create_pilot_router)


PREFIX = '[12:34:56 INFO]: [PersistentPilotWorlds] LAB_PILOT_WORLD '
FIXTURE = 'lab_pilot_fixture_recovery'


def append(log, payload, prefix=PREFIX):
    with log.open('a', encoding='utf8') as stream:
        stream.write(prefix + json.dumps(payload) + '\n')


def acknowledgement(command):
    words = command.split()
    action, request_id = words[1], words[-1]
    row = dict(request_id=request_id, ok=True, event=EVENTS[action])
    if action == 'player':
        row['player'] = words[2]
    elif action == 'admit':
        row.update(player=words[2], world=words[3])
    else:
        row['world'] = words[2]
        if action == 'fixture' and len(words) == 7:
            row['player'] = words[4]
    return row


def broker_fixture(tmp_path, sender=None, **kwargs):
    log = tmp_path / 'console.log'
    log.write_text('old unrelated console history\n')
    commands = []

    def send(command):
        commands.append(command)
        if sender:
            sender(command, log)
        else:
            append(log, acknowledgement(command))
    broker = PilotBroker(send, log, lambda: True, timeout_seconds=.15,
                         create_timeout_seconds=.15, poll_seconds=.001,
                         lock_timeout_seconds=.02, **kwargs)
    return broker, commands, log


@pytest.mark.parametrize('payload,words', [
    ({'action': 'create'}, ['labpilot', 'create', LIVE_WORLD, 'normal', '20261125']),
    ({'action': 'create', 'world': FIXTURE, 'terrain': 'flat', 'seed': -9}, ['labpilot', 'create', FIXTURE, 'flat', '-9']),
    ({'action': 'load'}, ['labpilot', 'load', LIVE_WORLD]),
    ({'action': 'status'}, ['labpilot', 'status', LIVE_WORLD]),
    ({'action': 'unload'}, ['labpilot', 'unload', LIVE_WORLD]),
    ({'action': 'admit'}, ['labpilot', 'admit', 'HomeAI01', LIVE_WORLD]),
    ({'action': 'player'}, ['labpilot', 'player', 'HomeAI01']),
    ({'action': 'admit', 'world': FIXTURE, 'player': 'PilotTest04'}, ['labpilot', 'admit', 'PilotTest04', FIXTURE]),
    ({'action': 'fixture', 'world': FIXTURE, 'operation': 'damage_roof'}, ['labpilot', 'fixture', FIXTURE, 'damage_roof']),
    ({'action': 'fixture', 'world': FIXTURE, 'operation': 'kill'}, ['labpilot', 'fixture', FIXTURE, 'kill', 'PilotTest01']),
    ({'action': 'fixture-time', 'world': FIXTURE, 'time': 18000}, ['labpilot', 'fixture-time', FIXTURE, '18000']),
    ({'action': 'retire', 'world': FIXTURE}, ['labpilot', 'retire', FIXTURE]),
])
def test_broker_builds_only_typed_managed_world_commands(payload, words):
    assert build_command(payload)[0] == words


@pytest.mark.parametrize('payload', [
    None, [], {'action': 'say', 'message': 'arbitrary command'},
    {'action': 'status\nstop'}, {'action': 'status', 'world': 'world'},
    {'action': 'status', 'world': LIVE_WORLD + ';stop'},
    {'action': 'status', 'world': 'lab_pilot_fixture_'},
    {'action': 'status', 'world': 'lab_pilot_fixture_' + 'a'*25},
    {'action': 'status', 'world': 'lab_pilot_fixture_recovery\nstop'},
    {'action': 'player', 'player': 'LabAI0'},
    {'action': 'player', 'world': FIXTURE, 'player': 'HomeAI01'},
    {'action': 'admit', 'world': LIVE_WORLD, 'player': 'PilotTest01'},
    {'action': 'admit', 'world': FIXTURE, 'player': 'PilotTest05'},
    {'action': 'admit', 'player': 'HomeAI01 --request forged'},
    {'action': 'create', 'terrain': 'flat'}, {'action': 'create', 'seed': True},
    {'action': 'create', 'seed': 2**63}, {'action': 'create', 'seed': '1;stop'},
    {'action': 'load', 'seed': 99}, {'action': 'status', 'request_id': 'forged'},
    {'action': 'retire'}, {'action': 'fixture', 'operation': 'resources'},
    {'action': 'fixture', 'world': FIXTURE, 'operation': 'kill @e'},
    {'action': 'fixture-time', 'time': 0},
    {'action': 'fixture-time', 'world': FIXTURE, 'time': 24000},
    {'action': 'fixture-time', 'world': FIXTURE, 'time': True},
    {'action': 'observe', 'player': 'xonosnet'}, {'action': 'leave', 'player': 'xonosnet'},
])
def test_injection_and_out_of_scope_operations_are_refused_before_console(tmp_path, payload):
    broker, commands, _ = broker_fixture(tmp_path)
    with pytest.raises(HTTPException) as error:
        broker.request(payload)
    assert error.value.status_code == 400 and commands == []


def test_only_exact_new_plugin_acknowledgement_is_returned(tmp_path):
    def send(command, log):
        expected = acknowledgement(command)
        append(log, {**expected, 'request_id': 'b'*32})
        append(log, expected, prefix='[12:34:56 INFO]: <Stranger> [PersistentPilotWorlds] LAB_PILOT_WORLD ')
        append(log, {**expected, 'world_uuid': 'real-world-uuid'})
    broker, commands, _ = broker_fixture(tmp_path, send)
    reply = broker.request({'action': 'status'})
    assert reply['world_uuid'] == 'real-world-uuid'
    assert len(reply['request_id']) == 32 and reply['broker_elapsed_ms'] >= 0
    assert commands[0].endswith('--request ' + reply['request_id'])


def test_historical_even_matching_id_and_new_wrong_id_cannot_acknowledge(tmp_path, monkeypatch):
    monkeypatch.setattr('lab.pilot_gateway.uuid.uuid4', lambda: SimpleNamespace(hex='a'*32))
    broker, _, log = broker_fixture(tmp_path, lambda command, log: append(log, {'request_id': 'b'*32, 'ok': True, 'event': 'status'}))
    append(log, dict(request_id='a'*32, ok=True, event='status', world=LIVE_WORLD))
    with pytest.raises(HTTPException) as error:
        broker.request({'action': 'status'})
    assert error.value.status_code == 504


def test_large_historical_log_is_skipped_and_chunked_new_line_is_assembled(tmp_path):
    def send(command, log):
        data = (PREFIX + json.dumps(acknowledgement(command)) + '\n').encode()
        with log.open('ab') as stream:
            stream.write(data[:13]); stream.flush()
            time.sleep(.01)
            stream.write(data[13:]); stream.flush()
    broker, _, log = broker_fixture(tmp_path, send)
    with log.open('wb') as stream:
        stream.seek(4*1024*1024)
        stream.write(b'old\n')
    assert broker.request({'action': 'status'})['ok'] is True


@pytest.mark.parametrize('change', ['truncate', 'replace', 'flood'])
def test_log_truncation_rotation_and_unbounded_new_backlog_fail_closed(tmp_path, change):
    def send(command, log):
        if change == 'truncate':
            log.write_text('')
        elif change == 'replace':
            log.rename(log.with_suffix('.old'))
            append(log, acknowledgement(command))
        else:
            with log.open('ab') as stream:
                stream.write(b'x' * (1024*1024 + 1) + b'\n')
            append(log, acknowledgement(command))
    broker, _, log = broker_fixture(tmp_path, send)
    if change == 'truncate':
        log.write_text('existing history'*100)
    with pytest.raises(HTTPException) as error:
        broker.request({'action': 'status'})
    assert error.value.status_code == 503


@pytest.mark.parametrize('overrides,status', [
    ({'ok': False, 'event': 'error', 'message': 'World ownership does not match'}, 409),
    ({'ok': 1}, 503), ({'event': 'fixture_setup'}, 503), ({'world': 'world'}, 503),
])
def test_plugin_refusals_and_wrong_operation_acknowledgements_are_not_success(tmp_path, overrides, status):
    broker, _, _ = broker_fixture(tmp_path, lambda command, log: append(log, {**acknowledgement(command), **overrides}))
    with pytest.raises(HTTPException) as error:
        broker.request({'action': 'status'})
    assert error.value.status_code == status


def test_missing_plugin_and_unhealthy_or_changing_lifecycle_stop_requests(tmp_path):
    broker, _, _ = broker_fixture(tmp_path, lambda command, log: log.write_text('[12:34:56 INFO]: Unknown or incomplete command, see below for error\n'))
    # Keep the log large enough that this missing-command reply appends rather than truncates.
    broker.command = lambda command: broker.logpath.open('a').write('[12:34:56 INFO]: Unknown or incomplete command, see below for error\n')
    with pytest.raises(HTTPException) as error:
        broker.request({'action': 'status'})
    assert error.value.status_code == 503
    broker.ready = lambda: False
    with pytest.raises(HTTPException) as error:
        broker.request({'action': 'status'})
    assert error.value.status_code == 503
    broker.ready = lambda: True
    snapshots = iter([{'pid': 1}, {'pid': 2}])
    broker.production_info = lambda: next(snapshots)
    with pytest.raises(HTTPException) as error:
        broker.request({'action': 'status'})
    assert error.value.status_code == 503


def test_blocked_dispatch_is_bounded_and_no_overlapping_retry_is_queued(tmp_path):
    entered, release = threading.Event(), threading.Event()
    def send(command, log):
        entered.set(); release.wait(2)
    broker, commands, _ = broker_fixture(tmp_path, send)
    broker.timeout = .04
    started = time.monotonic()
    try:
        with pytest.raises(HTTPException) as error:
            broker.request({'action': 'status'})
        assert entered.is_set() and error.value.status_code == 504
        assert time.monotonic()-started < .3
        with pytest.raises(HTTPException) as error:
            broker.request({'action': 'status'})
        assert error.value.status_code == 503 and len(commands) == 1
    finally:
        release.set()
    end = time.monotonic()+1
    while broker.lock.locked() and time.monotonic() < end:
        time.sleep(.001)
    assert not broker.lock.locked()


async def asgi(app, method, route, payload=None, token='secret', query=b''):
    headers = [(b'host', b'127.0.0.1:8000'), (b'content-type', b'application/json')]
    if token is not None:
        headers.append((b'x-lab-token', token.encode()))
    scope = dict(type='http', method=method, scheme='http', http_version='1.1', path=route,
                 client=('127.0.0.1', 40000), server=('127.0.0.1', 8000), headers=headers, query_string=query)
    messages = []
    async def receive():
        return {'type': 'http.request', 'body': json.dumps(payload).encode() if payload is not None else b'', 'more_body': False}
    async def send(message):
        messages.append(message)
    await app(scope, receive, send)
    return messages[0]['status'], json.loads(messages[1]['body'])


def auth(x_lab_token: str = Header(default='')):
    if x_lab_token != 'secret':
        raise HTTPException(401, 'Authentication required')


def test_router_import_and_creation_do_nothing_and_both_routes_require_auth(tmp_path):
    log = tmp_path/'console.log'; log.write_text('')
    commands = []
    def send(command):
        commands.append(command); append(log, acknowledgement(command))
    app = FastAPI()
    app.include_router(create_pilot_router(send, log, lambda: True, auth))
    assert commands == []
    for method, route, payload in [('GET', '/pilot/status', None), ('POST', '/pilot/world', {'action': 'create'})]:
        code, _ = asyncio.run(asgi(app, method, route, payload, token=None))
        assert code == 401
    assert commands == []
    assert asyncio.run(asgi(app, 'GET', '/pilot/status'))[0] == 200
    assert asyncio.run(asgi(app, 'POST', '/pilot/world', {'action': 'admit'}))[0] == 200


def test_authenticated_live_router_refuses_fixture_create_supply_and_status_before_dispatch(tmp_path):
    log = tmp_path/'console.log';log.write_text('')
    commands = []
    def send(command):
        commands.append(command);append(log, acknowledgement(command))
    app = FastAPI()
    app.include_router(create_pilot_router(send, log, lambda: True, auth))
    for payload in [{'action':'create','world':FIXTURE,'terrain':'flat'},
                    {'action':'fixture','world':FIXTURE,'operation':'supply','player':'PilotTest01'},
                    {'action':'fixture','world':FIXTURE,'operation':'kill'},
                    {'action':'fixture-time','world':FIXTURE,'time':18000},
                    {'action':'retire','world':FIXTURE}]:
        code, body = asyncio.run(asgi(app, 'POST', '/pilot/world', payload))
        assert code == 400 and 'isolated fixture host' in body['detail']
    assert asyncio.run(asgi(app, 'GET', '/pilot/status', query=('world='+FIXTURE).encode()))[0] == 400
    assert commands == []
    assert asyncio.run(asgi(app, 'GET', '/pilot/status'))[0] == 200
    assert asyncio.run(asgi(app, 'POST', '/pilot/world', {'action':'player'}))[0] == 200
    assert [command.split()[1] for command in commands] == ['status', 'player']


def test_fixture_router_requires_opt_in_but_low_level_isolated_broker_remains_supported(tmp_path):
    log = tmp_path/'console.log';log.write_text('')
    commands = []
    def send(command):
        commands.append(command);append(log, acknowledgement(command))
    app = FastAPI()
    app.include_router(create_pilot_router(send, log, lambda: True, auth, allow_fixtures=True))
    payload = {'action':'fixture','world':FIXTURE,'operation':'supply','player':'PilotTest01'}
    assert asyncio.run(asgi(app, 'POST', '/pilot/world', payload))[0] == 200
    assert asyncio.run(asgi(app, 'GET', '/pilot/status', query=('world='+FIXTURE).encode()))[0] == 200
    assert PilotBroker(send, log, lambda: True).request({'action':'retire','world':FIXTURE})['ok'] is True
    assert [command.split()[1] for command in commands] == ['fixture','status','retire']
    with pytest.raises(ValueError,match='explicit boolean'):
        create_pilot_router(send, log, lambda: True, auth, allow_fixtures='false')


def test_waiting_for_pilot_ack_does_not_block_other_service_requests(tmp_path):
    log = tmp_path/'console.log'; log.write_text('')
    app = FastAPI()
    router = create_pilot_router(lambda command: None, log, lambda: True, auth)
    router.pilot_broker.timeout = .15
    app.include_router(router)
    @app.get('/health')
    def health():
        return {'ok': True}
    async def run():
        pending = asyncio.create_task(asgi(app, 'GET', '/pilot/status'))
        await asyncio.sleep(.03)
        started = time.monotonic()
        code, body = await asgi(app, 'GET', '/health')
        assert code == 200 and body['ok'] and time.monotonic()-started < .1
        assert (await pending)[0] == 504
    asyncio.run(run())
