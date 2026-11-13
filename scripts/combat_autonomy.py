"""Train from native combat outcomes and evaluate against two frozen references."""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import random
import socket
import statistics
import subprocess
import sys

import torch

from lab.model import Policy


def load_policy(path):
    saved = torch.load(path, map_location='cpu', weights_only=True)
    weights = saved['model']
    width, inputs = weights['net.0.weight'].shape
    actions = weights['net.2.weight'].shape[0]
    model = Policy(width, inputs=inputs, actions=actions)
    model.load_state_dict(weights)
    return model


class Arena:
    def __enter__(self):
        self.lease = socket.socket()
        try:
            self.lease.bind(('127.0.0.1', 48192))
            self.process = subprocess.Popen(['node', 'scripts/combat_trial.cjs'], stdin=subprocess.PIPE,
                                            stdout=subprocess.PIPE, text=True, encoding='utf-8')
        except BaseException:
            self.lease.close()
            raise
        return self

    def read(self):
        line = self.process.stdout.readline()
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
            self.process.stdin = None
            output, _ = self.process.communicate(timeout=45)
            if exc[0] is None and (self.process.returncode or not any(
                    json.loads(line).get('cleaned') for line in output.splitlines())):
                raise RuntimeError('Native fixture did not exit cleanly and verify cleanup')
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.communicate()
            raise RuntimeError('Fixture cleanup timed out')
        finally:
            self.lease.close()


def fight(arena, seed, mob, model=None, explore=False):
    reply = arena.request(reset=True, seed=seed, mob=mob)
    trajectory = []
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
        if explore:
            reward = -.002 - .08 * (after['damage'] - previous_damage)
            if after['done']:
                reward += 2 if after['win'] else -3 if after['dead'] else -1
            trajectory.append((obs, action, reward))
        reply = after
    return reply, trajectory


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


def evaluate(arena, models, seeds, mob):
    rows = {name: [] for name in models}
    for index, seed in enumerate(seeds):
        order = list(models)
        offset = index % len(order)
        for name in order[offset:] + order[:offset]:
            result, _ = fight(arena, seed, mob, models[name])
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
    args = parser.parse_args()
    if args.smoke and (args.previous or args.retention_cycles):
        parser.error('Retention needs a full benchmark')
    if not args.output.resolve().is_relative_to(Path('logs').resolve()):
        parser.error('Output must be inside logs/')
    args.output.mkdir(parents=True)
    torch.set_num_threads(1)
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
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
    results = args.output / 'report.json'
    def save():
        temporary = results.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, indent=2), encoding='utf-8')
        temporary.replace(results)

    save()
    with Arena() as arena:
        assert arena.read()['ready']
        optimizer = torch.optim.Adam(candidate.parameters(), lr=.0005)
        report['training'] = []
        for _ in range(1 if args.smoke else 8):
            batch = []
            for seed in rng.sample(range(0, 100_000), 1 if args.smoke else 4):
                result, trajectory = fight(arena, seed, 'zombie', candidate, explore=True)
                batch.append(trajectory)
                report['training'].append(result)
                print(f'Train {seed} win={result["win"]} damage={result["damage"]:.1f}', flush=True)
            report['training'][-1]['loss'] = update(candidate, baseline, optimizer, batch)
            save()
        report['weights_changed'] = any(not torch.equal(a, b) for a, b in zip(candidate.parameters(), baseline.parameters()))
        torch.save({'model': candidate.state_dict()}, args.output / 'candidate.pt')
        report['benchmarks'] = {}
        for index, mob in enumerate(['skeleton'] if args.smoke else ['zombie', 'zombie', 'skeleton']):
            seeds = rng.sample(range((index + 1) * 100_000, (index + 2) * 100_000), 1 if args.smoke else 12)
            report['benchmarks'][f'{mob}_{index}'] = evaluate(arena, models, seeds, mob)
            save()
    report['cleaned'] = True
    report['scores'] = {k: {name: summary(rows) for name, rows in group.items()} for k, group in report['benchmarks'].items()}
    if not args.smoke:
        rows = report['benchmarks']
        references = ('teacher', 'original' if earlier else 'saved')
        report['passed'] = gates(rows, 'candidate', references)
        if earlier:
            report['candidate_retained'] = report['passed'] and all(
                safe_guard(group['candidate'], group['saved']) for group in rows.values())
    # Promotion here creates an isolated benchmark checkpoint. Production weights are owned by the lab scheduler.
    report['promoted'] = bool(report.get('candidate_retained' if earlier else 'passed') and report['weights_changed'])
    report['champion'] = bool(earlier or report['promoted'])
    if report['promoted']:
        (args.output / 'champion.pt').write_bytes((args.output / 'candidate.pt').read_bytes())
    elif earlier:
        (args.output / 'champion.pt').write_bytes(baseline_path.read_bytes())
    if earlier:
        report['retained'] = report['promoted'] or gates(rows, 'saved', references)
    save()
    print(json.dumps(report['scores']), flush=True)
    if args.retention_cycles and report.get('champion'):
        for cycle in range(1, args.retention_cycles + 1):
            next_output = args.output / f'cycle-{cycle}'
            subprocess.run([sys.executable, '-m', 'scripts.combat_autonomy', '--output', str(next_output),
                            '--seed', str(args.seed + cycle), '--continue-from', str(results)], check=True)
            results = next_output / 'report.json'


if __name__ == '__main__':
    main()
