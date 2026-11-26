import copy
import io
from pathlib import Path
import zipfile

import pytest

from scripts import deploy_persistent_pilot as deploy


def prepared_args():
    return ['--run', '--base-commit', 'a' * 40, '--expected-source-sha256', 'b' * 64,
            '--expected-controller', 'f399d8a9ddeca0fd', '--plugin-jar', 'logs/plugin/PersistentPilotWorlds.jar',
            '--plugin-sha256', 'c' * 64, '--minimum-round', '567', '--expected-lan-pid', '101']


def artifact(root, *, name='PersistentPilotWorlds', main='dev.xonosnet.pilot.PilotWorlds'):
    path = root / 'logs/build/PersistentPilotWorlds.jar'
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('plugin.yml', f'name: {name}\nmain: {main}\n')
        archive.writestr('dev/xonosnet/pilot/PilotWorlds.class', b'explicit-unit-fixture')
    return path


def test_explicit_run_and_exact_frozen_args_required():
    with pytest.raises(SystemExit):
        deploy.parse_args([])
    args = deploy.parse_args(prepared_args())
    assert args.minimum_round == 567 and args.expected_controller == 'f399d8a9ddeca0fd'
    assert args.prepare_world is False
    assert args.authorized_paused_phase_at is None
    assert deploy.parse_args(prepared_args() + ['--prepare-world']).prepare_world is True
    assert deploy.parse_args(prepared_args() + ['--authorized-paused-phase-at', '1795730834.9760773']).authorized_paused_phase_at == 1795730834.9760773
    assert deploy.parse_args(['--print-source-digest']).run is False
    for field in ('--base-commit', '--expected-source-sha256', '--expected-controller',
                  '--plugin-sha256', '--minimum-round', '--expected-lan-pid'):
        bad = prepared_args()
        at = bad.index(field)
        del bad[at:at + 2]
        with pytest.raises(SystemExit):
            deploy.parse_args(bad)
    for extra in (['--wait-hours', '0'], ['--wait-hours', '7'], ['--print-source-digest']):
        with pytest.raises(SystemExit):
            deploy.parse_args(prepared_args() + extra)
    for timestamp in ('0', '-1', 'nan', 'inf'):
        with pytest.raises(SystemExit):
            deploy.parse_args(prepared_args() + ['--authorized-paused-phase-at', timestamp])


def test_source_guard_covers_all_pilot_plugin_gateway_sleep_and_launcher_sources(tmp_path):
    for name in deploy.SOURCE_FILES:
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('original')
    for name in ('controller/index.js', 'config/agents.json', 'pilot/state.cjs', 'pilot/dashboard.html',
                 'pilot/plugin/plugin.yml', 'pilot/plugin/src/main/java/dev/xonosnet/pilot/PilotWorlds.java'):
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('original')
    original = deploy.source_digest(tmp_path)
    for target in deploy.source_paths(tmp_path):
        target.write_text('changed')
        assert deploy.source_digest(tmp_path) != original, target
        target.write_text('original')
    # Local worlds/logs/data and the independent proxy checkout are not recopied.
    for name in ('data/api-token', 'logs/service.log', 'server/world/level.dat', 'lab/dashboard_lan.py'):
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('local')
    assert deploy.source_digest(tmp_path) == original
    (tmp_path / 'pilot/new-module.cjs').write_text('new')
    assert deploy.source_digest(tmp_path) != original
    (tmp_path / 'lab/pilot_gateway.py').unlink()
    with pytest.raises(RuntimeError, match='missing'):
        deploy.source_digest(tmp_path)


def test_artifact_sha_and_typed_plugin_manifest_must_match(tmp_path):
    path = artifact(tmp_path)
    assert deploy.validate_artifact(path, deploy.sha256(path), tmp_path) == path.resolve()
    with pytest.raises(RuntimeError, match='SHA256'):
        deploy.validate_artifact(path, '0' * 64, tmp_path)
    for wrong in ({'name': 'Unexpected'}, {'main': 'other.Plugin'}):
        path = artifact(tmp_path, **wrong)
        with pytest.raises(RuntimeError, match='plugin'):
            deploy.validate_artifact(path, deploy.sha256(path), tmp_path)
    outside = tmp_path / 'PersistentPilotWorlds.jar'
    outside.write_bytes(path.read_bytes())
    with pytest.raises(ValueError, match='under logs'):
        deploy.validate_artifact(outside, deploy.sha256(outside), tmp_path)


def completed_boundary():
    return dict(world_learning=dict(enabled=True, phase='baseline', restore_pending=False,
                                   history=[{'round': 567}], run='next', round=568),
                world_training={'session': {'phase': 'restoring'}},
                server={'ready': True, 'busy': False, 'desired_running': True, 'error': None},
                training_job={'status': 'idle'}, performance={'persistence': {'pending': 0, 'error': None}})


def test_boundary_requires_completed_comparison_and_complete_healthy_persistence():
    snapshot = completed_boundary()
    assert deploy.boundary(snapshot, 567)
    assert not deploy.boundary(snapshot, 568)
    variants = [('world_learning', {'enabled': False}), ('world_learning', {'restore_pending': True}),
                ('world_learning', {'phase': 'evaluating'}), ('server', {'busy': True}),
                ('server', {'ready': False}), ('server', {'desired_running': False}),
                ('server', {'error': 'failed lifecycle'}), ('training_job', {'status': 'running'}),
                ('training_job', {'status': 'cancelling'}), ('training_job', {'status': 'unknown'})]
    for key, change in variants:
        altered = copy.deepcopy(snapshot)
        altered[key].update(change)
        assert not deploy.boundary(altered, 567), (key, change)
    for pending in ({'pending': 1, 'error': None}, {'pending': 0, 'error': 'failed'},
                    {'pending': 0}, {}, {'error': None}):
        altered = copy.deepcopy(snapshot)
        altered['performance']['persistence'] = pending
        assert not deploy.boundary(altered, 567)
    altered = copy.deepcopy(snapshot)
    altered['world_training']['session']['phase'] = 'running'
    assert not deploy.boundary(altered, 567)


def test_freshness_rejects_stale_future_disconnected_and_nonproduction_agents():
    agents = {name: {'connected': True, 'last_seen': 100} for name in deploy.BOT_NAMES}
    assert deploy.freshness({'agents': agents}, now=101) == deploy.BOT_NAMES
    agents['LabAI0']['last_seen'] = 92
    agents['LabAI1']['last_seen'] = 102
    agents['LabAI2']['connected'] = False
    agents['HomeAI01'] = {'connected': True, 'last_seen': 100}
    assert deploy.freshness({'agents': agents}, now=101) == deploy.BOT_NAMES - {'LabAI0', 'LabAI1', 'LabAI2'}


def test_authorized_pause_requires_the_exact_unchanged_healthy_user_pause():
    snapshot = preparation_snapshot()
    snapshot['world_learning']['phase_at'] = 1795730834.9760773
    stamp = snapshot['world_learning']['phase_at']
    assert deploy.authorized_pause(snapshot, stamp)
    changes = [('world_learning', {'phase_at': stamp + .001}),
               ('world_learning', {'enabled': True}), ('world_learning', {'restore_pending': True}),
               ('world_learning', {'phase': 'stopping'}), ('server', {'ready': False}),
               ('server', {'busy': True}), ('server', {'desired_running': False}),
               ('training_job', {'status': 'running'}), ('training_job', {'status': 'cancelling'})]
    for key, patch in changes:
        altered = copy.deepcopy(snapshot)
        altered[key].update(patch)
        assert not deploy.authorized_pause(altered, stamp), (key, patch)
    for persistence in ({'pending':1,'error':None}, {'pending':0,'error':'failed'}, {'pending':0}):
        altered = copy.deepcopy(snapshot)
        altered['performance']['persistence'] = persistence
        assert not deploy.authorized_pause(altered, stamp)
    snapshot['agents']['LabAI0']['last_seen'] -= 20
    assert not deploy.authorized_pause(snapshot, stamp)


def test_fingerprint_detects_optimizer_and_metadata_changes_across_torch_reload():
    import torch
    payload = {'model': {'weight': torch.tensor([[1., 2.]])},
               'optimizer': {'state': {0: {'step': torch.tensor(3.), 'exp_avg': torch.tensor([.1, .2])}},
                             'param_groups': [{'lr': .003, 'params': [0]}]}, 'width': 2}
    before = deploy.canonical_fingerprint(payload)
    stream = io.BytesIO()
    torch.save(payload, stream)
    stream.seek(0)
    assert deploy.canonical_fingerprint(torch.load(stream, weights_only=True)) == before
    payload['optimizer']['param_groups'][0]['lr'] = .004
    assert deploy.canonical_fingerprint(payload) != before
    payload['optimizer']['param_groups'][0]['lr'] = .003
    payload['width'] = 3
    assert deploy.canonical_fingerprint(payload) != before


def test_protected_bytes_must_match_even_when_tensor_payloads_match():
    before = {'active': {'full': 'payload', 'raw': 'zip-a', 'active': True},
              'protected': {'full': 'same', 'raw': 'fixed', 'active': False}}
    after = copy.deepcopy(before)
    after['active']['raw'] = 'zip-b'
    deploy.check_checkpoint_match(before, after)
    after['protected']['raw'] = 'rewritten'
    with pytest.raises(RuntimeError, match='protected bytes'):
        deploy.check_checkpoint_match(before, after)
    after = copy.deepcopy(before)
    after['active']['full'] = 'optimizer-changed'
    with pytest.raises(RuntimeError, match='payload changed'):
        deploy.check_checkpoint_match(before, after)
    with pytest.raises(RuntimeError, match='paths'):
        deploy.check_checkpoint_match(before, {})


def test_process_reuse_is_refused_and_only_owned_bot_or_service_can_be_terminated(monkeypatch):
    record = dict(pid=123, created=10, kind='bots', command=['node', 'controller/index.js'])
    monkeypatch.setattr(deploy, 'process_record', lambda pid, kind: {**record, 'created': 11})
    with pytest.raises(RuntimeError, match='reused'):
        deploy.same_process(record)
    monkeypatch.setattr(deploy, 'process_record', lambda pid, kind: dict(record))
    assert deploy.same_process(record)
    calls = []
    class Process:
        def terminate(self):
            calls.append('terminate')
        def wait(self, timeout):
            assert timeout == 30
            calls.append('wait')
    monkeypatch.setattr(deploy.psutil, 'Process', lambda pid: Process())
    deploy.terminate_owned(record)
    assert calls == ['terminate', 'wait']


def test_jar_install_is_scoped_and_atomic_preserving_old_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(deploy, 'ROOT', tmp_path)
    source = artifact(tmp_path)
    expected = deploy.sha256(source)
    target = tmp_path / 'server/plugins/PersistentPilotWorlds.jar'
    target.parent.mkdir(parents=True)
    target.write_bytes(b'prior plugin')
    other = target.parent / 'OtherPlugin.jar'
    other.write_bytes(b'unchanged')
    assert deploy.install_artifact(source, expected) == expected
    assert target.read_bytes() == source.read_bytes() and other.read_bytes() == b'unchanged'
    assert [file.read_bytes() for file in (tmp_path / 'logs').glob('pilot-plugin-prior-*.jar')] == [b'prior plugin']
    assert not list(target.parent.glob('*.tmp'))
    with pytest.raises(RuntimeError, match='SHA256'):
        deploy.install_artifact(source, '0' * 64)
    assert target.read_bytes() == source.read_bytes()


def test_human_shutdown_cancels_before_any_production_request(tmp_path, monkeypatch):
    monkeypatch.setattr(deploy, 'ROOT', tmp_path)
    (tmp_path / 'data').mkdir()
    (tmp_path / 'data/lab-stopped').write_text('human stopped')
    monkeypatch.setattr(deploy, 'fetch_json', lambda *args, **kwargs: pytest.fail('No request after intentional shutdown'))
    assert deploy.deploy(deploy.parse_args(prepared_args())) is False
    report = __import__('json').loads((tmp_path / 'logs/persistent-pilot-rollout.json').read_text())
    assert report['phase'] == 'cancelled'
    assert (tmp_path / 'data/lab-stopped').read_text() == 'human stopped'


@pytest.mark.parametrize('prepare_mode', ['none', 'success', 'capacity', 'failure'])
@pytest.mark.parametrize('authorized', [False, True])
def test_mocked_lifecycle_installs_only_after_saved_stop_then_resumes_same_options(tmp_path, monkeypatch, prepare_mode, authorized):
    """Exercise ordering and protected-state gates without touching any process."""
    monkeypatch.setattr(deploy, 'ROOT', tmp_path)
    data = tmp_path / 'data'
    data.mkdir()
    (data / 'arena.initialized').write_text('existing')
    for name, pid in [('dashboard-lan', 101), ('service', 102), ('bots', 103)]:
        (data / f'{name}.pid').write_text(str(pid))
    jar = artifact(tmp_path)
    args = deploy.parse_args(prepared_args())
    args.prepare_world = prepare_mode != 'none'
    args.authorized_paused_phase_at = 1234 if authorized else None
    args.plugin_jar, args.plugin_sha256 = jar, deploy.sha256(jar)
    # validate_artifact's explicit default root remains real; supply tmp root.
    validate = deploy.validate_artifact
    monkeypatch.setattr(deploy, 'validate_artifact', lambda path, digest: validate(path, digest, tmp_path))
    monkeypatch.setattr(deploy, 'source_digest', lambda: args.expected_digest)
    monkeypatch.setattr(deploy.subprocess, 'check_output', lambda command, **kw: args.commit if command[0] == 'git' else args.expected_controller)
    monkeypatch.setattr(deploy.time, 'sleep', lambda seconds: None)
    monkeypatch.setattr(deploy.shutil, 'which', lambda exe: 'pwsh.exe')
    phase = {'value': 'paused' if authorized else 'boundary', 'running_samples': 0}
    operations = []
    def process(pid, kind):
        return dict(pid=pid, kind=kind, created=1, command=[kind])
    monkeypatch.setattr(deploy, 'process_record', process)
    monkeypatch.setattr(deploy, 'owned_runtime', lambda launcher, port: {**launcher, 'pid': 104})
    monkeypatch.setattr(deploy, 'proxy_runtime', lambda launcher: {**launcher, 'pid': 105})
    monkeypatch.setattr(deploy, 'same_process', lambda record: record['kind'] != 'paper' or phase['value'] != 'stopped')
    def terminate(record):
        assert phase['value'] == 'stopped'
        assert record['kind'] in ('bots', 'service')
        operations.append('terminate:' + str(record['pid']))
    monkeypatch.setattr(deploy, 'terminate_owned', terminate)
    monkeypatch.setattr(deploy, 'archive_closed_logs', lambda: 'logs/mock-archive')
    def install(path, digest):
        assert operations[-3:] == ['terminate:103', 'terminate:104', 'terminate:102']
        operations.append('install')
        return digest
    monkeypatch.setattr(deploy, 'install_artifact', install)
    frozen_models = {'checkpoint': {'full': 'weights+optimizer', 'raw': 'protected', 'active': False}}
    monkeypatch.setattr(deploy, 'checkpoints', lambda: copy.deepcopy(frozen_models))
    names = {name: dict(serial=name, display_name=name) for name in deploy.BOT_NAMES}
    monkeypatch.setattr(deploy, 'identities', lambda: names)
    replay = {'data/demonstrations.npz': {'count': 3, 'fingerprint': 'demonstrations'}}
    monkeypatch.setattr(deploy, 'replays', lambda: replay)
    original_options = {'mission': 'first_night', 'night_level': 3, 'scenario': 2, 'size': 128, 'prepared': True, 'auto_progress': True}
    def snapshot():
        current = completed_boundary()
        current['world_learning']['options'] = dict(original_options)
        current['world_learning']['phase_at'] = 1234
        current['skills'] = [{'id': 'navigation', 'samples': 3}]
        current['agents'] = {name: dict(connected=True, last_seen=deploy.time.time(), display_name=name) for name in deploy.BOT_NAMES}
        current['server']['pid'] = 107 if phase['value'] in ('reloaded', 'running') else 106
        if phase['value'] in ('paused', 'reloaded'):
            current['world_learning'].update(enabled=False, phase='paused')
        if phase['value'] == 'running':
            phase['running_samples'] += 1
            current['world_learning'].update(round=569, run='fresh')
            current['world_training']['session'] = dict(run='fresh', phase='running', results={
                name: {'seconds': phase['running_samples'], 'timings': {'controller_revision': args.expected_controller}}
                for name in deploy.BOT_NAMES})
        return current
    monkeypatch.setattr(deploy, 'status', snapshot)
    def request(path, *, payload=None, **kw):
        if path == '/fixture/health':
            if phase['value'] == 'stopped':
                return {'server': {'ready': False, 'busy': False, 'phase': 'stopped'}}
            health = snapshot()
            health.update(stopped=False, ram_percent=86 if prepare_mode == 'capacity' else 70)
            health['server']['bots_online'] = 8
            return health
        operations.append(path)
        if path == '/world-learning/stop':
            phase['value'] = 'paused'
        elif path == '/control/shutdown':
            assert (data / 'lab-stopped').read_text().startswith('persistent-pilot-rollout:')
            phase['value'] = 'stopped'
        elif path == '/pilot/world':
            if payload['action'] == 'status':
                assert payload == {'action': 'status', 'world': 'lab_persistent_pilot'}
                return {'ok': True, 'event': 'status', 'world': 'lab_persistent_pilot', 'loaded': False}
            assert payload == {'action': 'create', 'world': 'lab_persistent_pilot', 'terrain': 'normal', 'seed': 20261125}
            assert phase['value'] == 'reloaded' and prepare_mode in ('success', 'failure')
            if prepare_mode == 'failure':
                raise TimeoutError('Explicit unverified one-attempt setup timeout')
            return prepared_world()
        elif path == '/world-learning/start':
            assert payload == original_options and phase['value'] == 'reloaded'
            phase['value'] = 'running'
        else:
            pytest.fail('Unexpected production API: ' + path)
        return {}
    monkeypatch.setattr(deploy, 'fetch_json', request)
    def start(command, **kw):
        assert phase['value'] == 'stopped' and operations[-1] == 'install'
        assert command[-1].endswith('Start-Lab.ps1')
        operations.append('Start-Lab')
        phase['value'] = 'reloaded'
        (data / 'lab-stopped').unlink()
        (data / 'service.pid').write_text('108')
        (data / 'bots.pid').write_text('109')
    monkeypatch.setattr(deploy.subprocess, 'run', start)
    assert deploy.deploy(args) is True
    expected = ['/world-learning/stop', '/control/shutdown', 'terminate:103',
                'terminate:104', 'terminate:102', 'install', 'Start-Lab', '/pilot/world']
    if authorized:
        expected.pop(0)
    if prepare_mode in ('success', 'failure'):
        expected.append('/pilot/world')
    assert operations == expected + ['/world-learning/start']
    assert (data / 'dashboard-lan.pid').read_text() == '101'
    assert not (data / 'lab-stopped').exists()
    report = __import__('json').loads((tmp_path / 'logs/persistent-pilot-rollout.json').read_text())
    preparation = report['pilot_world_preparation']
    assert preparation['status'] == {'none': 'not_requested', 'success': 'prepared',
                                      'capacity': 'skipped', 'failure': 'failed'}[prepare_mode]
    assert preparation['actors_admitted'] is False and preparation['supplied_items'] is False
    if prepare_mode != 'none':
        assert preparation['attempts'] == (1 if prepare_mode in ('success', 'failure') else 0)
    assert report['learning_enabled'] is True
    assert report['user_authorized_paused_window'] is authorized


def prepared_world(**patch):
    return dict(ok=True, event='created', world='lab_persistent_pilot', loaded=True, environment='NORMAL',
                keep_inventory=False, daylight_cycle=True, mob_spawning=True, auto_save=True,
                world_uuid='b99c9909-b68f-4b73-9616-b15ab8522c89', **patch)


def preparation_snapshot():
    snapshot = completed_boundary()
    snapshot['server']['pid'] = 123
    snapshot['agents'] = {name: dict(connected=True, last_seen=deploy.time.time()) for name in deploy.BOT_NAMES}
    snapshot['world_learning'].update(phase='paused', enabled=False)
    return snapshot


def preparation_health(snapshot, ram=70):
    health = copy.deepcopy(snapshot)
    health.update(stopped=False, ram_percent=ram)
    health['server']['bots_online'] = 8
    return health


@pytest.mark.parametrize('condition', ['no-ready', 'stale-bot', 'high-ram', 'nan-ram',
                                       'persistence', 'not-paused', 'wrong-pid'])
def test_optional_world_preparation_vetoes_before_creation(monkeypatch, condition):
    snapshot = preparation_snapshot()
    health = preparation_health(snapshot)
    if condition == 'no-ready':
        health['server']['ready'] = False
    elif condition == 'stale-bot':
        snapshot['agents']['LabAI0']['last_seen'] -= 20
    elif condition == 'high-ram':
        health['ram_percent'] = 86
    elif condition == 'nan-ram':
        health['ram_percent'] = float('nan')
    elif condition == 'persistence':
        health['performance']['persistence']['pending'] = 1
    elif condition == 'not-paused':
        snapshot['world_learning']['enabled'] = True
    elif condition == 'wrong-pid':
        health['server']['pid'] = 456
    def request(path, **kwargs):
        assert path == '/fixture/health'
        return health
    monkeypatch.setattr(deploy, 'fetch_json', request)
    result = deploy.prepare_pilot_world(snapshot, {'loaded': False}, 123)
    assert result['status'] == 'skipped' and result['attempts'] == 0
    assert result['reason']


@pytest.mark.parametrize('bad', [{'auto_save': False}, {'keep_inventory': True}, {'daylight_cycle': False},
                                {'mob_spawning': False}, {'environment': 'NETHER'}, {'world_uuid': 'not-a-uuid'}])
def test_optional_world_preparation_refuses_unverified_rules_without_retry(monkeypatch, bad):
    snapshot = preparation_snapshot()
    requests = []
    def request(path, *, payload=None, **kwargs):
        requests.append((path, payload))
        return preparation_health(snapshot) if path == '/fixture/health' else {**prepared_world(), **bad}
    monkeypatch.setattr(deploy, 'fetch_json', request)
    result = deploy.prepare_pilot_world(snapshot, {'loaded': False}, 123)
    assert result['status'] == 'failed' and result['attempts'] == 1
    assert len(requests) == 2


def test_optional_world_preparation_reuses_an_already_verified_owned_realm_without_creation(monkeypatch):
    snapshot = preparation_snapshot()
    monkeypatch.setattr(deploy, 'fetch_json', lambda path, **kwargs: preparation_health(snapshot))
    result = deploy.prepare_pilot_world(snapshot, prepared_world(), 123)
    assert result['status'] == 'prepared' and result['attempts'] == 0
    assert result['world_metadata']['world_uuid'] == prepared_world()['world_uuid']
