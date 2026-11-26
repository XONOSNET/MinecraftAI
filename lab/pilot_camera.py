"""Read-only, identity-scoped telemetry for the continuing resident's camera.

This projection is deliberately separate from production assignments, examples
and the eight training agents. Missing or stale evidence means no camera target;
the reader never starts the resident or repairs its saved state.
"""
import copy
import json
import math
from pathlib import Path
import re
import time
import uuid


IDENTITY = 'HomeAI01'
WORLD = 'lab_persistent_pilot'
DIMENSION = 'minecraft:' + WORLD
MAX_BYTES = 512 * 1024
MAX_AGE = 8


def _number(value, lower, upper):
    return type(value) in (int, float) and math.isfinite(value) and lower <= value <= upper


def _uuid(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value
    except (ValueError, AttributeError):
        return False


def _text(value, fallback='', limit=140):
    if not isinstance(value, str):
        return fallback
    return ''.join(c if c.isprintable() else ' ' for c in value)[:limit]


class PilotCameraFeed:
    def __init__(self, directory='data/persistent-pilot', clock=time.time):
        self.directory = Path(directory)
        self.clock = clock
        self._files = {}

    def _read(self, name, now, *, fresh=False):
        path = self.directory / name
        stat = path.stat()
        if not 0 < stat.st_size <= MAX_BYTES:
            raise ValueError('Pilot camera record exceeds its size bound')
        if fresh and not -1 <= now - stat.st_mtime <= MAX_AGE:
            raise ValueError('Pilot camera status file is stale')
        key = (stat.st_dev, stat.st_ino, stat.st_mtime_ns, stat.st_size)
        cached = self._files.get(name)
        if cached and cached[0] == key:
            return cached[1]
        # Bound the actual read too: a replacement between stat/open must not
        # turn a camera poll into an unbounded allocation.
        with path.open('rb') as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Pilot camera record changed beyond its size bound')
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError('Pilot camera record must be an object')
        self._files[name] = (key, value)
        return value

    def snapshot(self):
        """Return detached ``agents`` and ``progress`` for camera use only."""
        try:
            now = self.clock()
            control = self._read('control.json', now)
            status = self._read('status.json', now, fresh=True)
            return project_pilot_camera(control, status, now)
        except (OSError, ValueError, TypeError, AttributeError, KeyError, RecursionError):
            return dict(agents={}, progress={}, reason='Waiting for fresh verified pilot telemetry')


def project_pilot_camera(control, status, now):
    """Validate and project parsed records without reading or mutating anything.

    Invalid evidence raises ValueError (or a structural input error); the file
    reader converts those failures to an empty, unavailable camera snapshot.
    """
    if (control.get('schema') != 1 or control.get('enabled') is not True or
            status.get('enabled') is not True or status.get('connected') is not True):
        raise ValueError('Persistent resident is paused or disconnected')
    if (control.get('identity') != IDENTITY or status.get('identity') != IDENTITY or
            control.get('world') != WORLD or status.get('world_name') != WORLD):
        raise ValueError('Pilot camera identity or world does not match')
    world_id, player_id = control.get('world_uuid'), control.get('player_uuid')
    world, state = status.get('world'), status.get('state')
    if (not _uuid(world_id) or not _uuid(player_id) or
            not isinstance(world, dict) or not isinstance(state, dict) or
            status.get('world_uuid') != world_id or world.get('world_uuid') != world_id or
            world.get('world') != WORLD or world.get('dimension') != DIMENSION or
            world.get('loaded') is not True or world.get('environment') != 'NORMAL' or
            state.get('identity') != IDENTITY or state.get('worldKey') != world_id + '/' + player_id):
        raise ValueError('Pilot camera native scope did not verify')
    updated = status.get('updated_at_ms')
    if not _number(updated, 0, 2**53) or not -1 <= now - updated / 1000 <= MAX_AGE:
        raise ValueError('Pilot camera sample is stale or lacks a timestamp')
    player, life = status.get('player'), status.get('life')
    if not isinstance(player, dict) or not isinstance(life, dict):
        raise ValueError('Pilot camera lacks live player evidence')
    if player.get('uuid', player_id) != player_id:
        raise ValueError('Pilot camera player UUID does not match')
    position = player.get('position')
    if (not isinstance(position, list) or len(position) != 3 or
            not all(_number(v, -29999984, 29999984) for v in position) or
            not -64 <= position[1] <= 1024 or
            not _number(player.get('health'), 0, 20) or
            not _number(player.get('food'), 0, 20) or
            type(player.get('entity_id')) is not int or player['entity_id'] <= 0):
        raise ValueError('Pilot camera player values are invalid')
    run = life.get('run')
    if not isinstance(run, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,96}', run):
        raise ValueError('Pilot camera run is invalid')
    days = (state.get('demo') or {}).get('actual_active_days', 0)
    if not _number(days, 0, 1e9):
        raise ValueError('Pilot camera day clock is invalid')
    pilot = dict(goal=_text(life.get('goal'), 'survival', 64),
                 phase=_text(life.get('phase'), 'waiting', 64),
                 activity=_text(life.get('activity'), 'working', 64),
                 message=_text(life.get('message'), 'Continuing life'),
                 actual_active_days=days,
                 home_usable=(life.get('home_verification') or {}).get('usable') is True)
    agent = dict(connected=True, last_seen=updated / 1000,
                 health=player['health'], food=player['food'],
                 position=list(position), entity_id=player['entity_id'],
                 dimension=DIMENSION, run=run, activity=pilot['message'],
                 simulation='Persistent open world', display_name=IDENTITY,
                 action=4, skill='persistent', persistent_pilot=True, pilot=pilot)
    watch_height = player.get('camera_watch_height')
    if (pilot['phase'] == 'night_burrow' and pilot['activity'] == 'shelter_watch' and
            _number(watch_height, 2, 28)):
        # Presentation-only clearance from the resident's loaded column. It is
        # never an observation, goal, or action supplied to its controller.
        agent['camera_watch_height'] = watch_height
    look = player.get('look')
    if look is not None:
        if (not isinstance(look, list) or len(look) != 2 or
                not _number(look[0], -1e6, 1e6) or
                not _number(look[1], -math.pi / 2 - .01, math.pi / 2 + .01)):
            raise ValueError('Pilot camera look is invalid')
        agent['look'] = list(look)
    speed = player.get('speed')
    if speed is not None:
        if not _number(speed, 0, 100):
            raise ValueError('Pilot camera speed is invalid')
        agent['speed'] = speed
    progress = dict(pilot=pilot, run=run, mode='pilot',
                    label='Persistent open world', phase=pilot['phase'], job={})
    return copy.deepcopy(dict(agents={IDENTITY: agent}, progress=progress, reason=None))
