"""Analyze the matched opening wind-up study using native receipt order."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
from statistics import median

from scripts.combat_opening_evidence import summarize as summarize_opening


ARMS = ('existing', 'grounded')
PAIRS = 12


def _distribution(values):
    values = [value for value in values if value is not None]
    return dict(n=len(values), min_ms=min(values), median_ms=median(values), max_ms=max(values)) if values else dict(n=0)


def _opening_diagnostics(fights):
    # Both arms make opening proposals even when the saved policy already chose attack.
    openings = [fight['intervention'] for fight in fights if fight['intervention'] is not None]
    requests = [opening for opening in openings if opening['request'] is not None]
    confirmed = [opening for opening in requests if opening['first_hurt_consistent_with_request'] is not None]
    return dict(
        planned_fights=PAIRS,
        valid_fights=len(fights),
        no_trigger=len(fights) - len(openings),
        opening_proposals=sum(opening['proposal'] is not None for opening in openings),
        already_preferred_attack=sum(not opening['changed_action'] for opening in openings),
        grounded_at_proposal=sum(opening.get('grounded_at_proposal') is True for opening in openings),
        footing_refusals=sum(opening.get('refusal_reason') == 'lost_grounding' for opening in openings),
        helper_refusals=sum(opening['helper_refused'] and opening.get('refusal_reason') != 'lost_grounding'
                            for opening in openings),
        critical_windups=sum(opening.get('critical_windup') is True for opening in openings),
        critical_swings=sum(opening.get('critical_attempts') or 0 for opening in openings),
        attack_requests=len(requests),
        attributable_hit_confirmations=len(confirmed),
        openings_without_attributable_hit=len(openings) - len(confirmed),
        requests_without_attributable_hit=len(requests) - len(confirmed),
        attribution=dict(Counter(opening['attribution'] for opening in openings)),
        proposal_vs_first_damage=dict(Counter(opening['proposal_vs_first_damage'] for opening in openings)),
        request_vs_first_damage=dict(Counter(opening['request_vs_first_damage'] for opening in requests)),
        attributed_hit_vs_first_damage=dict(Counter(opening['consistent_hurt_vs_first_damage'] for opening in confirmed)),
        proposal_to_request=_distribution(opening['request_minus_proposal_ms'] for opening in requests),
        request_to_confirmation=_distribution(opening['consistent_hurt_minus_request_ms'] for opening in confirmed),
        total_damage_hp=sum(fight['damage'] for fight in fights),
    )


def _pair_diagnostics(pairs):
    # Wind-up eligibility emerges after the fight starts. This split is
    # descriptive only and cannot substitute for the all-assigned-pair gate.
    split = {}
    for pair in pairs:
        if 'conservative_first_hit_difference' not in pair:
            continue
        opening = pair['existing']['intervention']
        if not opening:
            kind = 'existing_no_trigger'
        elif opening.get('critical_windup') is True:
            kind = 'existing_windup'
        elif opening.get('critical_windup') is False:
            kind = 'existing_no_windup'
        else:
            kind = 'existing_windup_unknown'
        count = split.setdefault(kind, dict(pairs=0, better=0, tied=0, worse=0, net_gain=0))
        delta = pair['conservative_first_hit_difference']
        count['pairs'] += 1
        count[{1: 'better', 0: 'tied', -1: 'worse'}[delta]] += 1
        count['net_gain'] += delta
    return split


def summarize(rows, seeds):
    """Score all valid matched fights and diagnose the actual opening execution."""
    seeds = list(seeds)
    if len(seeds) != PAIRS:
        raise ValueError(f'Expected {PAIRS} preregistered starts')
    result = summarize_opening(rows, seeds, comparison='grounded', reference='existing')
    pairs = result['pairs']
    result['opening_diagnostics'] = {
        arm: _opening_diagnostics([pair[arm] for pair in pairs if pair[arm] is not None]) for arm in ARMS
    }
    result['descriptive_pairs_by_existing_windup'] = _pair_diagnostics(pairs)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path, help='The native runner\'s report.json')
    args = parser.parse_args()
    raw = args.report.read_bytes()
    report = json.loads(raw)
    print(json.dumps(dict(
        report_sha256=hashlib.sha256(raw).hexdigest(),
        analyzer_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        analysis=summarize(report['rows'], report['seeds']),
        cleaned=report.get('cleaned'),
        interrupted=report.get('interrupted'),
        invalid_attempts=report['invalid_attempts'],
    ), indent=2, allow_nan=False))
