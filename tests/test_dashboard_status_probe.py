from scripts.summarize_dashboard_status import CONTROL, STATUS, summarize


def pair(second, status, control):
    at = f'2026-11-14T18:00:{second:02d}.000Z'
    return {'results': [dict(path=STATUS, at=at, **status), dict(path=CONTROL, at=at, **control)]}


def test_timeout_is_censored_and_does_not_inherit_adjacent_persistence_or_phase():
    records = [
        pair(10, dict(status=200, latency_ms=40, world_phase='running', learning_phase='demonstrating',
                      persistence=dict(pending=0)), dict(status=200, latency_ms=6)),
        pair(20, dict(latency_ms=1502, error='TimeoutError'), dict(status=200, latency_ms=8)),
        pair(30, dict(status=200, latency_ms=820, world_phase='restoring', learning_phase='evaluating',
                      persistence=dict(pending=12)), dict(status=200, latency_ms=650)),
    ]
    result = summarize(records)
    assert result['routes'][STATUS]['timeouts'] == 1
    assert result['routes'][STATUS]['max_ms'] == 820
    assert result['paired_at_least_500ms'] == {'neither': 1, 'status_only': 1, 'both': 1}
    miss, = result['status_timeouts']
    assert 'persistence' not in miss and miss['headers_received'] is False
    assert [item['world_phase'] for item in miss['adjacent_successes']] == ['running', 'restoring']
