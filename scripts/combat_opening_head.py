"""Fit an attack-vs-saved preference from the completed opening replication."""

import hashlib
import json
from math import atan2, isfinite, pi
from pathlib import Path

import torch

from scripts.combat_autonomy import tensor_hash
from scripts.combat_opening import REPLICATION_SEEDS, SAVED, eligible
from scripts.combat_opening_evidence import summarize

RECIPE = 'opening-logistic-v1'
ATTACK = 6


def _features(observation, logits):
    gap = float(logits[ATTACK] - logits[:ATTACK].max())
    return (1.0, (observation[66] * 32 - 2.7) / .3,
            abs(atan2(observation[64], observation[65])) / pi,
            max(-20., min(0., gap)) / 20.)


def _safety_not_worse(proposed, reference):
    return (proposed['damage'] <= reference['damage'] + 1e-9 and
            proposed['win'] >= reference['win'] and proposed['dead'] <= reference['dead'] and
            proposed['escaped'] <= reference['escaped'])


def _label(pair):
    saved, opening = pair['control'], pair['opening']
    intervention = opening['intervention']
    if not intervention or not intervention['changed_action']:
        return None, 'no_changed_proposal'
    if 'ambiguous' in (saved['first_hit'], opening['first_hit']):
        return None, 'ambiguous_outcome'
    if (saved['first_hit'] == 'failure' and opening['first_hit'] == 'success' and
            intervention['first_hurt_consistent_with_request'] and _safety_not_worse(opening, saved)):
        return 1, 'attributable_safe_opening_gain'
    if opening['first_hit'] == 'failure':
        if saved['first_hit'] == 'success':
            return 0, 'control_first_hit_only'
        if _safety_not_worse(saved, opening):
            return 0, 'both_failed_no_safety_advantage'
    return None, 'no_clear_preference'


def _train(features, labels):
    x = torch.tensor(features, dtype=torch.float64)
    y = torch.tensor(labels, dtype=torch.float64)
    weights = torch.zeros(x.shape[1], dtype=x.dtype)
    # Mean binary cross-entropy plus one half the squared weight norm.
    for _ in range(200):
        gradient = x.T @ (torch.sigmoid(x @ weights) - y) / len(y) + weights
        weights -= .1 * gradient
    return weights.tolist()


def _fingerprint(record):
    canonical = json.dumps(record, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


class OpeningHead:
    def __init__(self, payload, fingerprint):
        self.payload = payload
        self.sha256 = fingerprint
        self.weights = tuple(payload['weights'])

    def __call__(self, observation, logits):
        if not eligible(observation) or int(logits.argmax()) == ATTACK:
            return False
        return sum(weight * feature for weight, feature in
                   zip(self.weights, _features(observation, logits), strict=True)) > 0


def load(path):
    """Verify checkpoint contents and original baseline identity before use."""
    checkpoint = json.loads(Path(path).read_bytes())
    payload = checkpoint['payload']
    digest = _fingerprint(payload)
    if (checkpoint['head_sha256'] != digest or payload['recipe'] != RECIPE or
            payload['saved_tensor_sha256'] != SAVED or len(payload['weights']) != 4 or
            not all(isfinite(weight) for weight in payload['weights'])):
        raise ValueError('Opening head checkpoint identity or schema mismatch')
    return OpeningHead(payload, digest)


def fit(model, replication_report, path):
    """Read only the qualifying fresh replication and write a frozen head checkpoint."""
    replication_report = Path(replication_report)
    raw = replication_report.read_bytes()
    report = json.loads(raw)
    if (report.get('protocol') != 'opening-attack-replication' or not report.get('training_only') or
            tuple(report.get('seeds', ())) != REPLICATION_SEEDS or not report.get('cleaned') or
            not report.get('reference_unchanged') or report.get('invalid_attempts') or
            report.get('saved_tensor_sha256') != SAVED or tensor_hash(model) != SAVED):
        raise ValueError('Opening head requires the original saved policy and a clean fresh replication')
    analysis = summarize(report['rows'], REPLICATION_SEEDS)
    if not analysis['passed']:
        raise ValueError('Opening head requires the replication to pass its preregistered gate')

    decisions = (replication_report.parent / 'decisions.jsonl').read_bytes()
    windows = {(row['seed'], row['arm']): row['first_eligible'] for row in report['rows']}
    features, labels, provenance = [], [], []
    opening_decisions = {}
    for line in decisions.splitlines():
        row = json.loads(line)
        if row['event'] == 'decision' and row['arm'] == 'opening':
            key = (row['seed'], row['decision'])
            if key in opening_decisions:
                raise ValueError(f'Duplicate logged decision: {key}')
            opening_decisions[key] = row
    for pair in analysis['pairs']:
        seed = pair['seed']
        label, reason = _label(pair)
        control = windows[(seed, 'control')]
        opening = windows[(seed, 'opening')]
        if not (control and opening):
            label, reason = None, 'missing_first_eligible_window'
        provenance.append(dict(seed=seed, label=label, reason=reason))
        if label is None:
            continue
        row = opening_decisions[(seed, opening['decision'])]
        observation = row['observation']
        with torch.inference_mode():
            logits = model(torch.tensor(observation, dtype=torch.float32))
        if (not row['valid'] or not eligible(observation) or row['proposed'] != ATTACK or
                int(logits.argmax()) != row['saved_action'] or
                row['saved_action'] != opening['underlying_action'] or row['saved_action'] == ATTACK):
            raise ValueError(f'Opening decision does not match frozen model or recorded eligibility: {seed}')
        features.append(_features(observation, logits))
        labels.append(label)

    counts = dict(attack=labels.count(1), saved=labels.count(0), abstained=len(provenance) - len(labels))
    if min(counts['attack'], counts['saved']) < 2:
        raise ValueError(f'Opening head requires at least two distinct starts per label: {counts}')
    payload = dict(recipe=RECIPE, saved_tensor_sha256=SAVED, weights=_train(features, labels),
                   report_sha256=hashlib.sha256(raw).hexdigest(),
                   decisions_sha256=hashlib.sha256(decisions).hexdigest(),
                   label_counts=counts, label_provenance=provenance)
    checkpoint = dict(payload=payload, head_sha256=_fingerprint(payload))
    with Path(path).open('x', encoding='utf-8') as out:
        json.dump(checkpoint, out, indent=2, allow_nan=False)
    return load(path)
