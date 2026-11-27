"""Bounded private Paper reproduction of the continuing resident's burrow stall.

The setup supplies an earth shaft, stock and test mobs. Those are test conditions,
not autonomous achievements. Only the owned disposable JVM receives commands.
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

WORLD = 'lab_pilot_fixture_burrow_recovery'
PLAYER = 'PilotTest01'
SCENARIOS = {'neutral', 'night', 'close', 'cave', 'rain', 'aggressive', 'bootstrap',
             'surface_bootstrap', 'calm_close_combat'}
DIMENSION = 'minecraft:' + WORLD
TAG = 'pilot_burrow_case'


def commands(scenario):
    if scenario not in SCENARIOS:
        raise ValueError('Unknown fixed burrow scenario')
    player_y = 80 if scenario in ('aggressive', 'calm_close_combat', 'surface_bootstrap') else 78
    player_z = 2.5 if scenario in ('aggressive', 'calm_close_combat') else .5
    mob = 'cave_spider' if scenario == 'cave' else 'spider'
    x = 2.5 if scenario == 'calm_close_combat' else 3.5 if scenario == 'close' else 9.5
    no_ai = 0 if scenario == 'aggressive' else 1
    result = [
        f'execute in {DIMENSION} run forceload add -16 -16 16 16',
        f'execute in {DIMENSION} run kill @e[tag={TAG}]',
        f'execute in {DIMENSION} run fill -12 76 -12 12 79 12 minecraft:dirt',
        f'execute in {DIMENSION} run fill -12 80 -12 12 104 12 minecraft:air',
        f'execute in {DIMENSION} run fill 0 78 0 0 79 0 minecraft:air',
        f'execute in {DIMENSION} run setblock 0 80 0 minecraft:dirt',
        f'execute in {DIMENSION} run setblock -1 80 0 minecraft:dirt',
        f'execute in {DIMENSION} run setblock -6 80 0 minecraft:oak_log',
        f'execute in {DIMENSION} run gamerule doDaylightCycle false',
        f'execute in {DIMENSION} run weather {"rain" if scenario == "rain" else "clear"}',
        f'gamemode survival {PLAYER}',
        f'clear {PLAYER}',
        f'effect give {PLAYER} minecraft:instant_health 1 10 true',
        f'effect give {PLAYER} minecraft:saturation 1 10 true',
    ]
    if scenario == 'surface_bootstrap':
        result.extend([
            f'execute in {DIMENSION} run fill 0 78 0 0 79 0 minecraft:dirt',
            f'execute in {DIMENSION} run setblock 0 80 0 minecraft:air',
            f'execute in {DIMENSION} run setblock -1 80 0 minecraft:air',
            f'give {PLAYER} minecraft:oak_log 3',
        ])
    else:
        result.extend([
            f'give {PLAYER} minecraft:oak_log 9',
            f'give {PLAYER} minecraft:acacia_log 22',
            f'give {PLAYER} minecraft:acacia_planks 7',
            f'give {PLAYER} minecraft:stick 4',
            f'give {PLAYER} minecraft:dirt 5',
        ])
        if scenario != 'bootstrap':
            result.append(f'give {PLAYER} minecraft:wooden_axe 1')
    result.append(f'execute in {DIMENSION} run tp {PLAYER} .5 {player_y} {player_z} 0 0')
    if scenario not in ('bootstrap', 'surface_bootstrap'):
        result.append(f'execute in {DIMENSION} run summon minecraft:{mob} {x} 80 .5 '
                      f'{{NoAI:{no_ai}b,PersistenceRequired:1b,Tags:["{TAG}"]}}')
    if scenario == 'aggressive':
        result.append(f'execute in {DIMENSION} run damage @e[tag={TAG},limit=1] 1 minecraft:player_attack by {PLAYER}')
    return result


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
                  setup_commands=[], production_commands=False)
    world_id = None

    def verify_scope():
        state = host.control({'action': 'player', 'world': WORLD, 'player': PLAYER})
        if not state.get('online') or state.get('position', {}).get('world_uuid') != world_id:
            raise RuntimeError('Fixture actor is not in its verified private world')
        return state

    def dispatch(request):
        action = request.get('action')
        if action == 'setup':
            scenario = request.get('scenario')
            verify_scope()
            host.send(f'execute in {DIMENSION} run forceload add -16 -16 16 16')
            time.sleep(1)
            for command in commands(scenario):
                host.send(command)
            host.control({'action': 'fixture-time', 'world': WORLD,
                          'time': 18000 if scenario in ('night', 'bootstrap', 'aggressive') else 6000})
            time.sleep(.3)
            state = verify_scope()
            report['setup_commands'].append(dict(scenario=scenario, commands=commands(scenario),
                                                native_player=state, at=time.time()))
            return {'ok': True, 'native': state, 'world_uuid': world_id}
        if action == 'freeze-aggressive':
            verify_scope()
            host.send(f'execute in {DIMENSION} run data merge entity @e[tag={TAG},limit=1] {{NoAI:1b}}')
            host.send(f'execute in {DIMENSION} run tp @e[tag={TAG},limit=1] 9.5 80 .5')
            host.send(f'execute in {DIMENSION} run tp {PLAYER} .5 78 .5 0 0')
            host.control({'action': 'fixture-time', 'world': WORLD, 'time': 6000})
            return {'ok': True, 'native': verify_scope()}
        if action == 'inspect':
            return {'ok': True, 'native': verify_scope()}
        if action == 'daylight':
            verify_scope()
            host.send(f'execute in {DIMENSION} run weather clear')
            host.control({'action': 'fixture-time', 'world': WORLD, 'time': 6000})
            return {'ok': True, 'native': verify_scope()}
        raise ValueError('Unknown private fixture request')

    try:
        host.arm_deadline()
        host.prepare()
        realm = host.control({'action': 'create', 'world': WORLD, 'terrain': 'flat', 'seed': 20261125})
        world_id = realm['world_uuid']
        host.control({'action': 'admit', 'world': WORLD, 'player': PLAYER})
        report['world_uuid'] = world_id
        report['fixture_pid'] = host.process.pid
        actor = subprocess.Popen(['node', str(ROOT / 'scripts/verify_pilot_burrow_recovery.cjs'),
                                  str(output), str(channel)], cwd=ROOT,
                                 stdout=(output / 'actor.log').open('w'),
                                 stderr=subprocess.STDOUT,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        next_health = 0
        seen = set()
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
                    # Unique immutable replies avoid Windows replace/read sharing
                    # violations; an acknowledged setup is never dispatched twice.
                    atomic_json(channel / (key + '.response.json'), dict(response, id=key))
                    atomic_json(output / 'setup.json', report)
            time.sleep(.05)
        report['actor_exit_code'] = actor.returncode
        report['native'] = json.loads((output / 'report.json').read_text())
        report['complete'] = actor.returncode == 0 and report['native'].get('complete') is True
        if not report['complete']:
            raise RuntimeError('Native burrow checks did not complete; inspect actor report')
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
    parser.add_argument('--output', default='logs/pilot-burrow-recovery-native')
    parser.add_argument('--duration', type=int, default=600)
    args = parser.parse_args()
    if not 60 <= args.duration <= 600:
        parser.error('Duration must be 60–600 seconds')
    if not args.run:
        print(json.dumps(dict(fixture_only=True, world=WORLD, port=25571,
                              heap_mib=512, duration=args.duration, production_commands=False)))
    else:
        run(ROOT / args.output, args.duration)
