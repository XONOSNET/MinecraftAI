import pytest

from scripts.combat_opening_evidence import summarize


def event(kind, at_ms, decision=1, **fields):
    return dict(kind=kind, at_ms=at_ms, decision=decision, **fields)


def fight(seed, arm, *, events=(), damage=0, win=True, valid=True, intervention=None):
    return dict(seed=seed, arm=arm, win=win, damage=damage, dead=False,
                escaped=False, valid=valid, events=list(events), intervention=intervention)


def test_includes_ambiguous_asymmetrically_without_dropping_no_triggers():
    rows = [
        fight(1, "control", events=[event("target_hurt", 100), event("player_damage", 150)], damage=2),
        fight(1, "opening", events=[event("target_hurt", 100)]),
        fight(2, "opening", events=[event("target_hurt", 100), event("player_damage", 140)], damage=1),
        fight(2, "control", damage=1),  # Win, but no target packet: potential success.
        fight(3, "control", win=False),
        fight(3, "opening", events=[event("target_hurt", 100)]),
    ]
    result = summarize(rows, [1, 2, 3])
    assert result["complete"] and result["completed_pairs"] == 3
    assert result["arms"]["control"]["ambiguous"] == 2
    assert result["arms"]["opening"]["no_trigger"] == 3
    assert result["conservative_net_gain"] == 0
    assert result["pairs"][1]["observed_order"] == ["opening", "control"]
    assert not result["passed"]


def test_gate_is_a_25_point_paired_gain_and_requires_no_safety_regression():
    rows = []
    for seed in range(12):
        damage = event("player_damage", 100)
        hit = event("target_hurt", 200)
        rows.extend([
            fight(seed, "control", events=[damage, hit], damage=2),
            fight(seed, "opening", events=[event("target_hurt", 0), damage] if seed < 3 else [damage, hit],
                  damage=2),
        ])
    result = summarize(rows, range(12))
    assert result["passed"] and result["required_net_gain"] == 3
    assert result["conservative_pairs"] == {"better": 3, "worse": 0, "tied": 9}
    rows[-1]["damage"] = 3
    assert not summarize(rows, range(12))["passed"]


@pytest.mark.parametrize("native_ms,health_ms,classification,reason", [
    (50, 201, "ambiguous", "target_and_player_hurt_packets_within_50ms"),
    (49, 201, "ambiguous", "player_hurt_packet_conflicts_with_health_loss_order"),
    (151, 49, "ambiguous", "player_hurt_packet_conflicts_with_health_loss_order"),
    (151, 201, "success", "target_hurt_observed_first"),
    (49, 30, "failure", "player_damage_observed_first"),
])
def test_flags_near_or_conflicting_native_damage_receipts(native_ms, health_ms, classification, reason):
    native = event("player_hurt", native_ms, source_id=17)
    row = fight(1, "control", events=sorted([
        native, event("target_hurt", 100), event("player_damage", health_ms),
    ], key=lambda e: e["at_ms"]), damage=2)
    control = summarize([row], [1])["pairs"][0]["control"]
    assert control["first_hit"] == classification
    assert control["first_hit_reason"] == reason
    assert control["first_player_hurt"] == native
    assert control["first_player_damage"]["at_ms"] == health_ms


def test_native_packet_without_health_loss_does_not_count_as_damage():
    row = fight(1, "control", events=[event("player_hurt", 99), event("target_hurt", 100)])
    control = summarize([row], [1])["pairs"][0]["control"]
    assert control["first_hit"] == "success"
    assert control["target_hurt_vs_first_player_hurt"] == "within_50ms"
    assert control["target_hurt_vs_first_player_damage"] == "event_missing"


def test_breaks_out_refusal_late_request_and_unverifiable_confirmation():
    rows = [
        fight(1, "opening", events=[event("proposal", 0, action=6), event("player_damage", 60),
                                    event("attack_request", 120, 2), event("target_hurt", 170, 2)],
              damage=2, intervention=dict(decision=1, helper_accepted=False, underlying_action=2,
                                          attack_requests=0)),
        fight(2, "opening", events=[event("proposal", 0, action=6), event("player_damage", 60),
                                    event("attack_request", 120), event("target_hurt", 170, 2)],
              damage=2, intervention=dict(decision=1, helper_accepted=True, underlying_action=2,
                                          attack_requests=1)),
        fight(3, "opening", events=[event("proposal", 0, action=6), event("attack_request", 30),
                                    event("attack_request", 120, 2), event("target_hurt", 170, 2)],
              intervention=dict(decision=1, helper_accepted=True, underlying_action=2, attack_requests=1)),
        fight(4, "opening", events=[event("proposal", 0, action=6), event("attack_request", 30),
                                    event("target_hurt", 120), event("player_damage", 180)],
              damage=2, intervention=dict(decision=1, helper_accepted=True, underlying_action=2,
                                          attack_requests=1)),
    ]
    result = summarize(rows, [1, 2, 3, 4])
    arm = result["arms"]["opening"]
    assert arm["forced_helper_refusals"] == 1
    assert arm["forced_requests_after_damage"] == 1
    assert arm["forced_requests_without_consistent_confirmation"] == 1
    assert arm["forced_consistent_confirmation_then_damage"] == 1
    assert arm["forced_proposals_vs_first_damage"] == {"before": 3, "event_missing": 1}
    late = result["pairs"][1]["opening"]["intervention"]
    assert late["proposal_minus_first_damage_ms"] == -60
    assert late["request_minus_first_damage_ms"] == 60
    assert late["request_minus_proposal_ms"] == 120
    assert late["consistent_hurt_minus_request_ms"] == 50
    assert not result["complete"] and not result["passed"]


def test_refuses_duplicate_rows_and_keeps_a_logged_invalid_start():
    row = fight(1, "opening", valid=False, win=False)
    row["invalid_reason"] = "invalid fixture"
    result = summarize([row], [1])
    assert result["exclusions"] == [{"seed": 1, "arm": "opening", "reason": "invalid fixture"}]
    assert not result["complete"]
    with pytest.raises(ValueError, match="duplicate"):
        summarize([row, row], [1])
