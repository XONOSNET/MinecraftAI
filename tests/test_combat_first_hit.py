import pytest

from scripts.combat_first_hit import summarize_first_hit


RECIPE = {"reward": {"step": -.002, "damage": -.08, "win": 2, "death": -3, "other": -1}}


def decision(*, proposal=0, aligned=True, damage=0, window_damage=0, attack_requests=0, target_hurts=0, done=False):
    obs = [0.] * 82
    obs[66] = 2.5 / 32
    obs[70] = obs[74] = obs[77] = 1.
    obs[64] = 0. if aligned else 1.
    obs[65] = 1. if aligned else 0.
    return dict(group="training", event="decision", valid=True, seed=11, observation=obs,
                proposed=proposal, done=done, reward=-.002 - .08 * damage + (2 if done else 0),
                execution=dict(damage_delta=window_damage, physics_ticks=2, held_item_ticks=0,
                               controls_ticks={"forward": int(proposal == 0), "back": 0},
                               attack_requests=attack_requests, target_hurts=target_hurts, elapsed_ms=100))


def test_reward_damage_gap_is_not_mistaken_for_a_post_hit_opportunity():
    rows = [decision(proposal=1, aligned=False), decision(damage=2.),
            decision(proposal=6, damage=1., window_damage=1., attack_requests=1, done=True)]
    result = summarize_first_hit({11: rows}, {11: dict(win=True, dead=False, damage=3.)}, recipe=RECIPE)
    summary = result["summary"]
    trace = result["per_fight"][0]
    assert summary["damage_vs_first_request"] == {"damage_before_request": 1}
    assert summary["first_damage_differs_from_execution_window_count"] == 1
    assert trace["first_damage"]["interval"] == 2
    assert trace["first_execution_damage_interval"] == 3
    available = trace["opportunities"]["attack_ready_any_yaw"]
    assert available["strictly_before_count"] == 1
    assert available["proposals"] == {"1": 1}
    assert available["also_in_first_damage_interval"]
    assert available["sampled_ms_to_damage_start"] == 100
    aligned = summary["opportunities_in_injured_fights"]["attack_ready_aligned"]
    assert aligned["injured_fights_with_same_interval_only"] == 1
    assert not aligned["strictly_prior_windows"]


def test_same_interval_and_no_damage_are_reported_separately():
    first = [decision(proposal=6), decision(proposal=6, damage=1., window_damage=1., attack_requests=1),
             decision(target_hurts=1, done=True)]
    second = [dict(decision(done=True), seed=12)]
    summary = summarize_first_hit({11: first, 12: second})["summary"]
    assert summary["damage_vs_first_request"] == {"same_window": 1, "uninjured": 1}
    assert summary["damage_vs_first_proposal"] == {"damage_after_event": 1, "uninjured": 1}
    assert summary["damage_vs_first_target_hurt"] == {"damage_before_event": 1, "uninjured": 1}
    opportunities = summary["opportunities_in_injured_fights"]["attack_ready_any_yaw"]
    assert opportunities["injured_fights_with_same_interval_only"] == 0
    assert opportunities["strictly_prior_windows"] == 1


def test_does_not_accept_nontraining_observations_or_inconsistent_loss():
    with pytest.raises(ValueError, match="only valid training"):
        summarize_first_hit({11: [dict(decision(done=True), group="zombie_0")]})
    with pytest.raises(ValueError, match="does not match terminal damage"):
        summarize_first_hit({11: [decision(done=True)]}, {11: dict(win=True, dead=False, damage=1.)}, recipe=RECIPE)
