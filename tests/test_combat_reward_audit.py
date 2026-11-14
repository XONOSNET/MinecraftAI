import copy
import json
from pathlib import Path

import pytest
import torch

from lab.model import Policy
from scripts import combat_autonomy
from scripts.combat_reward_audit import audit


def test_training_trace_reproduces_candidate_without_reading_holdout(tmp_path):
    torch.set_num_threads(1)
    saved = Policy(8, inputs=2, actions=2)
    candidate = copy.deepcopy(saved)
    opt = torch.optim.Adam(candidate.parameters(), lr=combat_autonomy.RECIPE['learning_rate'])
    obs = [1., 0.]
    combat_autonomy.update(candidate, saved, opt, [[(torch.tensor(obs), 0, -3.),
                                                    (torch.tensor(obs), 1, 2.)]])
    torch.save({'model': saved.state_dict()}, tmp_path / 'baseline.pt')
    archive = tmp_path / 'source/scripts/combat_autonomy.py'
    archive.parent.mkdir(parents=True)
    archive.write_bytes(Path(combat_autonomy.__file__).read_bytes())
    report = dict(reload_verified=True, recipe=combat_autonomy.RECIPE, smoke=True,
                  start_plan={'training': [99]},
                  training=[dict(seed=99, execution_counts={'decisions': 2})],
                  tensor_hashes=dict(saved=combat_autonomy.tensor_hash(saved),
                                     candidate=combat_autonomy.tensor_hash(candidate)))
    (tmp_path / 'report.json').write_text(json.dumps(report), encoding='utf-8')
    path = tmp_path / 'decisions.jsonl'
    rows = [dict(event='decision', group='training', valid=True, seed=99,
                 observation=obs, proposed=a, reward=r) for a, r in [(0, -3.), (1, 2.)]]
    # The holdout has no observation payload: it must not be consumed.
    rows.append(dict(event='decision', group='zombie_0', valid=True))
    path.write_text('\n'.join(map(json.dumps, rows)) + '\n', encoding='utf-8')
    result = audit(tmp_path)
    assert result['states'] == 2 and result['exact_replay']
    assert result['replay_tensor_hash'] != result['kl_only_tensor_hash']
    path.write_text(json.dumps(rows[0]) + '\n', encoding='utf-8')
    with pytest.raises(ValueError, match='Incomplete training trace'):
        audit(tmp_path)
