from scripts.combat_opening import OpeningChoice, SEEDS, eligible


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
