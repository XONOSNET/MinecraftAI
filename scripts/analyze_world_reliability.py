"""Read-only run audit. Failed bot-time is reported separately from success speed."""
import argparse
import collections
import json
import mmap
import re
import statistics
from pathlib import Path


def recent_runs(path, limit=12):
    """Decode bounded individual sessions, avoiding the full training-memory tree."""
    if limit < 1:
        raise ValueError('limit must be positive')
    runs = []
    seen = set()
    with Path(path).open('rb') as stream, mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as data:
        for match in reversed(list(re.finditer(rb'"run"\s*:\s*"world-\d+"', data))):
            start = data.rfind(b'{', 0, match.start())
            try:
                record, _ = json.JSONDecoder().raw_decode(data[start:start + 24_000_000].decode('utf-8'))
            except (ValueError, UnicodeDecodeError):
                continue
            if 'results' not in record or record.get('active') or record['run'] in seen:
                continue
            # Aborted comparisons and partial snapshots are not complete trials.
            if record.get('phase') != 'finished':
                continue
            runs.append(record)
            seen.add(record['run'])
            if len(runs) >= limit:
                break
    return list(reversed(runs))


def failure(result):
    text = result.get('message', '').lower()
    if result.get('failure_category') == 'death' or result.get('health') == 0 or 'died during' in text:
        return 'death', 'survival outcome; cause requires encounter evidence'
    if 'no reachable wood' in text or result.get('failure_category') == 'resource_unavailable':
        return 'resource_search', 'resource scarcity or reachability; not proof of absent resources'
    if 'time limit' in text or result.get('failure_category') == 'deadline':
        return 'deadline', 'unfinished work; inspect earlier phases'
    if any(s in text for s in ('stationary', 'no construction or movement', 'no safe return route', 'no route progress')):
        return 'navigation_stall', 'controller/policy attribution requires route and selected-action evidence'
    if any(s in text for s in ('did not open', 'windowopen', 'server did not answer', 'supporting face')):
        return 'interaction_or_placement', 'controller/geometry/server acknowledgement; not automatically infrastructure'
    if any(s in text for s in ('need three planks', 'missing materials', 'no cooking fuel', 'missing item')):
        return 'supplies', 'task recovery or inventory planning'
    return 'other', 'unclassified; inspect stop report'


def summarize(runs):
    groups = collections.defaultdict(list)
    failures = collections.defaultdict(list)
    run_rows = []
    for run in runs:
        rows = [run.get('results', {}).get(name, {}) for name in run.get('bots', run.get('results', {}))]
        rows = [r for r in rows if r.get('state') in ('complete', 'stopped')]
        driver = run.get('driver', 'unknown')
        groups[driver].extend(rows)
        for row in rows:
            if row['state'] == 'stopped':
                category, attribution = failure(row)
                failures[category].append((row, attribution))
        run_rows.append(dict(run=run['run'], driver=driver, learning_phase=run.get('learning_phase'),
                             night_level=run.get('night_level'), scenario=run.get('scenario'),
                             completed=sum(r['state'] == 'complete' for r in rows), attempts=len(rows),
                             controller_revision=run.get('controller_revision'),
                             reported_controller_revisions=sorted({r.get('timings', {}).get('controller_revision') for r in rows if r.get('timings', {}).get('controller_revision')}),
                             behavior_revision=run.get('behavior_snapshot', {}).get('revision')))
    def metrics(rows):
        successes = [r for r in rows if r['state'] == 'complete']
        times = [r['seconds'] for r in successes if isinstance(r.get('seconds'), (int, float))]
        failed = [r for r in rows if r['state'] == 'stopped']
        return dict(attempts=len(rows), completed=len(successes), failed=len(failed),
                    completion_rate=len(successes) / len(rows) if rows else None,
                    successful_median_seconds=statistics.median(times) if times else None,
                    successful_times_seconds=times,
                    failed_attempt_bot_seconds=sum(r.get('seconds', 0) for r in failed),
                    reported_final_idle_bot_seconds=sum(r.get('idle_seconds', 0) or 0 for r in failed))
    return dict(runs=run_rows, by_driver={k: metrics(v) for k, v in groups.items()},
                failures={k: dict(count=len(v), failed_attempt_bot_seconds=sum(r.get('seconds', 0) for r, _ in v),
                                 attribution=v[0][1], messages=dict(collections.Counter(r.get('message', '') for r, _ in v)))
                          for k, v in sorted(failures.items(), key=lambda pair: -len(pair[1]))},
                cautions=['Bot-seconds sum concurrent attempts; they are not wall-clock delay or wholly wasted learning.',
                          'Historical runs can use different controllers, sites and policies; this is a diagnostic audit, not a matched improvement estimate.',
                          'Behavior revision identifies settings, not controller source. Missing controller revisions cannot establish matched versions.',
                          'Success times include the required survival watch; never reward shorter failed attempts.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--path', default='data/world-training.json')
    parser.add_argument('--limit', type=int, default=12)
    args = parser.parse_args()
    print(json.dumps(summarize(recent_runs(args.path, args.limit)), indent=2))
