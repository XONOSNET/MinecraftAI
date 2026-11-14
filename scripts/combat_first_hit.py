"""Summarize observed opening opportunities from archived training decisions."""

from collections import Counter
import math
from statistics import median


ATTACK_REACH = 3.0
TEACHER_ALIGNMENT = .12
EPSILON = 1e-6


def _opportunities(row):
    obs = row["observation"]
    if len(obs) != 82:
        raise ValueError("Expected the 82-feature combat observation")
    target_visible = obs[70] > .5 and obs[77] > .5
    in_reach = target_visible and obs[74] > .5 and obs[66] * 32 <= ATTACK_REACH
    ready = in_reach and obs[76] <= EPSILON
    return {
        "in_reach": in_reach,
        "attack_ready_any_yaw": ready,
        "attack_ready_aligned": ready and abs(math.atan2(obs[64], obs[65])) <= TEACHER_ALIGNMENT,
    }


def _counts(rows):
    proposals, controls = Counter(), Counter()
    extra = Counter()
    for row in rows:
        ex = row["execution"]
        proposals[str(row["proposed"])] += 1
        controls.update(ex["controls_ticks"])
        for key in ("physics_ticks", "held_item_ticks", "attack_requests", "target_hurts"):
            extra[key] += ex[key]
        if ex.get("interaction") is True:
            extra["accepted_interactions"] += 1
    return dict(proposals=dict(proposals), controls_ticks=dict(controls), **extra)


def _order(first_damage, event, absent):
    return ("uninjured" if first_damage is None else absent if event is None else
            "damage_before_event" if first_damage < event else
            "same_window" if first_damage == event else "damage_after_event")


def _fight(seed, rows, outcome, reward):
    for row in rows:
        if (row["group"] != "training" or row["event"] != "decision" or not row["valid"]
                or row["seed"] != seed or not row["execution"]):
            raise ValueError("First-hit trace must contain only valid training decisions")
    if not rows:
        raise ValueError("First-hit trace fight has no decisions")
    if outcome is not None and (not rows[-1]["done"] or any(row["done"] for row in rows[:-1])):
        raise ValueError("Expected one terminal decision at the end of the fight")
    window_losses = [row["execution"]["damage_delta"] for row in rows]
    if outcome is not None:
        terminal = reward["win"] if outcome["win"] else reward["death"] if outcome["dead"] else reward["other"]
        losses = [max(0., (row["reward"] - reward["step"] - (terminal if row["done"] else 0))
                      / reward["damage"]) for row in rows]
        if not math.isclose(sum(losses), outcome["damage"], abs_tol=1e-4):
            raise ValueError("Reward-derived damage does not match terminal damage")
    else:
        losses = window_losses
    first_damage = next((i for i, loss in enumerate(losses) if loss > EPSILON), None)
    first_window_damage = next((i for i, loss in enumerate(window_losses) if loss > EPSILON), None)
    first_attack = next((i for i, row in enumerate(rows) if row["execution"]["attack_requests"]), None)
    first_proposal = next((i for i, row in enumerate(rows) if row["proposed"] == 6), None)
    first_target_hurt = next((i for i, row in enumerate(rows) if row["execution"]["target_hurts"]), None)
    order = _order(first_damage, first_attack, "no_attack_requested").replace("_event", "_request")
    cutoff = len(rows) if first_damage is None else first_damage
    flags = [_opportunities(row) for row in rows[:cutoff + 1]]
    windows = {}
    for key in flags[0]:
        eligible = [i for i in range(cutoff) if flags[i][key]]
        earliest = eligible[0] if eligible else None
        windows[key] = {
            "strictly_before_count": len(eligible),
            "also_in_first_damage_interval": None if first_damage is None else flags[first_damage][key],
            "first_opportunity_interval": None if earliest is None else earliest + 1,
            "intervals_to_damage_start": None if first_damage is None or earliest is None else first_damage - earliest,
            "sampled_ms_to_damage_start": None if first_damage is None or earliest is None else sum(
                row["execution"]["elapsed_ms"] for row in rows[earliest:first_damage]),
            **_counts([rows[i] for i in eligible]),
        }
    damage_snapshot = None
    if first_damage is not None:
        row = rows[first_damage]
        obs = row["observation"]
        damage_snapshot = dict(interval=first_damage + 1, gross_damage=losses[first_damage],
                               proposal=row["proposed"], range_blocks=obs[66] * 32,
                               bearing_radians=math.atan2(obs[64], obs[65]), cooldown_fraction=obs[76],
                               sampled_ms_before=sum(r["execution"]["elapsed_ms"] for r in rows[:first_damage]),
                               **_counts([row]))
    before = rows[:cutoff]
    return dict(seed=seed, decisions=len(rows), first_damage=damage_snapshot,
                first_execution_damage_interval=None if first_window_damage is None else first_window_damage + 1,
                first_attack_proposal_interval=None if first_proposal is None else first_proposal + 1,
                first_attack_request_interval=None if first_attack is None else first_attack + 1,
                first_target_hurt_interval=None if first_target_hurt is None else first_target_hurt + 1,
                damage_vs_first_proposal=_order(first_damage, first_proposal, "no_attack_proposal"),
                damage_vs_first_request=order,
                damage_vs_first_target_hurt=_order(first_damage, first_target_hurt, "no_target_hurt_observed"),
                opportunities=windows,
                pre_damage_or_uninjured_fight=_counts(before))


def summarize_first_hit(groups, outcomes=None, *, recipe=None):
    """Report observed eligibility and execution before the first damage observation.

    Supply the training terminal rows and recipe to include damage during gaps
    between execution windows, via the same reward delta used by the learner.
    """
    if not groups:
        raise ValueError("No training decision groups")
    if outcomes is not None and (set(groups) != set(outcomes) or recipe is None):
        raise ValueError("Reward-derived damage requires matched terminal rows and recipe")
    reward = recipe["reward"] if recipe is not None else None
    fights = [_fight(seed, rows, None if outcomes is None else outcomes[seed], reward)
              for seed, rows in groups.items()]
    injured = [row for row in fights if row["first_damage"] is not None]
    opportunity_summary = {}
    for key in fights[0]["opportunities"]:
        eligible = [row["opportunities"][key] for row in injured]
        with_lead = [row for row in eligible if row["strictly_before_count"]]
        opportunity_summary[key] = {
            "injured_fights_with_strictly_prior_opportunity": len(with_lead),
            "injured_fights_with_same_interval_only": sum(
                row["also_in_first_damage_interval"] and not row["strictly_before_count"] for row in eligible),
            "strictly_prior_windows": sum(row["strictly_before_count"] for row in eligible),
            "median_sampled_ms_to_damage_start": (
                median(row["sampled_ms_to_damage_start"] for row in with_lead) if with_lead else None),
            "median_intervals_to_damage_start": (
                median(row["intervals_to_damage_start"] for row in with_lead) if with_lead else None),
        }
        for stat_key in ("proposals", "controls_ticks"):
            totals = Counter()
            for row in with_lead:
                totals.update(row[stat_key])
            opportunity_summary[key][stat_key] = dict(totals)
        opportunity_summary[key]["attack_requests"] = sum(row.get("attack_requests", 0) for row in with_lead)
    return dict(
        summary=dict(fights=len(fights), injured=len(injured),
                     damage_source="reward_delta" if outcomes is not None else "execution_windows_only",
                     first_damage_differs_from_execution_window_count=sum(
                         row["first_damage"]["interval"] != row["first_execution_damage_interval"] for row in injured),
                     **{key: dict(Counter(row[key] for row in fights)) for key in (
                         "damage_vs_first_proposal", "damage_vs_first_request", "damage_vs_first_target_hurt")},
                     opportunities_in_injured_fights=opportunity_summary),
        limitations=[
            "First damage is first observed, not first server hit time; same-window request order is unknown.",
            "Summed execution milliseconds omit gaps between decisions; damage may arrive during a gap.",
            "Visible target, weapon, range <=3 blocks, and cooldown zero describe snapshot attack eligibility; "
            "the shared attack helper can re-aim, wind up a critical jump, or veto the swing as conditions change.",
            "Alignment additionally uses the teacher's 0.12-radian threshold, not an attack-helper requirement.",
            "Consumed controls and hurt packets are observed effects; they do not prove a counterfactual hit or block.",
        ],
        per_fight=fights,
    )
