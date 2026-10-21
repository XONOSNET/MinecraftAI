import os,json,time,sqlite3,secrets,subprocess,threading,random,math
os.environ['OMP_NUM_THREADS']='1'
os.environ['MKL_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
from collections import deque
from contextlib import asynccontextmanager
import numpy as np, torch, psutil
from fastapi import FastAPI,Header,HTTPException,Depends,Request
from fastapi.responses import HTMLResponse
from .model import Policy
from .jobs import TrainingJobs, TrainingCancelled
from .lan import LanBridge
from .server_control import ServerControl
from .minecraft_status import query_status
from .admin import build_admin_command
import copy
import re
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
torch.set_num_threads(4);torch.manual_seed(42);random.seed(42);np.random.seed(42)
Path('data').mkdir(exist_ok=True);Path('checkpoints').mkdir(exist_ok=True)
tokenfile=Path('data/api-token')
if not tokenfile.exists():tokenfile.write_text(secrets.token_urlsafe(32))
TOKEN=tokenfile.read_text().strip()
db=sqlite3.connect('data/lab.sqlite',check_same_thread=False)
db.executescript('''PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,profile TEXT,state TEXT);
CREATE TABLE IF NOT EXISTS memory(agent TEXT,x INT,y INT,z INT,block TEXT,seen REAL,PRIMARY KEY(agent,x,y,z));
CREATE TABLE IF NOT EXISTS episodes(id INTEGER PRIMARY KEY,run TEXT,agent TEXT,success INT,steps INT,distance REAL,time REAL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,time REAL,event TEXT,payload TEXT);
CREATE TABLE IF NOT EXISTS models(version TEXT PRIMARY KEY,metadata TEXT);
''')
model=Policy();opt=torch.optim.Adam(model.parameters(),lr=.003)
if Path('checkpoints/latest.pt').exists():
    saved=torch.load('checkpoints/latest.pt',weights_only=True)
    model=Policy(saved.get('width',128));opt=torch.optim.Adam(model.parameters(),lr=.003)
    model.load_state_dict(saved['model']);opt.load_state_dict(saved['optimizer'])
mode='paused';run='idle';agents={};samples=deque(maxlen=50000);server=None;logfile=None;lock=threading.RLock();started=time.time();training=False
system_cpu=0.0
shutting_down=False
lan_bridge=None
lan_error=None
server_log_offset=0
server_started_at=None
server_ready_seen=False
last_timing_request=None
player_status={'players':{},'sampled_at':None}
training_jobs=TrainingJobs()
last_training_result=json.loads(Path('data/training-result.json').read_text(encoding='utf-8')) if Path('data/training-result.json').exists() else None
if Path('data/demonstrations.npz').exists():
    demonstrations=np.load('data/demonstrations.npz')
    samples.extend(zip(demonstrations['obs'].tolist(),demonstrations['actions'].tolist()))
    demonstrations.close()

def event(name,payload):
    db.execute('INSERT INTO events(time,event,payload) VALUES(?,?,?)',(time.time(),name,json.dumps(payload)));db.commit()

def start_training(background=False):
    global mode,training
    with lock:
        if server_control.snapshot()['busy']:raise HTTPException(409,'A server operation is in progress. Wait for Minecraft to be ready.')
        if training_jobs.running:raise HTTPException(409,'Training is already running. Watch the progress panel.')
        if len(samples)<100:raise HTTPException(400,'Collect at least 100 examples before training. Click Collect examples first.')
        mode='paused';training=True
        observations=list(samples)
        initial_model=copy.deepcopy(model.state_dict())
        initial_optimizer=copy.deepcopy(opt.state_dict())
        width=model.net[0].out_features
        event('training_started',{'samples':len(observations),'epochs':100})

        def work(progress,cancel):
            global model,opt,training,last_training_result
            try:
                torch.set_num_threads(4)
                candidate=Policy(width);candidate.load_state_dict(initial_model)
                candidate_optimizer=torch.optim.Adam(candidate.parameters(),lr=.003)
                candidate_optimizer.load_state_dict(initial_optimizer)
                x=torch.tensor(np.array([s[0] for s in observations]),dtype=torch.float32)
                y=torch.tensor([s[1] for s in observations])
                temporary=Path('data/demonstrations.tmp')
                with temporary.open('wb') as f:np.savez_compressed(f,obs=x.numpy(),actions=y.numpy())
                os.replace(temporary,'data/demonstrations.npz')
                losses=[];t=time.time()
                for epoch in range(100):
                    for ix in torch.randperm(len(y)).split(128):
                        if cancel.is_set() or shutting_down:raise TrainingCancelled()
                        loss=torch.nn.functional.cross_entropy(candidate(x[ix]),y[ix])
                        candidate_optimizer.zero_grad();loss.backward();candidate_optimizer.step()
                    losses.append(float(loss.detach()))
                    progress(phase='learning',epoch=epoch+1,epochs=100,percent=round((epoch+1)*.95,1),
                             loss=losses[-1],message=f'Learning from {len(y):,} examples. Training pass {epoch+1} of 100.')
                if cancel.is_set() or shutting_down:raise TrainingCancelled()
                training_jobs.begin_saving()
                with lock:
                    previous_model,previous_optimizer=model,opt
                    model,opt=candidate,candidate_optimizer
                    try:version=checkpoint()
                    except Exception:
                        model,opt=previous_model,previous_optimizer
                        raise
                    result={'version':version,'samples':len(y),'seconds':time.time()-t,
                            'loss_start':losses[0],'loss_end':losses[-1],'parameters':model.parameters_count,
                            'finished_at':time.time()}
                    Path('data/training-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                    last_training_result=result;event('training',result)
                return result
            except TrainingCancelled:
                with lock:event('training_cancelled',{})
                raise
            except Exception as error:
                with lock:event('training_failed',{'error':str(error)})
                raise
            finally:
                with lock:training=False
        job=training_jobs.start(work,samples=len(observations),epochs=100,epoch=0)
    if background:return {'accepted':True,'job':job}
    finished=training_jobs.wait()
    if finished['status']=='completed':return finished['result']
    raise HTTPException(409 if finished['status']=='cancelled' else 500,finished.get('error',finished['message']))
def console(command):
    if not server or server.poll() is not None:raise RuntimeError('Minecraft server is not running')
    server.stdin.write(command+'\n');server.stdin.flush()
def checkpoint():
    stamp=str(time.time_ns());p=Path('checkpoints')/(stamp+'.pt')
    payload={'model':model.state_dict(),'optimizer':opt.state_dict(),'seed':42,'width':model.net[0].out_features}
    torch.save(payload,p)
    tmp=Path('checkpoints/latest.tmp');torch.save(payload,tmp);os.replace(tmp,'checkpoints/latest.pt')
    db.execute('INSERT OR REPLACE INTO models VALUES(?,?)',(stamp,json.dumps({'parameters':model.parameters_count,'bytes':p.stat().st_size,'samples':len(samples)})));db.commit()
    for old in sorted(Path('checkpoints').glob('[0-9]*.pt'))[:-10]:old.unlink()
    return stamp

def launch():
    global server,logfile,server_log_offset,server_started_at,server_ready_seen,last_timing_request,player_status
    import socket
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1',25565))==0:raise RuntimeError('Port 25565 is already in use')
    java=next(Path('runtime/java').rglob('java.exe'))
    if logfile:logfile.close()
    logfile=open('logs/minecraft-console.log','a',encoding='utf8')
    server_log_offset=Path('logs/minecraft-console.log').stat().st_size
    server_started_at=time.time();server_ready_seen=False;last_timing_request=None
    player_status={'players':{},'sampled_at':None}
    server=subprocess.Popen([str(java.resolve()),'-Xms1G','-Xmx4G','-jar','paper.jar','--nogui'],cwd=ROOT/'server',stdin=subprocess.PIPE,stdout=logfile,stderr=subprocess.STDOUT,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
    Path('data/server.pid').write_text(str(server.pid));event('server_start',{'pid':server.pid})

def server_alive():return server is not None and server.poll() is None

def current_server_log():
    path=Path('logs/minecraft-console.log')
    if not path.exists():return ''
    with path.open('rb') as stream:
        stream.seek(max(server_log_offset,path.stat().st_size-65536))
        return stream.read().decode('utf-8',errors='replace')

def server_ready():
    global server_ready_seen
    if not server_alive():return False
    if not server_ready_seen:server_ready_seen='Done (' in current_server_log()
    return server_ready_seen

def prepare_server_operation():
    global mode,run
    with lock:
        mode='paused';run='paused-'+str(int(time.time()))
        event('mode',{'mode':'paused','run':run,'reason':'server_operation'})
    if training_jobs.running:
        training_jobs.cancel();training_jobs.wait()
    with lock:
        checkpoint()
        if samples:
            with Path('data/demonstrations.tmp').open('wb') as stream:
                np.savez_compressed(stream,obs=np.asarray([s[0] for s in samples],dtype=np.float32),actions=np.asarray([s[1] for s in samples]))
            os.replace('data/demonstrations.tmp','data/demonstrations.npz')

def stop_minecraft():
    if server_alive():
        console('stop')
        try:server.wait(timeout=60)
        except subprocess.TimeoutExpired:raise RuntimeError('Minecraft has not finished saving after 60 seconds. It was not force-killed.')
    with lock:
        for agent in agents.values():agent['connected']=False

def launch_minecraft():
    with lock:launch()

def server_event(name,details):
    with lock:event(name,details)

def server_details():
    state=server_control.snapshot()
    now=time.time()
    state.update(version='Paper 1.21.4',java_client='26.3 (ViaVersion 5.12.1)' if Path('server/plugins/ViaVersion-5.12.1.jar').exists() else '1.21.4',
                 pid=server.pid if server_alive() else None,uptime_seconds=now-server_started_at if server_alive() and server_started_at else 0,
                 bots_online=sum(a.get('connected',True) and now-a.get('last_seen',0)<8 for a in agents.values()) if state['ready'] else 0,
                 ram_mib=None,tps=None,mspt=None,timing_sample_at=last_timing_request,
                 players_online=player_status['players'].get('online',0) if state['ready'] else 0,
                 player_limit=player_status['players'].get('max',12),players_updated_at=player_status['sampled_at'])
    if server_alive():
        try:state['ram_mib']=psutil.Process(server.pid).memory_info().rss/1048576
        except psutil.Error:pass
    if state['ready']:
        text=re.sub(r'\[[0-9;]*m','',current_server_log())
        tps=re.findall(r'TPS from last 1m, 5m, 15m:\s*\*?([\d.]+)',text)
        if tps:state['tps']=float(tps[-1])
        if 'Server tick times' in text:
            match=re.search(r'([\d.]+)/[\d.]+/[\d.]+',text.rsplit('Server tick times',1)[-1])
            if match:state['mspt']=float(match.group(1))
    return state

def operators():
    try:return json.loads(Path('server/ops.json').read_text(encoding='utf-8'))
    except (OSError,ValueError):return []

def online_players():
    if not server_ready():return []
    levels={entry['name'].casefold():entry.get('level',0) for entry in operators()}
    return [{'name':entry['name'],'uuid':entry.get('id'),'operator_level':levels.get(entry['name'].casefold(),0),
             'is_bot':bool(re.fullmatch(r'LabAI[0-4]',entry['name']))}
            for entry in player_status['players'].get('sample',[]) if re.fullmatch(r'[A-Za-z0-9_]{3,16}',entry.get('name',''))]

def backup():
    import zipfile
    offset=Path('logs/minecraft-console.log').stat().st_size
    console('save-off')
    try:
        console('save-all flush')
        deadline=time.time()+30
        while time.time()<deadline:
            if 'Saved the game' in Path('logs/minecraft-console.log').read_bytes()[offset:].decode(errors='replace'):break
            time.sleep(.2)
        else:raise RuntimeError('World save acknowledgment timed out; backup skipped')
        dest=Path('backups')/(time.strftime('%Y%m%d-%H%M%S')+'.zip')
        with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
            for world in Path('server').glob('world*'):
                for f in world.rglob('*'):
                    if f.is_file() and f.name!='session.lock':z.write(f,f.relative_to('server'))
        for old in sorted(Path('backups').glob('*.zip'))[:-3]:old.unlink()
        event('backup',{'path':str(dest)})
    finally:console('save-on')

def watchdog():
    global system_cpu,mode,last_timing_request,player_status
    last=time.time()
    retries=0
    psutil.cpu_percent()
    while not shutting_down:
        time.sleep(2)
        if shutting_down:return
        system_cpu=psutil.cpu_percent()
        if server_ready() and not server_control.snapshot()['busy']:
            try:
                response=query_status()
                with lock:player_status={'players':response.get('players',{}),'sampled_at':time.time()}
            except (OSError,ValueError):pass
        with lock:
            if psutil.virtual_memory().percent>90:
                globals()['mode']='paused';event('memory_pause',{})
            lifecycle=server_control.snapshot()
            if server and server.poll() is not None and lifecycle['desired_running'] and not lifecycle['busy'] and retries<3:
                mode='paused';retries+=1
                try:server_control.request('restart');event('server_recovery',{'attempt':retries})
                except Exception as e:event('server_recovery_failed',str(e))
            if lifecycle['ready'] and not lifecycle['busy'] and (last_timing_request is None or time.time()-last_timing_request>30):
                console('tps');console('mspt');last_timing_request=time.time()
            if time.time()-last>600 and lifecycle['ready'] and not lifecycle['busy'] and not training_jobs.running:
                try:checkpoint();backup()
                except Exception as e:event('maintenance_error',str(e))
                last=time.time()
server_control=ServerControl(launch_minecraft,stop_minecraft,prepare_server_operation,server_alive,server_ready,server_event)
@asynccontextmanager
async def lifespan(app):
    global shutting_down,lan_bridge,lan_error
    launch();threading.Thread(target=watchdog,daemon=True).start()
    if Path('config/lan.json').exists():
        config=json.loads(Path('config/lan.json').read_text(encoding='utf-8'))
        if config.get('enabled'):
            try:
                lan_bridge=LanBridge(config['address'],config['subnet'],config.get('port',25565))
                await lan_bridge.start()
                event('lan_enabled',lan_bridge.snapshot())
            except Exception as error:
                lan_error=str(error);event('lan_failed',{'error':lan_error})
    yield
    shutting_down=True
    if lan_bridge:await lan_bridge.stop()
    if training_jobs.running:
        training_jobs.cancel();training_jobs.wait()
    if server_control.snapshot()['busy']:server_control.wait()
    server_control.request('stop');server_control.wait()
    with lock:db.close()
app=FastAPI(lifespan=lifespan)
def auth(request:Request,x_lab_token:str=Header(default='')):
    if request.headers.get('origin') not in (None,'http://127.0.0.1:8000','http://localhost:8000'):raise HTTPException(403,'Invalid origin')
    credential=x_lab_token or request.cookies.get('lab_session','')
    if not secrets.compare_digest(credential,TOKEN):raise HTTPException(403,'Open the dashboard on this computer again to enable controls.')
@app.post('/access',dependencies=[Depends(auth)])
def access():return {'ok':True}
@app.get('/status')
def status():
    with lock:
        metrics=db.execute('''WITH ranked AS (SELECT *,row_number() OVER(PARTITION BY run,agent ORDER BY id) AS sequence FROM episodes)
            SELECT run,count(*),sum(success),avg(steps) FROM ranked WHERE sequence<=3 OR run LIKE '%teacher%' GROUP BY run''').fetchall()
        activity=[{'id':row[0],'time':row[1],'event':row[2],'details':json.loads(row[3])} for row in db.execute("SELECT id,time,event,payload FROM events WHERE event IN ('mode','training_started','training','training_failed','training_cancelled','backup','server_recovery','memory_pause','server_operation_started','server_operation_completed','server_operation_failed','admin_action') ORDER BY id DESC LIMIT 20")]
        return {'mode':mode,'run':run,'agents':agents,'parameters':model.parameters_count,'samples':len(samples),'server_alive':server_alive(),'server':server_details(),'players':online_players(),'operators':operators(),'cpu_percent':system_cpu,'ram_percent':psutil.virtual_memory().percent,'uptime':time.time()-started,'training':training,'training_job':training_jobs.snapshot(),'last_training':last_training_result,'activity':activity,'episodes':[dict(zip(['run','episodes','successes','mean_steps'],r)) for r in metrics],'raw_episode_rows':db.execute('SELECT count(*) FROM episodes').fetchone()[0],'lan':lan_bridge.snapshot() if lan_bridge else {'enabled':False,'error':lan_error}}
@app.get('/memory/{agent}')
def nearby_memory(agent:str):
    with lock:
        if agent not in agents:raise HTTPException(404,'Agent has no current position')
        x,y,z=agents[agent]['position']
        rows=db.execute('SELECT x,y,z,block,seen FROM memory WHERE agent=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND z BETWEEN ? AND ? LIMIT 512',(agent,x-16,x+16,y-16,y+16,z-16,z+16)).fetchall()
        return {'agent':agent,'source':'previously observed; may be stale','blocks':[dict(zip(('x','y','z','block','last_observed'),r)) for r in rows]}
@app.post('/assignment',dependencies=[Depends(auth)])
def assignment(d:dict):
    with lock:
        if 'position' in d:
            state=agents.setdefault(d['agent'],{'goal':None,'steps':0,'reward':0,'action':4,'inference_ms':0,'perception_ms':0,'rays':[]})
            state.update(position=d['position'],health=d['health'],food=d['food'],last_seen=time.time(),run=run)
            state['connected']=True
        # Repeated calls during a lifetime return the same assignment; next episode changes it.
        rng=random.Random(8000+d['index']*1000+d['episode'])
        finished=db.execute('SELECT count(*) FROM episodes WHERE run=? AND agent=?',(run,d['agent'])).fetchone()[0]
        if mode in ('untrained','evaluate','random','heuristic') and finished>=3:return {'mode':'paused','run':run}
        center=80 if mode in ('untrained','evaluate','random','heuristic') else 0
        start=[center+rng.uniform(-10,10),181.1,rng.uniform(-10,10)]
        theta=rng.uniform(-math.pi,math.pi);goal=[center+rng.uniform(-10,10),181.1,rng.uniform(-10,10)]
        return {'mode':mode,'run':run,'start':start,'goal':goal,'yaw':theta}
@app.post('/reset',dependencies=[Depends(auth)])
def reset(d:dict):
    import re
    if not re.fullmatch(r'LabAI[0-4]',d['agent']):raise HTTPException(400,'Unknown agent')
    p=d['position'];console(f"tp {d['agent']} {p[0]} {p[1]} {p[2]} {(-d['yaw']*180/math.pi)%360} 0")
    console(f"effect give {d['agent']} minecraft:saturation 2 5 true")
    return {'ok':True}
@app.post('/step',dependencies=[Depends(auth)])
def step(d:dict):
    with lock:
        torch.set_num_threads(1)
        if len(d['obs'])!=70 or not np.isfinite(d['obs']).all():raise HTTPException(400,'Invalid observation')
        t=time.perf_counter()
        with torch.no_grad():action=int(model(torch.tensor(d['obs'],dtype=torch.float32)).argmax())
        latency=(time.perf_counter()-t)*1000
        if mode=='teacher':samples.append((d['obs'],d['teacher']));action=d['teacher']
        elif mode=='heuristic':action=d['teacher']
        elif mode=='random':action=random.randrange(4)
        elif mode=='paused':action=4
        agents[d['agent']]={k:d[k] for k in ('position','health','food','goal','steps','reward','perception_ms')}
        agents[d['agent']].update(action=action,inference_ms=latency,last_seen=time.time(),run=run)
        agents[d['agent']]['rays']=d['obs'][:64]
        db.execute('INSERT OR IGNORE INTO agents VALUES(?,?,?)',(d['agent'],json.dumps({'personality':json.loads(Path('config/personality.json').read_text()),'generation':0}), '{}'))
        db.execute('UPDATE agents SET state=? WHERE id=?',(json.dumps(agents[d['agent']]),d['agent']))
        for h in d['hits']:
            p=h['position'];db.execute('INSERT OR REPLACE INTO memory VALUES(?,?,?,?,?,?)',(d['agent'],p['x'],p['y'],p['z'],h['name'],time.time()))
        if len(samples)%20==0:db.commit()
        # Append numeric trajectories as compact float32 rows, including action/reward.
        trajectory=Path('data/transitions.f32')
        if trajectory.exists() and trajectory.stat().st_size>100_000_000:
            os.replace(trajectory,'data/transitions-previous.f32')
        with open(trajectory,'ab') as f:np.asarray(d['obs']+[action,d['reward']],dtype=np.float32).tofile(f)
        if mode=='teacher' and len(samples)%100==0:
            np.savez_compressed('data/demonstrations.npz',obs=np.asarray([s[0] for s in samples],dtype=np.float32),actions=np.asarray([s[1] for s in samples]))
        return {'action':action,'inference_ms':latency}
@app.post('/episode',dependencies=[Depends(auth)])
def episode(d:dict):
    with lock:
        db.execute('INSERT INTO episodes(run,agent,success,steps,distance,time) VALUES(?,?,?,?,?,?)',(d['run'],d['agent'],d['success'],d['steps'],d['distance'],time.time()));db.commit()
        return {'ok':True}
@app.post('/agent-disconnected',dependencies=[Depends(auth)])
def agent_disconnected(d:dict):
    with lock:
        if d.get('agent') in agents:agents[d['agent']]['connected']=False
        return {'ok':True}
@app.post('/admin/action',dependencies=[Depends(auth)])
def admin_action(d:dict):
    with lock:
        if not server_ready() or server_control.snapshot()['busy']:raise HTTPException(409,'Wait until Minecraft is online before managing players.')
        try:cached=json.loads(Path('server/usercache.json').read_text(encoding='utf-8'))
        except (OSError,ValueError):cached=[]
        known=[entry['name'] for entry in cached]+[entry['name'] for entry in online_players()]
        try:command=build_admin_command(d,known,[entry['name'] for entry in online_players()])
        except ValueError as error:raise HTTPException(400,str(error))
        console(command);event('admin_action',{'action':d.get('action'),'player':d.get('player'),'command':command})
        return {'accepted':True,'command':command,'message':'Command sent to Minecraft. Player status updates automatically.'}
@app.post('/control/{command}',dependencies=[Depends(auth)])
def control(command:str,d:dict={}):
    global mode,run,training,model,opt,shutting_down
    if command in ('start-server','stop-server','restart-server','shutdown'):
        if command=='shutdown':
            shutting_down=True
            if server_control.snapshot()['busy']:server_control.wait()
        try:state=server_control.request('stop' if command=='shutdown' else command.removesuffix('-server'))
        except RuntimeError as error:raise HTTPException(409,str(error))
        if d.get('background',False):return {'accepted':True,'server':state}
        finished=server_control.wait()
        if finished['error']:raise HTTPException(500,finished['error'])
        return {'ok':True,'server':finished}
    if command=='train':return start_training(background=bool(d.get('background',False)))
    if command=='cancel-training':
        if not training_jobs.cancel():raise HTTPException(409,'No cancellable training job. It may already be saving or finished.')
        return {'ok':True}
    if command=='shutdown' and training_jobs.running:
        shutting_down=True;training_jobs.cancel();training_jobs.wait()
    with lock:
        if server_control.snapshot()['busy']:
            raise HTTPException(409,'A server operation is in progress. Please wait for it to finish.')
        if training_jobs.running and command not in ('shutdown',):
            raise HTTPException(409,'Training is in progress. Wait for it to finish or cancel training first.')
        if command in ('teacher','evaluate','untrained','random','heuristic','paused'):
            mode=command;run=d.get('run',command+'-'+str(int(time.time())));event('mode',{'mode':mode,'run':run});return {'run':run}
        if command=='checkpoint':return {'version':checkpoint()}
        if command=='new-policy':
            checkpoint();mode='paused';torch.manual_seed(42)
            model=Policy();opt=torch.optim.Adam(model.parameters(),lr=.003)
            if Path('data/demonstrations.npz').exists():
                os.replace('data/demonstrations.npz',f'data/demonstrations-{time.time_ns()}.npz')
            samples.clear();event('new_policy',{'seed':42});return {'parameters':model.parameters_count}
        if command=='timing':
            console('tps');console('mspt');return {'log':'logs/minecraft-console.log'}
        if command=='load':
            size=d.get('size')
            if size not in ('tiny','small','medium'):raise HTTPException(400,'Unknown model size')
            saved=torch.load(f'checkpoints/{size}.pt',weights_only=True)
            model=Policy(saved['width']);model.load_state_dict(saved['model'])
            opt=torch.optim.Adam(model.parameters(),lr=.003);opt.load_state_dict(saved['optimizer'])
            mode='paused';return {'parameters':model.parameters_count,'size':size}
        if command=='arena':
            for cx in (0,80):
                console(f'forceload add {cx-20} -20 {cx+20} 20')
            time.sleep(4)
            for cx in (0,80):
                console(f'fill {cx-20} 180 -20 {cx+20} 180 20 minecraft:stone')
                for z in (-20,20):console(f'fill {cx-20} 181 {z} {cx+20} 183 {z} minecraft:glass')
                for x in (cx-20,cx+20):console(f'fill {x} 181 -20 {x} 183 20 minecraft:glass')
            return {'ok':True}
        if command=='backup':backup();return {'ok':True}
        raise HTTPException(400,'Unknown command')
@app.get('/',response_class=HTMLResponse)
def dashboard():
    response=HTMLResponse(Path('lab/dashboard.html').read_text(encoding='utf-8'),headers={'Cache-Control':'no-store'})
    response.set_cookie('lab_session',TOKEN,httponly=True,samesite='strict',path='/')
    return response


