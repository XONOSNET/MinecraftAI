import json
from pathlib import Path

import pytest
import torch

from scripts import combat_temperature_ablation as experiment


def test_archive_reader_stops_at_end_of_training(tmp_path, monkeypatch):
    reference = object()
    root = tmp_path
    (root / 'source/scripts').mkdir(parents=True)
    (root / 'source/scripts/combat_autonomy.py').write_bytes(Path(experiment.base.__file__).read_bytes())
    report = dict(reload_verified=True, recipe=experiment.base.RECIPE,
                  start_plan={'training': list(range(32))},
                  training=[dict(seed=i, execution_counts=dict(decisions=1)) for i in range(32)],
                  tensor_hashes={'saved': 'reference'})
    (root / 'report.json').write_text(json.dumps(report), encoding='utf-8')
    rows = [dict(group='training', seed=i, event='decision', done=True, valid=True) for i in range(32)]
    text = '\n'.join(map(json.dumps, rows)) + '\n'
    path = root / 'decisions.jsonl'
    path.write_text(text + 'invalid sealed record\n', encoding='utf-8')
    monkeypatch.setattr(experiment.base, 'load_policy', lambda path: reference)
    monkeypatch.setattr(experiment.base, 'tensor_hash', lambda policy: 'reference')
    saved, _, groups = experiment.archived_training(root)
    assert saved is reference and list(groups) == list(range(32))
    path.write_text(text.rsplit('\n', 2)[0] + '\n', encoding='utf-8')
    with pytest.raises(ValueError, match='Incomplete'):
        experiment.archived_training(root)


def test_opportunities_and_native_gate_use_alignment_cooldown_and_all_controls():
    states = torch.zeros(4, 82)
    states[:, [65, 70, 74, 75, 77]] = 1
    states[:, 66] = 2.5 / 32
    states[0, 76] = .8  # Excess cooldown
    states[1, 76] = .4  # Possible wind-up
    states[2, 66] = 3.1 / 32
    sets = experiment.opportunity_sets(states)
    assert sets['aligned_cooling'].tolist() == [True, True, False, False]
    assert sets['aligned_attack_ready'].tolist() == [False, False, False, True]
    assert sets['aligned_critical_windup_possible'].tolist() == [False, True, False, False]
    choices = dict(original_real=[0, 0, 4, 6, 6], original_zero=[0, 0, 4, 6, 6],
                   matched_zero=[0, 4, 4, 6, 6], matched_real=[4, 4, 3, 3, 4])
    summary = experiment.choice_summary(choices, list(range(5)), list(range(5)))
    # Waiting already present in any control is not a new protective choice.
    assert summary['net_new_protection'] == 3
    assert not experiment.offline_gate(summary, summary)  # Fights and ready attacks both matter.
