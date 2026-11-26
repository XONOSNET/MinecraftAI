"""Bounded read-only continuing-world evidence; never restarts or rescues a bot."""
import argparse
import json
from pathlib import Path
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    with urllib.request.urlopen(url, timeout=8) as response:
        return json.load(response)


def observe(output, hours=4, interval=15):
    output = Path(output).resolve()
    if not output.is_relative_to(ROOT / 'logs'):
        raise ValueError('Observation evidence must remain under logs')
    if not 0 < hours <= 8 or not 5 <= interval <= 60:
        raise ValueError('Use a bounded observation of at most eight hours, at low request rate')
    output.mkdir(parents=True, exist_ok=True)
    report = dict(started_at=time.time(), target_ticks=168000, complete=False,
                  human_interventions=0, samples=0, request_failures=0, interruptions=[])
    deadline = time.monotonic() + hours * 3600
    last_connected = None
    try:
        while time.monotonic() < deadline:
            try:
                state = fetch('http://127.0.0.1:8100/status')
                if state['identity'] != 'HomeAI01' or state['world_name'] != 'lab_persistent_pilot':
                    raise RuntimeError('Observer found the wrong pilot scope')
                identifier = state.get('world_uuid')
                if identifier:
                    if report.get('world_uuid') not in (None, identifier):
                        raise RuntimeError('Persistent world UUID changed during observation')
                    report['world_uuid'] = identifier
                current = state.get('state') or {}
                demo = current.get('demo', {})
                row = dict(at=time.time(), enabled=state['enabled'], connected=state['connected'],
                           reason=state.get('reason'), world_uuid=state.get('world_uuid'),
                           world=state.get('world'), player=state.get('player'), life=state.get('life'),
                           demo=demo, metrics=current.get('metrics'), recovery=current.get('recovery'),
                           production=state.get('production'))
                with (output / 'samples.jsonl').open('a', encoding='utf-8') as stream:
                    stream.write(json.dumps(row) + '\n')
                report['samples'] += 1
                report['latest'] = row
                report['actual_active_days'] = demo.get('active_ticks', 0) / 24000
                report['human_interventions'] = current.get('metrics', {}).get('humanInterventions', 0)
                if last_connected is True and not state['connected']:
                    report['interruptions'].append(dict(at=row['at'], reason=state.get('reason')))
                last_connected = state['connected']
                if demo.get('active_ticks', 0) >= report['target_ticks']:
                    report['complete'] = True
                    report['stop_reason'] = 'Seven connected, observed Minecraft days reached; inspect lifecycle outcomes separately'
                    break
                if not state['enabled']:
                    report['stop_reason'] = 'Pilot intentionally paused; observer respected the pause'
                    break
            except (OSError, ValueError, KeyError) as error:
                report['request_failures'] += 1
                report['last_request_error'] = str(error)
            report['updated_at'] = time.time()
            temporary = output / 'report.tmp'
            temporary.write_text(json.dumps(report, indent=2), encoding='utf-8')
            temporary.replace(output / 'report.json')
            time.sleep(min(interval, max(0, deadline-time.monotonic())))
        else:
            report['stop_reason'] = 'Bounded observer duration expired; continuing pilot was not changed'
    except Exception as error:
        report['stop_reason'] = 'Observer stopped on invalid evidence; continuing pilot was not changed'
        report['error'] = f'{type(error).__name__}: {error}'
        raise
    finally:
        report['finished_at'] = time.time()
        report['elapsed_seconds'] = report['finished_at']-report['started_at']
        (output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='logs/persistent-pilot-seven-days')
    parser.add_argument('--hours', type=float, default=4)
    parser.add_argument('--interval', type=float, default=15)
    args = parser.parse_args()
    result = observe(args.output, args.hours, args.interval)
    print(json.dumps({key: result.get(key) for key in ('complete', 'actual_active_days', 'stop_reason', 'elapsed_seconds')}))
