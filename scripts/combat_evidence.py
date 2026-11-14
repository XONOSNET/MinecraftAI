"""Read-only summaries of historical and instrumented native combat reports."""

import argparse
import json
import math
from pathlib import Path
import random
from statistics import mean, median


DAMAGE_TIE = .1  # Same practical tie threshold as the benchmark gate.
UNCERTAINTY = (
    "Sign tests and the descriptive paired bootstrap operate on matched starts. "
    "Minecraft runs in one shared world and repeat episodes can be correlated; "
    "these are nominal summaries, not independent replication across worlds."
)


def _key(row):
    return row["mob"], row["seed"], row.get("start_id")


def _identity(key):
    mob, seed, start_id = key
    return {"mob": mob, "seed": seed, **({"start_id": start_id} if start_id is not None else {})}


def _valid(row):
    return not row.get("invalid", False) and row.get("valid", True) and row.get("done", True)


def _terminal(row):
    if row.get("reason"):
        return row["reason"]
    for flag, label in (("dead", "death"), ("escaped", "escape"), ("win", "win")):
        if row.get(flag):
            return label
    return "timeout_or_step_limit"


def _distribution(values):
    return ({"n": len(values), "mean": mean(values), "median": median(values),
             "min": min(values), "max": max(values)} if values else {"n": 0})


def _add_counts(dst, src):
    """Aggregate counter families without conflating proposal and execution."""
    for key, value in src.items():
        if isinstance(value, dict):
            _add_counts(dst.setdefault(key, {}), value)
        elif type(value) in (int, float) and math.isfinite(value):
            dst[key] = dst.get(key, 0) + value


def summarize_arm(rows):
    valid = [row for row in rows if _valid(row)]
    wins = [row for row in valid if row["win"]]
    terminal_counts, execution = {}, {}
    for row in valid:
        reason = _terminal(row)
        terminal_counts[reason] = terminal_counts.get(reason, 0) + 1
        _add_counts(execution, row.get("execution_counts") or {})
    return {
        "attempts": len(rows),
        "scored": len(valid),
        "excluded": len(rows) - len(valid),
        "wins": len(wins),
        "deaths": sum(bool(row.get("dead")) for row in valid),
        "escapes": sum(bool(row.get("escaped")) for row in valid),
        "retreats_reported": sum(row.get("retreats", 0) for row in valid)
        if any("retreats" in row for row in valid) else None,
        "terminal_counts": terminal_counts,
        "damage": _distribution([row["damage"] for row in valid]),
        "win_seconds": _distribution([row["seconds"] for row in wins]),
        "execution_coverage": sum(bool(row.get("execution_counts")) for row in valid),
        "execution_counts": execution or None,
    }


def _by_start(rows):
    result = {}
    for row in rows:
        if not _valid(row):
            continue
        key = _key(row)
        if key in result:
            raise ValueError(f"Duplicate scored row for start {_identity(key)!r}")
        result[key] = row
    return result


def _bootstrap(values):
    if len(values) < 2:
        return None
    rng = random.Random(0)
    sampled = sorted(mean(rng.choices(values, k=len(values))) for _ in range(2000))
    return [sampled[49], sampled[1949]]  # Descriptive 2.5th and 97.5th percentiles.


def _difference(values, tolerance):
    better = sum(value > tolerance for value in values)
    worse = sum(value < -tolerance for value in values)
    non_tied = better + worse
    return {
        "n": len(values),
        "mean_gain": mean(values) if values else None,
        "better": better,
        "tied": len(values) - non_tied,
        "worse": worse,
        "nominal_sign_p_one_sided": (
            sum(math.comb(non_tied, k) for k in range(better, non_tied + 1)) / 2**non_tied
            if non_tied else None
        ),
        "paired_bootstrap_95_descriptive": _bootstrap(values),
    }


def compare_arms(candidate_rows, reference_rows):
    candidate, reference = _by_start(candidate_rows), _by_start(reference_rows)
    keys = [key for key in candidate if key in reference]
    shared = [(candidate[key], reference[key]) for key in keys]
    joint_wins = [(c, r) for c, r in shared if c["win"] and r["win"]]
    equivalent = [(c, r) for c, r in joint_wins if abs(r["damage"] - c["damage"]) <= DAMAGE_TIE]
    return {
        "matched_starts": len(shared),
        "candidate_only": [_identity(key) for key in candidate if key not in reference],
        "reference_only": [_identity(key) for key in reference if key not in candidate],
        "win_gain": _difference([int(c["win"]) - int(r["win"]) for c, r in shared], 0),
        "damage_gain_shared_wins": _difference([r["damage"] - c["damage"] for c, r in joint_wins], DAMAGE_TIE),
        "seconds_gain_equivalent_wins": _difference([r["seconds"] - c["seconds"] for c, r in equivalent], 0),
    }


def summarize(report, *, per_start=False):
    completed = {}
    batches = {**report.get("benchmarks", {}),
               **{"reload_" + name: arms for name, arms in report.get("retention_benchmarks", {}).items()}}
    for batch, arms in batches.items():
        challenger = "candidate" if "candidate" in arms else "result"
        entry = {"arms": {name: summarize_arm(rows) for name, rows in arms.items()},
                 "candidate_vs": {name: compare_arms(arms[challenger], rows)
                                  for name, rows in arms.items() if name != challenger and challenger in arms}}
        if per_start:
            entry["per_start"] = arms
        completed[batch] = entry
    out = {"uncertainty_note": UNCERTAINTY,
           "positive_gain": "More wins, less damage, or less time for the candidate.",
           "timing_note": ("Arm-level win_seconds describes successful fights. Paired time comparisons use "
                           "only shared wins within 0.1 health points of damage."),
           "report_status": {k: report[k] for k in (
               "seed", "used_seeds", "smoke", "cleaned", "status", "weights_changed",
               "checkpoint_sha256", "passed", "promoted", "champion", "candidate_retained", "retained",
               "interrupted", "stopped_for_futility", "reload_verified", "retention_reload",
           ) if k in report},
           "invalid_attempts": report.get("invalid_attempts", []),
           "training": summarize_arm(report.get("training", [])),
           "benchmarks": completed}
    partial = {}
    for row in report.get("completed_attempts", []):
        group = row["group"]
        if group != "training" and group not in batches:
            partial.setdefault(group, {}).setdefault(row["arm"], []).append(row)
    if partial:
        out["partial_unscored"] = {name: {"arms": {arm: summarize_arm(rows) for arm, rows in arms.items()},
                                          **({"per_start": arms} if per_start else {})}
                                   for name, arms in partial.items()}
    if per_start:
        out["training_per_start"] = report.get("training", [])
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--per-start", action="store_true", help="Include raw terminal rows, including excluded rows")
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8-sig"))
    print(json.dumps(summarize(report, per_start=args.per_start), indent=2))


if __name__ == "__main__":
    main()
