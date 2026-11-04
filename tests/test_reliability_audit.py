from scripts.analyze_world_reliability import recent_runs, summarize, failure
import json


def test_failed_speed_cannot_lower_successful_median():
    run = dict(run='world-1', driver='teacher', results={
        'a': dict(state='complete', seconds=2000),
        'b': dict(state='stopped', seconds=10, message='Stationary for 90 seconds')})
    report = summarize([run])
    assert report['by_driver']['teacher']['successful_median_seconds'] == 2000
    assert report['by_driver']['teacher']['failed_attempt_bot_seconds'] == 10
    assert report['failures']['navigation_stall']['count'] == 1
    assert failure(dict(health=2, message='No safe return route'))[0] == 'navigation_stall'


def test_reader_excludes_active_aborted_and_nested_run_references(tmp_path):
    path = tmp_path / 'runs.json'
    def run(n, **kw):
        return dict(run=f'world-{n}', phase='finished', active=False, results={'a': dict(state='complete', seconds=100)}, **kw)
    active = run(3); active.update(active=True, phase='running')
    aborted = run(4); aborted['phase'] = 'stopped'
    path.write_text(json.dumps(dict(history=[run(1), run(2)], session=active, aborted=aborted, reference={'run':'world-2'})))
    assert [r['run'] for r in recent_runs(path, 1)] == ['world-2']
    assert [r['run'] for r in recent_runs(path, 2)] == ['world-1', 'world-2']
