"""Bounded private Paper check of stale burrow intent after a native death.

The home, shaft, test log, carried stock and forced death are supplied fixture
conditions. They are never counted as autonomous survival achievements.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.pilot_fixture_host import Host, atomic_json, production_health

WORLD = 'lab_pilot_fixture_respawn_recover'
PLAYER = 'PilotTest01'
DIMENSION = 'minecraft:' + WORLD


def run(output, duration):
    output = output.resolve()
    if not output.is_relative_to((ROOT / 'logs').resolve()):
        raise ValueError('Native evidence must remain under ignored logs')
    output.mkdir(parents=True, exist_ok=True)
    host = Host(output / 'host.json', duration)
    actor = None
    channel = output / ('channel-' + uuid.uuid4().hex)
    channel.mkdir()
    report = dict(complete=False, fixture_only=True, world=WORLD, player=PLAYER,
                  started_at=time.time(), setup_is_autonomous_achievement=False,
                  production_commands=False, setup_commands=[])
    world_id = None
    setup = None

    def verify_scope():
        state = host.control({'action': 'player', 'world': WORLD, 'player': PLAYER})
        if not state.get('online') or state.get('position', {}).get('world_uuid') != world_id:
            raise RuntimeError('Fixture actor left its verified private world')
        return state

    def dispatch(request):
        nonlocal setup
        action = request.get('action')
        if action == 'setup':
            verify_scope()
            realm = host.control({'action': 'status', 'world': WORLD})
            home_reply = host.control({'action': 'fixture', 'world': WORLD, 'operation': 'setup_home'})
            home = home_reply['home']
            spawn = realm['spawn']
            x, y, z = int(spawn['x']) - 16, int(spawn['y']), int(spawn['z'])
            hx, hy, hz = home['x'], home['y'], home['z']
            commands = [
                f'execute in {DIMENSION} run forceload add {x-16} {z-16} {hx+16} {hz+16}',
                f'execute in {DIMENSION} run fill {x-3} {y-3} {z-3} {x+3} {y-1} {z+3} minecraft:dirt',
                f'execute in {DIMENSION} run fill {x-3} {y} {z-3} {x+3} {y+4} {z+3} minecraft:air',
                f'execute in {DIMENSION} run fill {x} {y-2} {z} {x} {y} {z} minecraft:air',
                f'execute in {DIMENSION} run setblock {hx+8} {hy} {hz} minecraft:oak_log',
                f'execute in {DIMENSION} run gamerule doDaylightCycle false',
                f'execute in {DIMENSION} run gamerule doMobSpawning false',
                f'execute in {DIMENSION} run weather clear',
                f'gamemode survival {PLAYER}',
                f'clear {PLAYER}',
                f'give {PLAYER} minecraft:oak_log 3',
                f'give {PLAYER} minecraft:dirt 2',
                f'execute in {DIMENSION} run tp {PLAYER} {x+.5} {y-2} {z+.5} 0 0',
            ]
            for command in commands:
                host.send(command)
            host.control({'action': 'fixture-time', 'world': WORLD, 'time': 6000})
            time.sleep(.5)
            setup = dict(home=home, old_feet=[x, y, z], test_log=[hx+8, hy, hz], spawn=spawn,
                         native=verify_scope(), world_uuid=world_id, commands=commands,
                         supplied_home=home_reply, setup_is_autonomous_achievement=False)
            report['setup_commands'].append(setup)
            return {'ok': True, **setup}
        if action == 'kill':
            before = verify_scope()
            host.control({'action': 'fixture', 'world': WORLD, 'operation': 'kill', 'player': PLAYER})
            return {'ok': True, 'before': before, 'forced_test_death': True}
        if action == 'inspect':
            return {'ok': True, 'native': verify_scope()}
        raise ValueError('Unknown fixed private request')

    try:
        host.arm_deadline()
        host.prepare()
        realm = host.control({'action': 'create', 'world': WORLD, 'terrain': 'flat', 'seed': 20261126})
        world_id = realm['world_uuid']
        host.control({'action': 'admit', 'world': WORLD, 'player': PLAYER})
        report['world_uuid'] = world_id
        report['fixture_pid'] = host.process.pid
        actor = subprocess.Popen(['node', str(ROOT / 'scripts/verify_pilot_respawn_recovery.cjs'),
                                  str(output), str(channel)], cwd=ROOT,
                                 stdout=(output / 'actor.log').open('w'), stderr=subprocess.STDOUT,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        next_health, seen = 0, set()
        while actor.poll() is None:
            if host.stop_event.is_set() or time.monotonic() >= host.deadline:
                raise RuntimeError('Private fixture reached its bounded stop condition')
            if time.monotonic() >= next_health:
                next_health = time.monotonic() + 5
                report['production_last'] = production_health(host.production_pid)
            for request_path in sorted(channel.glob('*.request.json')):
                request = json.loads(request_path.read_text())
                key = request.get('id')
                if not isinstance(key, str) or len(key) != 32:
                    raise ValueError('Invalid private fixture ticket')
                if key not in seen:
                    seen.add(key)
                    try:
                        response = dispatch(request)
                    except Exception as error:
                        response = {'ok': False, 'error': str(error)}
                    atomic_json(channel / (key + '.response.json'), dict(response, id=key))
                    atomic_json(output / 'setup.json', report)
            time.sleep(.05)
        report['actor_exit_code'] = actor.returncode
        report['native'] = json.loads((output / 'report.json').read_text())
        report['complete'] = actor.returncode == 0 and report['native'].get('complete') is True
        if not report['complete']:
            raise RuntimeError('Native respawn check did not complete; inspect actor report')
    except Exception as error:
        report['error'] = f'{type(error).__name__}: {error}'
        raise
    finally:
        if actor and actor.poll() is None:
            actor.terminate()
            actor.wait(timeout=10)
        host.close()
        report['cleanup'] = host.report.get('cleanup')
        report['finished_at'] = time.time()
        atomic_json(output / 'owner-report.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--output', default='logs/pilot-respawn-recovery-native')
    parser.add_argument('--duration', type=int, default=300)
    args = parser.parse_args()
    if not 120 <= args.duration <= 300:
        parser.error('Duration must be 120–300 seconds')
    if not args.run:
        print(json.dumps(dict(fixture_only=True, world=WORLD, port=25571, heap_mib=512,
                              duration=args.duration, production_commands=False)))
    else:
        run(ROOT / args.output, args.duration)
