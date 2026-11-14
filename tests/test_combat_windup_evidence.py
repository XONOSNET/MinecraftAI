from scripts.combat_windup_evidence import summarize


SEEDS = list(range(12))


def fight(seed, arm, *, first_hit=False, ambiguous=False, windup=False,
          triggered=True, refusal=None, damage=2):
    events = [dict(kind='player_damage', at_ms=100, decision=1, loss=damage)]
    opening = None
    if triggered:
        request_at = 15 if first_hit else 130
        request_at = 90 if ambiguous else request_at
        hit_at = 30 if first_hit else 170
        hit_at = 107 if ambiguous else hit_at
        events.append(dict(kind='proposal', at_ms=0, decision=1, action=6))
        if not refusal:
            events.extend([dict(kind='attack_request', at_ms=request_at, decision=1),
                           dict(kind='target_hurt', at_ms=hit_at, decision=1)])
        opening = dict(decision=1, underlying_action=6, helper_accepted=not refusal,
                       attack_requests=int(not refusal), grounded_at_proposal=refusal != 'lost_grounding',
                       refusal_reason=refusal, critical_windup=windup, critical_attempts=int(windup and not refusal))
    return dict(seed=seed, arm=arm, damage=damage, win=True, dead=False, escaped=False,
                intervention=opening, events=sorted(events, key=lambda event: event['at_ms']), valid=True)


def test_windup_gate_includes_pairs_with_no_critical_attempt_or_trigger():
    rows = []
    for seed in SEEDS:
        existing = fight(seed, 'existing', windup=seed < 2, triggered=seed != 11)
        grounded = fight(seed, 'grounded', first_hit=seed < 4)
        rows.extend((existing, grounded) if seed % 2 == 0 else (grounded, existing))

    result = summarize(rows, SEEDS)
    assert result['complete'] and result['passed'] and result['required_net_gain'] == 3
    assert result['completed_pairs'] == 12 and result['conservative_net_gain'] == 3
    assert result['pairs'][1]['observed_order'] == ['grounded', 'existing']
    assert result['descriptive_pairs_by_existing_windup'] == {
        'existing_windup': dict(pairs=2, better=2, tied=0, worse=0, net_gain=2),
        'existing_no_windup': dict(pairs=9, better=2, tied=7, worse=0, net_gain=2),
        'existing_no_trigger': dict(pairs=1, better=0, tied=0, worse=1, net_gain=-1),
    }
    assert result['opening_diagnostics']['existing']['no_trigger'] == 1
    assert result['opening_diagnostics']['existing']['already_preferred_attack'] == 11
    assert result['opening_diagnostics']['existing']['attack_requests'] == 11
    assert result['opening_diagnostics']['grounded']['attack_requests'] == 12

    rows[-2]['damage'] = 3
    assert not summarize(rows, SEEDS)['passed']
    assert not summarize(rows[:-1], SEEDS)['complete']


def test_opening_diagnostics_separate_footing_helper_refusal_and_hit_attribution():
    rows = [fight(0, 'existing', ambiguous=True, windup=True),
            fight(0, 'grounded', first_hit=True),
            fight(1, 'existing', windup=True, refusal='helper_declined'),
            fight(1, 'grounded', refusal='lost_grounding'),
            fight(2, 'grounded')]
    # A later attack preceded target hurt, so that receipt cannot establish
    # that the original opening connected.
    rows[-1]['events'].insert(-1, dict(kind='attack_request', at_ms=145, decision=2))
    result = summarize(rows, SEEDS)
    assert not result['complete'] and result['conservative_net_gain'] is None
    assert result['pairs'][0]['conservative_first_hit_difference'] == 0
    existing = result['opening_diagnostics']['existing']
    grounded = result['opening_diagnostics']['grounded']
    assert existing['critical_windups'] == 2 and existing['critical_swings'] == 1
    assert existing['helper_refusals'] == 1 and existing['footing_refusals'] == 0
    assert grounded['helper_refusals'] == 0 and grounded['footing_refusals'] == 1
    assert grounded['opening_proposals'] == 3 and grounded['attack_requests'] == 2
    assert grounded['attributable_hit_confirmations'] == 1
    assert grounded['openings_without_attributable_hit'] == 2
    assert grounded['requests_without_attributable_hit'] == 1
    assert grounded['attribution'] == {'competing_or_unverified_requests': 1,
                                      'no_recorded_request': 1, 'consistent_with_only_prior_request': 1}
    assert grounded['proposal_to_request'] == dict(n=2, min_ms=15, median_ms=72.5, max_ms=130)
    assert grounded['request_to_confirmation'] == dict(n=1, min_ms=15, median_ms=15, max_ms=15)
