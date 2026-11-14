"""Train from native combat outcomes and evaluate against two frozen references."""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import random
import queue
import shutil
import socket
import statistics
import subprocess
import sys
import threading
import time

import torch

from lab.model import Policy

RECIPE = dict(version='native-outcome-v1', temperature=1.2, learning_rate=.0005,
              batches=8, fights_per_batch=4, passes=4, discount=.99,
              ratio_clip=[.8, 1.2], reference_kl=.05, grad_norm=1,
              reward=dict(step=-.002, damage=-.08, win=2, death=-3, other=-1))


def tensor_hash(model):
    digest = hashlib.sha256()
    for name, value in sorted(model.state_dict().items()):
        digest.update(name.encode())
        digest.update(str((value.dtype, tuple(value.shape))).encode())
        digest.update(value.cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()


def start_plan(seed, smoke, excluded=(), retention=False):
    rng = random.Random(seed)
    used = set(excluded)
    def draw(domain, count):
        seeds = []
        while len(seeds) < count:
            n = rng.randrange(domain * 1_000_000, (domain + 1) * 1_000_000)
            if n not in used:
                used.add(n)
                seeds.append(n)
        return seeds
    plan = {'training': draw(1, 1 if smoke else 32)}
    if smoke:
        plan['skeleton_0'] = draw(4, 1)
    else:
        for index, name in enumerate(('zombie_0', 'zombie_1', 'skeleton_2'), 2):
            plan[name] = draw(index, 12)
        if retention:
            for index, name in enumerate(('zombie_0', 'zombie_1', 'skeleton_2'), 5):
                plan['reload_' + name] = draw(index, 12)
    return plan


def freeze_source(output):
    root = output / 'source'
    hashes = {}
    for path in [*Path('controller').glob('*.js'),
                 *(Path('config') / name for name in ('behavior-schema.json', 'mining.json',
                   'survival-progression.json', 'house.json', 'world-resources.json')),
                 *(Path('scripts') / name for name in ('combat_trial.cjs', 'combat_execution.cjs',
                   'combat_autonomy.py')), Path('package-lock.json'), Path('lab/model.py')]:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        hashes[path.as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()
    return hashes


def load_policy(path):
    saved = torch.load(path, map_location='cpu', weights_only=True)
    weights = saved['model']
    width, inputs = weights['net.0.weight'].shape
    actions = weights['net.2.weight'].shape[0]
    model = Policy(width, inputs=inputs, actions=actions)
    model.load_state_dict(weights)
    return model


class Arena:
    def __init__(self, script='scripts/combat_trial.cjs'):
        self.script = script

    def __enter__(self):
        self.lease = socket.socket()
        try:
            self.lease.bind(('127.0.0.1', 48192))
            self.process = subprocess.Popen(['node', str(self.script)], stdin=subprocess.PIPE,
                                            stdout=subprocess.PIPE, text=True, encoding='utf-8')
            self.lines = queue.Queue()
            def drain():
                for line in self.process.stdout:
                    self.lines.put(line)
                self.lines.put(None)
            self.reader = threading.Thread(target=drain, daemon=True)
            self.reader.start()
        except BaseException:
            self.lease.close()
            raise
        return self

    def read(self):
        try:
            line = self.lines.get(timeout=90)
        except queue.Empty:
            raise RuntimeError('Native fixture response timed out') from None
        if not line:
            raise RuntimeError('Native fixture disconnected')
        reply = json.loads(line)
        if reply.get('error'):
            raise RuntimeError(reply['error'])
        return reply

    def request(self, **request):
        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()
        return self.read()

    def __exit__(self, *exc):
        try:
            self.process.stdin.close()
            self.process.wait(timeout=45)
            self.reader.join(timeout=2)
            confirmed = False
            while not self.lines.empty():
                line = self.lines.get_nowait()
                if line is not None:
                    try:
                        confirmed |= bool(json.loads(line).get('cleaned'))
                    except ValueError:
                        pass
            self.cleaned = confirmed
            if exc[0] is None and (self.process.returncode or not confirmed):
                raise RuntimeError('Native fixture did not exit cleanly and verify cleanup')
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
            raise RuntimeError('Fixture cleanup timed out')
        finally:
            self.lease.close()


def fight(arena, seed, mob, model=None, explore=False, trace=None):
    reply = arena.request(reset=True, seed=seed, mob=mob)
    start = reply.get('start')
    if trace:
        trace(dict(event='start', start=start, seed=seed, mob=mob))
    if not start or start.get('difficulty') not in ('normal', 2):
        raise RuntimeError('Missing start telemetry or unexpected native difficulty')
    server = start.get('server') or {}
    if (not server.get('ready') or server.get('busy') or not server.get('pid')
            or time.time() * 1000 - server.get('sampled_at_ms', 0) > 60_000):
        raise RuntimeError('Missing or unhealthy server monitoring')
    if getattr(arena, 'server_pid', server['pid']) != server['pid']:
        raise RuntimeError('Minecraft process changed')
    arena.server_pid = server['pid']
    trajectory = []
    counts = {'proposed': {}, 'by_action': {}, 'decisions': 0}
    while not reply['done']:
        if model is None:
            action = reply['teacher']
        else:
            obs = torch.tensor(reply['observation'], dtype=torch.float32)
            with torch.no_grad():
                logits = model(obs)
                if explore:
                    action = int(torch.distributions.Categorical(logits=logits / 1.2).sample())
                else:
                    action = int(logits.argmax())
        previous_damage = reply['damage']
        after = arena.request(action=action)
        effect = after.get('execution')
        if after.get('valid', True) and (not effect or effect['proposed'] != action):
            raise RuntimeError('Missing or mismatched execution telemetry')
        reward = -.002 - .08 * (after['damage'] - previous_damage)
        if after['done']:
            reward += 2 if after['win'] else -3 if after['dead'] else -1
        if trace:
            trace(dict(event='decision', seed=seed, mob=mob, observation=reply['observation'],
                       teacher=reply['teacher'], proposed=action, execution=effect, reward=reward,
                       done=after['done'], valid=after.get('valid', True)))
        if effect:
            key = str(action)
            counts['decisions'] += 1
            counts['proposed'][key] = counts['proposed'].get(key, 0) + 1
            tally = counts['by_action'].setdefault(key, {})
            for field in ('physics_ticks', 'held_item_ticks', 'attack_requests', 'critical_attempts',
                          'target_hurts', 'damage_events'):
                tally[field] = tally.get(field, 0) + effect[field]
            tally['accepted_interactions'] = tally.get('accepted_interactions', 0) + int(effect['interaction'] is True)
            tally['motion_intervals'] = tally.get('motion_intervals', 0) + int(effect['movement']['blocks'] > .01)
            tally['turn_intervals'] = tally.get('turn_intervals', 0) + int(abs(effect['movement']['yaw_radians']) > .01)
            for control, ticks in effect['controls_ticks'].items():
                name = f'{control}_ticks'
                tally[name] = tally.get(name, 0) + ticks
        if explore:
            trajectory.append((obs, action, reward))
        reply = after
    return {**reply, 'start': start, 'execution_counts': counts}, trajectory


def update(candidate, reference, optimizer, batch):
    states, actions, returns = [], [], []
    for trajectory in batch:
        future = 0
        for obs, action, reward in reversed(trajectory):
            future = reward + .99 * future
            states.append(obs)
            actions.append(action)
            returns.append(future)
    x = torch.stack(states)
    y = torch.tensor(actions)
    advantage = torch.tensor(returns)
    advantage = (advantage - advantage.mean()) / advantage.std(unbiased=False).clamp_min(.05)
    with torch.no_grad():
        prior = reference(x).softmax(-1)
        old_log_prob = (candidate(x) / 1.2).log_softmax(-1).gather(1, y[:, None]).squeeze(1)
    for _ in range(4):
        log_probs = (candidate(x) / 1.2).log_softmax(-1)
        ratio = (log_probs.gather(1, y[:, None]).squeeze(1) - old_log_prob).exp()
        loss = -torch.minimum(ratio * advantage, ratio.clamp(.8, 1.2) * advantage).mean()
        loss += .05 * torch.nn.functional.kl_div(log_probs, prior, reduction='batchmean')
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(candidate.parameters(), 1)
        optimizer.step()
    return float(loss.detach())


def summary(rows):
    wins = [r for r in rows if r['win']]
    return dict(attempts=len(rows), wins=len(wins), deaths=sum(r['dead'] for r in rows),
                mean_damage=statistics.mean(r['damage'] for r in rows),
                median_win_seconds=statistics.median(r['seconds'] for r in wins) if wins else None)


def paired_gate(candidate, reference):
    """Require repeatable improvement, with death and wins ahead of damage."""
    assert len(candidate) == len(reference) and candidate
    assert [(r['seed'], r['mob']) for r in candidate] == [(r['seed'], r['mob']) for r in reference]
    c, r = summary(candidate), summary(reference)
    if c['deaths'] > r['deaths'] or c['wins'] < r['wins']:
        return False
    if c['wins'] > r['wins']:
        better = sum(a['win'] and not b['win'] for a, b in zip(candidate, reference))
        worse = sum(b['win'] and not a['win'] for a, b in zip(candidate, reference))
    else:
        joint = [(a, b) for a, b in zip(candidate, reference) if a['win'] and b['win']]
        if not joint or statistics.mean(b['damage'] - a['damage'] for a, b in joint) < 1:
            return False
        better = sum(a['damage'] + .1 < b['damage'] for a, b in joint)
        worse = sum(b['damage'] + .1 < a['damage'] for a, b in joint)
    n = better + worse
    return n > 0 and sum(math.comb(n, k) for k in range(better, n + 1)) / 2**n <= .05


def safe_guard(candidate, reference):
    c, r = summary(candidate), summary(reference)
    return c['deaths'] <= r['deaths'] and c['wins'] >= r['wins'] and c['mean_damage'] <= r['mean_damage'] + 1


def evaluate(run_fight, models, seeds, mob, group):
    rows = {name: [] for name in models}
    for index, seed in enumerate(seeds):
        order = list(models)
        offset = index % len(order)
        for name in order[offset:] + order[:offset]:
            result, _ = run_fight(group, name, seed, mob, models[name])
            rows[name].append(result)
            print(f'{mob} {seed} {name} win={result["win"]} damage={result["damage"]:.1f}', flush=True)
    return rows


def gates(rows, candidate, references):
    return (all(paired_gate(rows[key][candidate], rows[key][ref])
                for key in ('zombie_0', 'zombie_1') for ref in references)
            and all(safe_guard(rows['skeleton_2'][candidate], rows['skeleton_2'][ref]) for ref in references))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='New directory below logs/')
    parser.add_argument('--smoke', action='store_true')
    parser.add_argument('--seed', type=int, default=41)
    parser.add_argument('--continue-from', dest='previous', type=Path, help='Prior experiment report with a protected champion')
    parser.add_argument('--retention-cycles', type=int, choices=(0, 1, 2), default=0)
    parser.add_argument('--protocol', choices=('v1',), default='v1')
    args = parser.parse_args()
    if args.smoke and (args.previous or args.retention_cycles):
        parser.error('Retention needs a full benchmark')
    if not args.output.resolve().is_relative_to(Path('logs').resolve()):
        parser.error('Output must be inside logs/')
    args.output.mkdir(parents=True)
    torch.set_num_threads(1)
    torch.manual_seed(args.seed)
    earlier = json.loads(args.previous.read_text(encoding='utf-8')) if args.previous else None
    if earlier and (not earlier.get('champion') or args.seed in earlier['used_seeds']):
        parser.error('Use a report with a protected champion and a fresh seed')
    saved = args.previous.parent / 'champion.pt' if earlier else Path('checkpoints/skills/combat.pt')
    baseline_path = args.output / 'baseline.pt'
    baseline_path.write_bytes(saved.read_bytes())
    report = {'smoke': args.smoke, 'seed': args.seed, 'used_seeds': (earlier['used_seeds'] if earlier else []) + [args.seed],
              'checkpoint_sha256': hashlib.sha256(baseline_path.read_bytes()).hexdigest()}
    baseline = load_policy(baseline_path)
    candidate = copy.deepcopy(baseline)
    models = {'teacher': None, 'saved': baseline, 'candidate': candidate}
    origin = args.output / 'original.pt'
    origin.write_bytes((args.previous.parent / 'original.pt').read_bytes() if earlier else baseline_path.read_bytes())
    if earlier:
        models['original'] = load_policy(origin)
    excluded = set(earlier.get('used_starts', ())) if earlier else set()
    plan = start_plan(args.seed, args.smoke, excluded, retention=bool(earlier))
    source = freeze_source(args.output)
    if earlier and earlier.get('source') != source:
        parser.error('Retention requires the exact frozen experiment sources')
    report.update(protocol=args.protocol, recipe=RECIPE, source=source,
                  start_plan=plan, used_starts=sorted(excluded | {n for group in plan.values() for n in group}),
                  arm_order=list(models), torch_version=str(torch.__version__),
                  tensor_hashes={'saved': tensor_hash(baseline), 'original': tensor_hash(load_policy(origin))},
                  invalid_attempts=[], training=[], benchmarks={}, completed_attempts=[])
    results = args.output / 'report.json'
    def save():
        temporary = results.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, indent=2), encoding='utf-8')
        temporary.replace(results)

    save()
    deadline = time.monotonic() + (120 if earlier else 75) * 60
    arena = Arena(args.output / 'source/scripts/combat_trial.cjs')
    try:
        with (args.output / 'decisions.jsonl').open('x', encoding='utf-8', buffering=1) as events, arena:
            ready = arena.read()
            if not ready.get('ready') or not ready.get('metadata'):
                raise RuntimeError('Fixture did not report its protocol metadata')
            report['arena'] = ready['metadata']
            if report['arena']['difficulty'] not in ('normal', 2):
                raise RuntimeError('Expected Normal native difficulty')
            save()

            def run_fight(group, arm, seed, mob, model, explore=False):
                if time.monotonic() >= deadline or Path('data/lab-stopped').exists():
                    raise RuntimeError('Experiment budget elapsed or lab intentionally stopped')
                identity = dict(group=group, arm=arm, seed=seed, mob=mob)
                def trace(row):
                    events.write(json.dumps({**identity, **row}, allow_nan=False) + '\n')
                try:
                    row, trajectory = fight(arena, seed, mob, model, explore, trace)
                    if not row.get('valid', True):
                        raise RuntimeError(row['invalid_reason'])
                    if not row.get('start') or not row['execution_counts']['decisions']:
                        raise RuntimeError('Start or execution trace was missing')
                except Exception as error:
                    report['invalid_attempts'].append({**identity, 'error': str(error)})
                    save()
                    raise
                report['completed_attempts'].append({'group': group, 'arm': arm, **row})
                save()
                return row, trajectory

            optimizer = torch.optim.Adam(candidate.parameters(), lr=RECIPE['learning_rate'])
            if earlier:
                optimizer.load_state_dict(torch.load(baseline_path, weights_only=True)['optimizer'])
            size = 1 if args.smoke else RECIPE['fights_per_batch']
            for start in range(0, len(plan['training']), size):
                batch = []
                for seed in plan['training'][start:start+size]:
                    result, trajectory = run_fight('training', 'candidate', seed, 'zombie', candidate, explore=True)
                    batch.append(trajectory)
                    report['training'].append(result)
                    print(f'Train {seed} win={result["win"]} damage={result["damage"]:.1f}', flush=True)
                report['training'][-1]['loss'] = update(candidate, baseline, optimizer, batch)
                save()
            report['tensor_hashes']['candidate'] = tensor_hash(candidate)
            report['weights_changed'] = tensor_hash(candidate) != report['tensor_hashes']['saved']
            torch.save({'model': candidate.state_dict(), 'optimizer': optimizer.state_dict(), 'recipe': RECIPE},
                       args.output / 'candidate.pt')
            loaded = load_policy(args.output / 'candidate.pt')
            probes = torch.stack([item[0] for trajectory in batch for item in trajectory])
            with torch.inference_mode():
                report['reload_verified'] = tensor_hash(loaded) == tensor_hash(candidate) and torch.equal(loaded(probes), candidate(probes))
            if not report['reload_verified'] or not report['weights_changed']:
                raise RuntimeError('Outcome update or checkpoint reload did not verify')
            models['candidate'] = loaded
            realized = {}
            for row in report['training']:
                for action, counts in row['execution_counts']['by_action'].items():
                    realized[action] = realized.get(action, 0) + sum(counts.get(key, 0)
                        for key in ('attack_requests', 'motion_intervals', 'turn_intervals', 'held_item_ticks'))
            if sum(v > 0 for v in realized.values()) < 2 or not any(
                counts.get('target_hurts', 0) for row in report['training']
                for counts in row['execution_counts']['by_action'].values()):
                raise RuntimeError('Training control feasibility gate failed')
            if not args.smoke and not any(row['damage'] >= 1 or not row['win'] for row in report['training']):
                raise RuntimeError('Training outcomes saturated both win and material-damage endpoints')
            for group, seeds in plan.items():
                if group == 'training' or group.startswith('reload_'):
                    continue
                report['benchmarks'][group] = evaluate(run_fight, models, seeds, group.split('_')[0], group)
                save()
                if not args.smoke and not earlier and group == 'zombie_0' and not all(
                    paired_gate(report['benchmarks'][group]['candidate'], report['benchmarks'][group][ref])
                    for ref in ('teacher', 'saved')):
                    report['stopped_for_futility'] = True
                    break
            if earlier:
                rows = report['benchmarks']
                refs = ('teacher', 'original')
                proposed = gates(rows, 'candidate', refs) and all(
                    safe_guard(group['candidate'], group['saved']) for group in rows.values())
                report['candidate_retained'] = proposed
                selected = args.output / 'candidate.pt' if proposed else baseline_path
                checkpoint = load_policy(selected)
                with torch.inference_mode():
                    online = models['candidate'] if proposed else models['saved']
                    if tensor_hash(checkpoint) != tensor_hash(online) or not torch.equal(checkpoint(probes), online(probes)):
                        raise RuntimeError('Resulting champion did not reload identically')
                report['retention_reload'] = {'candidate_selected': proposed, 'tensor_sha256': tensor_hash(checkpoint)}
                report['retention_benchmarks'] = {}
                for key in ('zombie_0', 'zombie_1', 'skeleton_2'):
                    report['retention_benchmarks'][key] = evaluate(run_fight,
                        {'teacher': None, 'original': models['original'], 'result': checkpoint},
                        plan['reload_' + key], key.split('_')[0], 'reload_' + key)
                    save()
                report['retained'] = gates(report['retention_benchmarks'], 'result', refs)
                if not report['retained']:
                    report['candidate_retained'] = False
    except (Exception, KeyboardInterrupt) as error:
        report['interrupted'] = str(error) or type(error).__name__
        report['cleaned'] = getattr(arena, 'cleaned', False)
        save()
        raise
    report['cleaned'] = arena.cleaned
    report['scores'] = {k: {name: summary(rows) for name, rows in group.items()} for k, group in report['benchmarks'].items()}
    if not args.smoke:
        rows = report['benchmarks']
        references = ('teacher', 'original' if earlier else 'saved')
        report['passed'] = not report.get('stopped_for_futility') and gates(rows, 'candidate', references)
    # Promotion here creates an isolated benchmark checkpoint. Production weights are owned by the lab scheduler.
    report['promoted'] = bool(report.get('candidate_retained' if earlier else 'passed') and report['weights_changed'])
    report['champion'] = bool(earlier or report['promoted'])
    if report['promoted']:
        (args.output / 'champion.pt').write_bytes((args.output / 'candidate.pt').read_bytes())
    elif earlier:
        (args.output / 'champion.pt').write_bytes(baseline_path.read_bytes())
    save()
    print(json.dumps(report['scores']), flush=True)
    if args.retention_cycles and report.get('champion'):
        for cycle in range(1, args.retention_cycles + 1):
            next_output = args.output / f'cycle-{cycle}'
            subprocess.run([sys.executable, '-m', 'scripts.combat_autonomy', '--output', str(next_output),
                            '--seed', str(args.seed + cycle), '--continue-from', str(results)], check=True)
            results = next_output / 'report.json'
            if not json.loads(results.read_text(encoding='utf-8')).get('retained'):
                break


if __name__ == '__main__':
    main()
