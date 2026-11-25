import json

import pytest

from lab.world_training import WorldTraining, configured_copy_batch_size


def test_unconfigured_service_keeps_the_two_copy_window(tmp_path):
    assert configured_copy_batch_size(tmp_path / 'terrain-copy-window.json') == 2


def test_validated_setting_survives_a_fresh_service_load(tmp_path):
    path = tmp_path / 'terrain-copy-window.json'
    path.write_text(json.dumps({'batch_size': 4, 'native_report': 'verified-local-report'}))
    world = WorldTraining(tmp_path / 'world.json', lambda _: None, tmp_path / 'console.log',
                          copy_batch_size=configured_copy_batch_size(path))
    assert world.copy_batch_size == 4


@pytest.mark.parametrize('value', [0, 5, True, '4'])
def test_service_rejects_unbounded_or_mistyped_copy_settings(tmp_path, value):
    path = tmp_path / 'terrain-copy-window.json'
    path.write_text(json.dumps({'batch_size': value}))
    with pytest.raises(ValueError):
        configured_copy_batch_size(path)


def fixture(tmp_path):
    commands = []
    clock = [0.0]
    log = tmp_path / 'console.log'
    log.write_text('')
    world = WorldTraining(tmp_path / 'world.json', commands.append, log,
                          lambda: clock[0], copy_batch_size=4)
    world.start({}, ['LabAI0'])
    return world, commands, clock, log


def begin(world, clock):
    world.tick()
    clock[0] = 1.0
    world.tick()
    assert world.job['phase'] == 'waiting'


def reply(world, log, successes=None, serial=None):
    job = world.job
    successes = job['batch_count'] if successes is None else successes
    serial = job['serial'] if serial is None else serial
    with log.open('a') as stream:
        stream.write('Successfully cloned 4096 blocks\n' * successes)
        stream.write(f'Set [lab_world] for #world_ack to {serial}\n')


def clones(commands):
    return [command for command in commands if command.startswith('clone ')]


def clone_volume(command):
    x, y, z, end_x, end_y, end_z = map(int, command.split()[1:7])
    return (end_x - x + 1) * (end_y - y + 1) * (end_z - z + 1)


def test_four_slice_windows_cover_the_full_band_and_an_odd_tail(tmp_path):
    for label, band, expected in [('full', [-64, 192], [4, 4, 4, 4]),
                                   ('tail', [60, 133], [4, 1])]:
        folder = tmp_path / label
        folder.mkdir()
        world, commands, clock, log = fixture(folder)
        world.session['copy_y'] = band
        world.jobs = [(16384, 17408, 16384, 16)]
        world.total = 1
        begin(world, clock)
        batches = []
        while world.job['phase'] == 'waiting':
            batches.append(world.job['batch_count'])
            outstanding = clones(commands)[-world.job['batch_count']:]
            assert all(clone_volume(command) <= 4096 for command in outstanding)
            assert sum(map(clone_volume, outstanding)) <= 16384
            reply(world, log)
            world.tick()
        assert batches == expected
        assert world.job['phase'] == 'cleaning'
        intervals = [(int(command.split()[2]), int(command.split()[5]) + 1)
                     for command in clones(commands)]
        assert intervals[0][0] == band[0] and intervals[-1][1] == band[1]
        assert all(left[1] == right[0] for left, right in zip(intervals, intervals[1:]))
        stats = world.session['copy_stats']
        assert stats['acknowledged'] == stats['sent'] == sum(expected)
        assert stats['batches'] == len(expected)
        assert stats['block_limit'] == 4096 and stats['inflight_block_limit'] == 16384


def test_four_slice_window_waits_for_its_exact_fence_before_sending_more(tmp_path):
    world, commands, clock, log = fixture(tmp_path)
    begin(world, clock)
    assert world.job['batch_count'] == 4
    first_serial = world.job['serial']
    clock[0] = 1.2
    reply(world, log, serial=first_serial * 10)
    world.tick()
    assert len(clones(commands)) == 4
    assert world.session['copy_stats']['acknowledged'] == 0
    with log.open('a') as stream:
        stream.write(f'Set [lab_world] for #world_ack to {first_serial}\n')
    world.tick()
    assert world.session['copy_stats']['acknowledged'] == 4
    assert len(clones(commands)) == 8
    assert world.job['serial'] != first_serial
    clock[0] += 0.1
    world.tick()
    assert len(clones(commands)) == 8
    assert world.session['copy_stats']['acknowledged'] == 4


@pytest.mark.parametrize('successes', [3, 5])
def test_four_slice_fence_rejects_an_inexact_success_count_and_releases_prefetch(tmp_path, successes):
    world, commands, clock, log = fixture(tmp_path)
    begin(world, clock)
    assert world.preloaded is not None
    reply(world, log, successes=successes)
    world.tick()
    assert world.session['phase'] == 'paused'
    assert world.session['copy_stats']['acknowledged'] == 0
    assert len(clones(commands)) == 4
    assert sum(command.startswith('forceload remove ') for command in commands) == 4
    assert world.job is None and world.preloaded is None and not world.jobs
    assert not world.saved['templates']
    assert not any(command.startswith('clear LabAI') for command in commands)


def test_four_slice_timeout_releases_both_owned_tiles_without_more_copies(tmp_path):
    world, commands, clock, log = fixture(tmp_path)
    begin(world, clock)
    clock[0] = 22.0
    world.tick()
    assert world.session['phase'] == 'paused'
    assert len(clones(commands)) == 4
    assert sum(command.startswith('forceload remove ') for command in commands) == 4
    assert world.job is None and world.preloaded is None and not world.jobs


def test_four_slice_completion_keeps_the_post_copy_item_sweep_before_unload(tmp_path):
    world, commands, clock, log = fixture(tmp_path)
    world.stop()
    commands.clear()
    world.saved['templates']['0-128'] = {'camp_anchor': [16448, 70, 16448]}
    world.start({}, ['LabAI0'])
    world.session['copy_y'] = [62, 94]
    begin(world, clock)
    assert world.job['width'] == 32 and world.job['batch_count'] == 4
    reply(world, log)
    world.tick()
    assert world.job['phase'] == 'cleaning'
    sent = len(commands)
    clock[0] += 0.24
    world.tick()
    assert len(commands) == sent
    clock[0] += 0.02
    world.tick()
    cleanup = commands[sent:]
    assert len(cleanup) == 4
    assert all(command.startswith('kill @e[type=minecraft:item,') and
               'y=-64' in command and 'dy=383' in command and 'dx=31' in command
               for command in cleanup[:2])
    assert all(command.startswith('forceload remove ') for command in cleanup[2:])
    assert not any(command.startswith('clear LabAI') for command in commands)


def test_slow_four_slice_fence_yields_and_falls_back_to_one_small_copy(tmp_path):
    world, commands, clock, log = fixture(tmp_path)
    begin(world, clock)
    next_y = world.job['next_y']
    clock[0] = 4.0
    reply(world, log)
    world.tick()
    assert world.job['phase'] == 'pacing'
    assert world.session['copy_stats']['acknowledged'] == 4
    assert len(clones(commands)) == 4
    clock[0] += 0.49
    world.tick()
    assert len(clones(commands)) == 4
    clock[0] += 0.02
    world.tick()
    assert world.job['phase'] == 'waiting' and world.job['batch_count'] == 1
    assert int(clones(commands)[-1].split()[2]) == next_y
    assert clone_volume(clones(commands)[-1]) <= 1024


def test_memory_hold_preserves_the_four_slice_window_and_excludes_held_time(tmp_path):
    world, commands, clock, log = fixture(tmp_path)
    begin(world, clock)
    run = world.session['run']
    job, preloaded = world.job, world.preloaded
    assert world.hold_preparation(run)
    sent = len(commands)
    clock[0] += 300
    reply(world, log)
    world.tick()
    assert len(commands) == sent and world.job is job and world.preloaded is preloaded
    assert world.session['copy_stats']['acknowledged'] == 0
    assert world.resume_preparation(run)
    world.tick()
    assert world.session['copy_stats']['acknowledged'] == 4
    assert world.session['copy_stats']['max_ack_seconds'] < 1
    assert world.session['preparation_wait_seconds'] == 300
    assert len(clones(commands)) == 8 and world.job['phase'] == 'waiting'
