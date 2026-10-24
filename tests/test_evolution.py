import sqlite3

import torch

from lab.evolution import ModelEvolution
from lab.model import Policy


def test_saves_reviews_and_restarts_preserve_identity(tmp_path):
    path = tmp_path / 'registry.sqlite'
    db = sqlite3.connect(path)
    registry = ModelEvolution(db)
    model = Policy()
    checkpoint = tmp_path / 'weights.pt'
    torch.save(model.state_dict(), checkpoint)
    first = registry.record('navigation', model.state_dict(), checkpoint)
    assert registry.record('navigation', model.state_dict(), checkpoint) == first
    registry.review(dict(skill='navigation', kind='saved_model_validation', baseline=1, score=1, episodes=24))
    snapshot = registry.snapshot('navigation')
    current = snapshot['current']
    assert snapshot['version_count'] == 1
    assert current['parameters'] == 9604
    assert current['weight_bytes'] == 9604 * 4
    assert current['checkpoint_bytes'] == checkpoint.stat().st_size
    assert current['architecture'] == [70, 128, 4]
    db.close()
    restored = ModelEvolution(sqlite3.connect(path))
    assert restored.record('navigation', model.state_dict()) == first
    assert restored.snapshot('navigation')['current']['name'] == current['name']


def test_candidate_rollback_and_promotion_preserve_lineage():
    registry = ModelEvolution(sqlite3.connect(':memory:'))
    model = Policy()
    original = {k: v.clone() for k, v in model.state_dict().items()}
    first = registry.record('navigation', original)
    with torch.no_grad(): model.net[0].bias.add_(1)
    candidate = registry.record('navigation', model.state_dict(), source='candidate', training={'samples':100})
    assert candidate != first
    registry.record('navigation', original, source='restored')
    registry.review(dict(skill='navigation', accepted=False, baseline=.9, score=.5, episodes=24))
    snapshot = registry.snapshot('navigation')
    assert snapshot['current']['id'] == first
    assert snapshot['history'][0]['state'] == 'rejected'
    assert snapshot['history'][0]['parent'] == first
    with torch.no_grad(): model.net[0].bias.add_(1)
    accepted = registry.record('navigation', model.state_dict(), source='candidate')
    registry.review(dict(skill='navigation', accepted=True, baseline=.9, score=1, episodes=24))
    current = registry.snapshot('navigation')['current']
    assert current['id'] == accepted
    assert current['revision'] == 3
    assert current['state'] == 'accepted'
    assert current['parent'] == first


def test_skills_are_independent_and_old_active_models_remain_visible():
    registry = ModelEvolution(sqlite3.connect(':memory:'))
    navigation = Policy()
    nav_id = registry.record('navigation', navigation.state_dict())
    skill = Policy(inputs=82, actions=7)
    for index in range(65):
        with torch.no_grad(): skill.net[0].bias.add_(.01)
        registry.record('expedition', skill.state_dict(), source='trained')
    snapshot = registry.snapshot('navigation')
    assert snapshot['current']['id'] == nav_id
    assert snapshot['version_count'] == 66
    assert len(snapshot['history']) == 60
    assert len(snapshot['skills']) == 2
    assert snapshot['total_parameters'] == navigation.parameters_count + skill.parameters_count
    assert registry.snapshot('expedition')['current']['architecture'] == [82,128,7]
