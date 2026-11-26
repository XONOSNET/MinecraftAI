"""Authenticated, bounded console broker for the independently enabled pilot.

Only the managed-world plugin's typed commands are exposed. This module never
creates a world, admits a player, or enables a controller merely by importing it.
The request lock belongs to this broker, not the production service state lock.
"""
import json
from pathlib import Path
import re
import threading
import time
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse


LIVE_WORLD = 'lab_persistent_pilot'
LIVE_PLAYER = 'HomeAI01'
FIXTURE_WORLD = re.compile(r'lab_pilot_fixture_[a-z0-9_]{1,24}\Z')
FIXTURE_PLAYERS = {f'PilotTest0{index}' for index in range(1, 5)}
FIXTURE_OPERATIONS = {'home', 'setup_home', 'damage_roof', 'roof', 'damage_access',
                      'door', 'block_access', 'destroy_bed', 'bed', 'resources',
                      'kill', 'supply', 'position_home', 'position_spawn'}
PLAYER_OPERATIONS = {'kill', 'supply', 'position_home', 'position_spawn'}
EVENTS = {'create': 'created', 'load': 'loaded', 'status': 'status',
          'unload': 'unloaded', 'retire': 'fixture_retired', 'admit': 'admission_ready',
          'player': 'player_status', 'fixture': 'fixture_setup', 'fixture-time': 'fixture_time'}
FIELDS = {'create': {'action', 'world', 'terrain', 'seed'},
          'load': {'action', 'world'}, 'status': {'action', 'world'},
          'unload': {'action', 'world'}, 'retire': {'action', 'world'},
          'admit': {'action', 'world', 'player'}, 'player': {'action', 'world', 'player'},
          'fixture': {'action', 'world', 'operation', 'player'},
          'fixture-time': {'action', 'world', 'time'}}
ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
ACK = re.compile(r'^(?:\[\d{2}:\d{2}:\d{2} INFO\]:\s*)?'
                 r'\[PersistentPilotWorlds\]\s+LAB_PILOT_WORLD\s+(\{.*\})\s*$')
UNKNOWN = re.compile(r'^(?:\[\d{2}:\d{2}:\d{2} INFO\]:\s*)?'
                     r'(?:Unknown or incomplete command|Unknown command[.:]).*$')


def build_command(payload):
    """Return validated command words and expected response scope, never raw input."""
    if not isinstance(payload, dict) or not isinstance(payload.get('action'), str):
        raise HTTPException(400, 'Choose a supported pilot action.')
    action = payload['action']
    if action not in FIELDS or set(payload) - FIELDS[action]:
        raise HTTPException(400, 'Unknown pilot action or fields.')
    world = payload.get('world', LIVE_WORLD)
    if not isinstance(world, str) or world != LIVE_WORLD and not FIXTURE_WORLD.fullmatch(world):
        raise HTTPException(400, 'Choose the persistent pilot world or a named pilot fixture.')
    fixture = world != LIVE_WORLD
    player = payload.get('player')
    if player is not None and (not isinstance(player, str) or
                              player not in (FIXTURE_PLAYERS if fixture else {LIVE_PLAYER})):
        raise HTTPException(400, 'Player does not belong to this pilot scope.')
    words = ['labpilot', action, world]
    if action == 'create':
        terrain = payload.get('terrain', 'normal')
        seed = payload.get('seed', 20261125)
        if terrain not in (('normal', 'flat') if fixture else ('normal',)):
            raise HTTPException(400, 'Live terrain is natural; flat terrain is fixture-only.')
        if type(seed) is not int or not -(2**63) <= seed < 2**63:
            raise HTTPException(400, 'Choose a signed 64-bit integer seed.')
        words.extend([terrain, str(seed)])
    elif action in ('admit', 'player'):
        player = player or ('PilotTest01' if fixture else LIVE_PLAYER)
        words = ['labpilot', action, player] + ([world] if action == 'admit' else [])
    elif action == 'retire':
        if not fixture:
            raise HTTPException(400, 'The persistent world cannot be retired through this broker.')
    elif action == 'fixture':
        operation = payload.get('operation')
        if not fixture or not isinstance(operation, str) or operation not in FIXTURE_OPERATIONS:
            raise HTTPException(400, 'Fixture setup and destructive operations require a named fixture world.')
        words.append(operation)
        if operation in PLAYER_OPERATIONS or player is not None:
            player = player or 'PilotTest01'
            words.append(player)
    elif action == 'fixture-time':
        value = payload.get('time')
        if not fixture or type(value) is not int or not 0 <= value < 24000:
            raise HTTPException(400, 'Clock setup is limited to fixture time 0–23999.')
        words.append(str(value))
    return words, {'action': action, 'world': world, 'player': player}


class PilotBroker:
    def __init__(self, command, logpath, ready, production_info=None, *,
                 timeout_seconds=15, create_timeout_seconds=20,
                 lock_timeout_seconds=.25, poll_seconds=.05):
        if not (0 < timeout_seconds <= 15 and 0 < create_timeout_seconds <= 20 and
                0 < lock_timeout_seconds <= 1 and 0 < poll_seconds <= .1):
            raise ValueError('Pilot request timing exceeds its bounds')
        self.command, self.logpath, self.ready = command, Path(logpath), ready
        self.production_info = production_info
        self.timeout, self.create_timeout = timeout_seconds, create_timeout_seconds
        self.lock_timeout, self.poll_seconds = lock_timeout_seconds, poll_seconds
        self.lock = threading.Lock()

    def lifecycle(self):
        try:
            if not self.ready():
                raise HTTPException(503, 'Minecraft is not ready for pilot control.')
            if self.production_info is None:
                return None
            info = self.production_info()
            server = info.get('server', info)
            if (server.get('busy') or server.get('error') or server.get('ready') is False or
                    server.get('desired_running') is False or info.get('stopped') is True):
                raise HTTPException(503, 'Minecraft lifecycle is not ready for pilot control.')
            return tuple(server.get(key) for key in ('pid', 'busy', 'desired_running', 'error'))
        except HTTPException:
            raise
        except (OSError, RuntimeError, TypeError, AttributeError) as error:
            raise HTTPException(503, 'Pilot lifecycle telemetry is unavailable.') from error

    def request(self, payload):
        words, expected = build_command(payload)
        started = time.monotonic()
        deadline = started + (self.create_timeout if expected['action'] == 'create' else self.timeout)
        if not self.lock.acquire(timeout=min(self.lock_timeout, max(.001, deadline-started))):
            raise HTTPException(503, 'Another pilot command is pending; retry after it is verified.')
        dispatch = {'pending': False, 'handler_done': False, 'released': False, 'error': None}
        dispatch_guard = threading.Lock()

        def release_if_finished():
            if dispatch['handler_done'] and not dispatch['pending'] and not dispatch['released']:
                dispatch['released'] = True
                self.lock.release()

        try:
            lifecycle = self.lifecycle()
            try:
                stat = self.logpath.stat()
                offset = stat.st_size
                file_id = (stat.st_dev, stat.st_ino)
            except OSError as error:
                raise HTTPException(503, 'Minecraft console acknowledgement log is unavailable.') from error
            request_id = uuid.uuid4().hex
            command = ' '.join(words + ['--request', request_id])

            def send():
                try:
                    self.command(command)
                except Exception as error:
                    with dispatch_guard:
                        dispatch['error'] = error
                finally:
                    with dispatch_guard:
                        dispatch['pending'] = False
                        release_if_finished()

            # A blocked pipe cannot hold an HTTP worker beyond the request budget.
            # Keep the pilot lease until that one dispatch returns: no queued or
            # overlapping retry may race an uncertain, late console command.
            dispatch['pending'] = True
            try:
                threading.Thread(target=send, daemon=True, name='pilot-console-dispatch').start()
            except RuntimeError as error:
                dispatch['pending'] = False
                raise HTTPException(503, 'Pilot console dispatcher is unavailable.') from error
            partial = b''
            consumed = 0
            while time.monotonic() < deadline:
                if self.lifecycle() != lifecycle:
                    raise HTTPException(503, 'Minecraft lifecycle changed during pilot verification.')
                with dispatch_guard:
                    error = dispatch['error']
                if error is not None:
                    raise HTTPException(503, 'Pilot console dispatch failed.') from error
                try:
                    current = self.logpath.stat()
                    if (current.st_dev, current.st_ino) != file_id or current.st_size < offset:
                        raise HTTPException(503, 'Minecraft console changed during pilot verification.')
                    with self.logpath.open('rb') as stream:
                        stream.seek(offset)
                        chunk = stream.read(262144)
                        offset = stream.tell()
                except OSError as error:
                    raise HTTPException(503, 'Minecraft console became unavailable.') from error
                consumed += len(chunk)
                if consumed > 1024 * 1024:
                    raise HTTPException(503, 'Pilot acknowledgement exceeded its bounded console window.')
                partial += chunk.replace(b'\r', b'\n')
                lines = partial.split(b'\n')
                partial = lines.pop()
                for raw in lines:
                    line = ANSI.sub('', raw.decode('utf-8', errors='replace')).strip()
                    if UNKNOWN.fullmatch(line):
                        raise HTTPException(503, 'PersistentPilotWorlds is missing or its command is unavailable.')
                    match = ACK.fullmatch(line)
                    if not match:
                        continue
                    try:
                        reply = json.loads(match[1])
                    except (ValueError, TypeError, RecursionError):
                        if request_id in match[1]:
                            raise HTTPException(503, 'Pilot plugin returned malformed acknowledgement JSON.') from None
                        continue
                    if not isinstance(reply, dict) or reply.get('request_id') != request_id:
                        continue
                    if type(reply.get('ok')) is not bool:
                        raise HTTPException(503, 'Pilot plugin returned an invalid acknowledgement.')
                    if not reply['ok']:
                        raise HTTPException(409, {'message': 'Pilot plugin refused the operation.', 'plugin': reply})
                    if (reply.get('event') != EVENTS[expected['action']] or
                            'world' in reply and reply['world'] != expected['world'] or
                            expected['player'] is not None and reply.get('player') != expected['player']):
                        raise HTTPException(503, 'Pilot acknowledgement does not match the requested operation.')
                    return {**reply, 'broker_elapsed_ms': round((time.monotonic()-started)*1000, 3)}
                time.sleep(min(self.poll_seconds, max(0, deadline-time.monotonic())))
            raise HTTPException(504, 'Pilot acknowledgement timed out; the operation is not verified.')
        finally:
            with dispatch_guard:
                dispatch['handler_done'] = True
                release_if_finished()


def create_pilot_router(command, logpath, ready, auth, production_info=None, *, allow_fixtures=False):
    if type(allow_fixtures) is not bool:
        raise ValueError('Fixture routing requires an explicit boolean opt-in')
    broker = PilotBroker(command, logpath, ready, production_info)
    router = APIRouter()

    def request(payload):
        # Validate the entire typed command before applying this surface's
        # stricter scope. Production never exposes disposable setup/destruction.
        _, expected = build_command(payload)
        if not allow_fixtures and expected['world'] != LIVE_WORLD:
            raise HTTPException(400, 'Fixture commands belong to the isolated fixture host, not the live pilot dashboard.')
        return broker.request(payload)

    @router.post('/pilot/world', dependencies=[Depends(auth)])
    def control(payload=Body(...)):
        return JSONResponse(request(payload), headers={'Cache-Control': 'no-store'})

    @router.get('/pilot/status', dependencies=[Depends(auth)])
    def status(world: str = LIVE_WORLD):
        return JSONResponse(request({'action': 'status', 'world': world}), headers={'Cache-Control': 'no-store'})

    router.pilot_broker = broker
    return router
