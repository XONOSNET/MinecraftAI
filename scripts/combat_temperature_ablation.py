"""One bounded, offline factorial on the archived native training trace."""

import argparse
from collections import Counter
import copy
import json
from pathlib import Path

import torch

from scripts import combat_autonomy as base

ARMS = ('original_real', 'original_zero', 'matched_real', 'matched_zero')
PROTECT = (3, 4)


def archived_training(root):
    with (root / 'report.json').open(encoding='utf-8') as stream:
        report = json.load(stream)
    if (report.get('smoke') or not report.get('reload_verified') or
            report.get('recipe') != base.RECIPE):
        raise ValueError('Expected a completed v1 training archive')
    if (root / 'source/scripts/combat_autonomy.py').read_bytes() != Path(base.__file__).read_bytes():
        raise ValueError('Learner differs from the frozen archive')
    seeds = report['start_plan']['training']
    expected = {row['seed']: row['execution_counts']['decisions'] for row in report['training']}
    if (len(seeds) != 32 or set(seeds) != set(expected) or
            any(n <= 0 for n in expected.values())):
        raise ValueError('Expected 32 complete archived training fights')
    groups = {seed: [] for seed in seeds}
    remaining = sum(expected.values())
    with (root / 'decisions.jsonl').open(encoding='utf-8') as stream:
        for line in stream:
            row = json.loads(line)
            if row['group'] != 'training':
                raise ValueError('Training trace ended before all training decisions were present')
            if row['event'] != 'decision':
                continue
            seed = row['seed']
            episode = groups[seed]
            if not row['valid'] or len(episode) >= expected[seed] or row['done'] != (len(episode) + 1 == expected[seed]):
                raise ValueError('Invalid or incomplete training episode')
            episode.append(row)
            remaining -= 1
            if not remaining:
                break  # Do not read any evaluation decision records.
    if remaining:
        raise ValueError('Incomplete training archive')
    original = base.load_policy(root / 'baseline.pt')
    if base.tensor_hash(original) != report['tensor_hashes']['saved']:
        raise ValueError('Saved reference differs from archive')
    return original, report, groups


def replay(original, batch, reference_temperature, real_reward):
    policy = copy.deepcopy(original)
    optimizer = torch.optim.Adam(policy.parameters(), lr=base.RECIPE['learning_rate'])
    def reference(x):
        logits = original(x)
        return logits if reference_temperature == 1 else logits / reference_temperature
    size = base.RECIPE['fights_per_batch']
    for i in range(0, len(batch), size):
        original_group = batch[i:i+size]
        group = original_group if real_reward else [
            [(obs, action, 0.) for obs, action, reward in fight] for fight in original_group]
        base.update(policy, reference, optimizer, group)
    return policy


def is_protection(action):
    return action in PROTECT


def choice_summary(choices, seeds, indices):
    chosen = {arm: [actions[i] for i in indices] for arm, actions in choices.items()}
    matched = chosen['matched_real']
    other = [chosen[arm] for arm in ARMS if arm != 'matched_real']
    gains = losses = 0
    improved = set()
    for i, action in enumerate(matched):
        if is_protection(action) and not any(is_protection(arm[i]) for arm in other):
            gains += 1
            improved.add(seeds[indices[i]])
        if not is_protection(action) and all(is_protection(arm[i]) for arm in other):
            losses += 1
    net = gains - losses
    pairs = (('original_real', 'original_zero'), ('matched_real', 'matched_zero'),
             ('matched_real', 'original_real'), ('matched_zero', 'original_zero'))
    differences = {}
    for a, b in pairs:
        transitions = Counter(f'{old}->{new}' for new, old in zip(chosen[a], chosen[b]) if new != old)
        differences[f'{a}_vs_{b}'] = dict(changed=sum(transitions.values()), transitions=dict(transitions))
    protection = {a: sum(map(is_protection, v)) for a, v in chosen.items()}
    return dict(rows=len(indices), fights=len({seeds[i] for i in indices}),
                actions={a: [v.count(i) for i in range(7)] for a, v in chosen.items()},
                contrasts=differences, matched_real_only_protection=gains, matched_real_only_nonprotection=losses,
                net_new_protection=net, newly_protective_fights=len(improved),
                reward_x_recipe_protection=protection['matched_real'] - protection['matched_zero']
                - protection['original_real'] + protection['original_zero'])


def opportunity_sets(states):
    distance = states[:, 66] * 32
    aligned = torch.atan2(states[:, 64], states[:, 65]).abs() <= .12
    ready_gear_and_sight = ((states[:, 70] == 1) & (states[:, 74] == 1) &
                            (states[:, 75] == 1) & (states[:, 77] == 1))
    near = ready_gear_and_sight & (distance <= 3)
    cooldown = states[:, 76] * 625
    return {
        'all': torch.ones(len(states), dtype=torch.bool),
        'visible_in_range': near,
        'aligned_cooling': near & aligned & (cooldown > 0),
        'unaligned_cooling': near & ~aligned & (cooldown > 0),
        'aligned_cooldown_over_400ms': near & aligned & (cooldown > 400),
        'aligned_critical_windup_possible': (near & aligned & (cooldown > 0) &
                                              (cooldown <= 400) & (distance <= 2.7)),
        'aligned_attack_ready': near & aligned & (cooldown == 0),
        'unaligned_attack_ready': near & ~aligned & (cooldown == 0),
        'visible_beyond_3': ready_gear_and_sight & (distance > 3),
    }


def offline_gate(cooling, ready):
    for row in (cooling, ready):
        if not row['rows']:
            return False
    attack_loss = ready['actions']['original_real'][6] - ready['actions']['matched_real'][6]
    return (10 * cooling['net_new_protection'] >= cooling['rows'] and
            cooling['newly_protective_fights'] >= 4 and 20 * attack_loss <= ready['rows'])


def ablate(root):
    torch.set_num_threads(1)
    original, report, groups = archived_training(root)
    batch = [[(torch.tensor(row['observation'], dtype=torch.float32), row['proposed'], row['reward'])
              for row in episode] for episode in groups.values()]
    models = {arm: replay(original, batch, base.RECIPE['temperature'] if arm.startswith('matched') else 1,
                          arm.endswith('_real')) for arm in ARMS}
    hashes = {arm: base.tensor_hash(model) for arm, model in models.items()}
    if hashes['original_real'] != report['tensor_hashes']['candidate']:
        raise ValueError('Original recipe did not reproduce the archived candidate')
    states = torch.stack([obs for episode in batch for obs, _, _ in episode])
    seeds = [seed for seed, episode in groups.items() for row in episode]
    with torch.inference_mode():
        reference = original(states)
        results = {arm: model(states) for arm, model in models.items()}
        choices = {arm: logits.argmax(1).tolist() for arm, logits in results.items()}
        choices['saved'] = reference.argmax(1).tolist()
        max_logit_delta = {arm: (logits - reference).abs().max().item() for arm, logits in results.items()}
        # Separate a change in sampling distribution from a changed greedy
        # proposal. Both distributions are measured at the same temperature.
        exploration = {arm: (logits / base.RECIPE['temperature']).softmax(-1)
                       for arm, logits in results.items()}
        tv_real_temperature = .5 * (exploration['matched_real'] - exploration['original_real']).abs().sum(1)
    sets = {name: choice_summary(choices, seeds, selected.nonzero().flatten().tolist())
            for name, selected in opportunity_sets(states).items()}
    passed = offline_gate(sets['aligned_cooling'], sets['aligned_attack_ready'])
    result = dict(training_only=True, training_seeds=list(groups), saved_hash=base.tensor_hash(original),
                  tensor_hashes=hashes, max_logit_delta_vs_saved=max_logit_delta,
                  mean_real_reward_exploration_tv=tv_real_temperature.mean().item(),
                  max_real_reward_exploration_tv=tv_real_temperature.max().item(),
                  exact_original_replay=True, opportunity_sets=sets, offline_gate_passed=passed)
    if not passed:
        from scripts.combat_first_hit import summarize_first_hit
        result['first_hit'] = summarize_first_hit(
            groups, {row['seed']: row for row in report['training']}, recipe=report['recipe'])
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    print(json.dumps(ablate(parser.parse_args().archive), indent=2))
