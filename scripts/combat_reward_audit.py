"""Replay the completed training trace and compare against a zero-reward update.

This is an offline diagnostic on training observations, never a holdout arm.
"""
import argparse
from collections import Counter
import copy
import json
from pathlib import Path

import torch

from scripts.combat_autonomy import RECIPE, load_policy, tensor_hash, update


def audit(root):
    report = json.loads((root / 'report.json').read_text(encoding='utf-8'))
    if not report.get('reload_verified') or report.get('recipe') != RECIPE:
        raise ValueError('Expected a complete training trace with the current frozen recipe')
    frozen_runner = root / 'source/scripts/combat_autonomy.py'
    if frozen_runner.read_bytes() != Path(__file__).with_name('combat_autonomy.py').read_bytes():
        raise ValueError('Run the audit with the exact archived learner implementation')
    seeds = report['start_plan']['training']
    by_seed = {seed: [] for seed in seeds}
    with (root / 'decisions.jsonl').open(encoding='utf-8') as stream:
        for line in stream:
            try:
                row = json.loads(line)
            except ValueError:
                if line.endswith('\n'):
                    raise
                break  # Last line may be in flight; completeness is checked below.
            if row['group'] == 'training' and row['event'] == 'decision' and row['valid']:
                by_seed[row['seed']].append((torch.tensor(row['observation'], dtype=torch.float32),
                                            row['proposed'], row['reward']))
    expected = {row['seed']: row['execution_counts']['decisions'] for row in report['training']}
    if set(expected) != set(seeds) or any(not expected[seed] or len(rows) != expected[seed]
                                          for seed, rows in by_seed.items()):
        raise ValueError('Incomplete training trace')
    torch.set_num_threads(1)
    original = load_policy(root / 'baseline.pt')
    if tensor_hash(original) != report['tensor_hashes']['saved']:
        raise ValueError('Saved reference tensor mismatch')
    replayed, kl_only = copy.deepcopy(original), copy.deepcopy(original)
    opt, kl_opt = (torch.optim.Adam(model.parameters(), lr=RECIPE['learning_rate'])
                   for model in (replayed, kl_only))
    previous = root / 'baseline.pt'
    if len(report.get('arm_order', ())) > 3:
        optimizer = torch.load(previous, weights_only=True, map_location='cpu')['optimizer']
        opt.load_state_dict(copy.deepcopy(optimizer))
        kl_opt.load_state_dict(copy.deepcopy(optimizer))
    batch = list(by_seed.values())
    size = 1 if report['smoke'] else RECIPE['fights_per_batch']
    for i in range(0, len(batch), size):
        group = batch[i:i+size]
        update(replayed, original, opt, group)
        update(kl_only, original, kl_opt, [[(obs, action, 0.) for obs, action, _ in episode]
                                          for episode in group])
    states = torch.stack([obs for episode in batch for obs, _, _ in episode])
    with torch.inference_mode():
        saved, replay, kl = (m(states).argmax(1) for m in (original, replayed, kl_only))
    return dict(states=len(states), train_only=True,
                exact_replay=tensor_hash(replayed) == report['tensor_hashes']['candidate'],
                replay_tensor_hash=tensor_hash(replayed), kl_only_tensor_hash=tensor_hash(kl_only),
                replay_vs_saved_changes=int((replay != saved).sum()),
                kl_only_vs_saved_changes=int((kl != saved).sum()),
                replay_vs_kl_only_changes=int((replay != kl).sum()),
                saved_argmax=dict(Counter(saved.tolist())),
                replay_argmax=dict(Counter(replay.tolist())),
                kl_only_argmax=dict(Counter(kl.tolist())))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path, help='Completed training experiment directory')
    print(json.dumps(audit(parser.parse_args().run), indent=2))
