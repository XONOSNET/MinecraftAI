import random

from scripts.combat_opening import DEVELOPMENT_SEEDS, OpeningChoice, REPLICATION_SEEDS, SEEDS, WINDUP_SEEDS, eligible


def observation():
    obs = [0.0] * 82
    obs[66] = 3 / 32
    obs[70] = obs[74] = obs[77] = 1
    return obs


def test_opening_overrides_at_most_once_even_after_helper_refusal():
    obs = observation()
    opening = OpeningChoice(intervene=True)
    obs[76] = .25
    assert opening.pick(obs, 2, 1) == 2
    obs[76] = 0
    assert opening.pick(obs, 2, 2) == 6
    opening.acknowledge(2, {'interaction': False, 'attack_requests': 0})
    assert opening.intervention['helper_accepted'] is False
    assert opening.pick(obs, 1, 3) == 1
    assert opening.intervention['decision'] == 2


def test_control_preserves_every_proposal_and_triggers_without_change():
    obs = observation()
    control = OpeningChoice(intervene=False)
    opening = OpeningChoice(intervene=True)
    for index, underlying in enumerate([6, 3, 2], start=1):
        assert control.pick(obs, underlying, index) == underlying
        assert opening.pick(obs, underlying, index) == underlying
    assert control.first == opening.first
    assert control.intervention is None
    assert opening.intervention['underlying_action'] == 6


def test_eligibility_checks_all_native_prerequisites():
    obs = observation()
    assert eligible(obs)
    for index, value in [(66, 3.01 / 32), (70, 0), (74, 0), (76, .001), (77, 0)]:
        other = obs.copy()
        other[index] = value
        assert not eligible(other)
    assert len(set(SEEDS)) == 12


def test_replication_starts_follow_the_fresh_preregistered_draw():
    assert not set(SEEDS).intersection(REPLICATION_SEEDS)
    assert REPLICATION_SEEDS == tuple(random.Random(170212).sample(range(12_000_000, 13_000_000), 12))
    assert DEVELOPMENT_SEEDS == tuple(random.Random(170213).sample(range(13_000_000, 14_000_000), 8))


def test_learned_choice_can_decline_and_is_called_once():
    calls = []

    def decline(obs, logits):
        calls.append((obs, logits))
        return False

    obs = observation()
    selector = OpeningChoice(intervene=False, head=decline)
    assert selector.pick(obs, 1, 1, [1]) == 1
    assert selector.pick(obs, 2, 2, [2]) == 2
    assert calls == [(obs, [1])]
    assert selector.intervention is None


def test_windup_arms_require_footing_and_apply_their_helper_once():
    assert WINDUP_SEEDS == tuple(random.Random(170214).sample(range(14_000_000, 15_000_000), 12))
    for swing in ('helper', 'grounded'):
        obs = observation()
        selector = OpeningChoice(intervene=True, opening_swing=swing)
        assert selector.request(selector.pick(obs, 2, 1), 1) == {'action': 2}
        obs[69] = 1
        assert selector.request(selector.pick(obs, 6, 2), 2) == {'action': 6, 'opening_swing': swing}
        selector.acknowledge(2, dict(interaction=False, attack_requests=0, critical_attempts=0,
                                     opening_swing=swing, opening_grounded=False,
                                     opening_critical_windup=False, opening_refusal='lost_grounding'))
        assert selector.intervention['underlying_action'] == 6
        assert selector.intervention['refusal_reason'] == 'lost_grounding'
        assert selector.request(selector.pick(obs, 6, 3), 3) == {'action': 6}
