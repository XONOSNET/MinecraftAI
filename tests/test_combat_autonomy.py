import copy

import torch

from lab.model import Policy
from scripts.combat_autonomy import paired_gate, safe_guard, update


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
