"""Training-only paired test of one attack proposal at the first eligible observation."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import time
from urllib.request import urlopen

import torch

from scripts.combat_autonomy import Arena, freeze_source, load_policy, tensor_hash

SEEDS = (10311180, 10737471, 10192716, 10572246, 10362703, 10882707,
         10560339, 10550370, 10816047, 10080307, 10330461, 10637136)
REPLICATION_SEEDS = (12668833, 12760363, 12034427, 12100099, 12057153, 12707889,
                     12270827, 12480339, 12906348, 12097883, 12074184, 12094710)
DEVELOPMENT_SEEDS = (13300130, 13278258, 13434558, 13656125, 13306912, 13168775, 13905289, 13817830)
SAVED = '6b167faf6d664abf34158fe125dff337011c4679f1ef7a9fb0a179610abf30e6'
ARCHIVE = Path('logs/combat-experience-v1-full')
PROTOCOL = Path('docs/combat-opening-protocol.md')
REPLICATION_PROTOCOL = Path('docs/combat-opening-replication-protocol.md')


def eligible(obs):
    return (len(obs) == 82 and obs[70] == 1 and obs[77] == 1 and
            obs[66] * 32 <= 3 and obs[74] == 1 and obs[76] == 0)


class OpeningChoice:
    def __init__(self, intervene, head=None):
        self.intervene = intervene
        self.head = head
        self.first = None
        self.intervention = None

    def pick(self, observation, underlying, decision, logits=None):
        if self.first is None and eligible(observation):
            self.first = dict(decision=decision, underlying_action=underlying,
                              range_blocks=observation[66] * 32)
            if self.intervene or (self.head is not None and self.head(observation, logits)):
                self.intervention = dict(self.first)
                return 6
        return underlying

    def acknowledge(self, decision, execution):
        if self.intervention and self.intervention['decision'] == decision:
            self.intervention.update(helper_accepted=execution.get('interaction'),
                                     attack_requests=execution['attack_requests'])


def check_health(expected_pid=None, beginning=False):
    if Path('data/lab-stopped').exists():
        raise RuntimeError('Lab intentionally stopped')
    with urlopen('http://127.0.0.1:8000/status?compact=true', timeout=8) as response:
        status = json.load(response)
    server = status['server']
    pid = server.get('pid')
    if (not pid or not server.get('ready') or server.get('busy') or server.get('bots_online') != 8
            or status.get('ram_percent', 100) >= 86 or status['performance']['persistence'].get('error')
            or (expected_pid is not None and pid != expected_pid)):
        raise RuntimeError('Production health limit reached')
    phase = (status['world_training'].get('session') or {}).get('phase')
    if beginning and phase in ('snapshotting', 'restoring'):
        raise RuntimeError('Wait until production terrain preparation completes')
    return dict(pid=pid, ram_percent=status['ram_percent'], world_phase=phase,
                learning=status['world_learning'].get('phase'), sampled_at=time.time())


def encounter(arena, model, seed, arm, expected_pid, log, head=None):
    reply = arena.request(reset=True, seed=seed, mob='zombie', expected_pid=expected_pid)
    start = reply.get('start', {})
    log(dict(event='start', start=start))
    if reply.get('done'):
        raise RuntimeError(reply.get('invalid_reason') or 'Native reset ended before release')
    server = start.get('server') or {}
    if (start.get('difficulty') not in ('normal', 2) or not start.get('ai_frozen') or
            not server.get('ready') or server.get('busy') or server.get('pid') != expected_pid or
            server.get('ram_percent', 100) >= 86 or time.time() * 1000 - server.get('sampled_at_ms', 0) > 60_000):
        raise RuntimeError('Missing verified native start or unhealthy server sample')
    selection = OpeningChoice(arm == 'opening', head if arm == 'learned' else None)
    decision = 0
    while not reply['done']:
        decision += 1
        observation = reply['observation']
        with torch.inference_mode():
            logits = model(torch.tensor(observation, dtype=torch.float32))
            underlying = int(logits.argmax())
        action = selection.pick(observation, underlying, decision, logits)
        after = arena.request(action=action)
        execution = after.get('execution')
        log(dict(event='decision', decision=decision, observation=observation, saved_action=underlying,
                 proposed=action, execution=execution, damage_before=reply['damage'],
                 damage_after=after['damage'], valid=after.get('valid', True), done=after['done']))
        if not after.get('valid', True):
            raise RuntimeError(after['invalid_reason'])
        if (not execution or execution.get('proposed') != action or
                execution.get('decision') != decision or 'at_ms' not in execution):
            raise RuntimeError('Native proposal/effect trace missing')
        selection.acknowledge(decision, execution)
        reply = after
    if not reply.get('valid') or not decision or not reply.get('events'):
        raise RuntimeError(reply.get('invalid_reason') or 'Missing terminal event journal')
    row = {**reply, 'arm': arm, 'start': start, 'first_eligible': selection.first,
           'intervention': selection.intervention}
    log(dict(event='terminal', result=row))
    return row


def run(output, replication=False, development_from=None):
    from scripts.combat_opening_evidence import summarize, summarize_development

    if not output.resolve().is_relative_to(Path('logs').resolve()):
        raise ValueError('Output must be inside logs/')
    status = check_health(beginning=True)
    output.mkdir(parents=True)
    torch.set_num_threads(1)
    reference = output / 'baseline.pt'
    shutil.copyfile(ARCHIVE / 'baseline.pt', reference)
    model = load_policy(reference).eval()
    if tensor_hash(model) != SAVED:
        raise ValueError('Expected the original archived reference')
    source = freeze_source(output)
    runner = Path(__file__).resolve().relative_to(Path.cwd().resolve())
    paths = [runner, Path('scripts/combat_opening_evidence.py'), PROTOCOL]
    if replication or development_from:
        paths.append(REPLICATION_PROTOCOL)
    if development_from:
        paths.append(Path('scripts/combat_opening_head.py'))
    for path in paths:
        destination = output / 'source' / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
        source[path.as_posix()] = hashlib.sha256(destination.read_bytes()).hexdigest()
    # The experiment may add fixture telemetry; the shared actuators and
    # observation code must match those used to freeze this saved reference.
    archived = ARCHIVE / 'source'
    for path, digest in source.items():
        if path.startswith(('controller/', 'config/', 'lab/')) or path == 'package-lock.json':
            if not (archived / path).is_file() or hashlib.sha256((archived / path).read_bytes()).hexdigest() != digest:
                raise ValueError(f'Frozen shared source differs: {path}')
    head = None
    if development_from:
        from scripts.combat_opening_head import fit

        head = fit(model, development_from, output / 'opening-head.json')
        seeds = DEVELOPMENT_SEEDS
        orders = (('control', 'opening', 'learned'), ('opening', 'learned', 'control'),
                  ('learned', 'control', 'opening'))
        protocol = 'opening-attack-development'
        analyze = summarize_development
    else:
        seeds = REPLICATION_SEEDS if replication else SEEDS
        orders = (('control', 'opening'), ('opening', 'control'))
        protocol = 'opening-attack-replication' if replication else 'opening-attack-v1'
        analyze = summarize
    plan = [(seed, arm) for i, seed in enumerate(seeds) for arm in orders[i % len(orders)]]
    report = dict(protocol=protocol, training_only=True, seeds=list(seeds), plan=plan,
                  source=source, saved_tensor_sha256=SAVED, start_health=status,
                  torch_version=str(torch.__version__), rows=[], invalid_attempts=[])
    if head is not None:
        report['opening_head_sha256'] = hashlib.sha256((output / 'opening-head.json').read_bytes()).hexdigest()
    def save():
        path = output / 'report.tmp'
        path.write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
        path.replace(output / 'report.json')
    save()
    deadline = time.monotonic() + 18 * 60
    arena = Arena(output / 'source/scripts/combat_trial.cjs')
    active = None
    try:
        with (output / 'decisions.jsonl').open('x', encoding='utf-8', buffering=1) as stream, arena:
            ready = arena.read()
            metadata = ready.get('metadata', {})
            if (not ready.get('ready') or metadata.get('difficulty') not in ('normal', 2) or
                    metadata.get('event_clock') != 'monotonic_ms_from_release_send'):
                raise RuntimeError('Native arena difficulty or event clock not verified')
            if (replication or development_from) and metadata.get('frozen_dashboard_retry') != dict(timeout_ms=1500, retries=2, delay_ms=250):
                raise RuntimeError('Native frozen-state dashboard retry not verified')
            report['arena'] = metadata
            save()
            for seed, arm in plan:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Training-only experiment budget elapsed')
                active = dict(seed=seed, arm=arm)
                health = check_health(status['pid'])
                def log(row):
                    stream.write(json.dumps({**active, **row}, allow_nan=False) + '\n')
                log(dict(event='preflight', health=health))
                row = encounter(arena, model, seed, arm, status['pid'], log, head=head)
                report['rows'].append(row)
                active = None
                save()
                print(f'{seed} {arm}: {row["reason"]}, damage={row["damage"]:.2f}', flush=True)
    except (Exception, KeyboardInterrupt) as error:
        report['interrupted'] = str(error) or type(error).__name__
        if active is not None:
            report['invalid_attempts'].append({**active, 'error': report['interrupted']})
        report['cleaned'] = getattr(arena, 'cleaned', False)
        report['analysis'] = analyze(report['rows'], seeds)
        save()
        raise
    report['cleaned'] = arena.cleaned
    report['reference_unchanged'] = tensor_hash(model) == SAVED
    report['analysis'] = analyze(report['rows'], seeds)
    save()
    print(json.dumps({k: v for k, v in report['analysis'].items() if k != 'pairs'}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='New directory under logs/')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--replication', action='store_true', help='Use fresh, preregistered replication starts')
    mode.add_argument('--development-from', type=Path, help='Passing replication report.json for fitting')
    args = parser.parse_args()
    run(args.output, replication=args.replication, development_from=args.development_from)
