"""Explicit, bounded disposable Paper/broker host for pilot lifecycle fixtures.

This process never sends a production command. Only cached project assets are
used. Its worlds are temporary; the continuing seven-day pilot belongs in the
separate persistent production realm, never this disposable host.
"""
from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import uuid

import psutil
import uvicorn
from fastapi import Body, Depends, FastAPI, Header, HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lab.pilot_gateway import FIXTURE_WORLD, PilotBroker, build_command
from lab.minecraft_status import query_status

GAME_PORT = 25571
BROKER_PORT = 8102


def port_open(port):
    with socket.socket() as stream:
        stream.settimeout(.25)
        return stream.connect_ex(('127.0.0.1', port)) == 0


def atomic_json(path, value):
    temporary = path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        with temporary.open('x',encoding='utf8') as stream:
            json.dump(value,stream,indent=2); stream.flush(); os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def production_health(expected_pid=None, initial=False):
    with urllib.request.urlopen('http://localhost:8000/fixture/health', timeout=5) as response:
        sample = json.load(response)
    server = sample['server']
    if (not server['ready'] or server['busy'] or not server['desired_running'] or server['error'] or
            server['bots_online'] != 8 or sample['stopped'] or sample['performance']['persistence']['error']):
        raise RuntimeError('Production lifecycle veto: ' + json.dumps(sample))
    # 512 MiB capped heap plus native/Node overhead fits below the continuing
    # 89% stop gate. Also require five GiB actually available on every preflight.
    if sample['ram_percent'] >= (84 if initial else 89):
        raise RuntimeError('Production memory veto: ' + json.dumps(sample))
    if expected_pid is not None and server['pid'] != expected_pid:
        raise RuntimeError('Production Paper identity changed')
    if sample['world_training']['session'] and sample['world_training']['session']['phase'] in ('restoring', 'snapshotting'):
        raise RuntimeError('Production terrain preparation owns the compute window')
    if initial and psutil.virtual_memory().available < 5 * 2**30:
        raise RuntimeError('Five GiB available memory is required for an isolated lifecycle fixture')
    return sample


class KillOnCloseJob:
    """The only assigned child is our JVM; a killed host cannot orphan it."""
    def __init__(self):
        self.handle = None
        self.lock = threading.Lock()
        self.closed = False
        if os.name != 'nt':
            return
        class Basic(ctypes.Structure):
            _fields_ = [('process_time', ctypes.c_int64), ('job_time', ctypes.c_int64),
                        ('flags', wintypes.DWORD), ('minimum_ws', ctypes.c_size_t),
                        ('maximum_ws', ctypes.c_size_t), ('active_limit', wintypes.DWORD),
                        ('affinity', ctypes.c_size_t), ('priority', wintypes.DWORD),
                        ('scheduling', wintypes.DWORD)]
        class Io(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in
                        ('read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes')]
        class Extended(ctypes.Structure):
            _fields_ = [('basic', Basic), ('io', Io), ('process_memory', ctypes.c_size_t),
                        ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t),
                        ('peak_job', ctypes.c_size_t)]
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        kernel.CreateJobObjectW.restype = wintypes.HANDLE
        kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        kernel.SetInformationJobObject.restype = wintypes.BOOL
        kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        self.kernel = kernel
        self.handle = kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())
        limits = Extended()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            error = ctypes.WinError(ctypes.get_last_error())
            self.close()
            raise error

    def assign(self, process):
        with self.lock:
            if self.closed:
                raise RuntimeError('The fixture process job was already closed')
            if self.handle and not self.kernel.AssignProcessToJobObject(self.handle, wintypes.HANDLE(process._handle)):
                raise ctypes.WinError(ctypes.get_last_error())

    def close(self):
        with self.lock:
            self.closed = True
            handle = self.handle
            self.handle = None
        if handle:
            self.kernel.CloseHandle(handle)


class Host:
    def __init__(self, output, duration):
        self.output = output
        self.directory = ROOT / 'logs' / ('pilot-fixture-host-' + uuid.uuid4().hex)
        self.log = self.directory / 'console.log'
        self.token_file = self.directory / 'api-token'
        self.token = secrets.token_hex(32)
        self.deadline = time.monotonic() + duration
        self.stop_event = threading.Event()
        self.pipe_lock = threading.Lock()
        self.lifecycle_lock = threading.Lock()
        self.report_lock = threading.RLock()
        self.process = self.stream = self.http = self.job = self.timer = None
        self.broker = None
        self.ready = False
        self.busy = False
        self.private_players = 0
        self.loaded = set()
        self.report = dict(scope='disposable lifecycle fixtures only; no production commands',
                           fixture_only=True, host_pid=os.getpid(), phase='preflight', ready=False,
                           broker_url=f'http://127.0.0.1:{BROKER_PORT}',
                           minecraft_host='127.0.0.1', minecraft_port=GAME_PORT,
                           token_file=str(self.token_file), fixture_directory=str(self.directory),
                           console_log=str(self.log), production_samples=[], restarts=0, broker_restarts=0)

    def arm_deadline(self):
        self.timer=threading.Timer(max(.1,self.deadline-time.monotonic()),self.hard_deadline)
        self.timer.daemon=True
        self.timer.start()

    def hard_deadline(self):
        # Independent of HTTP handlers and the stdin lock. Closing the Windows
        # job kills only the assigned JVM, including when a pipe write blocks.
        self.stop_event.set(); self.ready=False
        self.report['hard_deadline_expired']=True
        if self.http:
            self.http.should_exit=True
        if self.job:
            self.job.close()
        if self.process and self.process.poll() is None:
            try:
                self.process.kill()
            except OSError:
                pass

    def publish(self, phase=None, **fields):
        with self.report_lock:
            if phase is not None:
                self.report['phase'] = phase
            self.report.update(fields, ready=self.ready, at=time.time())
            atomic_json(self.output, self.report)

    def lifecycle(self):
        return {'server': dict(pid=self.process.pid if self.process and self.process.poll() is None else None,
                               ready=self.ready, busy=self.busy, desired_running=not self.stop_event.is_set(),
                               error=self.report.get('error')), 'stopped':self.stop_event.is_set()}

    def fixture_health(self):
        state=self.lifecycle()
        state['server']['bots_online']=self.private_players
        state['server']['phase']='online' if self.ready else 'starting' if self.process and self.process.poll() is None else 'stopped'
        state.update(protocol='fixture-health-v1',sampled_at_ms=int(time.time()*1000),
                     ram_percent=psutil.virtual_memory().percent,fixture_only=True,
                     world_learning={'phase':'fixture','enabled':False,'restore_pending':False},
                     world_training={'session':{'phase':'running' if self.ready else 'paused'}},
                     performance={'persistence':{'pending':0,'capacity':1,'error':self.report.get('error')}},
                     production=self.report.get('production_last',self.report.get('production_before')))
        return state

    def send(self, command):
        if self.stop_event.is_set() or not self.process or self.process.poll() is not None:
            raise RuntimeError('Isolated Paper is not available')
        with self.pipe_lock:
            self.process.stdin.write(command + '\n')
            self.process.stdin.flush()

    def read_tail(self):
        if not self.log.exists():
            return ''
        with self.log.open('rb') as stream:
            stream.seek(max(0,self.log.stat().st_size-262144))
            return stream.read(262144).decode('utf8',errors='replace')

    def prepare(self):
        if port_open(GAME_PORT):
            raise RuntimeError('The isolated Minecraft port is already occupied')
        before = None
        for index in range(3):
            before = production_health(initial=True)
            if index < 2:
                time.sleep(2)
        self.production_pid = before['server']['pid']
        self.report['production_before'] = before
        self.directory.mkdir()
        self.token_file.write_text(self.token,encoding='ascii')
        self.token_file.chmod(0o600)
        shutil.copy2(ROOT/'server/paper.jar',self.directory/'paper.jar')
        for name in ('cache','libraries','versions'):
            shutil.copytree(ROOT/'server'/name,self.directory/name)
        plugin = ROOT/'logs/pilot-plugin-build/PersistentPilotWorlds.jar'
        if not plugin.is_file():
            raise RuntimeError('Build the pilot plugin before launching the host')
        (self.directory/'plugins').mkdir()
        shutil.copy2(plugin,self.directory/'plugins/PersistentPilotWorlds.jar')
        self.report['plugin_sha256'] = hashlib.sha256(plugin.read_bytes()).hexdigest()
        (self.directory/'eula.txt').write_text('eula=true\n',encoding='ascii')
        props = {'server-ip':'127.0.0.1','server-port':GAME_PORT,'online-mode':'false',
                 'enable-rcon':'false','enforce-secure-profile':'false','level-name':'pilot-fixture-base',
                 'level-type':'minecraft\\:flat','level-seed':20261125,'generate-structures':'false',
                 'allow-nether':'false','spawn-monsters':'true','spawn-protection':0,
                 'view-distance':3,'simulation-distance':2,'max-players':5,'gamemode':'spectator',
                 'force-gamemode':'false','difficulty':'normal','pause-when-empty-seconds':-1,
                 'motd':'Isolated persistent pilot lifecycle fixture'}
        (self.directory/'server.properties').write_text(''.join(f'{key}={value}\n' for key,value in props.items()),encoding='ascii')
        (self.directory/'bukkit.yml').write_text('settings:\n  allow-end: false\n',encoding='ascii')
        (self.directory/'config').mkdir()
        # Exercise the actual global-command cancellation path, rather than
        # passing a clock test merely because Paper scopes time to one world.
        (self.directory/'config/paper-global.yml').write_text('_version: 29\ncommands:\n  time-command-affects-all-worlds: true\n',encoding='ascii')
        self.job = KillOnCloseJob()
        self.publish('starting')
        self.start_java()

    def start_java(self):
        if self.stop_event.is_set() or time.monotonic()>=self.deadline:
            raise TimeoutError('Fixture deadline expired before Java launch')
        self.ready = False
        java = next((ROOT/'runtime/java').rglob('java.exe'))
        self.stream = self.log.open('ab')
        offset = self.log.stat().st_size
        self.process = subprocess.Popen([str(java),'-XX:+UseSerialGC','-Xms128M','-Xmx512M',
            '-XX:MaxDirectMemorySize=64M','-XX:ActiveProcessorCount=1','-jar','paper.jar','--nogui'],
            cwd=self.directory,stdin=subprocess.PIPE,stdout=self.stream,stderr=subprocess.STDOUT,text=True,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            self.job.assign(self.process)
        except Exception:
            self.process.kill(); self.process.wait(timeout=5)
            raise
        self.report['fixture_pid'] = self.process.pid
        self.report['fixture_creation_time'] = psutil.Process(self.process.pid).create_time()
        self.publish()
        end = min(self.deadline,time.monotonic()+110)
        startup = ''
        while time.monotonic()<end:
            if self.stop_event.is_set() or self.process.poll() is not None:
                raise RuntimeError('Fixture stopped during startup')
            with self.log.open('rb') as stream:
                stream.seek(offset); part=stream.read(262144); offset=stream.tell()
            startup=(startup+part.decode('utf8',errors='replace'))[-262144:]
            if 'Done (' in startup:
                if '[PersistentPilotWorlds]' not in startup or 'Error occurred while enabling PersistentPilotWorlds' in startup:
                    raise RuntimeError('Pilot plugin did not enable cleanly')
                break
            time.sleep(.1)
        else:
            raise TimeoutError('Isolated Paper startup timed out')
        self.send('gamerule doMobSpawning false')
        self.send('weather clear')
        self.ready = True
        self.broker = PilotBroker(self.send,self.log,lambda:self.ready,self.lifecycle)
        self.publish('running')

    def stop_java(self):
        self.ready = False
        if self.process and self.process.poll() is None:
            try:
                with self.pipe_lock:
                    self.process.stdin.write('stop\n'); self.process.stdin.flush()
                self.process.wait(timeout=45)
            except (OSError,subprocess.TimeoutExpired):
                self.process.kill(); self.process.wait(timeout=5)
        if self.stream:
            self.stream.close(); self.stream=None

    def restart(self):
        if not self.lifecycle_lock.acquire(blocking=False):
            raise HTTPException(409,'Fixture lifecycle is already busy')
        try:
            self.busy=True; self.publish('restarting')
            worlds=sorted(self.loaded)
            self.stop_java()
            self.start_java()
            # The plugin only auto-loads a previously enabled main pilot realm;
            # temporary test realms are explicitly reloaded by this fixture owner.
            self.busy=False
            for world in worlds:
                self.broker.request({'action':'load','world':world})
            self.report['restarts']+=1
            self.publish('running')
            return {'ok':True,'kind':'private_paper_process_restart','fixture_pid':self.process.pid,'loaded_worlds':worlds}
        finally:
            self.busy=False; self.lifecycle_lock.release()

    def control(self,payload):
        _,expected=build_command(payload)
        if not FIXTURE_WORLD.fullmatch(expected['world']):
            raise HTTPException(400,'This disposable host only accepts named fixture worlds, never the continuing pilot')
        result=self.broker.request(payload)
        if expected['action'] in ('create','load'):
            self.loaded.add(expected['world'])
        elif expected['action'] in ('unload','retire'):
            self.loaded.discard(expected['world'])
        return result

    def verify_time_guard(self,payload):
        if not isinstance(payload,dict) or set(payload)!={'world'}:
            raise HTTPException(400,'A single named fixture world is required')
        world=payload['world']
        _,expected=build_command({'action':'status','world':world})
        if not FIXTURE_WORLD.fullmatch(expected['world']):
            raise HTTPException(400,'Clock probes are restricted to disposable fixture worlds')
        if not self.lifecycle_lock.acquire(blocking=False):
            raise HTTPException(409,'Fixture lifecycle is busy')
        proof={}
        try:
            before=self.broker.request({'action':'fixture-time','world':world,'time':12000})
            offset=self.log.stat().st_size
            self.send('time set 0')  # Only this private JVM; never production.
            after=self.broker.request({'action':'status','world':world})
            with self.log.open('rb') as stream:
                stream.seek(offset); text=stream.read(262144).decode('utf8',errors='replace')
            events=[]
            for line in text.replace('\r','\n').splitlines():
                marker='LAB_PILOT_EVENT '
                if marker not in line:
                    continue
                try:
                    row=json.loads(line.split(marker,1)[1])
                except ValueError:
                    continue
                if row.get('event')=='production_time_command_ignored' and row.get('world_uuid')==before.get('world_uuid'):
                    events.append(row)
            passed=(before.get('world_uuid')==after.get('world_uuid') and
                    isinstance(after.get('time_of_day'),int) and after['time_of_day']>=12000 and bool(events))
            proof={'ok':passed,'setup':True,'autonomous_achievement':False,'world':world,
                   'global_time_affects_all_worlds':True,'before':before,'after':after,'cancellation_events':events}
            if not passed:
                raise HTTPException(409,{'message':'Native time-command cancellation did not verify','proof':proof})
        finally:
            try:
                reset=self.broker.request({'action':'fixture-time','world':world,'time':6000})
                proof['reset']=reset
            finally:
                self.lifecycle_lock.release()
        return proof

    def monitor(self):
        while not self.stop_event.wait(5):
            try:
                if time.monotonic()>=self.deadline:
                    raise TimeoutError('Bounded fixture duration reached')
                sample=production_health(self.production_pid)
                self.report['production_last']=sample
                self.report['production_samples']=(self.report['production_samples']+[sample])[-120:]
                if self.process and self.process.poll() is not None and not self.busy:
                    raise RuntimeError('The fixture Paper process exited')
                if self.ready and not self.busy:
                    private=query_status('127.0.0.1',GAME_PORT,timeout=1)
                    self.private_players=private.get('players',{}).get('online',0)
                self.publish()
            except Exception as error:
                self.publish('interrupted',error=f'{type(error).__name__}: {error}')
                self.stop_event.set()
                if self.http:
                    self.http.should_exit=True
                return

    def close(self):
        self.stop_event.set()
        self.ready=False
        self.stop_java()
        if self.job:
            self.job.close()
        if self.timer:
            self.timer.cancel()
        cleanup={'process_exited':self.process is None or self.process.poll() is not None,
                 'minecraft_port_closed':not port_open(GAME_PORT),'worlds_removed':False}
        if self.log.exists():
            self.output.with_suffix('.console.log').write_text(self.read_tail(),encoding='utf8')
        if not cleanup['minecraft_port_closed']:
            raise RuntimeError('Fixture Minecraft port remains occupied; refusing to delete its world')
        if self.directory.exists():
            resolved=self.directory.resolve()
            if resolved.parent!=(ROOT/'logs').resolve() or not resolved.name.startswith('pilot-fixture-host-'):
                raise RuntimeError('Unsafe fixture cleanup target')
            shutil.rmtree(resolved)
        cleanup['worlds_removed']=not self.directory.exists()
        self.publish('stopped',cleanup=cleanup)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',action='store_true')
    parser.add_argument('--duration',type=int,default=900)
    parser.add_argument('--output',default='logs/pilot-fixture-host.json')
    args=parser.parse_args()
    if not 60<=args.duration<=1800:
        parser.error('Duration must be 60–1800 seconds')
    output=(ROOT/args.output).resolve()
    if not output.is_relative_to((ROOT/'logs').resolve()):
        parser.error('Fixture evidence must stay under ignored logs/')
    if not args.run:
        print(json.dumps({'minecraft_port':GAME_PORT,'broker_port':BROKER_PORT,'max_seconds':args.duration,
                          'heap_mib':512,'cpus':1,'production_commands':False,'fixture_only':True}))
        return 0
    output.parent.mkdir(parents=True,exist_ok=True)
    lease=socket.socket()
    if os.name=='nt':
        lease.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
    lease.bind(('127.0.0.1',BROKER_PORT)); lease.listen(128)
    host=Host(output,args.duration)
    app=FastAPI()

    def auth(x_lab_token: str|None=Header(default=None)):
        if not x_lab_token or not hmac.compare_digest(x_lab_token,host.token):
            raise HTTPException(401,'Fixture token required')

    @app.get('/health',dependencies=[Depends(auth)])
    def health():
        return {'ready':host.ready,'busy':host.busy,'fixture_only':True,'phase':host.report['phase'],
                'fixture_pid':host.process.pid if host.process and host.process.poll() is None else None,
                'remaining_seconds':max(0,round(host.deadline-time.monotonic()))}

    @app.get('/fixture/health')
    def fixture_health():
        return host.fixture_health()

    @app.post('/pilot/world',dependencies=[Depends(auth)])
    def control(payload=Body(...)):
        return host.control(payload)

    @app.get('/pilot/status',dependencies=[Depends(auth)])
    def status(world:str):
        return host.control({'action':'status','world':world})

    @app.post('/fixture/restart',dependencies=[Depends(auth)])
    def restart():
        return host.restart()

    @app.post('/fixture/restart-broker',dependencies=[Depends(auth)])
    def restart_broker():
        if not host.ready or host.busy:
            raise HTTPException(503,'Fixture is not ready')
        host.broker=PilotBroker(host.send,host.log,lambda:host.ready,host.lifecycle)
        host.report['broker_restarts']+=1; host.publish()
        return {'ok':True,'kind':'broker_object_reinitialization','worlds_unchanged':True}

    @app.post('/fixture/verify-time-guard',dependencies=[Depends(auth)])
    def verify_time_guard(payload=Body(...)):
        return host.verify_time_guard(payload)

    @app.post('/fixture/stop',dependencies=[Depends(auth)])
    def stop():
        host.stop_event.set()
        host.http.should_exit=True
        return {'ok':True}

    code=0
    try:
        host.arm_deadline()
        host.prepare()
        config=uvicorn.Config(app,host='127.0.0.1',port=BROKER_PORT,log_level='warning',
                              access_log=False,timeout_graceful_shutdown=3)
        host.http=uvicorn.Server(config)
        monitor=threading.Thread(target=host.monitor,daemon=True,name='pilot-fixture-resource-guard')
        monitor.start()
        print(json.dumps({'ready':True,'descriptor':str(output),'fixture_pid':host.process.pid}),flush=True)
        host.http.run(sockets=[lease])
    except Exception as error:
        code=1
        host.publish('error',error=f'{type(error).__name__}: {error}')
    finally:
        lease.close()
        try:
            host.close()
        except Exception as error:
            code=1
            host.publish('cleanup_error',cleanup_error=f'{type(error).__name__}: {error}')
    return code


if __name__=='__main__':
    raise SystemExit(main())
