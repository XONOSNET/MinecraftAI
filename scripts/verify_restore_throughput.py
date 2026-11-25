"""Bounded, disposable Paper test of terrain-copy throughput and cleanup.

No production commands are issued. The sole live dependency is the read-only
fixture-health contract. This measures the copy phase, not livestock/survey
preparation or model learning. Without --run it only prints the plan.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import socket
import statistics
import subprocess
import sys
import threading
import time
import urllib.request
import uuid

import psutil

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lab.minecraft_status import query_status
from lab.world_training import WorldTraining

LOW, HIGH = -64, 192
X, Z, WIDTH, OFFSET = 128, 128, 64, 1024
PORTS = (25571, 25572)
ORDER = (2, 4, 4, 2)


def port_open(port):
    with socket.socket() as stream:
        stream.settimeout(.25)
        return stream.connect_ex(('127.0.0.1', port)) == 0


class MaintenanceGuard:
    """Attest one owner's saved-Paper maintenance interval; never stop it here."""
    def __init__(self, path):
        self.path = (ROOT / path).resolve()
        if not self.path.is_relative_to((ROOT/'logs').resolve()) or not self.path.is_file():
            raise ValueError('Maintenance manifest must be an existing file under ignored logs/')
        if self.path.stat().st_size > 8192:
            raise ValueError('Maintenance manifest exceeds its bounded size')
        self.raw, self.signature = self.fingerprint(self.path)
        self.manifest = json.loads(self.raw.decode('utf8'))
        self.marker = ROOT / 'data/lab-stopped'
        self.marker_raw, self.marker_signature = self.fingerprint(self.marker)
        pid = self.manifest.get('old_paper_pid')
        created = self.manifest.get('old_paper_creation_time')
        owned = self.manifest.get('owned_marker')
        if (self.manifest.get('phase') != 'paper_saved_for_native' or
                type(pid) is not int or pid <= 0 or type(created) not in (int,float) or
                not math.isfinite(created) or created <= 0 or
                not isinstance(owned,str) or not owned.strip() or
                self.marker.read_text(encoding='utf8') != owned):
            raise ValueError('Maintenance ownership manifest does not match the saved-Paper marker')
        self.assert_ownership()

    @staticmethod
    def fingerprint(path):
        before = path.stat()
        raw = path.read_bytes()
        after = path.stat()
        signature = (after.st_dev,after.st_ino,after.st_mtime_ns,after.st_size)
        if (before.st_dev,before.st_ino,before.st_mtime_ns,before.st_size) != signature:
            raise RuntimeError('Maintenance proof changed while being read')
        return raw,signature

    def assert_ownership(self):
        if self.fingerprint(self.path) != (self.raw,self.signature):
            raise RuntimeError('Maintenance manifest changed during the native block')
        if self.fingerprint(self.marker) != (self.marker_raw,self.marker_signature):
            raise RuntimeError('Owned lab-stopped marker was removed or overwritten')
        try:
            process = psutil.Process(self.manifest['old_paper_pid'])
            if abs(process.create_time()-self.manifest['old_paper_creation_time']) <= .01 and process.is_running():
                raise RuntimeError('The old owned Paper process is still running')
        except psutil.NoSuchProcess:
            pass
        if port_open(25565):
            raise RuntimeError('Production Minecraft reopened during offline maintenance')

    def assert_health(self, sample):
        self.assert_ownership()
        server, learning = sample['server'],sample['world_learning']
        if (sample['stopped'] is not True or server.get('pid') is not None or
                server['ready'] is not False or server['busy'] is not False or
                server['desired_running'] is not False or server['error'] is not None or
                server['phase'] != 'stopped' or learning['phase'] != 'paused' or
                learning['restore_pending'] is not False):
            raise RuntimeError('Offline maintenance lifecycle veto: ' + json.dumps(sample))

    def description(self):
        return dict(manifest=str(self.path.relative_to(ROOT)),
                    manifest_sha256=hashlib.sha256(self.raw).hexdigest(),
                    marker_sha256=hashlib.sha256(self.marker_raw).hexdigest(),
                    old_paper_pid=self.manifest['old_paper_pid'],
                    old_paper_creation_time=self.manifest['old_paper_creation_time'],
                    phase='paper_saved_for_native',production_expected_stopped=True)


def health(expected_pid=None, *, initial=False, maintenance=None):
    with urllib.request.urlopen('http://localhost:8000/fixture/health', timeout=5) as response:
        sample = json.load(response)
    server = sample['server']
    if maintenance is not None:
        maintenance.assert_health(sample)
    elif (not server['ready'] or server['busy'] or server['error'] or not server['desired_running'] or server['bots_online'] != 8 or
          sample['stopped'] or sample['world_training']['session']['phase'] != 'running' or
          sample['world_learning']['phase'] in ('paused', 'stopping', 'error', 'recovering')):
        raise RuntimeError('Production health veto: ' + json.dumps(sample))
    if sample['performance']['persistence']['error'] or sample['ram_percent'] >= (87 if initial else 89):
        raise RuntimeError(('Maintenance' if maintenance else 'Production') + ' health veto: ' + json.dumps(sample))
    if maintenance is None and expected_pid is not None and server['pid'] != expected_pid:
        raise RuntimeError('Production Paper PID changed')
    if initial and psutil.virtual_memory().available < 4 * 2**30:
        raise RuntimeError('Less than 4 GiB available before the isolated fixture')
    return sample


def safe_remove(path):
    path = path.resolve()
    if path.parent != (ROOT / 'logs').resolve() or not path.name.startswith('terrain-throughput-fixture-'):
        raise RuntimeError('Refusing cleanup outside the named fixture directory')
    shutil.rmtree(path)


class Fixture:
    def __init__(self, report, deadline, output, maintenance=None):
        self.report, self.deadline, self.output = report, deadline, output
        self.maintenance = maintenance
        self.directory = ROOT / 'logs' / ('terrain-throughput-fixture-' + uuid.uuid4().hex)
        self.log = self.directory / 'console.log'
        self.process = self.stream = self.timer = None
        self.serial = 0
        self.stopped = threading.Event()
        self.monitor = None
        self.monitor_error = None
        self.pass_id = 'startup'
        self.production_pid = None

    def check(self):
        if time.monotonic() >= self.deadline:
            raise TimeoutError('Fixture wall-clock deadline reached')
        if self.monitor_error:
            raise RuntimeError(self.monitor_error)
        if self.process and self.process.poll() is not None:
            raise RuntimeError('Isolated Paper exited with code ' + str(self.process.returncode))

    def send(self, command):
        self.check()
        self.process.stdin.write(command + '\n')
        self.process.stdin.flush()

    def read(self, offset):
        if not self.log.exists():
            return '', offset
        with self.log.open('rb') as stream:
            stream.seek(offset)
            raw = stream.read(262144)
            return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', raw.decode('utf8', errors='replace')).replace('\r', '\n'), stream.tell()

    def fence(self, commands, timeout=15):
        self.serial += 1
        offset = self.log.stat().st_size
        serial = self.serial
        for command in commands:
            self.send(command)
        self.send(f'scoreboard players set #native_restore_ack lab_world {serial}')
        end, result = min(self.deadline, time.monotonic() + timeout), ''
        while time.monotonic() < end:
            self.check()
            text, offset = self.read(offset)
            result += text
            if re.search(r'#native_restore_ack to ' + str(serial) + r'(?!\d)', result):
                return result
            if len(result) > 2**21:
                raise RuntimeError('Fixture command response exceeded its bounded log window')
            time.sleep(.025)
        raise TimeoutError('Fixture setup/verification fence timed out')

    def start(self):
        if any(port_open(port) for port in PORTS):
            raise RuntimeError('An isolated fixture port is already in use')
        before = health(initial=True,maintenance=self.maintenance)
        self.production_pid = before['server']['pid']
        self.report['production_preflight'] = before
        self.directory.mkdir(parents=True)
        shutil.copy2(ROOT / 'server/paper.jar', self.directory / 'paper.jar')
        for name in ('cache', 'libraries', 'versions'):
            shutil.copytree(ROOT / 'server' / name, self.directory / name)
        self.check()
        (self.directory / 'eula.txt').write_text('eula=true\n', encoding='ascii')
        properties = {
            'server-ip': '127.0.0.1', 'server-port': PORTS[0], 'enable-rcon': 'true',
            'rcon.port': PORTS[1], 'rcon.password': uuid.uuid4().hex,
            'broadcast-rcon-to-ops': 'false', 'online-mode': 'false',
            'enforce-secure-profile': 'false', 'level-name': 'restore-fixture',
            'level-type': 'minecraft\\:flat', 'level-seed': 326324934,
            'generate-structures': 'false', 'allow-nether': 'false',
            'spawn-monsters': 'true', 'spawn-protection': 0, 'view-distance': 3,
            'simulation-distance': 2, 'max-players': 1,
            'pause-when-empty-seconds': -1,
            'gamemode': 'spectator', 'motd': 'Isolated terrain-copy benchmark',
        }
        (self.directory / 'server.properties').write_text(''.join(f'{key}={value}\n' for key, value in properties.items()), encoding='ascii')
        (self.directory / 'bukkit.yml').write_text('settings:\n  allow-end: false\n', encoding='ascii')
        java = next((ROOT / 'runtime/java').rglob('java.exe'))
        self.stream = self.log.open('wb')
        self.process = subprocess.Popen([
            str(java), '-XX:+UseSerialGC', '-Xms128M', '-Xmx512M',
            '-XX:MaxDirectMemorySize=64M', '-XX:ActiveProcessorCount=1',
            '-jar', 'paper.jar', '--nogui'], cwd=self.directory, stdin=subprocess.PIPE,
            stdout=self.stream, stderr=subprocess.STDOUT, text=True,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        self.report['fixture_pid'] = self.process.pid
        self.report['fixture_directory'] = str(self.directory)
        # Kill the owned JVM even if a console write or unexpected native wait
        # hangs. The main path still verifies ports and removes the world.
        self.timer = threading.Timer(max(.1, self.deadline - time.monotonic()), self.process.kill)
        self.timer.daemon = True
        self.timer.start()
        end = min(self.deadline, time.monotonic() + 100)
        offset, text = 0, ''
        while time.monotonic() < end:
            self.check()
            part, offset = self.read(offset)
            text = (text + part)[-262144:]
            if 'Done (' in text:
                break
            time.sleep(.1)
        else:
            raise TimeoutError('Isolated Paper startup did not complete')
        health(self.production_pid,maintenance=self.maintenance)
        self.fence(['scoreboard objectives add lab_world dummy',
                    'gamerule doMobSpawning false', 'gamerule doDaylightCycle false',
                    'gamerule doWeatherCycle false', 'gamerule randomTickSpeed 0',
                    'difficulty normal', 'time set 18000', 'weather clear'])
        self.monitor = threading.Thread(target=self.monitor_health, daemon=True)
        self.monitor.start()

    def monitor_health(self):
        next_production = 0
        while not self.stopped.is_set():
            try:
                at = time.perf_counter()
                query_status('127.0.0.1', PORTS[0], timeout=1)
                self.report['status_probes'].append(dict(pass_id=self.pass_id, at=time.time(), milliseconds=round((time.perf_counter()-at)*1000, 3)))
            except Exception as error:
                self.report['status_probes'].append(dict(pass_id=self.pass_id,at=time.time(),error=str(error)))
                self.monitor_error = 'Fixture status probe failed: ' + str(error)
                return
            try:
                if time.monotonic() >= next_production:
                    sample = health(self.production_pid,maintenance=self.maintenance)
                    self.report['production_samples'].append(sample)
                    next_production = time.monotonic() + 10
            except Exception as error:
                self.report['production_health_errors'].append(dict(pass_id=self.pass_id,at=time.time(),error=str(error)))
                self.monitor_error = 'Production health probe veto: ' + str(error)
                return
            self.stopped.wait(2)

    def setup(self):
        self.pass_id = 'setup'
        loads = [f'forceload add {x} {Z} {x+WIDTH-1} {Z+WIDTH-1}' for x in (X, X+OFFSET)]
        self.fence(loads)
        time.sleep(2)
        commands = []
        for xx in range(X, X+WIDTH, 16):
            for zz in range(Z, Z+WIDTH, 16):
                sx = xx + OFFSET
                for y in range(LOW, HIGH, 64):
                    commands.append(f'fill {sx} {y} {zz} {sx+15} {y+63} {zz+15} minecraft:air')
                commands += [
                    f'fill {sx} -64 {zz} {sx+15} 63 {zz+15} minecraft:stone',
                    f'fill {sx} 63 {zz} {sx+15} 63 {zz+15} minecraft:grass_block',
                    f'fill {sx+6} 64 {zz+6} {sx+6} 68 {zz+6} minecraft:oak_log',
                    f'fill {sx+5} 68 {zz+5} {sx+7} 69 {zz+7} minecraft:oak_leaves[persistent=true]',
                    f'setblock {sx+3} 63 {zz+3} minecraft:water',
                    f'setblock {sx+4} 64 {zz+4} minecraft:chest',
                ]
        # The regular copier installs boundary glass after each tile. Give the
        # saved source the same immutable boundary for exact final comparison.
        for x0, z0, x1, z1 in [(X+OFFSET,Z,X+OFFSET,Z+WIDTH-1),
                               (X+OFFSET+WIDTH-1,Z,X+OFFSET+WIDTH-1,Z+WIDTH-1),
                               (X+OFFSET,Z,X+OFFSET+WIDTH-1,Z),
                               (X+OFFSET,Z+WIDTH-1,X+OFFSET+WIDTH-1,Z+WIDTH-1)]:
            commands.append(f'fill {x0} -64 {z0} {x1} 191 {z1} minecraft:glass')
        for index in range(0, len(commands), 16):
            result = self.fence(commands[index:index+16])
            if any(word in result for word in ('not loaded', 'Too many blocks', 'Unknown or incomplete')):
                raise RuntimeError('Fixture source preparation command failed: ' + result[-2048:])
        self.fence([f'forceload remove {x} {Z} {x+WIDTH-1} {Z+WIDTH-1}' for x in (X, X+OFFSET)])

    def dirty(self):
        self.pass_id = 'dirtying'
        self.fence([f'forceload add {x} {Z} {x+WIDTH-1} {Z+WIDTH-1}' for x in (X, X+OFFSET)])
        time.sleep(1)
        self.fence(['kill @e[tag=restore_probe]', 'kill @e[type=minecraft:item]'])
        commands = []
        for xx in range(X, X+WIDTH, 16):
            for zz in range(Z, Z+WIDTH, 16):
                for y in range(LOW, HIGH, 64):
                    commands.append(f'fill {xx} {y} {zz} {xx+15} {y+63} {zz+15} minecraft:air')
                commands += [f'fill {xx} 63 {zz} {xx+15} 63 {zz+15} minecraft:dirt',
                             f'setblock {xx+4} 64 {zz+4} minecraft:chest',
                             f'item replace block {xx+4} 64 {zz+4} container.0 with minecraft:diamond 3']
                for x in (xx, xx+OFFSET):
                    for y in (-40, 230):
                        commands.append(f'summon minecraft:item {x+8.5} {y} {zz+8.5} {{NoGravity:1b,PickupDelay:32767s,Age:-32768s,Tags:["restore_probe"],Item:{{id:"minecraft:emerald",count:1}}}}')
                commands.append(f'summon minecraft:zombie {xx+10.5} 65 {zz+10.5} {{NoAI:1b,NoGravity:1b,Invulnerable:1b,PersistenceRequired:1b,Tags:["restore_probe"]}}')
        commands.append(f'summon minecraft:zombie {X+11.5} 65 {Z+11.5} {{NoAI:1b,NoGravity:1b,Invulnerable:1b,PersistenceRequired:1b,Tags:["restore_probe","lab_combat"]}}')
        for index in range(0, len(commands), 16):
            result = self.fence(commands[index:index+16])
            if any(word in result for word in ('not loaded', 'Unknown or incomplete', 'Expected whitespace')):
                raise RuntimeError('Fixture dirty-state preparation failed: ' + result[-2048:])
        # An explicit summon success is insufficient when a fixture setting
        # removes monsters on the next world tick. Validate the dirty state
        # itself before releasing any timed copy pass.
        time.sleep(.6)
        expected = {'#native_items':64, '#native_zombies':16, '#native_combat':1}
        selectors = {
            '#native_items':'@e[type=minecraft:item,tag=restore_probe]',
            '#native_zombies':'@e[type=minecraft:zombie,tag=restore_probe,tag=!lab_combat]',
            '#native_combat':'@e[type=minecraft:zombie,tag=restore_probe,tag=lab_combat]',
        }
        checks = []
        for holder, selector in selectors.items():
            checks += [f'execute store result score {holder} lab_world if entity {selector}',
                       f'scoreboard players get {holder} lab_world']
        text = self.fence(checks)
        for holder, count in expected.items():
            if not re.search(re.escape(holder) + r' has ' + str(count) + r' \[lab_world\]', text):
                raise RuntimeError('Fixture dirty-state population did not match: ' + holder)
        self.report['dirty_state_checks'].append(dict(items=64,untagged_zombies=16,tagged_combat=1,verified=True))
        self.output.write_text(json.dumps(self.report,indent=2),encoding='utf8')
        self.fence([f'forceload remove {x} {Z} {x+WIDTH-1} {Z+WIDTH-1}' for x in (X, X+OFFSET)])

    def run_copy(self, count, index):
        self.dirty()
        self.pass_id = f'{index}-window-{count}'
        world = WorldTraining(self.directory / f'world-{index}.json', self.send, self.log, copy_batch_size=count)
        world.start({'mission':'first_night', 'night_level':3}, ['LabAI0'])
        world.session.update(bots=[], phase='restoring', bounds=[X,X+WIDTH,Z,Z+WIDTH],
                             core_bounds=[X,X+WIDTH,Z,Z+WIDTH], reset_area=[X,X+WIDTH,Z,Z+WIDTH],
                             copy_y=[LOW,HIGH], started_at=time.time())
        world.jobs = [(xx+OFFSET,xx,zz,16) for xx in range(X,X+WIDTH,16) for zz in range(Z,Z+WIDTH,16)]
        world.total = len(world.jobs)
        start = time.perf_counter()
        peak_tickets = 0
        # Do not call tick once the last cleaned tile is released: the full
        # scheduler would then begin fauna/survey, which is outside this probe.
        try:
            while world.jobs or world.job:
                self.check()
                world.tick()
                if not world.session['active']:
                    raise RuntimeError('Terrain copier stopped: ' + world.session['message'])
                owned = set()
                for job in (world.job, world.preloaded):
                    if job:
                        owned |= world.tile_chunks(job)
                peak_tickets = max(peak_tickets, len(owned))
                if len(owned) > 4:
                    raise RuntimeError('Copier exceeded four owned chunk tickets')
                time.sleep(.05)
            elapsed = time.perf_counter() - start
            stats = copy.deepcopy(world.session['copy_stats'])
            if stats['sent'] != stats['acknowledged']:
                raise RuntimeError('Unacknowledged copies remain')
            if stats['inflight_block_limit'] != count * 4096:
                raise RuntimeError('Terrain telemetry reports the wrong in-flight bound')
            result = dict(index=index, window=count, elapsed_seconds=round(elapsed,3),
                          blocks=WIDTH*WIDTH*(HIGH-LOW), copy_stats=stats,
                          peak_owned_chunk_tickets=peak_tickets)
            self.report['attempts'].append(result)
            self.output.write_text(json.dumps(self.report,indent=2),encoding='utf8')
        finally:
            world.stop('Isolated throughput pass finished; no bots deployed.')
        result['verification'] = self.verify()
        self.report['passes'].append(result)
        print(json.dumps(result), flush=True)

    def verify(self):
        self.pass_id = 'verification'
        self.fence([f'forceload add {x} {Z} {x+WIDTH-1} {Z+WIDTH-1}' for x in (X, X+OFFSET)])
        time.sleep(1)
        commands, markers = [], []
        for xx in range(X, X+WIDTH, 16):
            for zz in range(Z, Z+WIDTH, 16):
                for y in (LOW, 64):
                    marker = f'NATIVE_RESTORE_MATCH_{xx}_{zz}_{y}'
                    markers.append(marker)
                    commands.append(f'execute if blocks {xx+OFFSET} {y} {zz} {xx+OFFSET+15} {y+127} {zz+15} {xx} {y} {zz} all run say {marker}')
        for x in (X, X+OFFSET):
            marker = f'NATIVE_RESTORE_ITEMS_CLEAR_{x}'
            markers.append(marker)
            commands.append(f'execute unless entity @e[type=minecraft:item,x={x},y=-64,z={Z},dx={WIDTH-1},dy=383,dz={WIDTH-1}] run say {marker}')
        markers += ['NATIVE_RESTORE_HOSTILES_CLEAR', 'NATIVE_RESTORE_COMBAT_PRESERVED']
        commands += [f'execute unless entity @e[type=minecraft:zombie,tag=!lab_combat,x={X},y=-64,z={Z},dx={WIDTH-1},dy=383,dz={WIDTH-1}] run say NATIVE_RESTORE_HOSTILES_CLEAR',
                     'execute if entity @e[type=minecraft:zombie,tag=restore_probe,tag=lab_combat] run say NATIVE_RESTORE_COMBAT_PRESERVED']
        text = self.fence(commands)
        missing = [marker for marker in markers if not re.search(r'\[Server\] ' + re.escape(marker) + r'\s', text)]
        if missing:
            raise RuntimeError('Native restore verification missing: ' + ', '.join(missing))
        populations = {'#after_items':('@e[type=minecraft:item]',0),
                       '#after_hostiles':('@e[type=minecraft:zombie,tag=!lab_combat]',0),
                       '#after_combat':('@e[type=minecraft:zombie,tag=restore_probe,tag=lab_combat]',1)}
        checks = []
        for holder, (selector, _) in populations.items():
            checks += [f'execute store result score {holder} lab_world if entity {selector}',
                       f'scoreboard players get {holder} lab_world']
        text = self.fence(checks)
        for holder, (_, count) in populations.items():
            if not re.search(re.escape(holder) + r' has ' + str(count) + r' \[lab_world\]', text):
                raise RuntimeError('Post-copy fixture population did not match: ' + holder)
        self.fence([f'forceload remove {x} {Z} {x+WIDTH-1} {Z+WIDTH-1}' for x in (X, X+OFFSET)])
        text = self.fence(['forceload query'])
        if 'No force loaded chunks' not in text:
            raise RuntimeError('Fixture still has owned forceload tickets: ' + text[-1024:])
        return dict(full_band_blocks_equal=True, source_and_destination_items_clear=True,
                    all_loaded_items=0,untagged_hostiles_clear=True, tagged_combat_preserved=True,
                    tagged_combat_count=1,forceloads_released=True)

    def close(self, output):
        self.stopped.set()
        if self.monitor:
            self.monitor.join(timeout=6)
        cleanup = dict(process_exited=True, ports_closed=True, directory_removed=False)
        if self.process:
            if self.process.poll() is None:
                try:
                    self.process.stdin.write('stop\n')
                    self.process.stdin.flush()
                    self.process.wait(timeout=10)
                except (OSError, subprocess.TimeoutExpired):
                    self.process.kill()
                    self.process.wait(timeout=5)
            cleanup['process_exited'] = self.process.poll() is not None
        if self.timer:
            self.timer.cancel()
        if self.stream:
            self.stream.close()
        if self.log.exists():
            with self.log.open('rb') as stream:
                stream.seek(max(0,self.log.stat().st_size-262144))
                output.with_suffix('.console.log').write_bytes(stream.read(262144))
        cleanup['ports_closed'] = not any(port_open(port) for port in PORTS)
        if not cleanup['ports_closed']:
            raise RuntimeError('Fixture ports remain open after owned JVM stopped')
        if self.directory.exists():
            safe_remove(self.directory)
        cleanup['directory_removed'] = not self.directory.exists()
        self.report['cleanup'] = cleanup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Explicitly launch the disposable fixture')
    parser.add_argument('--output', default='logs/restore-throughput-native.json')
    parser.add_argument('--timeout', type=int, default=480)
    parser.add_argument('--maintenance-manifest',help='Owned saved-Paper proof under logs/; never stops production here')
    args = parser.parse_args()
    if not 60 <= args.timeout <= 600:
        parser.error('Fixture deadline must be60–600seconds')
    report = dict(scope='isolated terrain copy only; no production commands or model updates',
                  health_mode='parallel_production',
                  geometry=dict(x=X,z=Z,width=WIDTH,copy_y=[LOW,HIGH],source_offset=OFFSET),
                  order=list(ORDER), per_clone_block_limit=4096, max_experimental_inflight_blocks=16384,
                  passes=[], attempts=[],dirty_state_checks=[],status_probes=[], production_samples=[],production_health_errors=[])
    if args.maintenance_manifest:
        report.update(scope='isolated offline maintenance; production Paper must remain saved and stopped',
                      health_mode='maintenance_saved_paper',maintenance_manifest=args.maintenance_manifest)
    if not args.run:
        print(json.dumps(report, indent=2))
        return 0
    output = (ROOT / args.output).resolve()
    if not output.is_relative_to((ROOT/'logs').resolve()):
        parser.error('Native reports must remain under ignored logs/')
    output.parent.mkdir(parents=True, exist_ok=True)
    maintenance = MaintenanceGuard(args.maintenance_manifest) if args.maintenance_manifest else None
    if maintenance:
        report['maintenance'] = maintenance.description()
    fixture = Fixture(report, time.monotonic()+args.timeout,output,maintenance=maintenance)
    source = ROOT / 'lab/world_training.py'
    report['world_training_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    code = 0
    try:
        fixture.start()
        report['phase'] = 'fixture_started'
        output.write_text(json.dumps(report,indent=2),encoding='utf8')
        fixture.setup()
        report['phase'] = 'source_prepared'
        output.write_text(json.dumps(report,indent=2),encoding='utf8')
        for index, count in enumerate(ORDER, 1):
            fixture.run_copy(count,index)
            report['phase'] = f'pass_{index}_verified'
            output.write_text(json.dumps(report,indent=2),encoding='utf8')
        if hashlib.sha256(source.read_bytes()).hexdigest() != report['world_training_sha256']:
            raise RuntimeError('Copier source changed during the isolated block')
        report['production_final'] = health(fixture.production_pid,maintenance=maintenance)
        report['passed'] = True
    except Exception as error:
        code = 1
        report['error'] = f'{type(error).__name__}: {error}'
        report['passed'] = False
    finally:
        try:
            fixture.close(output)
        except Exception as error:
            code = 1
            report['cleanup_error'] = f'{type(error).__name__}: {error}'
            report['passed'] = False
        output.write_text(json.dumps(report,indent=2),encoding='utf8')
    complete = len(report['passes']) == len(ORDER)
    medians = {str(count):statistics.median(row['elapsed_seconds'] for row in report['passes'] if row['window']==count)
               for count in (2,4) if sum(row['window']==count for row in report['passes'])==2}
    reduction = 100*(1-medians['4']/medians['2']) if len(medians)==2 else None
    status_values = [row['milliseconds'] for row in report['status_probes'] if 'milliseconds' in row]
    failures = sum('error' in row for row in report['status_probes'])
    status_max = max(status_values,default=None)
    report['gate'] = dict(complete=complete,median_seconds=medians,percent_reduction=reduction,
                          minimum_percent_reduction=20,status_failures=failures,status_max_ms=status_max,
                          production_health_vetoes=len(report['production_health_errors']),
                          minimum_improvement_met=reduction is not None and reduction>=20,
                          checks_passed=report['passed'],
                          passed=bool(complete and report['passed'] and reduction is not None and reduction>=20 and
                                      failures==0 and status_max is not None and status_max<=2000))
    report['phase'] = 'complete' if complete and report['passed'] else 'incomplete'
    output.write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(dict(passed=report['passed'], error=report.get('error'),
                          cleanup=report.get('cleanup'), cleanup_error=report.get('cleanup_error'),gate=report['gate'])), flush=True)
    return code


if __name__ == '__main__':
    raise SystemExit(main())
