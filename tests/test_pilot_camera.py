import copy
import json
import os

import pytest

from lab.pilot_camera import (DIMENSION, IDENTITY, MAX_BYTES, PilotCameraFeed,
                              WORLD, project_pilot_camera)


WORLD_ID = '8e07621d-5eba-498a-97b5-e5f77691066b'
PLAYER_ID = '5a9c8c90-f711-3cd5-8950-74a1425990ba'


@pytest.fixture
def sample(tmp_path):
    control = dict(schema=1, enabled=True, identity=IDENTITY, world=WORLD,
                   world_uuid=WORLD_ID, player_uuid=PLAYER_ID)
    status = dict(enabled=True, connected=True, identity=IDENTITY,
                  world_name=WORLD, world_uuid=WORLD_ID, updated_at_ms=100_000,
                  world=dict(world=WORLD, world_uuid=WORLD_ID, loaded=True,
                             environment='NORMAL', dimension=DIMENSION),
                  state=dict(identity=IDENTITY, worldKey=WORLD_ID + '/' + PLAYER_ID,
                             demo=dict(actual_active_days=.75)),
                  player=dict(position=[1.5, 65, -3.5], health=20, food=19,
                              entity_id=42, look=[.4, -.2], speed=.1),
                  life=dict(run='pilot-native-session', goal='survival', phase='night_burrow',
                            activity='shelter_watch', message='Waiting for daylight',
                            home_verification=dict(usable=False)))

    def write(name, value):
        path = tmp_path / name
        path.write_text(json.dumps(value), encoding='utf-8')
        os.utime(path, (100, 100))
    write('control.json', control)
    write('status.json', status)
    return tmp_path, control, status, write


def test_projection_has_own_context_and_no_training_or_inventory(sample):
    root, control, status, _ = sample
    before = copy.deepcopy((control, status))
    result = PilotCameraFeed(root, lambda: 100).snapshot()
    agent = result['agents'][IDENTITY]
    assert agent['position'] == [1.5, 65, -3.5]
    assert agent['entity_id'] == 42 and agent['dimension'] == DIMENSION
    assert agent['look'] == [.4, -.2] and agent['speed'] == .1
    assert agent['persistent_pilot'] is True and agent['last_seen'] == 100
    assert result['progress']['pilot']['activity'] == 'shelter_watch'
    assert result['progress']['pilot']['actual_active_days'] == .75
    assert 'world' not in result['progress'] and 'inventory' not in agent
    assert 'teacher' not in agent and 'samples' not in result
    assert (control, status) == before
    assert project_pilot_camera(control, status, 100) == result


@pytest.mark.parametrize('age', [8.001, -1.001])
def test_stale_or_future_file_fails_even_with_fresh_payload(sample, age):
    root, _, _, _ = sample
    os.utime(root / 'status.json', (100-age, 100-age))
    assert PilotCameraFeed(root, lambda: 100).snapshot()['agents'] == {}


@pytest.mark.parametrize('updated', [None, 91_999, 101_001, True, '100000', float('nan')])
def test_stale_missing_or_invalid_payload_timestamp_fails(sample, updated):
    root, _, status, write = sample
    status['updated_at_ms'] = updated
    write('status.json', status)
    assert PilotCameraFeed(root, lambda: 100).snapshot()['agents'] == {}


@pytest.mark.parametrize('path,value', [
    (('identity',), 'LabAI0'), (('world_name',), 'world'),
    (('world_uuid',), PLAYER_ID), (('enabled',), False), (('connected',), False),
    (('world', 'world_uuid'), PLAYER_ID), (('world', 'dimension'), 'minecraft:overworld'),
    (('world', 'loaded'), False), (('state', 'worldKey'), WORLD_ID + '/' + WORLD_ID),
    (('state', 'identity'), 'SomeoneElse'), (('player', 'health'), float('nan')),
    (('player', 'position'), [1, True, 3]), (('player', 'entity_id'), '42'),
    (('player', 'entity_id'), False), (('player', 'look'), [0, 9]),
    (('player', 'uuid'), WORLD_ID),
    (('player', 'speed'), -1), (('life', 'run'), 'unsafe\nrun'),
])
def test_unverified_or_malformed_live_scope_fails(sample, path, value):
    root, _, status, write = sample
    cursor = status
    for key in path[:-1]:
        cursor = cursor[key]
    cursor[path[-1]] = value
    write('status.json', status)
    assert PilotCameraFeed(root, lambda: 100).snapshot()['agents'] == {}


@pytest.mark.parametrize('field,value', [('identity', 'LabAI0'), ('world', 'world'),
                                        ('player_uuid', 'bad'), ('enabled', False)])
def test_control_scope_must_match(sample, field, value):
    root, control, _, write = sample
    control[field] = value
    write('control.json', control)
    assert PilotCameraFeed(root, lambda: 100).snapshot()['agents'] == {}


def test_cached_file_still_expires_and_caller_cannot_mutate_cache(sample):
    root, _, _, _ = sample
    now = [100]
    feed = PilotCameraFeed(root, lambda: now[0])
    first = feed.snapshot()
    first['agents'][IDENTITY]['position'][0] = 900
    first['progress']['pilot']['message'] = 'overwritten'
    assert feed.snapshot()['agents'][IDENTITY]['position'][0] == 1.5
    assert feed.snapshot()['progress']['pilot']['message'] == 'Waiting for daylight'
    now[0] = 109
    assert feed.snapshot()['agents'] == {}


def test_same_size_atomic_replacement_invalidates_read_cache(sample):
    root, _, status, write = sample
    feed = PilotCameraFeed(root, lambda: 100)
    assert feed.snapshot()['agents'][IDENTITY]['health'] == 20
    status['player']['health'] = 19
    write('next.json', status)
    (root / 'next.json').replace(root / 'status.json')
    assert feed.snapshot()['agents'][IDENTITY]['health'] == 19


@pytest.mark.parametrize('contents', ['{', '[]', 'null', ' ' * (MAX_BYTES + 1)],
                         ids=['truncated', 'array', 'null', 'oversized'])
def test_corrupt_or_oversized_status_is_bounded_and_refused(sample, contents):
    root, _, _, _ = sample
    path = root / 'status.json'
    path.write_text(contents)
    os.utime(path, (100, 100))
    assert PilotCameraFeed(root, lambda: 100).snapshot()['agents'] == {}


def test_missing_optional_look_and_speed_remain_supported(sample):
    root, _, status, write = sample
    del status['player']['look']
    del status['player']['speed']
    write('status.json', status)
    result = PilotCameraFeed(root, lambda: 100).snapshot()
    assert IDENTITY in result['agents']
    assert 'look' not in result['agents'][IDENTITY]


@pytest.mark.parametrize('height', [2, 10.5, 28])
def test_verified_shelter_watch_forwards_bounded_camera_clearance(sample, height):
    root, _, status, write = sample
    status['player']['camera_watch_height'] = height
    write('status.json', status)
    agent = PilotCameraFeed(root, lambda: 100).snapshot()['agents'][IDENTITY]
    assert agent['camera_watch_height'] == height


@pytest.mark.parametrize('height,phase,activity', [
    (1.9, 'night_burrow', 'shelter_watch'),
    (28.1, 'night_burrow', 'shelter_watch'),
    (float('nan'), 'night_burrow', 'shelter_watch'),
    (True, 'night_burrow', 'shelter_watch'),
    ('10', 'night_burrow', 'shelter_watch'),
    (10, 'gather', 'shelter_watch'),
    (10, 'night_burrow', 'working'),
])
def test_bad_or_inapplicable_clearance_is_ignored_not_a_telemetry_failure(sample, height, phase, activity):
    root, _, status, write = sample
    status['player']['camera_watch_height'] = height
    status['life'].update(phase=phase, activity=activity)
    write('status.json', status)
    agent = PilotCameraFeed(root, lambda: 100).snapshot()['agents'][IDENTITY]
    assert 'camera_watch_height' not in agent


def test_missing_directory_is_read_only(tmp_path):
    absent = tmp_path / 'not-created'
    assert PilotCameraFeed(absent).snapshot()['agents'] == {}
    assert not absent.exists()
