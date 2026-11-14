"""Summarize paired dashboard latency without imputing timed-out phase or backlog."""

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import json
from math import ceil
from pathlib import Path
from statistics import median


STATUS = '/status?compact=true'
CONTROL = '/brain/data'
SLOW_MS = 500


def stats(rows):
    done = [row for row in rows if row.get('status') == 200 and 'error' not in row]
    latency = sorted(row['latency_ms'] for row in done)
    return dict(
        samples=len(rows), completed=len(done),
        timeouts=sum(row.get('error') == 'TimeoutError' for row in rows),
        other_failures=len(rows) - len(done) - sum(row.get('error') == 'TimeoutError' for row in rows),
        median_ms=round(median(latency), 1) if latency else None,
        p95_ms=round(latency[ceil(.95 * len(latency)) - 1], 1) if latency else None,
        max_ms=round(latency[-1], 1) if latency else None,
        completed_at_least_500ms=sum(value >= SLOW_MS for value in latency),
    )


def summarize(pairs):
    routes = defaultdict(list)
    phases = defaultdict(list)
    misses = []
    joint_slow = Counter()
    slow_label = {(True, True): 'both', (True, False): 'status_only',
                  (False, True): 'control_only', (False, False): 'neither'}
    for pair in pairs:
        mapping = {row['path']: row for row in pair['results']}
        status, control = mapping[STATUS], mapping[CONTROL]
        for path, row in mapping.items():
            routes[path].append(row)
        if status.get('status') == 200 and 'error' not in status:
            phases[(status.get('world_phase'), status.get('learning_phase'))].append(status)
        slow = (status['latency_ms'] >= SLOW_MS, control['latency_ms'] >= SLOW_MS)
        joint_slow[slow_label[slow]] += 1
        if status.get('error') == 'TimeoutError':
            misses.append(dict(at=status['at'], headers_received='headers_ms' in status,
                               control_ms=round(control['latency_ms'], 1), control_error=control.get('error'),
                               narrow_ms=mapping.get('/fixture/health', {}).get('latency_ms')))
    status_rows = sorted(routes[STATUS], key=lambda row: row['at'])
    complete = [row for row in status_rows if row.get('status') == 200 and 'error' not in row]
    for miss in misses:
        when = datetime.fromisoformat(miss['at'])
        nearby = [row for row in complete if abs((datetime.fromisoformat(row['at']) - when).total_seconds()) <= 60]
        before = next((row for row in reversed(nearby) if row['at'] < miss['at']), None)
        after = next((row for row in nearby if row['at'] > miss['at']), None)
        miss['adjacent_successes'] = [{key: row[key] for key in ('at', 'world_phase', 'learning_phase', 'persistence')
                                       if key in row} if row else None for row in (before, after)]
    return dict(routes={path: stats(rows) for path, rows in routes.items()}, paired_at_least_500ms=joint_slow,
                status_timeouts=misses,
                completed_status_by_phase=[
                    dict(world=world, learning=learning, **stats(rows),
                         pending_counts=dict(Counter(row.get('persistence', {}).get('pending') for row in rows)))
                    for (world, learning), rows in phases.items()])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('traces', nargs='+', type=Path)
    args = parser.parse_args()
    records = [json.loads(line) for trace in args.traces for line in trace.read_text().splitlines()]
    print(json.dumps(summarize(records), indent=2, allow_nan=False))
