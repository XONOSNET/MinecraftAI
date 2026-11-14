import pytest

from scripts.combat_evidence import compare_arms, summarize


def fight(seed, damage, *, win=True, dead=False, escaped=False, **extra):
    return dict(seed=seed, mob="zombie", damage=damage, seconds=5, win=win, dead=dead,
                escaped=escaped, **extra)


def test_matches_by_start_and_shows_incomplete_groups_explicitly():
    candidate = [fight(8, 0), fight(3, 1), fight(1, 2), fight(11, 6, win=False, invalid=True)]
    teacher = [fight(3, 3), fight(11, 0), fight(8, 2), fight(1, 4)]
    result = compare_arms(candidate, teacher)
    assert result["matched_starts"] == 3
    assert result["candidate_only"] == []
    assert result["reference_only"] == [{"mob": "zombie", "seed": 11}]
    assert result["damage_gain_shared_wins"] == {
        "n": 3, "mean_gain": 2, "better": 3, "tied": 0, "worse": 0,
        "nominal_sign_p_one_sided": .125, "paired_bootstrap_95_descriptive": [2, 2],
    }
    assert result["seconds_gain_equivalent_wins"]["n"] == 0


def test_damage_and_speed_pairing_distinguishes_a_loss_from_a_win():
    result = compare_arms([fight(1, 0, win=False), fight(2, 2, win=True), fight(3, 20, win=False, dead=True)],
                          [fight(1, 2), fight(2, 2.05), fight(3, 0, win=False)])
    assert result["win_gain"]["worse"] == 1
    assert result["damage_gain_shared_wins"]["n"] == 1
    assert result["damage_gain_shared_wins"]["tied"] == 1
    assert result["seconds_gain_equivalent_wins"]["n"] == 1
    assert result["seconds_gain_equivalent_wins"]["mean_gain"] == 0


def test_duplicate_scored_start_is_not_silently_accepted():
    with pytest.raises(ValueError, match="Duplicate scored row"):
        compare_arms([fight(2, 2), fight(2, 1)], [fight(2, 3)])
    # Multiple genuine repetitions have explicit IDs and pair across arm order.
    one = fight(2, 2, start_id="a")
    two = fight(2, 1, start_id="b")
    result = compare_arms([one, two], [two, one])
    assert result["matched_starts"] == 2
    assert result["damage_gain_shared_wins"]["tied"] == 2


def test_logs_observed_execution_separately_and_leaves_missing_telemetry_null():
    rows = [
        fight(1, 1, execution_counts={"proposals": {"6": 5}, "target_hurts": 2}),
        fight(2, 4, win=False, escaped=True, execution_counts={"proposals": {"6": 1, "3": 9},
                                                              "target_hurts": 1}),
        fight(3, 9, win=False, dead=True),
        fight(4, 9, win=False, invalid=True),
    ]
    report = {"benchmarks": {"zombie_0": {"candidate": rows, "teacher": [fight(1, 2)]}},
              "invalid_attempts": [{"arm": "candidate", "seed": 4, "error": "bad setup"}]}
    evidence = summarize(report, per_start=True)
    group = evidence["benchmarks"]["zombie_0"]
    c = group["arms"]["candidate"]
    assert (c["attempts"], c["scored"], c["execution_coverage"]) == (4, 3, 2)
    assert c["terminal_counts"] == {"win": 1, "escape": 1, "death": 1}
    assert c["execution_counts"] == {"proposals": {"6": 6, "3": 9}, "target_hurts": 3}
    assert group["arms"]["teacher"]["execution_counts"] is None
    assert group["per_start"]["candidate"] == rows
    assert evidence["invalid_attempts"] == report["invalid_attempts"]


def test_reports_partial_attempts_without_scoring_and_identifies_reload_arm():
    report = {"retention_benchmarks": {"zombie_0": {
        "teacher": [fight(7, 4)], "result": [fight(7, 2)]}},
        "completed_attempts": [
            fight(7, 2, group="reload_zombie_0", arm="result"),
            fight(8, 3, group="reload_zombie_1", arm="teacher")]}
    evidence = summarize(report, per_start=True)
    assert evidence["benchmarks"]["reload_zombie_0"]["candidate_vs"]["teacher"]["damage_gain_shared_wins"]["mean_gain"] == 2
    assert list(evidence["partial_unscored"]) == ["reload_zombie_1"]
    assert evidence["partial_unscored"]["reload_zombie_1"]["per_start"]["teacher"][0]["seed"] == 8
