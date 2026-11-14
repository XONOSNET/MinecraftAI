import copy

import torch

from lab.model import Policy
from scripts.combat_autonomy import fight, paired_gate, safe_guard, start_plan, tensor_hash, update


def test_policy_update_prefers_action_with_better_native_outcome():
    model = Policy(8, inputs=2, actions=2)
    reference = copy.deepcopy(model)
    optimizer = torch.optim.Adam(model.parameters(), lr=.01)
    obs = torch.tensor([1., 0.])
    before = model(obs).diff().item()
    loss = update(model, reference, optimizer, [[(obs, 0, -3.)], [(obs, 1, 2.)]])
    assert torch.isfinite(torch.tensor(loss))
    assert model(obs).diff().item() > before


def rows(damage, win=True, dead=False):
    return [dict(seed=i, mob='zombie', win=win, dead=dead, damage=damage, seconds=5) for i in range(12)]


def test_promotion_requires_matched_material_improvement_and_no_death_regression():
    teacher = rows(4)
    assert paired_gate(rows(2), teacher)
    assert not paired_gate(rows(3.5), teacher)
    assert not paired_gate(rows(0, dead=True), teacher)
    assert not safe_guard(rows(0, win=False), teacher)
    assert paired_gate(rows(6), rows(2, win=False))


def test_starts_are_repeatable_and_disjoint_across_training_holdout_and_retention_reload():
    initial = start_plan(70202, False)
    assert initial == start_plan(70202, False)
    used = {n for group in initial.values() for n in group}
    assert len(used) == 68
    # Even the same RNG seed cannot reuse a start once it is reserved.
    later = start_plan(70202, False, used, retention=True)
    fresh = {n for group in later.values() for n in group}
    assert len(fresh) == 104
    assert not used & fresh
    assert len(later['reload_skeleton_2']) == 12


def test_tensor_identity_ignores_serialization_and_detects_a_weight_update():
    model = Policy(8, inputs=2, actions=2)
    other = copy.deepcopy(model)
    assert tensor_hash(model) == tensor_hash(other)
    with torch.no_grad():
        other.net[0].weight[0, 0] += 1
    assert tensor_hash(model) != tensor_hash(other)


def test_fight_records_native_effects_separately_from_action_and_reward():
    import time
    class Native:
        def request(self, **d):
            if d.get('reset'):
                return dict(done=False, teacher=6, damage=0, observation=[0.] * 82,
                            start=dict(difficulty='normal', server=dict(ready=True, pid=123,
                                        sampled_at_ms=time.time() * 1000)))
            assert d['action'] == 6
            return dict(done=True, win=True, dead=False, escaped=False, damage=2, execution=dict(
                proposed=6, physics_ticks=3, held_item_ticks=0, attack_requests=1,
                critical_attempts=0, target_hurts=1, damage_events=1, interaction=True,
                movement=dict(blocks=.02, yaw_radians=0), controls_ticks={'forward': 0}))
    trace = []
    row, trajectory = fight(Native(), 21, 'zombie', trace=trace.append)
    assert not trajectory
    assert [x['event'] for x in trace] == ['start', 'decision']
    assert abs(trace[-1]['reward'] - 1.838) < .00001
    assert row['execution_counts']['proposed'] == {'6': 1}
    assert row['execution_counts']['by_action']['6']['target_hurts'] == 1
