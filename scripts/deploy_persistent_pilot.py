"""One explicitly authorized, protected restart to install the optional pilot.

Import and --print-source-digest are read-only. --run requires the exact prepared
commit, source/controller fingerprints, JAR digest, LAN proxy and minimum completed
comparison. Default installation is inert. --prepare-world may prepare one fixed
owned natural realm while learning is paused; no option admits or supplies a bot.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import struct
import subprocess
import time
import urllib.request
import uuid
import zipfile

import psutil


ROOT = Path(__file__).resolve().parents[1]
BOT_NAMES = {f'LabAI{index}' for index in range(8)}
SKILLS = ('expedition', 'gathering', 'shelter', 'combat')
PLUGIN_NAME = 'PersistentPilotWorlds.jar'
SOURCE_FILES = (
    'lab/pilot_gateway.py', 'lab/service.py', 'lab/sleep_quorum.py', 'lab/world_training.py',
    'scripts/Build-PilotPlugin.ps1', 'scripts/Start-Lab.ps1', 'scripts/Start-Bots.ps1',
    'scripts/Start-DashboardLan.ps1', 'scripts/Start-PersistentPilot.ps1',
    'scripts/Stop-PersistentPilot.ps1', 'scripts/observe_persistent_pilot.py',
    'scripts/deploy_persistent_pilot.py',
)
SETTINGS_FILES = ('data/terrain-copy-window.json', 'data/vision.json', 'data/harvest-markers.json')


class Cancelled(RuntimeError):
    """A human or another owner changed a protected state; do not override it."""


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(payload, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def source_paths(root=ROOT):
    paths = set(root.joinpath('controller').glob('*.js'))
    paths.update(root.joinpath('config').rglob('*.json'))
    paths.update(path for path in root.joinpath('pilot').rglob('*')
                 if path.is_file() and path.suffix in {'.cjs', '.java', '.yml', '.html'})
    paths.update(root / name for name in SOURCE_FILES)
    if any(not path.is_file() for path in paths):
        raise RuntimeError('A required rollout source file is missing')
    return sorted(paths)


def source_digest(root=ROOT):
    digest = hashlib.sha256()
    for path in source_paths(root):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(b'\0')
        digest.update(path.read_bytes())
    return digest.hexdigest()


def validate_artifact(path, expected, root=ROOT):
    path = Path(path).resolve(strict=True)
    if not path.is_relative_to((root / 'logs').resolve()) or path.name != PLUGIN_NAME:
        raise ValueError('The prepared plugin artifact must be PersistentPilotWorlds.jar under logs')
    if sha256(path) != expected:
        raise RuntimeError('Prepared plugin artifact SHA256 changed')
    with zipfile.ZipFile(path) as archive:
        manifest = archive.read('plugin.yml').decode('utf-8')
        if not re.search(r'^name:\s*PersistentPilotWorlds\s*$', manifest, re.M):
            raise RuntimeError('Prepared artifact has the wrong plugin name')
        if not re.search(r'^main:\s*dev\.xonosnet\.pilot\.PilotWorlds\s*$', manifest, re.M):
            raise RuntimeError('Prepared artifact has the wrong plugin entry point')
        if 'dev/xonosnet/pilot/PilotWorlds.class' not in archive.namelist():
            raise RuntimeError('Prepared plugin has no compiled entry point')
    return path


def fetch_json(path, *, payload=None, timeout=15):
    headers = {}
    if payload is not None:
        headers = {'X-Lab-Token': ROOT.joinpath('data/api-token').read_text().strip(),
                   'Content-Type': 'application/json'}
    request = urllib.request.Request('http://localhost:8000' + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=headers, method='POST' if payload is not None else 'GET')
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def status():
    return fetch_json('/status?compact=true&fresh=true')


def freshness(snapshot, now=None):
    now = time.time() if now is None else now
    return {name for name, agent in snapshot.get('agents', {}).items()
            if name in BOT_NAMES and agent.get('connected')
            and 0 <= now - agent.get('last_seen', 0) < 8}


def boundary(snapshot, minimum_round):
    learning = snapshot.get('world_learning', {})
    session = snapshot.get('world_training', {}).get('session') or {}
    persistence = snapshot.get('performance', {}).get('persistence', {})
    return (learning.get('enabled') is True and learning.get('phase') == 'baseline'
            and not learning.get('restore_pending')
            and any(row.get('round', -1) >= minimum_round for row in learning.get('history', []))
            and session.get('phase') in ('restoring', 'snapshotting')
            and snapshot.get('server', {}).get('ready') is True
            and snapshot['server'].get('busy') is False
            and snapshot['server'].get('desired_running') is True and not snapshot['server'].get('error')
            and snapshot.get('training_job', {}).get('status') in ('idle', 'completed', 'cancelled', 'failed')
            and persistence.get('pending') == 0 and 'error' in persistence and not persistence['error'])


def authorized_pause(snapshot, phase_at):
    """Match one explicit user-authorized pause, never any later human pause."""
    learning = snapshot.get('world_learning', {})
    server = snapshot.get('server', {})
    persistence = snapshot.get('performance', {}).get('persistence', {})
    return (learning.get('phase') == 'paused' and learning.get('enabled') is False
            and learning.get('restore_pending') is False and learning.get('phase_at') == phase_at
            and server.get('ready') is True and server.get('busy') is False
            and server.get('desired_running') is True and not server.get('error')
            and snapshot.get('training_job', {}).get('status') in ('idle', 'completed', 'cancelled', 'failed')
            and persistence.get('pending') == 0 and 'error' in persistence and not persistence['error']
            and freshness(snapshot) == BOT_NAMES)


def read_pid(filename):
    return int(ROOT.joinpath(filename).read_text(encoding='utf-8-sig').strip())


def process_record(pid, kind):
    process = psutil.Process(pid)
    command = process.cmdline()
    text = ' '.join(command).replace('\\', '/')
    expected = {'service': 'uvicorn lab.service:app', 'bots': 'controller/index.js',
                'lan': '-m lab.dashboard_lan', 'paper': '-jar paper.jar'}[kind]
    name = process.name().lower()
    valid_names = {'bots': ('node.exe',), 'paper': ('java.exe',),
                   'service': ('python.exe', 'python3.11.exe'),
                   'lan': ('python.exe', 'python3.11.exe')}[kind]
    if expected not in text or name not in valid_names:
        raise RuntimeError(f'PID {pid} is not the expected {kind} process')
    expected_cwd = ROOT / 'server' if kind == 'paper' else ROOT
    if Path(process.cwd()).resolve() != expected_cwd.resolve():
        raise RuntimeError(f'PID {pid} does not belong to this project workspace')
    return dict(pid=pid, created=process.create_time(), kind=kind,
                command=command, parent=process.ppid(), name=name)


def owned_runtime(launcher, port):
    owners = {connection.pid for connection in psutil.net_connections(kind='tcp')
              if connection.status == psutil.CONN_LISTEN and connection.laddr.port == port
              and connection.laddr.ip == '127.0.0.1'}
    if len(owners) != 1:
        raise RuntimeError('Expected exactly one existing loopback backend listener')
    runtime = process_record(owners.pop(), launcher['kind'])
    if runtime['pid'] != launcher['pid'] and runtime['parent'] != launcher['pid']:
        raise RuntimeError('Listening backend is not owned by the saved launcher')
    return runtime


def proxy_runtime(launcher):
    children = [process_record(child.pid, 'lan')
                for child in psutil.Process(launcher['pid']).children()
                if '-m lab.dashboard_lan' in ' '.join(child.cmdline())]
    if len(children) > 1:
        raise RuntimeError('Ambiguous independent LAN proxy runtime')
    return children[0] if children else launcher


def same_process(record):
    try:
        current = process_record(record['pid'], record['kind'])
    except psutil.NoSuchProcess:
        return False
    if current['created'] != record['created'] or current['command'] != record['command']:
        raise RuntimeError('Recorded PID was reused or its command changed')
    return True


def terminate_owned(record):
    if same_process(record):
        process = psutil.Process(record['pid'])
        process.terminate()
        process.wait(timeout=30)


def canonical_fingerprint(value):
    """Fingerprint weights, optimizer and metadata independent of torch ZIP bytes."""
    import numpy as np
    import torch
    digest = hashlib.sha256()

    def field(tag, body=b''):
        digest.update(tag)
        digest.update(struct.pack('>Q', len(body)))
        digest.update(body)

    def visit(item):
        if isinstance(item, torch.Tensor):
            tensor = item.detach().cpu().contiguous()
            field(b'tensor', str(tensor.dtype).encode())
            visit(list(tensor.shape))
            field(b'data', tensor.reshape(-1).view(torch.uint8).numpy().tobytes())
        elif isinstance(item, np.ndarray):
            if item.dtype.hasobject:
                raise TypeError('Object arrays are not an accepted protected payload')
            field(b'ndarray', str(item.dtype).encode())
            visit(list(item.shape))
            field(b'data', item.tobytes(order='C'))
        elif isinstance(item, dict):
            field(b'dict', str(len(item)).encode())
            for key in sorted(item, key=lambda key: (type(key).__name__, repr(key))):
                visit(key)
                visit(item[key])
            if getattr(item, '_metadata', None) is not None:
                field(b'ordered_state_metadata')
                visit(item._metadata)
        elif isinstance(item, (list, tuple)):
            field(b'list' if isinstance(item, list) else b'tuple', str(len(item)).encode())
            for child in item:
                visit(child)
        elif item is None:
            field(b'none')
        elif isinstance(item, bool):
            field(b'bool', b'1' if item else b'0')
        elif isinstance(item, int):
            field(b'int', str(item).encode())
        elif isinstance(item, float):
            field(b'float', struct.pack('>d', item))
        elif isinstance(item, str):
            field(b'string', item.encode())
        elif isinstance(item, bytes):
            field(b'bytes', item)
        else:
            raise TypeError(f'Unsupported protected payload: {type(item).__name__}')

    visit(value)
    return digest.hexdigest()


def checkpoints():
    import torch
    torch.set_num_threads(1)
    required = {'checkpoints/latest.pt'}
    required.update(f'checkpoints/{folder}/{skill}.pt'
                    for folder in ('skills', 'world-learning') for skill in SKILLS)
    result = {}
    for path in ROOT.joinpath('checkpoints').rglob('*.pt'):
        # Timestamped rotation is an existing save policy, not a changed model.
        if path.parent == ROOT / 'checkpoints' and path.stem.isdecimal():
            continue
        key = path.relative_to(ROOT).as_posix()
        payload = torch.load(path, map_location='cpu', weights_only=True)
        if key in required and (not isinstance(payload, dict)
                                or not {'model', 'optimizer'} <= payload.keys()):
            raise RuntimeError('A required model/optimizer checkpoint is incomplete: ' + key)
        result[key] = dict(full=canonical_fingerprint(payload), raw=sha256(path),
                           active=key == 'checkpoints/latest.pt' or key.startswith('checkpoints/skills/')
                           and not path.stem.endswith('-champion'))
    if not required <= result.keys():
        raise RuntimeError('A required active or protected checkpoint is missing')
    return result


def check_checkpoint_match(before, after):
    if before.keys() != after.keys():
        raise RuntimeError('Non-rotating checkpoint paths changed')
    for path, row in before.items():
        if row['full'] != after[path]['full']:
            raise RuntimeError(path + ' model/optimizer/metadata payload changed')
        if not row['active'] and row['raw'] != after[path]['raw']:
            raise RuntimeError(path + ' protected bytes changed')


def replays():
    import numpy as np
    result = {}
    for path in sorted([*ROOT.joinpath('data/skills').glob('*.npz'), ROOT / 'data/demonstrations.npz']):
        if path.is_file():
            with np.load(path, allow_pickle=False) as archive:
                arrays = {name: archive[name] for name in archive.files}
                result[path.relative_to(ROOT).as_posix()] = dict(
                    count=len(arrays['actions']), fingerprint=canonical_fingerprint(arrays))
    return result


def identities():
    db = sqlite3.connect('file:' + ROOT.joinpath('data/lab.sqlite').as_posix() + '?mode=ro', uri=True)
    try:
        return {row[0]: dict(serial=row[1], display_name=row[2]) for row in
                db.execute('SELECT agent,serial,display_name FROM agent_identity') if row[0] in BOT_NAMES}
    finally:
        db.close()


def settings():
    return {name: sha256(ROOT / name) if ROOT.joinpath(name).exists() else None for name in SETTINGS_FILES}


def verify_settings(expected):
    if settings() != expected:
        raise Cancelled('Saved production settings changed outside this rollout')


def archive_closed_logs():
    directory = ROOT / 'logs' / ('pilot-rollout-archive-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8])
    directory.mkdir()
    for name in ('service.log', 'service-error.log', 'bots.log', 'bots-error.log', 'minecraft-console.log'):
        path = ROOT / 'logs' / name
        if path.exists():
            path.rename(directory / name)
    return directory.relative_to(ROOT).as_posix()


def install_artifact(artifact, expected_sha):
    destination = ROOT / 'server/plugins' / PLUGIN_NAME
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and sha256(destination) != expected_sha:
        backup = ROOT / 'logs' / ('pilot-plugin-prior-' + uuid.uuid4().hex + '.jar')
        shutil.copy2(destination, backup)
    temporary = destination.with_name(destination.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with artifact.open('rb') as source, temporary.open('xb') as target:
            shutil.copyfileobj(source, target)
            target.flush()
            os.fsync(target.fileno())
        if sha256(temporary) != expected_sha:
            raise RuntimeError('Copied plugin artifact failed SHA256 verification')
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return sha256(destination)


def prepare_pilot_world(snapshot, prior_world, expected_paper):
    """One optional preparation attempt; a veto must not strand healthy learning.

    The typed plugin refuses adoption, regeneration and foreign UUIDs. A failed or
    timed-out acknowledgement is recorded as unverified; never repeat creation.
    Any partially created owned realm is retained for later inspection.
    """
    started = time.monotonic()
    result = dict(requested=True, status='skipped', attempts=0, world='lab_persistent_pilot',
                  terrain='normal', seed=20261125, actors_admitted=False, supplied_items=False)

    def verify_world(world):
        if (world.get('ok') is not True or world.get('world') != 'lab_persistent_pilot'
                or world.get('loaded') is not True or world.get('environment') != 'NORMAL'
                or world.get('keep_inventory') is not False or world.get('daylight_cycle') is not True
                or world.get('mob_spawning') is not True or world.get('auto_save') is not True):
            raise RuntimeError('Prepared owned world did not verify its natural survival rules')
        identifier = world.get('world_uuid')
        if not isinstance(identifier, str) or str(uuid.UUID(identifier)) != identifier.lower():
            raise RuntimeError('Prepared world did not return a native UUID')
        if prior_world.get('world_uuid') and prior_world['world_uuid'] != identifier:
            raise RuntimeError('Prepared world UUID differs from its previous owned status')

    try:
        health = fetch_json('/fixture/health', timeout=5)
        result['health_before'] = dict(server=health.get('server'), ram_percent=health.get('ram_percent'),
                                       persistence=health.get('performance', {}).get('persistence'))
        server = health.get('server') or {}
        persistence = health.get('performance', {}).get('persistence') or {}
        ram = health.get('ram_percent')
        learning = snapshot.get('world_learning', {})
        reasons = []
        if (server.get('pid') != expected_paper or server.get('ready') is not True
                or server.get('busy') is not False or server.get('desired_running') is not True
                or server.get('error') or health.get('stopped') is not False):
            reasons.append('Paper lifecycle is not ready and unchanged')
        if server.get('bots_online') != 8 or freshness(snapshot) != BOT_NAMES:
            reasons.append('All eight production heartbeats are not fresh')
        if type(ram) not in (int, float) or not math.isfinite(ram) or not 0 <= ram < 86:
            reasons.append('Memory does not have headroom below 86%')
        if persistence.get('pending') != 0 or 'error' not in persistence or persistence['error']:
            reasons.append('Persistence is not clear and healthy')
        if (learning.get('phase') != 'paused' or learning.get('enabled') is not False
                or learning.get('restore_pending') is not False
                or health.get('world_learning', {}).get('phase') != 'paused'
                or health.get('world_learning', {}).get('restore_pending') is not False):
            reasons.append('Production is not protected and paused')
        if reasons:
            result['reason'] = '; '.join(reasons)
            return result
        world = prior_world
        if prior_world.get('loaded') is not True:
            result['attempts'] = 1
            world = fetch_json('/pilot/world', payload={'action': 'create', 'world': 'lab_persistent_pilot',
                'terrain': 'normal', 'seed': 20261125}, timeout=25)
            if world.get('event') != 'created':
                raise RuntimeError('World preparation returned the wrong typed acknowledgement')
        verify_world(world)
        result.update(status='prepared', verified=True, world_metadata=world,
                      ownership='native plugin UUID record; existing owned terrain is reused, never regenerated')
    except Exception as error:
        result.update(status='failed', verified=False, error=str(error),
                      reason='One bounded preparation attempt was not verified; no creation retry')
    finally:
        result['elapsed_seconds'] = round(time.monotonic() - started, 3)
    return result


@contextmanager
def rollout_lease():
    import msvcrt
    with ROOT.joinpath('data/controller-rollout.lock').open('a+b') as stream:
        stream.seek(0)
        msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        try:
            yield
        finally:
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)


def deploy(args):
    stop = ROOT / 'data/lab-stopped'
    report_path = ROOT / 'logs/persistent-pilot-rollout.json'
    marker_content = 'persistent-pilot-rollout:' + uuid.uuid4().hex
    context = dict(base_commit=args.commit, minimum_round=args.minimum_round,
                   expected_controller=args.expected_controller, source_sha256=args.expected_digest,
                   plugin_sha256=args.plugin_sha256, enabled_pilot=False,
                   prepare_world_requested=args.prepare_world,
                   user_authorized_paused_window=args.authorized_paused_phase_at is not None,
                   authorized_paused_phase_at=args.authorized_paused_phase_at)

    def report(phase, **details):
        context.update(details)
        write_json(report_path, dict(context, phase=phase, at=time.time()))

    def human_stop():
        if stop.exists():
            raise Cancelled('Intentional lab shutdown marker is present')

    def own_marker():
        if not stop.exists() or stop.read_text(encoding='utf-8-sig').strip() != marker_content:
            raise Cancelled('Our shutdown marker was removed or changed by another owner')

    def source_guard():
        if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() != args.commit:
            raise RuntimeError('Prepared commit no longer matches checkout HEAD')
        if source_digest() != args.expected_digest:
            raise RuntimeError('Prepared pilot/controller/configuration source changed')
        actual = subprocess.check_output(['node', '-p', "require('./controller/controller_revision')"], cwd=ROOT, text=True).strip()
        if actual != args.expected_controller:
            raise RuntimeError('Production controller revision differs from the unchanged expected revision')
        validate_artifact(args.plugin_jar, args.plugin_sha256)

    def lan_guard():
        if read_pid('data/dashboard-lan.pid') != args.expected_lan_pid or not same_process(lan) or not same_process(lan_runtime):
            raise Cancelled('Independent LAN proxy changed or stopped; do not replace it')

    try:
        human_stop()
        source_guard()
        if not ROOT.joinpath('data/arena.initialized').is_file():
            raise RuntimeError('Existing initialized-world marker is required')
        artifact = validate_artifact(args.plugin_jar, args.plugin_sha256)
        lan = process_record(read_pid('data/dashboard-lan.pid'), 'lan')
        lan_runtime = proxy_runtime(lan)
        lan_guard()
        original_settings = settings()
        if args.authorized_paused_phase_at is not None:
            report('checking_user_authorized_paused_window', lan_pid=lan['pid'], lan_runtime_pid=lan_runtime['pid'])
            first = status()
            if not authorized_pause(first, args.authorized_paused_phase_at):
                raise Cancelled('Current pause does not match the exact healthy user-authorized paused window')
            source_guard()
            second = status()
            if (not authorized_pause(second, args.authorized_paused_phase_at)
                    or first['server']['pid'] != second['server']['pid']):
                raise Cancelled('The user-authorized pause or Paper changed during verification')
        else:
            report('waiting_for_completed_comparison', lan_pid=lan['pid'], lan_runtime_pid=lan_runtime['pid'])
            wait_until = time.monotonic() + args.wait_hours * 3600
            while time.monotonic() < wait_until:
                human_stop()
                lan_guard()
                verify_settings(original_settings)
                health = fetch_json('/fixture/health', timeout=5)
                if health['world_learning']['phase'] in ('paused', 'stopping'):
                    raise Cancelled('Learning was paused before the completed-comparison boundary')
                session = health.get('world_training', {}).get('session') or {}
                if health['world_learning']['phase'] == 'baseline' and session.get('phase') in ('restoring', 'snapshotting'):
                    first = status()
                    if boundary(first, args.minimum_round):
                        source_guard()
                        second = status()
                        if boundary(second, args.minimum_round) and first['world_learning']['run'] == second['world_learning']['run']:
                            break
                time.sleep(8)
            else:
                raise TimeoutError('No completed comparison boundary during the bounded wait')

        source_guard()
        human_stop()
        lan_guard()
        options = second['world_learning']['options']
        old_round = second['world_learning']['round']
        paper = process_record(second['server']['pid'], 'paper')
        service = process_record(read_pid('data/service.pid'), 'service')
        runtime = owned_runtime(service, 8000)
        bots = process_record(read_pid('data/bots.pid'), 'bots')
        report('using_user_authorized_paused_window' if args.authorized_paused_phase_at is not None else 'pausing_at_completed_boundary',
               previous_round=old_round, options=options,
               previous_paper=paper, previous_service=service, previous_runtime=runtime, previous_bots=bots)
        if args.authorized_paused_phase_at is not None:
            paused = status()
            if (not authorized_pause(paused, args.authorized_paused_phase_at)
                    or paused['server']['pid'] != paper['pid']):
                raise Cancelled('The authorized pause changed before checkpoint protection')
        else:
            fetch_json('/world-learning/stop', payload={}, timeout=30)
            pause_until = time.monotonic() + 180
            while time.monotonic() < pause_until:
                human_stop()
                paused = status()
                if paused['server']['pid'] != paper['pid'] or not paused['server']['ready']:
                    raise RuntimeError('Paper changed before protected restoration finished')
                if paused['world_learning']['phase'] == 'paused' and not paused['world_learning']['restore_pending']:
                    break
                time.sleep(1)
            else:
                raise TimeoutError('Protected bundle restoration did not finish; no restart attempted')

        paused_at = paused['world_learning']['phase_at']
        before_models, before_names = checkpoints(), identities()
        before_counts = {row['id']: row['samples'] for row in paused['skills']}
        if set(before_names) != BOT_NAMES:
            raise RuntimeError('Eight persistent bot identities could not be verified')
        verify_settings(original_settings)
        report('protected_pause_verified', checkpoints_before=before_models, identities_before=before_names,
               sample_counts_before=before_counts, settings_before=original_settings)
        source_guard()
        human_stop()
        latest = status()['world_learning']
        if (latest['phase'] != 'paused' or latest['phase_at'] != paused_at
                or latest['enabled'] or latest['restore_pending']):
            raise Cancelled('Learning changed after our protected pause')
        with stop.open('x', encoding='utf-8') as marker:
            marker.write(marker_content)
            marker.flush()
            os.fsync(marker.fileno())
        own_marker()
        report('graceful_save_and_paper_stop')
        fetch_json('/control/shutdown', payload={'background': True}, timeout=30)
        stop_until = time.monotonic() + 600
        while time.monotonic() < stop_until:
            own_marker()
            health = fetch_json('/fixture/health', timeout=5)
            server = health['server']
            if server.get('error'):
                raise RuntimeError('Graceful Paper stop failed: ' + server['error'])
            if not server['ready'] and not server['busy'] and server['phase'] == 'stopped' and not same_process(paper):
                break
            time.sleep(2)
        else:
            raise TimeoutError('Paper did not finish saving and stopping; no force-kill attempted')

        check_checkpoint_match(before_models, checkpoints())
        saved_replays = replays()
        for skill, expected in before_counts.items():
            key = 'data/demonstrations.npz' if skill == 'navigation' else f'data/skills/{skill}.npz'
            if expected is None or saved_replays.get(key, {}).get('count', 0) != expected:
                raise RuntimeError('Saved replay does not match paused in-memory count: ' + skill)
        if identities() != before_names:
            raise RuntimeError('Bot identity changed during save')
        report('saved_paper_verified', replay_saved=saved_replays)
        own_marker()
        source_guard()
        verify_settings(original_settings)
        lan_guard()
        terminate_owned(bots)
        own_marker()
        lan_guard()
        terminate_owned(runtime)
        if service['pid'] != runtime['pid']:
            own_marker()
            terminate_owned(service)
        for filename, expected in (('data/service.pid', service['pid']), ('data/bots.pid', bots['pid'])):
            if ROOT.joinpath(filename).exists():
                if read_pid(filename) != expected:
                    raise RuntimeError('Owned PID file was changed by another process')
                ROOT.joinpath(filename).unlink()
        if same_process(paper):
            raise RuntimeError('Old Paper still exists; refusing installation')
        own_marker()
        source_guard()
        report('installing_inert_plugin', archived_logs=archive_closed_logs(),
               installed_plugin_sha256=install_artifact(artifact, args.plugin_sha256))
        shell = shutil.which('pwsh.exe') or shutil.which('pwsh')
        if not shell:
            raise RuntimeError('Configured PowerShell launcher is unavailable')
        own_marker()
        lan_guard()
        verify_settings(original_settings)
        source_guard()
        report('starting_saved_lab')
        restore_until = time.monotonic() + 20 * 60
        subprocess.run([shell, '-NoProfile', '-NonInteractive', '-File', str(ROOT / 'scripts/Start-Lab.ps1')],
                       cwd=ROOT, check=True, timeout=300, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        while time.monotonic() < restore_until:
            human_stop()
            lan_guard()
            verify_settings(original_settings)
            snapshot = status()
            if snapshot['server']['ready'] and not snapshot['server']['busy'] and freshness(snapshot) == BOT_NAMES:
                break
            time.sleep(2)
        else:
            raise TimeoutError('Reload did not produce ready Minecraft and eight fresh bots')
        new_paper = snapshot['server']['pid']
        learning = snapshot['world_learning']
        if new_paper == paper['pid'] or learning['enabled'] or learning['restore_pending'] or learning['phase'] != 'paused':
            raise RuntimeError('Reload did not preserve the expected protected paused state')
        new_service = process_record(read_pid('data/service.pid'), 'service')
        new_bots = process_record(read_pid('data/bots.pid'), 'bots')
        if new_service['pid'] == service['pid'] or new_bots['pid'] == bots['pid']:
            raise RuntimeError('Backend or bot controller was not replaced')
        if any(snapshot['agents'][name].get('display_name') != before_names[name]['display_name'] for name in BOT_NAMES):
            raise RuntimeError('Reloaded bot names differ from their durable identities')
        check_checkpoint_match(before_models, checkpoints())
        if replays() != saved_replays or identities() != before_names:
            raise RuntimeError('Replay or identities changed during reload')
        after_counts = {row['id']: row['samples'] for row in snapshot['skills']}
        if after_counts != before_counts:
            raise RuntimeError('Reloaded in-memory demonstration counts changed')
        # This status request does not create/load a pilot realm or admit a player.
        plugin = fetch_json('/pilot/world', payload={'action': 'status', 'world': 'lab_persistent_pilot'}, timeout=20)
        if plugin.get('ok') is not True or plugin.get('event') != 'status' or plugin.get('world') != 'lab_persistent_pilot':
            raise RuntimeError('Installed inert plugin did not acknowledge typed status')
        source_guard()
        human_stop()
        lan_guard()
        before_preparation = status()
        current = before_preparation['world_learning']
        if (current['phase'] != 'paused' or current['phase_at'] != learning['phase_at']
                or current['enabled'] or current['restore_pending']):
            raise Cancelled('Human changed learning after reload; do not auto-resume')
        preparation = dict(requested=False, status='not_requested', actors_admitted=False, supplied_items=False)
        if args.prepare_world:
            report('preparing_optional_pilot_world', pilot_world_preparation=dict(requested=True, status='checking'))
            preparation = prepare_pilot_world(before_preparation, plugin, new_paper)
            report('optional_pilot_world_preparation_returned', pilot_world_preparation=preparation)
            # Preparation is optional: a memory/health veto or failed ack cannot
            # silently change the production pause into a permanent stop.
            human_stop()
            lan_guard()
            source_guard()
            verify_settings(original_settings)
            current = status()['world_learning']
            if (current['phase'] != 'paused' or current['phase_at'] != learning['phase_at']
                    or current['enabled'] or current['restore_pending']):
                raise Cancelled('Human changed learning during optional world preparation; do not auto-resume')
        report('resuming_original_learning', checkpoints_unchanged=True, protected_bytes_unchanged=True,
               replay_unchanged=True, identities_unchanged=True, plugin_status=plugin,
               pilot_world_preparation=preparation,
               new_paper_pid=new_paper, new_service_pid=new_service['pid'], new_bots_pid=new_bots['pid'])
        fetch_json('/world-learning/start', payload=options, timeout=30)
        first_seconds = None
        run = None
        while time.monotonic() < restore_until:
            human_stop()
            lan_guard()
            verify_settings(original_settings)
            snapshot = status()
            learning = snapshot['world_learning']
            trial = snapshot['world_training'].get('session') or {}
            if not learning['enabled'] or learning['phase'] in ('paused', 'stopping'):
                raise Cancelled('Learning was paused during verification')
            if learning['options'] != options or snapshot['server']['pid'] != new_paper or not snapshot['server']['ready']:
                raise RuntimeError('Production world options or Paper changed after reload')
            if trial.get('run') == learning.get('run') and learning['round'] > old_round and trial.get('phase') == 'running':
                if run is not None and trial['run'] != run:
                    raise RuntimeError('First resumed trial changed before progress verified')
                run = trial['run']
                results = trial.get('results') or {}
                revisions = set(results) == BOT_NAMES and all(
                    row.get('timings', {}).get('controller_revision') == args.expected_controller for row in results.values())
                if revisions and freshness(snapshot) == BOT_NAMES:
                    seconds = {name: results[name].get('seconds', 0) for name in BOT_NAMES}
                    if first_seconds is not None and any(seconds[name] > first_seconds[name] for name in BOT_NAMES):
                        report('verified', eight_expected_revisions=True, eight_fresh_bots=True,
                               fresh_comparison_progressing=True, run=run, round=learning['round'],
                               options_unchanged=True, learning_enabled=True, dashboard_responding=True,
                               lan_proxy_unchanged=True, pilot_enabled_by_rollout=False)
                        return True
                    first_seconds = seconds
            time.sleep(2)
        raise TimeoutError('Fresh unchanged-controller comparison progress did not verify within twenty minutes')
    except Cancelled as error:
        report('cancelled', error=str(error))
        return False
    except Exception as error:
        report('error', error=str(error), own_stop_marker_present=stop.exists() and
               stop.read_text(encoding='utf-8-sig').strip() == marker_content)
        raise


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Explicitly authorize the prepared protected restart')
    parser.add_argument('--print-source-digest', action='store_true')
    parser.add_argument('--prepare-world', action='store_true',
                        help='Prepare the fixed natural pilot realm once while learning is protected and paused; no bot admission')
    parser.add_argument('--authorized-paused-phase-at', type=float,
                        help='Use only this exact explicitly user-authorized existing protected pause, and resume learning afterward')
    parser.add_argument('--base-commit', dest='commit')
    parser.add_argument('--expected-source-sha256', dest='expected_digest')
    parser.add_argument('--expected-controller')
    parser.add_argument('--plugin-jar', type=Path)
    parser.add_argument('--plugin-sha256')
    parser.add_argument('--minimum-round', type=int)
    parser.add_argument('--expected-lan-pid', type=int)
    parser.add_argument('--wait-hours', type=float, default=6)
    args = parser.parse_args(argv)
    if args.print_source_digest and args.run:
        parser.error('Use --print-source-digest separately from --run')
    if not args.print_source_digest:
        if not args.run:
            parser.error('No restart is authorized without explicit --run')
        for field, width in (('commit', 40), ('expected_digest', 64), ('expected_controller', 16), ('plugin_sha256', 64)):
            if not isinstance(getattr(args, field), str) or not re.fullmatch(r'[0-9a-f]{' + str(width) + '}', getattr(args, field)):
                parser.error('An exact lowercase fingerprint is required for ' + field)
        if args.plugin_jar is None or not args.minimum_round or args.minimum_round < 1 or not args.expected_lan_pid or args.expected_lan_pid < 1:
            parser.error('Explicit artifact, completed round and current LAN PID are required')
        if not 0 < args.wait_hours <= 6:
            parser.error('Boundary wait must be positive and at most six hours')
        if args.authorized_paused_phase_at is not None and (not math.isfinite(args.authorized_paused_phase_at)
                                                          or args.authorized_paused_phase_at <= 0):
            parser.error('Authorized paused phase_at must be an exact positive finite timestamp')
    return args


def main(argv=None):
    args = parse_args(argv)
    if args.print_source_digest:
        print(source_digest())
        return 0
    with rollout_lease():
        return 0 if deploy(args) else 2


if __name__ == '__main__':
    raise SystemExit(main())
