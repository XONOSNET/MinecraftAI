import json

import pytest
import torch

from scripts import combat_opening_head as head


def eligible_obs(distance):
    observation = [0.] * 82
    observation[65] = 1.
    observation[66] = distance / 32.
    observation[70] = observation[74] = observation[77] = 1.
    return observation


def fight(seed, arm, first_hit):
    events = [dict(kind='proposal', at_ms=0, decision=1, action=6),
              dict(kind='attack_request', at_ms=1, decision=1),
              dict(kind='target_hurt', at_ms=100, decision=1)]
    if not first_hit:
        events.insert(2, dict(kind='player_damage', at_ms=20, decision=1, loss=1))
    intervention = dict(decision=1, underlying_action=2, helper_accepted=True, attack_requests=1)
    first_eligible = dict(decision=1, underlying_action=2)
    return dict(seed=seed, arm=arm, events=events, damage=int(not first_hit), first_eligible=first_eligible,
                valid=True, win=True, dead=False, escaped=False,
                intervention=intervention if arm == 'opening' else None)


def test_fits_passing_matched_preferences_and_checks_checkpoint_identity(tmp_path, monkeypatch):
    monkeypatch.setattr(head, 'tensor_hash', lambda _: head.SAVED)
    logits = torch.tensor([0., 0., 1., 0., 0., 0., 0.])
    rows, decisions = [], []
    for i, seed in enumerate(head.REPLICATION_SEEDS):
        rows += [fight(seed, 'control', False), fight(seed, 'opening', i < 6)]
        decisions.append(dict(event='decision', arm='opening', seed=seed, decision=1, valid=True,
                              proposed=6, saved_action=2, observation=eligible_obs(2.9 if i < 6 else 2.1)))
    report = tmp_path / 'report.json'
    report.write_text(json.dumps(dict(protocol='opening-attack-replication', training_only=True,
                                     seeds=head.REPLICATION_SEEDS, saved_tensor_sha256=head.SAVED,
                                     cleaned=True, reference_unchanged=True, rows=rows)), encoding='utf-8')
    (tmp_path / 'decisions.jsonl').write_text('\n'.join(map(json.dumps, decisions)), encoding='utf-8')
    policy = tmp_path / 'head.json'
    loaded = head.fit(lambda _: logits, report, policy)
    assert loaded.payload['label_counts'] == {'attack': 6, 'saved': 6, 'abstained': 0}
    assert loaded(eligible_obs(2.9), logits)
    assert not loaded(eligible_obs(2.1), logits)
    assert not loaded(eligible_obs(3.1), logits)
    assert not loaded(eligible_obs(2.9), torch.tensor([0., 0., 0., 0., 0., 0., 1.]))
    assert head.load(policy).sha256 == loaded.sha256
    assert head.fit(lambda _: logits, report, tmp_path / 'duplicate.json').sha256 == loaded.sha256
    checkpoint = json.loads(policy.read_bytes())
    checkpoint['payload']['weights'][0] += .01
    policy.write_text(json.dumps(checkpoint), encoding='utf-8')
    with pytest.raises(ValueError, match='checkpoint identity'):
        head.load(policy)


def test_refuses_pilot_report_before_using_decisions(tmp_path):
    report = tmp_path / 'report.json'
    report.write_text('{"protocol":"opening-attack-v1"}', encoding='utf-8')
    with pytest.raises(ValueError, match='clean fresh replication'):
        head.fit(None, report, tmp_path / 'head.json')
