"""Inject fixture-only dashboard faults and verify cleanup without releasing the mob."""

import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen


def status(timeout=8):
    with urlopen('http://127.0.0.1:8000/status?compact=true', timeout=timeout) as response:
        return json.load(response)


def verify_dashboard_cleanup(pid):
    # Allow the dashboard's player-list cache to catch up after disconnect.
    deadline = time.monotonic() + 20
    while (remaining := deadline - time.monotonic()) > 0:
        try:
            after = status(timeout=min(4, remaining))
        except TimeoutError:
            time.sleep(.25)
            continue
        server = after['server']
        if server['pid'] != pid or not server['ready'] or server['bots_online'] != 8:
            raise RuntimeError('Lab health changed during the timeout probe')
        if not any(p['name'] == 'LabCombatRL' for field in ('players', 'operators') for p in after[field]):
            return
        time.sleep(.5)
    raise RuntimeError('Dashboard did not confirm native fixture disconnect and deop')


def probe(mode):
    seed = 16_000_001 if mode == 'exhaust' else 16_000_002
    log = Path('logs') / f'combat-opening-timeout-{mode}.jsonl'
    before = status()
    server = before['server']
    pid = server['pid']
    assert (pid and server['ready'] and not server['busy'] and server['bots_online'] == 8
            and before['ram_percent'] < 86 and not before['performance']['persistence']['error']
            and not Path('data/lab-stopped').exists()), 'Lab health preflight failed'
    with socket.socket() as lease:
        lease.bind(('127.0.0.1', 48192))
        with log.open('x', encoding='utf-8') as evidence:
            run = subprocess.Popen(['node', '--require', './scripts/combat_opening_timeout_preload.cjs',
                                    'scripts/combat_trial.cjs'], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, text=True, encoding='utf-8',
                                   env={**os.environ, 'COMBAT_TIMEOUT_PROBE': mode})
            request = json.dumps(dict(reset=True, seed=seed, mob='zombie', expected_pid=pid)) + '\n'
            try:
                # EOF follows reset. There is no action or mob release request.
                output, _ = run.communicate(request, timeout=135)
            except subprocess.TimeoutExpired:
                run.kill()
                output, _ = run.communicate()
                evidence.write(output)
                raise RuntimeError('Native probe cleanup could not be confirmed') from None
            evidence.write(output)
    rows = [json.loads(line) for line in output.splitlines()]
    assert len(rows) == 3 and rows[0]['ready'] and rows[-1]['cleaned'], 'Fixture did not verify cleanup'
    reply = rows[1]
    start = reply['start']
    assert start['ai_frozen'] and start['predecision_damage'] == 0
    verified = start['verified']
    assert verified['health'] == verified['food'] == 20
    assert all(verified[name] == start['observed'][name] for name in ('player', 'target'))
    assert verified['loadout'] == dict(mainhand='iron_sword',
                                      armor=['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'],
                                      offhand=None)
    attempts = [attempt['outcome'] for attempt in start['server_attempts']]
    if mode == 'exhaust':
        assert attempts == ['TimeoutError'] * 3
        assert reply['done'] and not reply['valid'] and reply['steps'] == 0 and not reply['events']
        assert reply['stop_fixture'] and reply['health_check_failed'] and run.returncode == 1
    else:
        assert attempts == ['TimeoutError', 'received']
        assert not reply['done'] and len(reply['observation']) == 82 and run.returncode == 0
    verify_dashboard_cleanup(pid)
    return dict(mode=mode, seed=seed, attempts=attempts, release_sent=False,
                cleaned=True, deopped=True, server_pid=pid, output=str(log))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['recover', 'exhaust'])
    print(json.dumps(probe(parser.parse_args().mode)))
