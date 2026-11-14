"""Analyze matched training-only opening attacks using client receipt order."""

from collections import Counter
from math import ceil, isfinite
from statistics import mean


AMBIGUITY_MS = 50
MIN_GAIN_FRACTION = .25
ARMS = ("control", "opening")


def _first(events, kind, *, action=None):
    return next((row for row in events if row["kind"] == kind and
                 (action is None or row.get("action") == action)), None)


def _delta_ms(a, b):
    if a is None or b is None:
        return None
    return a["at_ms"] - b["at_ms"]


def _relative(a, b):
    delta = _delta_ms(a, b)
    if delta is None:
        return "event_missing"
    if abs(delta) <= AMBIGUITY_MS:
        return "within_50ms"
    return "before" if delta < 0 else "after"


def _first_hit(row, hurt, damage, player_hurt):
    if hurt is None:
        if row["win"]:
            return "ambiguous", "win_without_target_hurt_packet"
        return "failure", "no_target_hurt_or_win"
    if damage is None:
        if row["damage"] > 0 or row["dead"]:
            return "ambiguous", "damage_without_health_loss_timestamp"
        return "success", "target_hurt_without_player_damage"
    order = _relative(hurt, damage)
    if order == "within_50ms":
        return "ambiguous", "target_hurt_and_player_damage_within_50ms"
    native_order = _relative(hurt, player_hurt)
    if native_order == "within_50ms":
        return "ambiguous", "target_and_player_hurt_packets_within_50ms"
    if player_hurt is not None and native_order != order:
        return "ambiguous", "player_hurt_packet_conflicts_with_health_loss_order"
    if order == "before":
        return "success", "target_hurt_observed_first"
    return "failure", "player_damage_observed_first"


def _intervention_timing(row, events, hurt, damage):
    intervention = row.get("intervention")
    if not intervention:
        return None
    decision = intervention["decision"]
    step_events = [event for event in events if event.get("decision") == decision]
    proposal = _first(step_events, "proposal", action=6)
    request = _first(step_events, "attack_request")
    requests_before_hurt = ([event for event in events[:events.index(hurt)]
                             if event["kind"] == "attack_request"] if hurt else [])
    # A packet is not a causal acknowledgement of a particular request. The
    # first hurt is only consistent with this swing if it has no competitors.
    consistent = (request is not None and intervention["attack_requests"] == 1 and
                  requests_before_hurt == [request])
    acceptance = intervention["helper_accepted"]
    return {
        **intervention,
        "changed_action": intervention["underlying_action"] != 6,
        "proposal": proposal,
        "request": request,
        "helper_refused": acceptance is False,
        "proposal_vs_first_damage": _relative(proposal, damage),
        "proposal_minus_first_damage_ms": _delta_ms(proposal, damage),
        "request_vs_first_damage": _relative(request, damage),
        "request_minus_first_damage_ms": _delta_ms(request, damage),
        "request_minus_proposal_ms": _delta_ms(request, proposal),
        "first_hurt_consistent_with_request": hurt if consistent else None,
        "consistent_hurt_vs_first_damage": _relative(hurt if consistent else None, damage),
        "consistent_hurt_minus_request_ms": _delta_ms(hurt if consistent else None, request),
        "attribution": (
            "consistent_with_only_prior_request" if consistent else
            "no_recorded_request" if request is None else
            "no_target_hurt_packet" if hurt is None else
            "first_hurt_precedes_request" if request not in requests_before_hurt else
            "competing_or_unverified_requests"
        ),
    }


def _fight(row):
    events = row["events"]
    times = [event["at_ms"] for event in events]
    if any(not isfinite(t) for t in times) or times != sorted(times):
        raise ValueError("Native event receipts must be in monotonic order")
    if not isfinite(row["damage"]) or row["damage"] < 0:
        raise ValueError("Invalid terminal damage")
    proposal = _first(events, "proposal", action=6)
    request = _first(events, "attack_request")
    hurt = _first(events, "target_hurt")
    damage = _first(events, "player_damage")
    player_hurt = _first(events, "player_hurt")
    result, reason = _first_hit(row, hurt, damage, player_hurt)
    return {
        **{field: row[field] for field in ("seed", "arm", "win", "dead", "escaped", "damage")},
        "reason": row.get("reason"),
        "first_hit": result,
        "first_hit_reason": reason,
        "first_attack_proposal": proposal,
        "first_attack_request": request,
        "first_target_hurt": hurt,
        "first_player_damage": damage,
        "first_player_hurt": player_hurt,
        "target_hurt_vs_first_player_damage": _relative(hurt, damage),
        "target_hurt_vs_first_player_hurt": _relative(hurt, player_hurt),
        "first_attack_proposal_vs_first_damage": _relative(proposal, damage),
        "first_attack_request_minus_proposal_ms": (
            _delta_ms(request, proposal) if proposal and request and
            proposal.get("decision") is not None and proposal["decision"] == request.get("decision") else None
        ),
        "intervention": _intervention_timing(row, events, hurt, damage),
    }


def _arm_summary(rows):
    status = Counter(row["first_hit"] for row in rows)
    triggers = [row["intervention"] for row in rows if row["intervention"] is not None]
    changed = [trigger for trigger in triggers if trigger["changed_action"]]
    return {
        "fights": len(rows),
        "hit_before_damage": status["success"],
        "ambiguous": status["ambiguous"],
        "not_hit_before_damage": status["failure"],
        "confirmed_share": status["success"] / len(rows) if rows else None,
        "possible_share": (status["success"] + status["ambiguous"]) / len(rows) if rows else None,
        "wins": sum(row["win"] for row in rows),
        "deaths": sum(row["dead"] for row in rows),
        "escapes": sum(row["escaped"] for row in rows),
        "mean_total_damage": mean(row["damage"] for row in rows) if rows else None,
        "triggered": len(triggers),
        "no_trigger": len(rows) - len(triggers),
        "already_preferred_attack": len(triggers) - len(changed),
        "changed_action": len(changed),
        "trigger_helper_refusals": sum(trigger["helper_refused"] for trigger in triggers),
        "forced_helper_refusals": sum(trigger["helper_refused"] for trigger in changed),
        "forced_proposals_vs_first_damage": dict(Counter(
            trigger["proposal_vs_first_damage"] for trigger in changed)),
        "forced_requests_after_damage": sum(trigger["request_vs_first_damage"] == "after" for trigger in changed),
        "forced_requests_within_50ms_of_damage": sum(trigger["request_vs_first_damage"] == "within_50ms"
                                                    for trigger in changed),
        "forced_requests_without_consistent_confirmation": sum(
            trigger["request"] is not None and not trigger["first_hurt_consistent_with_request"]
            for trigger in changed),
        "forced_consistent_confirmation_then_damage": sum(
            trigger["consistent_hurt_vs_first_damage"] == "before" for trigger in changed),
        "forced_confirmations_vs_first_damage": dict(Counter(
            trigger["consistent_hurt_vs_first_damage"] for trigger in changed
            if trigger["first_hurt_consistent_with_request"] is not None)),
        "forced_request_attribution": dict(Counter(trigger["attribution"] for trigger in changed)),
    }


def summarize(rows, seeds):
    """Report the fixed ordered pairs; never pass when a matched arm is missing."""
    seeds = list(seeds)
    expected = {(seed, arm) for seed in seeds for arm in ARMS}
    if not seeds or len(seeds) != len(set(seeds)):
        raise ValueError("Expected distinct planned starts")
    fights, orders, exclusions = {}, {}, []
    for row in rows:
        key = (row["seed"], row["arm"])
        if key not in expected or key in orders:
            raise ValueError(f"Unexpected or duplicate matched row: {key}")
        orders[key] = len(orders)
        if not row["valid"]:
            exclusions.append(dict(seed=row["seed"], arm=row["arm"],
                                   reason=row.get("invalid_reason") or row.get("reason")))
            continue
        fights[key] = _fight(row)
    pairs = []
    gains = Counter()
    paired_rows = {arm: [] for arm in ARMS}
    for seed in seeds:
        sides = {arm: fights.get((seed, arm)) for arm in ARMS}
        pair = dict(seed=seed, **sides,
                    observed_order=sorted((arm for arm in ARMS if (seed, arm) in orders),
                                          key=lambda arm: orders[seed, arm]))
        if all(side is not None for side in sides.values()):
            for arm, side in sides.items():
                paired_rows[arm].append(side)
            c, o = sides["control"], sides["opening"]
            difference = int(o["first_hit"] == "success") - int(c["first_hit"] != "failure")
            pair["conservative_first_hit_difference"] = difference
            gains[difference] += 1
        pairs.append(pair)
    n = len(paired_rows["control"])
    complete = n == len(seeds)
    arms = {arm: _arm_summary([fights[seed, arm] for seed in seeds if (seed, arm) in fights])
            for arm in ARMS}
    gain = gains[1] - gains[-1]
    threshold = ceil(len(seeds) * MIN_GAIN_FRACTION)
    safety = None
    if complete:
        c, o = arms["control"], arms["opening"]
        safety = dict(no_more_deaths=o["deaths"] <= c["deaths"],
                      no_more_escapes=o["escapes"] <= c["escapes"],
                      no_fewer_wins=o["wins"] >= c["wins"],
                      no_more_mean_damage=o["mean_total_damage"] <= c["mean_total_damage"] + 1e-9)
    return dict(
        complete=complete, passed=bool(complete and gain >= threshold and all(safety.values())),
        planned_pairs=len(seeds), completed_pairs=n, pairs=pairs, exclusions=exclusions, arms=arms,
        minimum_gain_fraction=MIN_GAIN_FRACTION, required_net_gain=threshold,
        conservative_net_gain=gain if complete else None,
        conservative_share_gain=gain / len(seeds) if complete else None,
        conservative_pairs=dict(better=gains[1], tied=gains[0], worse=gains[-1]),
        safety=safety,
        ambiguity_ms=AMBIGUITY_MS,
        interpretation=("Packet and health-loss receipt times are not server hit times. "
                        "When both sides dealt damage, target hurt within 50 ms of the first "
                        "health loss or owned-mob hurt packet is ambiguous, as is conflicting "
                        "damage order. For screening, ambiguous opening "
                        "outcomes count as failures and ambiguous control outcomes as successes. "
                        "No-trigger and helper-refused outcomes remain in their assigned arm."),
    )


if __name__ == "__main__":
    import argparse
    import hashlib
    import json
    from pathlib import Path

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path, help="The native runner's report.json")
    args = parser.parse_args()
    raw = args.report.read_bytes()
    report = json.loads(raw)
    print(json.dumps({
        "report_sha256": hashlib.sha256(raw).hexdigest(),
        "analyzer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "analysis": summarize(report["rows"], report["seeds"]),
        "interrupted": report.get("interrupted"),
        "invalid_attempts": report["invalid_attempts"],
    }, indent=2, allow_nan=False))
