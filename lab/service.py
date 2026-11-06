import os,json,time,sqlite3,secrets,subprocess,threading,random,math
os.environ['OMP_NUM_THREADS']='1'
os.environ['MKL_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
from collections import deque
from contextlib import asynccontextmanager
import numpy as np, torch, psutil
from fastapi import FastAPI,Header,HTTPException,Depends,Request
from fastapi.responses import HTMLResponse, JSONResponse
from .model import Policy
from .evolution import ModelEvolution
from .jobs import TrainingJobs, TrainingCancelled
from .persistence import TelemetryPersistence
from .lan import LanBridge
from .server_control import ServerControl
from .minecraft_status import query_status
from .admin import build_admin_command
from .trial_catalogue import catalogue as describe_trials
from .curriculum import Curriculum, STAGES, STAGES_V8, STAGES_V9, LEGACY_STAGES, sample_route, route_seed
from .skills import SkillBank, SKILL_INPUTS, SKILL_ACTIONS
from .tasks import task_spec, arena_commands, reset_commands, task_success, SKILLS, minecraft_yaw
from .config import AGENT_COUNT, EPISODES_PER_AGENT, EXPECTED_EPISODES, LANE_END, is_agent
from .observers import Observers, observer_progress
from .camera_input import CameraInput
from .dashboard_state import world_view, learning_view, compact_status
from .world_training import WorldTraining, SCENARIOS, LEVELS, readiness
from .bot_lights import BotLights
from .efficiency import completion_timing
from .world_learning import WorldLearning
from .world_replay import prepare_replay, ReplayReference

world_replay_reference=ReplayReference('data/world-replay-reference')
from .identities import Identities
from .protection import PracticeProtection
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
CREATE TABLE IF NOT EXISTS episode_timing(episode INTEGER PRIMARY KEY,seconds REAL NOT NULL CHECK(seconds>=0));
CREATE TABLE IF NOT EXISTS run_config(run TEXT PRIMARY KEY,agent_count INT,episodes_per_agent INT);
CREATE INDEX IF NOT EXISTS episodes_run_agent_id ON episodes(run,agent,id);
''')
episode_generation=0
episode_cache={'generation':-1,'at':0,'rows':None,'raw':db.execute('SELECT count(*) FROM episodes').fetchone()[0]}
def episode_metrics():
    if episode_cache['rows'] is None or (episode_cache['generation']!=episode_generation and time.monotonic()-episode_cache['at']>=1):
        episode_cache.update(rows=db.execute(f'''WITH ranked AS (SELECT *,row_number() OVER(PARTITION BY run,agent ORDER BY id) AS sequence FROM episodes)
            SELECT run,count(*),sum(success),avg(steps),avg(episode_timing.seconds) FROM ranked LEFT JOIN episode_timing ON ranked.id=episode_timing.episode WHERE sequence<={EPISODES_PER_AGENT} OR run LIKE '%teacher%' GROUP BY run''').fetchall(),generation=episode_generation,at=time.monotonic())
    return episode_cache['rows']

persistence=TelemetryPersistence('data/lab.sqlite')
personality_json=json.dumps({'personality':json.loads(Path('config/personality.json').read_text()),'generation':0})
identities=Identities(db,AGENT_COUNT)
model=Policy();opt=torch.optim.Adam(model.parameters(),lr=.003)
if Path('checkpoints/latest.pt').exists():
    saved=torch.load('checkpoints/latest.pt',weights_only=True)
    model=Policy(saved.get('width',128));opt=torch.optim.Adam(model.parameters(),lr=.003)
    model.load_state_dict(saved['model']);opt.load_state_dict(saved['optimizer'])
console_lock=threading.Lock();maintenance_lock=threading.Lock()
mode='paused';run='idle';agents={};samples=deque(maxlen=50000);server=None;logfile=None;lock=threading.RLock();started=time.time();training=False
system_cpu=0.0
example_counter=0
curriculum=None
shutting_down=False
lan_bridge=None
lan_error=None
server_log_offset=0
server_started_at=None
server_ready_seen=False
last_timing_request=None
player_status={'players':{},'sampled_at':None}
player_states={}
training_jobs=TrainingJobs()
skill_bank=SkillBank(persist=persistence.replay)
evolution=ModelEvolution(db)
evolution.record('navigation',model.state_dict(),'checkpoints/latest.pt')
for existing_skill in SKILLS:
    existing_path=Path('checkpoints/skills')/(existing_skill+'.pt')
    if existing_skill!='navigation' and existing_path.exists():
        evolution.record(existing_skill,torch.load(existing_path,weights_only=True)['model'],existing_path)
assigned_tasks={}
pending_tasks={}
practice=None
last_training_result=json.loads(Path('data/training-result.json').read_text(encoding='utf-8')) if Path('data/training-result.json').exists() else None
training_results={}
for row in db.execute("SELECT payload FROM events WHERE event='training' ORDER BY id DESC"):
    result=json.loads(row[0]);training_results.setdefault(result.get('skill','navigation'),result)
if Path('data/demonstrations.npz').exists():
    demonstrations=np.load('data/demonstrations.npz')
    samples.extend(zip(demonstrations['obs'].tolist(),demonstrations['actions'].tolist()))
    demonstrations.close()

def event(name,payload):
    db.execute('INSERT INTO events(time,event,payload) VALUES(?,?,?)',(time.time(),name,json.dumps(payload)));db.commit()

def active_skill():
    if world_training.session:return world_training.session.get('training_skill','expedition')
    if practice:return STAGES[practice['stage']]['skill']
    return STAGES[curriculum.state['stage']].get('skill','navigation') if curriculum and curriculum.state['enabled'] else 'navigation'

def learning_context(skill=None):
    skill=skill or active_skill()
    if skill=='navigation':return model,opt,samples
    fresh=skill not in skill_bank.entries
    entry=skill_bank.get(skill,model)
    if fresh:evolution.record(skill,entry['model'].state_dict(),skill_bank.checkpoints/(skill+'.pt'))
    return entry['model'],entry['optimizer'],entry['samples']

def start_training(background=False,world_automatic=False):
    global mode,training
    with lock:
        if server_control.snapshot()['busy']:raise HTTPException(409,'A server operation is in progress. Wait for Minecraft to be ready.')
        if training_jobs.running:raise HTTPException(409,'Training is already running. Watch the progress panel.')
        if world_learning.state.get('enabled') and not world_automatic:raise HTTPException(409,'World learning owns the current model comparison.')
        skill=active_skill();policy,optimizer,replay=learning_context(skill)
        if len(replay)<(30 if world_automatic else 100):raise HTTPException(400,'Collect more examples before training (100 for manual training, 30 fresh examples for an automatic world specialist).')
        db.commit();persistence.flush()
        cleanup_combat()
        observations=list(replay)
        validation=[];world_mix={}
        if world_automatic:
            cycle=world_learning.state['round']
            reference=world_replay_reference.load(skill,cycle)
            observations,validation,world_mix=prepare_replay(observations,world_learning.state.get('new_examples',{}).get(skill,0),cycle,reference=reference)
            world_mix['reference_cycle']=cycle
        mode='paused';training=True
        initial_model=copy.deepcopy(policy.state_dict());initial_optimizer=copy.deepcopy(optimizer.state_dict())
        width=policy.net[0].out_features;inputs=policy.net[0].in_features;actions=policy.net[2].out_features
        event('training_started',{'skill':skill,'samples':len(observations),'epochs':100})
        def work(progress,cancel):
            global model,opt,training,last_training_result
            try:
                torch.set_num_threads(4)
                candidate=Policy(width,inputs=inputs,actions=actions);candidate.load_state_dict(initial_model)
                candidate_optimizer=torch.optim.Adam(candidate.parameters(),lr=.003);candidate_optimizer.load_state_dict(initial_optimizer)
                scale=1 if world_automatic else curriculum.state.get('learning_rate_scales',{}).get(str(curriculum.state['stage']),1)
                for group in candidate_optimizer.param_groups:group['lr']=.003*scale
                x=torch.tensor(np.array([s[0] for s in observations]),dtype=torch.float32);y=torch.tensor([s[1] for s in observations])
                if skill=='navigation':
                    temporary=Path('data/demonstrations.tmp')
                    with temporary.open('wb') as f:np.savez_compressed(f,obs=x.numpy(),actions=y.numpy())
                    os.replace(temporary,'data/demonstrations.npz')
                else:skill_bank.save_replay(skill)
                counts=torch.bincount(y,minlength=actions).float().clamp(min=1)
                weights=(counts.sum()/counts).sqrt().clamp(max=15);weights=weights/weights.mean()
                losses=[];t=time.time()
                vx=torch.tensor(np.asarray([row[0] for row in validation]),dtype=torch.float32) if validation else None
                vy=torch.tensor([row[1] for row in validation]) if validation else None
                with torch.no_grad():before_accuracy=float((candidate(vx).argmax(1)==vy).float().mean()) if validation else None
                for epoch in range(100):
                    for ix in torch.randperm(len(y)).split(128):
                        if cancel.is_set() or shutting_down:raise TrainingCancelled()
                        loss=torch.nn.functional.cross_entropy(candidate(x[ix]),y[ix],weight=weights if skill!='navigation' else None)
                        candidate_optimizer.zero_grad();loss.backward();candidate_optimizer.step()
                    losses.append(float(loss.detach()))
                    progress(phase='learning',epoch=epoch+1,epochs=100,percent=round((epoch+1)*.95,1),loss=losses[-1],
                             message=f'{skill.title()}: learning from {len(y):,} examples. Pass {epoch+1} of 100.')
                if cancel.is_set() or shutting_down:raise TrainingCancelled()
                training_jobs.begin_saving()
                with lock:
                    if skill=='navigation':
                        previous_model,previous_optimizer=model,opt;model,opt=candidate,candidate_optimizer
                        try:version=checkpoint()
                        except Exception:model,opt=previous_model,previous_optimizer;raise
                    else:
                        entry=skill_bank.entries[skill];previous_model,previous_optimizer=entry['model'],entry['optimizer']
                        entry.update(model=candidate,optimizer=candidate_optimizer)
                        try:version=skill_bank.save(skill)
                        except Exception:entry.update(model=previous_model,optimizer=previous_optimizer);raise
                    result={'skill':skill,'version':version,'samples':len(y),'seconds':time.time()-t,'loss_start':losses[0],
                            'loss_end':losses[-1],'parameters':candidate.parameters_count,'finished_at':time.time()}
                    if world_automatic:
                        with torch.no_grad():after_accuracy=float((candidate(vx).argmax(1)==vy).float().mean()) if validation else None
                        result.update(world_mix=world_mix,replay_accuracy_before=before_accuracy,replay_accuracy_after=after_accuracy,replay_guard_passed=not validation or after_accuracy>=before_accuracy-.08)
                    result['model_id']=evolution.record(skill,candidate.state_dict(),
                        'checkpoints/latest.pt' if skill=='navigation' else version,
                        source='candidate' if curriculum.state['enabled'] or world_learning.state.get('enabled') else 'trained',training=dict(result))
                    Path('data/training-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                    last_training_result=result;training_results[skill]=result;event('training',result)
                return result
            except TrainingCancelled:
                with lock:event('training_cancelled',{'skill':skill})
                raise
            except Exception as error:
                with lock:event('training_failed',{'error':str(error),'skill':skill})
                raise
            finally:
                with lock:training=False
        job=training_jobs.start(work,skill=skill,samples=len(observations),epochs=100,epoch=0)
    if background:return {'accepted':True,'job':job}
    finished=training_jobs.wait()
    if finished['status']=='completed':return finished['result']
    raise HTTPException(409 if finished['status']=='cancelled' else 500,finished.get('error',finished['message']))

def cleanup_combat():
    if server_alive():console('kill @e[tag=lab_combat]')

def console(command):
    if not server or server.poll() is not None:raise RuntimeError('Minecraft server is not running')
    with console_lock:
        server.stdin.write(command+'\n');server.stdin.flush()
from .vision import VisionLines
vision_lines=VisionLines('data/vision.json',console)
from .harvest_markers import HarvestMarkers,validate_intent
harvest_markers=HarvestMarkers('data/harvest-markers.json',console)
observers=Observers('data/observers.json',console)
observers.external_motion=True
camera_input=CameraInput('logs/minecraft-console.log',console,'server/world/datapacks/lab_camera_controls')
from .bot_outlines import install_outline_pack
install_outline_pack('server/world/datapacks/lab_bot_outlines')
practice_protection=PracticeProtection(console)
from .staging import StagingPad
staging_pad=StagingPad(console)
world_training=WorldTraining('data/world-training.json',console,'logs/minecraft-console.log',staging=staging_pad,persist=persistence.document,sleep_pack_path='server/world/datapacks/lab_sleep_quorum')
bot_lights=BotLights(console,config_path="config/bot-lights.json")
from .behavior import BehaviorRules
behavior_rules=BehaviorRules('config/behavior.json',[f'LabAI{i}' for i in range(AGENT_COUNT)])

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
    player_states.clear()
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
    # ServerControl marks the operation busy before entering here.
    with maintenance_lock:pass
    with lock:
        if curriculum and curriculum.state['enabled']:
            if server_control.snapshot().get('automatic'):curriculum.hold('Waiting for Minecraft to recover.')
            else:curriculum.pause('Paused for a server operation. Resume autonomous training when ready.')
    with lock:
        world_learning.suspend()
        world_training.stop('Paused for a server operation.')
        mode='paused';run='paused-'+str(int(time.time()))
        event('mode',{'mode':'paused','run':run,'reason':'server_operation'})
    if training_jobs.running:
        training_jobs.cancel();training_jobs.wait()
    with lock:
        world_training.save();db.commit()
    persistence.flush()
    with lock:
        if server_ready():
            observers.suspend([p['name'] for p in online_players()])
            bot_lights.clear()
        checkpoint()
        for skill in skill_bank.entries:
            skill_bank.save(skill);skill_bank.save_replay(skill)
        if samples:
            with Path('data/demonstrations.tmp').open('wb') as stream:
                np.savez_compressed(stream,obs=np.asarray([s[0] for s in samples],dtype=np.float32),actions=np.asarray([s[1] for s in samples]))
            os.replace('data/demonstrations.tmp','data/demonstrations.npz')
    persistence.flush()

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
             'is_bot':is_agent(entry['name'])}
            for entry in player_status['players'].get('sample',[]) if re.fullmatch(r'[A-Za-z0-9_]{3,16}',entry.get('name',''))]

def backup():
    with maintenance_lock:
        import zipfile
        if shutting_down or server_control.snapshot()['busy']:return
        offset=Path('logs/minecraft-console.log').stat().st_size
        console('save-off')
        try:
            console('save-all flush')
            deadline=time.time()+30
            tail=''
            while time.time()<deadline:
                with Path('logs/minecraft-console.log').open('rb') as stream:
                    stream.seek(offset);chunk=stream.read(262144);offset=stream.tell()
                tail=(tail+chunk.decode(errors='replace'))[-262144:]
                if 'Saved the game' in tail:break
                time.sleep(.2)
            else:raise RuntimeError('World save acknowledgment timed out; backup skipped')
            dest=Path('backups')/(time.strftime('%Y%m%d-%H%M%S')+'.zip')
            with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
                for world in Path('server').glob('world*'):
                    for f in world.rglob('*'):
                        if f.is_file() and f.name!='session.lock':z.write(f,f.relative_to('server'))
            for old in sorted(Path('backups').glob('*.zip'))[:-3]:old.unlink()
            with lock:event('backup',{'path':str(dest)})
        finally:console('save-on')

def watchdog():
    global system_cpu,mode,last_timing_request,player_status
    last=time.time()
    last_practice_sweep=0
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
        do_backup=False
        with lock:
            if psutil.virtual_memory().percent>90 and not curriculum.state['enabled']:
                if world_learning.state.get('enabled') and world_learning.state.get('phase')!='recovering':
                    held=world_learning.suspend('memory')
                    if not held:world_training.stop('Waiting for system memory to recover.')
                    training_jobs.cancel()
                globals()['mode']='paused';event('memory_pause',{})
            lifecycle=server_control.snapshot()
            if lifecycle['ready'] and not lifecycle['busy']:practice_protection.tick(server.pid,time.time())
            if server and server.poll() is not None and lifecycle['desired_running'] and not lifecycle['busy'] and retries<3:
                mode='paused';retries+=1
                try:server_control.request('restart',automatic=True);event('server_recovery',{'attempt':retries})
                except Exception as e:event('server_recovery_failed',str(e))
            if lifecycle['ready'] and not lifecycle['busy'] and (last_timing_request is None or time.time()-last_timing_request>30):
                console('tps');console('mspt');last_timing_request=time.time()
            if time.time()-last>600 and lifecycle['ready'] and not lifecycle['busy'] and not training_jobs.running:
                try:checkpoint();do_backup=True
                except Exception as e:event('maintenance_error',str(e))
                last=time.time()
        if do_backup:
            try:backup()
            except Exception as error:
                with lock:event('maintenance_error',str(error))
server_control=ServerControl(launch_minecraft,stop_minecraft,prepare_server_operation,server_alive,server_ready,server_event)
@asynccontextmanager
async def lifespan(app):
    global shutting_down,lan_bridge,lan_error
    launch();threading.Thread(target=watchdog,daemon=True).start();threading.Thread(target=curriculum_worker,daemon=True).start();threading.Thread(target=observer_worker,daemon=True).start();threading.Thread(target=camera_worker,daemon=True).start()
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
    with lock:db.commit()
    persistence.close()
    with lock:db.close()
app=FastAPI(lifespan=lifespan)
def auth(request:Request,x_lab_token:str=Header(default='')):
    if request.headers.get('origin') not in (None,'http://127.0.0.1:8000','http://localhost:8000'):raise HTTPException(403,'Invalid origin')
    credential=x_lab_token or request.cookies.get('lab_session','')
    if not secrets.compare_digest(credential,TOKEN):raise HTTPException(403,'Open the dashboard on this computer again to enable controls.')
@app.post('/access',dependencies=[Depends(auth)])
def access():return {'ok':True}
dashboard_cache={'at':0,'response':None}
@app.get('/status')
def status(compact:bool=True,fresh:bool=False):
    cached=dashboard_cache.get('response')
    if compact and not fresh and cached is not None and time.monotonic()-dashboard_cache['at']<.25:return cached
    with lock:
        captured_at=time.monotonic()
        if compact and not fresh and dashboard_cache['response'] is not None and captured_at-dashboard_cache['at']<.25:return dashboard_cache['response']
        metadata=dashboard_cache.get('metadata')
        if fresh or not metadata or metadata['compact']!=compact or metadata['skill']!=active_skill() or captured_at-metadata['at']>=5:
            metrics=episode_metrics()
            run_sizes={r[0]:r[1]*r[2] for r in db.execute('SELECT * FROM run_config')}
            activity=[{'id':row[0],'time':row[1],'event':row[2],'details':json.loads(row[3])} for row in db.execute("SELECT id,time,event,payload FROM events WHERE event IN ('mode','training_started','training','training_failed','training_cancelled','backup','server_recovery','memory_pause','server_operation_started','server_operation_completed','server_operation_failed','admin_action','curriculum_cycle','curriculum_error','world_learning_cycle') ORDER BY id DESC LIMIT 20")]
            metadata=dict(at=captured_at,compact=compact,skill=active_skill(),metrics=metrics,run_sizes=run_sizes,activity=activity,
                          history=[world_view(s,summary=compact) for s in world_training.saved['history'][-10:]],
                          readiness=readiness(world_training.saved['history']),models=evolution.snapshot(active_skill(),history_limit=20 if compact else 60),skills=skill_status())
            dashboard_cache['metadata']=metadata
        metrics=metadata['metrics'];run_sizes=metadata['run_sizes'];activity=metadata['activity']
        world_status=dict(session=world_view(world_training.session),scenarios=SCENARIOS,history=metadata['history'],first_night_levels=LEVELS,readiness=metadata['readiness'])
        payload={'performance':{'persistence':persistence.snapshot(),'camera_worker':dict(observers.motion_stats)},'world_learning':learning_view(world_learning.state),'world_training':world_status,'model_evolution':metadata['models'],'bot_lights':{'enabled':bot_lights.enabled,'active_cells':len(bot_lights.positions or [])},'vision':dict(vision_lines.settings),'harvest_markers':dict(harvest_markers.settings),'behavior':behavior_rules.snapshot(),'behavior_active_revision':(world_training.session or {}).get('behavior_snapshot',{}).get('revision'),'practice_protection':practice_protection.snapshot(),'agent_count':AGENT_COUNT,'evaluation':{'episodes_per_agent':trial_limit(),'expected_episodes':AGENT_COUNT*trial_limit()},'observer':observers.snapshot(),'hardware':{'ram_gib':round(psutil.virtual_memory().total/2**30,1),'logical_cpus':psutil.cpu_count()},'mode':mode,'run':run,'agents':agents,'parameters':learning_context()[0].parameters_count,'samples':len(learning_context()[2]),'current_skill':active_skill(),'practice':practice,'server_alive':server_alive(),'server':server_details(),'players':online_players(),'operators':operators(),'cpu_percent':system_cpu,'ram_percent':psutil.virtual_memory().percent,'uptime':time.time()-started,'training':training,'training_job':training_jobs.snapshot(),'last_training':training_results.get(active_skill()),'activity':activity,'episodes':[dict(zip(['run','episodes','successes','mean_steps','mean_seconds'],r),expected_episodes=run_sizes.get(r[0],15)) for r in metrics],'raw_episode_rows':episode_cache['raw'],'v9_stage_names':[stage['name'] for stage in STAGES_V9],'previous_stage_names':[stage['name'] for stage in STAGES_V8],'legacy_stage_names':[stage['name'] for stage in LEGACY_STAGES],'curriculum':curriculum.snapshot(),'skills':metadata['skills'],'lan':lan_bridge.snapshot() if lan_bridge else {'enabled':False,'error':lan_error}}
        if compact:payload=compact_status(payload)
        # Freeze mutable telemetry under the lock; JSON encoding must not block
        # inference, heartbeats or camera updates behind historical tables.
        payload=copy.deepcopy(payload)
    response=JSONResponse(payload,headers={'Cache-Control':'no-store'})
    if compact:
        with lock:dashboard_cache.update(at=time.monotonic(),response=response)
    return response
@app.get('/memory/{agent}')
def nearby_memory(agent:str):
    with lock:
        if agent not in agents:raise HTTPException(404,'Agent has no current position')
        x,y,z=agents[agent]['position']
        rows=db.execute('SELECT x,y,z,block,seen FROM memory WHERE agent=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND z BETWEEN ? AND ? LIMIT 512',(agent,x-16,x+16,y-16,y+16,z-16,z+16)).fetchall()
        return {'agent':agent,'source':'previously observed; may be stale','blocks':[dict(zip(('x','y','z','block','last_observed'),r)) for r in rows]}
@app.post('/assignment',dependencies=[Depends(auth)])
def assignment(d:dict):
    # Camera-only look sample, independent of slower trial/history work.
    if is_agent(d.get('agent')) and d.get('agent')==f"LabAI{d.get('index')}":
        observers.record_camera_pose(d['agent'],d.get('camera_look'),d.get('entity_id'),d.get('speed',0))
    with lock:
        response=_assignment(d)
        frozen=(world_training.session or {}).get('behavior_snapshot') if world_training.session else None
        response['behavior']=behavior_rules.effective(d['agent'],frozen)
    # Assignment fields are owned snapshots or immutable per-run configuration.
    # Avoid the framework's recursive encoder on the high-frequency control path.
    return JSONResponse(response)

def _assignment(d:dict):
    with lock:
        if not is_agent(d.get('agent')) or d.get('agent')!=f"LabAI{d.get('index')}":raise HTTPException(400,'Unknown agent')
        for player in d.get('players',[]):
            if re.fullmatch(r'[A-Za-z0-9_]{3,16}',player.get('name','')) and type(player.get('mode')) is int and player['mode'] in range(4):
                player_states[player['name']]={'mode':player['mode'],'seen':time.time()}
        if 'position' in d:
            state=agents.setdefault(d['agent'],{'goal':None,'steps':0,'reward':0,'action':4,'inference_ms':0,'perception_ms':0,'rays':[]})
            state.update(position=d['position'],health=d['health'],food=d['food'],last_seen=time.time(),run=run)
            state.update(identities.get(d['agent']))
            state['harvest_intent']=validate_intent(d.get('harvest_intent'),world_training.session,d['agent'],time.time())
            state.update(trial_seconds=d.get('trial_seconds'),activity=str(d.get('activity','Waiting'))[:160],speed=d.get('speed',0),reset_seconds=d.get('reset_seconds'),reset_steps_left=d.get('reset_steps_left'))
            state.update(connected=True,entity_id=d.get('entity_id'),dimension=d.get('dimension'),simulation=STAGES[practice['stage'] if practice else curriculum.state['stage']]['name'] if practice or curriculum.state['enabled'] else 'Manual navigation')
        if world_training.session:
            assignment=world_training.assignment(d['agent'],d.get('world_memory_run'))
            result=world_training.session['results'].get(d['agent'],{})
            agents[d['agent']].update(trial_completed=1 if result.get('state') in ('complete','stopped') else 0,trial=1,reset_seconds=None,reset_steps_left=None)
            agents[d['agent']]['simulation']='Real world: '+world_training.session['name']
            if assignment:return assignment
            message='Sequence complete; waiting for the other bots.' if result.get('state')=='complete' else 'Attempt stopped; waiting for the next learning phase.' if result.get('state')=='stopped' else 'Preparing terrain or training models.'
            return {'mode':'paused','run':run,'message':message}
        if mode=='paused':return {'mode':'paused','run':run,'message':'Waiting for the next training or evaluation phase.'}
        # Repeated calls during a lifetime return the same assignment; next episode changes it.
        rng=random.Random(8000+d['index']*1000+d['episode'])
        finished=db.execute('SELECT count(*) FROM episodes WHERE run=? AND agent=?',(run,d['agent'])).fetchone()[0]
        agents[d['agent']].update(trial=max(1,int(d.get('episode',0))),trial_completed=finished)
        if (mode in ('untrained','evaluate','random','heuristic') or mode=='teacher' and curriculum.state.get('queued_active')) and finished>=trial_limit():return {'mode':'paused','run':run}
        center=80 if mode in ('untrained','evaluate','random','heuristic') else 0
        start=[center+rng.uniform(-10,10),181.1,rng.uniform(-10,10)]
        theta=rng.uniform(-math.pi,math.pi);goal=[center+rng.uniform(-10,10),181.1,rng.uniform(-10,10)]
        if (curriculum.state['enabled'] and mode in ('teacher','evaluate')) or (practice and mode in ('heuristic','evaluate')):
            center=240 if mode=='evaluate' else 160
            seed=route_seed(practice['seed'] if practice else curriculum.state['seed'],d['index'],d['episode'],mode in ('evaluate','heuristic'))
            stage=STAGES[practice['stage'] if practice else curriculum.state['stage']]
            if stage.get('skill','navigation')!='navigation':
                task=task_spec(stage,seed,d['index'],mode in ('evaluate','heuristic'));pending_tasks[d['agent']]={'run':run,'task':task}
                return {'mode':mode,'run':run,'start':task['start'],'goal':task['goal'],'yaw':task['yaw'],'task':task}
            start,goal,theta=sample_route(curriculum.state['stage'],seed,center)
        return {'mode':mode,'run':run,'start':start,'goal':goal,'yaw':theta}
@app.post('/reset',dependencies=[Depends(auth)])
def reset(d:dict):
    with lock:
        if not is_agent(d['agent']):raise HTTPException(400,'Unknown agent')
        task=pending_tasks.get(d['agent'])
        if task and task['run']==run and d.get('run')==run and active_skill()!='navigation':
            assigned_tasks[d['agent']]=copy.deepcopy(task)
            for command in reset_commands(task['task'],d['agent']):console(command)
            p=task['task']['start'];yaw=task['task']['yaw']
        else:p=d['position'];yaw=d['yaw']
        console(f"tp {d['agent']} {p[0]} {p[1]} {p[2]} {minecraft_yaw(yaw)} 0")
        if active_skill()=='navigation':console(f"effect give {d['agent']} minecraft:saturation 2 5 true")
        return {'ok':True}
@app.post('/step',dependencies=[Depends(auth)])
def step(d:dict):
    global example_counter
    with lock:
        torch.set_num_threads(1)
        if d.get('run')!=run or mode=='paused':return {'action':4,'inference_ms':0}
        skill=active_skill()
        if world_training.session and world_training.session['active'] and d.get('world_skill') in ('expedition','gathering','shelter','combat'):skill=d['world_skill']
        policy,optimizer,replay=learning_context(skill)
        if len(d['obs'])!=policy.net[0].in_features or not np.isfinite(d['obs']).all():raise HTTPException(400,'Invalid observation')
        t=time.perf_counter()
        with torch.no_grad():action=int(policy(torch.tensor(d['obs'],dtype=torch.float32)).argmax())
        latency=(time.perf_counter()-t)*1000
        if mode=='teacher' or (practice and mode=='heuristic'):
            if not isinstance(d.get('teacher'),int) or not 0<=d['teacher']<policy.net[2].out_features:raise HTTPException(400,'Invalid teacher action')
            if skill=='navigation':replay.append((d['obs'],d['teacher']))
            else:skill_bank.record(skill,d['obs'],d['teacher'])
            example_counter+=1;action=d['teacher']
        elif mode=='heuristic':action=d['teacher']
        elif mode=='random':action=random.randrange(4)
        elif mode=='paused':action=4
        previous=agents.get(d['agent'],{})
        agents[d['agent']]={k:d[k] for k in ('position','health','food','goal','steps','reward','perception_ms')}
        agents[d['agent']].update({k:previous.get(k) for k in ('entity_id','dimension','simulation','activity','speed','trial','trial_completed','reset_seconds','reset_steps_left','trial_seconds','display_name','serial','tracked_since','deaths','spawns','trials','successful_trials')})
        agents[d['agent']].update(connected=True,action=action,inference_ms=latency,last_seen=time.time(),run=run)
        agents[d['agent']]['vision']=d.get('vision')
        agents[d['agent']]['rays']=d['obs'][:64]
        agents[d['agent']]['skill']=skill;agents[d['agent']]['metrics']=d.get('metrics')
        trajectory=Path('data/transitions.f32') if skill=='navigation' else Path('data/skills')/(skill+'-transitions.f32')
        row=dict(agent=d['agent'],profile=personality_json,state=json.dumps(agents[d['agent']]),
                 hits=[(d['agent'],h['position']['x'],h['position']['y'],h['position']['z'],h['name'],time.time()) for h in d['hits']],
                 trajectory=str(trajectory),transition=np.asarray(d['obs']+[action,d['reward']],dtype=np.float32).tobytes())
        if mode=='teacher' and skill=='navigation' and example_counter%100==0:
            persistence.replay('data/demonstrations.npz',list(samples))
    # Backpressure waits outside the controller/camera lock; accepted rows stay ordered.
    persistence.step(row)
    return {'action':action,'inference_ms':latency,'skill':skill}
@app.post('/episode',dependencies=[Depends(auth)])
def episode(d:dict):
    global episode_generation
    with lock:
        if d.get('task'):
            assigned=assigned_tasks.get(d['agent'])
            if not assigned or assigned['run']!=d['run']:return {'ok':True,'ignored':'stale task'}
            metrics=d.get('metrics',{});d['success']=not d.get('reason') and bool(task_success(assigned['task'],metrics))
            if assigned['task']['kind']=='combat':console(f"kill @e[tag=lab_combat_{d['agent']}]")
            event('skill_episode',{'run':d['run'],'agent':d['agent'],'task':assigned['task']['kind'],'success':d['success'],'metrics':metrics})
        cursor=db.execute('INSERT INTO episodes(run,agent,success,steps,distance,time) VALUES(?,?,?,?,?,?)',(d['run'],d['agent'],d['success'],d['steps'],d['distance'],time.time()))
        seconds=d.get('elapsed_seconds')
        if type(seconds) in (int,float) and math.isfinite(seconds) and 0<=seconds<=86400:db.execute('INSERT INTO episode_timing VALUES(?,?)',(cursor.lastrowid,seconds))
        db.commit();episode_generation+=1;episode_cache['raw']+=1
        return {'ok':True}
@app.post('/agent-life',dependencies=[Depends(auth)])
def agent_life(d:dict):
    with lock:
        try:
            result=identities.record(d.get('agent'),d.get('event'),d.get('id'));agents.setdefault(d['agent'],{}).update(result)
            if d.get('event')=='death':world_training.record_death(d['agent'],d.get('run'))
            return result
        except ValueError as error:raise HTTPException(400,str(error))
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
        if d.get('action') in ('gamemode','teleport','teleport-coordinates') and any(n.casefold()==d['player'].casefold() for n in observers.sessions):
            observers.stop(d['player'],[p['name'] for p in online_players()])
        console(command);event('admin_action',{'action':d.get('action'),'player':d.get('player'),'command':command})
        return {'accepted':True,'command':command,'message':'Command sent to Minecraft. Player status updates automatically.'}
@app.post('/control/{command}',dependencies=[Depends(auth)])
def control(command:str,d:dict={}):
    global mode,run,training,model,opt,shutting_down,practice
    with lock:
        if curriculum.state.get('restore_pending') and not curriculum.state['enabled'] and command in ('train','load','new-policy','teacher','evaluate','random','heuristic','untrained'):
            raise HTTPException(409,'Restoring the saved champion model. Try again shortly.')
        if curriculum.state['enabled'] and command not in ('start-server','stop-server','restart-server','shutdown','paused','checkpoint','timing'):
            raise HTTPException(409,'Pause autonomous training before using manual learning controls.')
        if command=='paused' and curriculum.state['enabled']:curriculum.pause()
    if command in ('start-server','stop-server','restart-server','shutdown'):
        if command=='shutdown':
            shutting_down=True
            if server_control.snapshot()['busy']:server_control.wait()
        try:state=server_control.request('stop' if command=='shutdown' else command.removesuffix('-server'),automatic=d.get('automatic') is True)
        except RuntimeError as error:raise HTTPException(409,str(error))
        if d.get('background',False):return {'accepted':True,'server':state}
        finished=server_control.wait()
        if finished['error']:raise HTTPException(500,finished['error'])
        return {'ok':True,'server':finished}
    if (world_learning.state.get('enabled') or world_learning.state.get('restore_pending') or world_learning.state.get('phase')=='stopping') and command in ('train','teacher','evaluate','untrained','random','heuristic','load','new-policy','arena'):raise HTTPException(409,'Pause automatic world learning and wait for protected-model restoration before using manual controls.')
    if command=='paused' and world_learning.state.get('enabled'):
        with lock:return world_learning.stop()
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
            if command=='paused':world_training.stop()
            else:world_training.stop();world_training.session=None
            if command=='evaluate' and practice:
                practice['driver']='student';practice['seed']=time.time_ns();mode='evaluate';run='skilltest-'+str(practice['stage'])+'-'+str(int(time.time()))
            else:
                practice=None;mode=command;run=d.get('run',command+'-'+str(int(time.time())))
            cleanup_combat()
            record_run();event('mode',{'mode':mode,'run':run});return {'run':run}
        if command=='checkpoint':return {'version':checkpoint()}
        if command=='new-policy':
            checkpoint();mode='paused';torch.manual_seed(42)
            model=Policy();opt=torch.optim.Adam(model.parameters(),lr=.003)
            if Path('data/demonstrations.npz').exists():
                os.replace('data/demonstrations.npz',f'data/demonstrations-{time.time_ns()}.npz')
            evolution.record('navigation',model.state_dict(),source='reset')
            samples.clear();event('new_policy',{'seed':42});return {'parameters':model.parameters_count}
        if command=='timing':
            console('tps');console('mspt');return {'log':'logs/minecraft-console.log'}
        if command=='load':
            size=d.get('size')
            if size not in ('tiny','small','medium'):raise HTTPException(400,'Unknown model size')
            saved=torch.load(f'checkpoints/{size}.pt',weights_only=True)
            model=Policy(saved['width']);model.load_state_dict(saved['model'])
            opt=torch.optim.Adam(model.parameters(),lr=.003);opt.load_state_dict(saved['optimizer'])
            evolution.record('navigation',model.state_dict(),f'checkpoints/{size}.pt',source='loaded')
            mode='paused';return {'parameters':model.parameters_count,'size':size}
        if command=='arena':
            for cx in (0,80):
                console(f'forceload add {cx-20} -20 {cx+20} 20')
            time.sleep(4)
            for cx in (0,80):
                console(f'fill {cx-20} 180 -20 {cx+20} 180 20 minecraft:sea_lantern')
                for z in (-20,20):console(f'fill {cx-20} 181 {z} {cx+20} 183 {z} minecraft:glass')
                for x in (cx-20,cx+20):console(f'fill {x} 181 -20 {x} 183 20 minecraft:glass')
            return {'ok':True}
        if command=='backup':backup();return {'ok':True}
        raise HTTPException(400,'Unknown command')

def skill_status():
    result=[]
    for skill in SKILLS:
        stages=[(i,stage) for i,stage in enumerate(STAGES) if stage.get('skill','navigation')==skill]
        history=[row for row in curriculum.state['history'] if STAGES[row['stage']].get('skill','navigation')==skill]
        status='active' if active_skill()==skill and curriculum.state['enabled'] else 'unlocked' if curriculum.state.get('round',0)>0 or stages[0][0]<=curriculum.state['stage'] else 'locked'
        if all(i<curriculum.state['stage'] for i,_ in stages) or (curriculum.state['phase']=='completed' and all(i<=curriculum.state['stage'] for i,_ in stages)):status='passed'
        if practice and STAGES[practice['stage']]['skill']==skill:status='teacher reference' if practice['driver']=='teacher' else 'neural test'
        summary=skill_bank.summary(skill) if skill!='navigation' else {'samples':len(samples),'parameters':model.parameters_count}
        count=summary['samples']
        result.append({'id':skill,'status':status,'stages':[stage['name'] for _,stage in stages],
                       'samples':count,'best_score':max((row['score'] for row in history),default=None),
                       'parameters':summary['parameters']})
    return result

def trial_limit():return practice.get('episodes_per_agent',EPISODES_PER_AGENT) if practice else EPISODES_PER_AGENT

def record_run():
    db.execute('INSERT OR IGNORE INTO run_config VALUES(?,?,?)',(run,AGENT_COUNT,trial_limit()));db.commit()

def auto_mode(value,identifier=None):
    global mode,run
    if value=='paused':cleanup_combat()
    mode=value
    if identifier:run=identifier;record_run()

def auto_protect():
    skill=active_skill();curriculum.state['champion_skill']=skill
    if skill!='navigation':
        skill_bank.get(skill,model);skill_bank.save(skill,champion=True);return
    payload={'model':copy.deepcopy(model.state_dict()),'optimizer':copy.deepcopy(opt.state_dict()),'width':model.net[0].out_features}
    torch.save(payload,'checkpoints/champion.tmp');os.replace('checkpoints/champion.tmp','checkpoints/champion.pt')

def auto_restore():
    global model,opt
    skill=curriculum.state.get('champion_skill','navigation')
    if skill!='navigation':
        skill_bank.get(skill,model);skill_bank.restore(skill)
        evolution.record(skill,skill_bank.entries[skill]['model'].state_dict(),skill_bank.checkpoints/(skill+'.pt'),source='restored');return
    if not Path('checkpoints/champion.pt').exists():return
    saved=torch.load('checkpoints/champion.pt',weights_only=True);model=Policy(saved['width']);model.load_state_dict(saved['model'])
    opt=torch.optim.Adam(model.parameters(),lr=.003);opt.load_state_dict(saved['optimizer']);checkpoint()
    evolution.record('navigation',model.state_dict(),'checkpoints/latest.pt',source='restored')

def auto_results(identifier):
    rows=db.execute('SELECT agent,success,episode_timing.seconds FROM episodes LEFT JOIN episode_timing ON episodes.id=episode_timing.episode WHERE run=? ORDER BY episodes.id',(identifier,)).fetchall()
    counts={};successes=0;seconds=[];cases={}
    for name,success,elapsed in rows:
        counts[name]=counts.get(name,0)+1
        if counts[name]<=EPISODES_PER_AGENT:
            successes+=success
            if success:
                seconds.append(elapsed);cases[f'{name}:{counts[name]}']=elapsed
    return {'episodes':sum(min(v,EPISODES_PER_AGENT) for v in counts.values()),'successes':successes,'successful_case_seconds':cases,**completion_timing(seconds,successes)}

def auto_health(recovering=False):
    if psutil.virtual_memory().percent>(84 if recovering else 88):return 'System memory is above '+('84%' if recovering else '88%')+'.'
    if psutil.disk_usage(str(ROOT)).free<2*1024**3:return 'Less than 2 GiB of disk space remains.'
    if not server_ready() or server_control.snapshot()['busy']:return 'Waiting for Minecraft to be ready.'
    if sum(time.time()-a.get('last_seen',0)<8 and a.get('connected',True) for name,a in agents.items() if is_agent(name))<AGENT_COUNT:return f'Waiting for all {AGENT_COUNT} bots to connect.'
    return None

auto_arena={'pid':None,'phase':0,'time':0,'offset':0}
def auto_prepare():
    if auto_arena['pid']!=server.pid:auto_arena.update(pid=server.pid,phase=0)
    if auto_arena['phase']==0:
        for center in (160,240,320,480):
            for mob in ('creeper','zombie','skeleton','spider','witch','enderman','slime','phantom'):
                console(f'kill @e[type=minecraft:{mob},x={center-24},y=175,z=-24,dx=48,dy=50,dz={LANE_END+26}]')
            console(f'forceload add {center-24} -8 {center+24} {LANE_END+2}')
        auto_arena.update(phase=1,time=time.time());return False
    if auto_arena['phase']==1:
        if time.time()-auto_arena['time']<5:return False
        auto_arena['offset']=Path('logs/minecraft-console.log').stat().st_size
        for center in (160,240):
            console(f'fill {center-20} 181 -20 {center+20} 185 20 minecraft:air')
            console(f'fill {center-20} 180 -20 {center+20} 180 20 minecraft:sea_lantern')
            for z in (-20,20):console(f'fill {center-20} 181 {z} {center+20} 183 {z} minecraft:glass')
            for x in (center-20,center+20):console(f'fill {x} 181 -20 {x} 183 20 minecraft:glass')
        for center in (320,480):
            for command in arena_commands(center):console(command)
        auto_arena.update(phase=2,time=time.time());return False
    if auto_arena['phase']==2:
        if time.time()-auto_arena['time']<2:return False
        log=Path('logs/minecraft-console.log').read_bytes()[auto_arena['offset']:].decode(errors='replace')
        if 'not loaded' in log or 'too many blocks' in log.lower():raise RuntimeError('Simulation arena preparation failed. Check the Minecraft console log.')
        if log.count('Successfully filled')<2:raise RuntimeError('Simulation arena construction was not acknowledged.')
        auto_arena['phase']=3
    return True

def record_curriculum_result(result):
    evolution.review(result)
    event('curriculum_cycle',result)

curriculum=Curriculum('data/curriculum.json',{'pause':lambda:auto_mode('paused'),'cancel':training_jobs.cancel,
    'job':training_jobs.snapshot,'mode':auto_mode,'protect':auto_protect,'restore':auto_restore,
    'results':auto_results,'count':lambda:example_counter,'train':lambda:start_training(background=True),
    'expected_episodes':lambda:EXPECTED_EPISODES,'health':auto_health,'recovery_health':lambda:auto_health(recovering=True),'prepare':auto_prepare,'event':record_curriculum_result,'queue_event':lambda row:event('queued_trial',row)})

def curriculum_worker():
    while not shutting_down:
        try:
            with lock:curriculum.tick()
        except Exception as error:
            with lock:
                curriculum.pause('Autonomous training stopped: '+str(error));event('curriculum_error',{'error':str(error)})
        time.sleep(1)

TRIAL_CATALOGUE=describe_trials(STAGES)

@app.get('/trials')
def trial_catalogue():
    with lock:return {'catalogue':TRIAL_CATALOGUE,'trials':curriculum.trials.snapshot()}

@app.post('/trials/queue',dependencies=[Depends(auth)])
def queue_trial(d:dict):
    with lock:
        try:item=curriculum.trials.enqueue(d.get('stage_id'),d.get('driver','student'))
        except ValueError as error:raise HTTPException(400,str(error))
        return {'item':item,'trials':curriculum.trials.snapshot()}

@app.post('/trials/queue/{action}',dependencies=[Depends(auth)])
def change_trial_queue(action:str,d:dict):
    with lock:
        try:
            if action=='remove':curriculum.trials.remove(d.get('id'))
            elif action=='reorder':curriculum.trials.reorder(d.get('ids'))
            elif action=='clear':curriculum.trials.clear()
            else:raise ValueError('Unknown queue action')
        except ValueError as error:raise HTTPException(400,str(error))
        return {'trials':curriculum.trials.snapshot()}

@app.post('/curricula/prepare',dependencies=[Depends(auth)])
def prepare_practice():
    with lock:
        if world_learning.state.get('enabled') or world_learning.state.get('restore_pending'):raise HTTPException(409,'Pause world learning before preparing basics practice.')
        if curriculum.state['enabled'] or training_jobs.running or not server_ready():raise HTTPException(409,'Pause training and wait for Minecraft before preparing practice')
        return {'ready':auto_prepare()}

@app.post('/curricula/practice/{stage_index}',dependencies=[Depends(auth)])
def practice_stage(stage_index:int,d:dict={}):
    global practice,mode,run
    with lock:
        if world_learning.state.get('enabled') or world_learning.state.get('restore_pending') or world_learning.state.get('phase')=='stopping':raise HTTPException(409,'Pause world learning before starting basics practice.')
        if not 4<=stage_index<len(STAGES):raise HTTPException(400,'Choose an implemented broader stage')
        if curriculum.state['enabled'] or curriculum.state.get('restore_pending') or training_jobs.running or server_control.snapshot()['busy']:
            raise HTTPException(409,'Pause autonomous training and wait for saving before starting a teacher demonstration.')
        if not server_ready() or auto_arena['phase']!=3:raise HTTPException(409,'Simulation arenas are not ready. Start autonomous training once to prepare them.')
        cleanup_combat()
        driver=d.get('driver','teacher')
        if driver not in ('teacher','student'):raise HTTPException(400,'Choose teacher or student')
        limit=d.get('episodes_per_agent',EPISODES_PER_AGENT)
        if type(limit) is not int or not 1<=limit<=3:raise HTTPException(400,'Choose 1-3 trials per bot')
        seed=d.get('seed',time.time_ns())
        if type(seed) is not int or not 0<=seed<2**63:raise HTTPException(400,'Choose a nonnegative 63-bit simulation seed')
        world_training.stop();world_training.session=None
        practice={'stage':stage_index,'seed':seed,'driver':driver,'episodes_per_agent':limit};mode='heuristic' if driver=='teacher' else 'evaluate'
        run=('practice-' if driver=='teacher' else 'skilltest-')+str(stage_index)+'-'+str(int(time.time()))+'-v10'
        record_run();event('mode',{'mode':mode,'run':run,'stage':STAGES[stage_index]['name'],'reference':driver=='teacher'})
        return {'run':run,'stage':STAGES[stage_index],'message':'Teacher reference started; demonstrations are collected. This measures task feasibility, not learned performance.' if driver=='teacher' else 'Neural policy test started on fresh routes, without teacher control.'}

def camera_worker():
    next_tick=time.monotonic()
    while not shutting_down:
        try:
            if server_alive() and server_ready_seen and not server_control.snapshot()['busy']:observers.move_cameras()
        except (OSError,RuntimeError):pass
        next_tick=max(next_tick+.05,time.monotonic())
        time.sleep(max(0,next_tick-time.monotonic()))

def observer_worker():
    next_tick=time.monotonic()
    while not shutting_down:
        try:
            with lock:
                harvest_markers.tick(world_training.session,agents,server_ready() and not server_control.snapshot()['busy'])
                vision_lines.tick(agents,observers.sessions,server_ready() and not server_control.snapshot()['busy'])
                if server_ready() and not server_control.snapshot()['busy']:
                    staging_pad.tick(server.pid,time.time())
                    bot_lights.tick(agents,True)
                    camera_input.tick(observers,[p['name'] for p in online_players()],agents)
                    world_training.tick()
                    connected=[n for n,a in agents.items() if is_agent(n) and a.get('connected') and time.time()-a.get('last_seen',0)<8]
                    try:world_learning.tick()
                    except Exception as error:world_learning.fail(error)
                    repeat=world_training.next_batch(connected)
                    if repeat and not world_learning.state.get('enabled') and world_learning.state.get('phase') not in ('stopping','error') and not training_jobs.running and not curriculum.state['enabled']:start_world(repeat)
                    online=[p['name'] for p in online_players() if not p['is_bot']]
                    for player,choice in world_training.ui(online,[p['name'] for p in operators() if p.get('level',0)>=4]):
                        try:
                            if choice==1:autonomy('start')
                            elif choice in (2,3):start_world({'scenario':0,'size':128,'driver':'teacher' if choice==2 else 'student'})
                            elif choice==4:stop_world();curriculum.pause()
                            elif choice==8:start_world_learning({})
                            elif choice in (9,10,11):start_world_learning({'mission':{9:'iron_age',10:'homestead',11:'home_defense'}[choice]})
                            elif choice==12:start_world_learning({'mission':'first_night','night_level':0})
                            elif choice in (5,6,7):train_world({'skill':{5:'gathering',6:'expedition',7:'shelter'}[choice]})
                            else:world_training.menu(player)
                        except (ValueError,HTTPException) as error:console('tellraw '+player+' '+json.dumps({'text':str(getattr(error,'detail',error)),'color':'red'}))
                observers.tick([p['name'] for p in online_players()],player_states,agents,server_ready() and not server_control.snapshot()['busy'],mode,progress_context=observer_progress(curriculum.state,STAGES,mode,practice,training_jobs.snapshot(),trial_limit(),run,world_training.session,world_training.saved['history']),pause_reason=(training_jobs.snapshot().get('message','Training')+f" ({training_jobs.snapshot().get('percent',0):.0f}%)" if training_jobs.running else curriculum.state.get('message','Waiting for next learning phase') if curriculum.state['enabled'] else 'Paused; resume learning from the dashboard'))
        except Exception as error:
            with lock:
                for session in observers.sessions.values():
                    if session.get('enabled'):session.update(status='error',message='Camera update failed: '+str(error))
        next_tick=max(next_tick+.05,time.monotonic())
        time.sleep(max(0,next_tick-time.monotonic()))

@app.post('/world/start',dependencies=[Depends(auth)])
def start_world(d:dict={}):
    with lock:
        if world_learning.state.get('enabled') or world_learning.state.get('phase')=='stopping':return world_learning.stop({'mode':'world','data':d})
        if world_learning.state.get('restore_pending'):raise HTTPException(409,'Protected model restoration is required before starting another mode.')
        return _begin_world(d)

def _begin_world(d:dict):
    global mode,run,practice
    with lock:
        if training_jobs.running or server_control.snapshot()['busy'] or not server_ready():raise HTTPException(409,'Wait for training and server operations to finish.')
        if curriculum.state.get('restore_pending'):raise HTTPException(409,'Wait for champion model restoration.')
        if world_learning.state.get('enabled'):
            # tick() already checked the full roster before replay capture and
            # other work under this lock. Those hooks can age heartbeat times;
            # never drop a configured bot by re-filtering freshness afterward.
            names=[f'LabAI{i}' for i in range(AGENT_COUNT)]
            if any(not agents.get(name,{}).get('connected') for name in names):raise HTTPException(409,'Waiting for the full automatic world roster.')
        else:
            names=[n for n,a in agents.items() if is_agent(n) and a.get('connected') and time.time()-a.get('last_seen',0)<8]
            if not names:raise HTTPException(409,'No connected bots.')
        try:
            frozen=behavior_rules.frozen(d['behavior_snapshot']['config']) if d.get('behavior_snapshot') else behavior_rules.frozen()
            result=world_training.start(d,sorted(names)[:8])
            world_training.session['behavior_snapshot']=frozen
            result['session']['behavior_snapshot']=frozen
        except ValueError as error:raise HTTPException(400,str(error))
        curriculum.pause('Basics saved while real-world hut training is selected.');practice=None
        mode='teacher' if d.get('driver','teacher')=='teacher' else 'evaluate';run=world_training.session['run']
        record_run();console('scoreboard objectives add lab_world trigger')
        world_training.park(names)
        event('world_started',{'run':run,**d});return result

@app.post('/world/stop',dependencies=[Depends(auth)])
def stop_world():
    global mode
    with lock:
        if world_learning.state.get('enabled') or world_learning.state.get('restore_pending'):return world_learning.stop()
        world_training.stop();mode='paused';return world_training.snapshot()

@app.post('/world/camp',dependencies=[Depends(auth)])
def prepare_world_camp(d:dict):
    with lock:
        try:return world_training.camp(d.get('agent'),d.get('position'))
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/world/spawn',dependencies=[Depends(auth)])
def world_spawn(d:dict):
    with lock:
        try:world_training.spawn(d.get('agent'),d.get('position'));return {'ok':True}
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/world/resources',dependencies=[Depends(auth)])
def world_lesson_resources(d:dict):
    with lock:
        try:return {'trees':world_training.lesson_resources(d.get('agent'))}
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/world/livestock',dependencies=[Depends(auth)])
def world_livestock(d:dict):
    with lock:
        try:return world_training.livestock(d)
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/world/quarry',dependencies=[Depends(auth)])
def prepare_world_quarry(d:dict):
    with lock:
        try:return world_training.quarry(d.get('agent'))
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/world/survival',dependencies=[Depends(auth)])
def world_survival(d:dict):
    with lock:
        try:return world_training.survival(d,agents.get(d.get('agent'),{}).get('display_name') or d.get('agent'))
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/world/report',dependencies=[Depends(auth)])
def world_report(d:dict):
    with lock:
        world_training.report(d.get('agent'),d);return {'ok':True}

@app.post('/world/train',dependencies=[Depends(auth)])
def train_world(d:dict={}):
    with lock:
        if world_learning.state.get('enabled') or world_learning.state.get('restore_pending'):raise HTTPException(409,'Pause automatic world learning before manual training.')
        skill=d.get('skill','expedition')
        if skill not in ('expedition','gathering','shelter','combat'):raise HTTPException(400,'Choose navigation, gathering or shelter.')
        if world_training.session and world_training.session['active']:raise HTTPException(409,'Finish or stop the world trial before training.')
        if training_jobs.running or curriculum.state.get('restore_pending'):raise HTTPException(409,'Wait for the current model operation to finish.')
        if not world_training.session:
            if not world_training.saved['history']:raise HTTPException(409,'Run a teacher world trial first.')
            world_training.session=copy.deepcopy(world_training.saved['history'][-1]);world_training.session['active']=False
        curriculum.pause('Basics saved while training the selected world specialist.')
        world_training.session['loop']=False
        world_training.session['training_skill']=skill
        return start_training(background=True)

@app.post('/world/menu',dependencies=[Depends(auth)])
def world_menu(d:dict={}):
    with lock:
        player=d.get('player','Xonosnet')
        allowed=[p['name'] for p in online_players() if not p['is_bot']]
        if player not in allowed:raise HTTPException(400,'Choose an online human player.')
        console('scoreboard objectives add lab_world trigger');console(f'scoreboard players enable {player} lab_world');world_training.menu(player);return {'ok':True}

@app.post('/behavior',dependencies=[Depends(auth)])
def configure_behavior(d:dict):
    with lock:
        try:return behavior_rules.update(d)
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/harvest-markers',dependencies=[Depends(auth)])
def configure_harvest_markers(d:dict):
    with lock:
        try:return harvest_markers.configure(d)
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/vision',dependencies=[Depends(auth)])
def configure_vision(d:dict):
    with lock:
        try:return vision_lines.configure(d)
        except ValueError as error:raise HTTPException(400,str(error))

@app.post('/observer/{action}',dependencies=[Depends(auth)])
def observer_action(action:str,d:dict):
    with lock:
        try:
            online=[p['name'] for p in online_players()]
            if action=='stop':return observers.stop(d.get('player','Xonosnet'),online,server_ready() and not server_control.snapshot()['busy'])
            if action=='next':return observers.next_bot(d.get('player','Xonosnet'),agents)
            if action=='adjust':return observers.adjust(d.get('player','Xonosnet'),d.get('key'))
            if action!='start':raise ValueError('Choose start, stop or next')
            cached=json.loads(Path('server/usercache.json').read_text(encoding='utf-8'))
            result=observers.start(d,online+[p['name'] for p in cached]);event('observer_started',result);return result
        except (ValueError,TypeError) as error:raise HTTPException(400,str(error))

@app.post('/autonomy/{action}',dependencies=[Depends(auth)])
def autonomy(action:str):
    global practice
    with lock:
        if action=='pause':return curriculum.pause()
        if action!='start':raise HTTPException(400,'Unknown autonomous training action')
        if world_learning.state.get('enabled') or world_learning.state.get('phase')=='stopping':return world_learning.stop({'mode':'basics'})
        if training_jobs.running or server_control.snapshot()['busy']:raise HTTPException(409,'Wait for the current training or server operation to finish.')
        if curriculum.state.get('restore_pending'):raise HTTPException(409,'Restoring the previous model. Try again shortly.')
        if world_learning.state.get('restore_pending'):raise HTTPException(409,'Protected world specialists must be restored first.')
        world_training.stop();world_training.session=None
        practice=None
        try:return curriculum.start()
        except ValueError as error:raise HTTPException(409,str(error))

@app.get('/',response_class=HTMLResponse)
def dashboard():
    response=HTMLResponse(Path('lab/dashboard.html').read_text(encoding='utf-8'),headers={'Cache-Control':'no-store'})
    response.set_cookie('lab_session',TOKEN,httponly=True,samesite='strict',path='/')
    return response


WORLD_SKILLS=('expedition','gathering','shelter','combat')

def capture_world_replay():
    cycle=world_learning.state['round']
    return {skill:world_replay_reference.capture(skill,cycle,list(skill_bank.get(skill,model)['samples'])) for skill in WORLD_SKILLS}

def protect_world_models():
    root=Path('checkpoints/world-learning');root.mkdir(parents=True,exist_ok=True)
    for skill in WORLD_SKILLS:
        entry=skill_bank.get(skill,model);path=root/(skill+'.pt');tmp=path.with_suffix('.tmp')
        torch.save(skill_bank.payload(entry),tmp);os.replace(tmp,path)

def restore_world_models():
    for skill in WORLD_SKILLS:
        path=Path('checkpoints/world-learning')/(skill+'.pt')
        if not path.exists():raise RuntimeError('Protected world checkpoint is missing: '+skill)
        baseline=world_learning.state.get('baseline',{})
        evolution.review(dict(skill=skill,kind='world_bundle_interrupted',accepted=False,baseline=baseline.get('progress',0),score=0,episodes=baseline.get('bots',0),selection_reason='World candidate was interrupted or rejected; restored protected weights.'))
        saved=torch.load(path,weights_only=True);entry=skill_bank.get(skill,model)
        entry['model'].load_state_dict(saved['model']);entry['optimizer'].load_state_dict(saved['optimizer']);skill_bank.save(skill)
        evolution.record(skill,entry['model'].state_dict(),skill_bank.checkpoints/(skill+'.pt'),source='restored')

def world_train_skill(skill):
    world_training.stop('Teacher examples saved. Waiting while the CPU trains '+skill+'.')
    world_training.session['training_skill']=skill
    return start_training(background=True,world_automatic=True)

def review_world_models(result):
    for skill in result['skills']:
        evolution.review(dict(skill=skill,kind='world_bundle_comparison',accepted=result['accepted'],
            baseline=result['baseline']['progress'],score=result['candidate']['progress'],episodes=result['candidate']['bots'],
            selection_reason=result['reason'],world_comparison=result))
    event('world_learning_cycle',result)

def world_learning_switch(action):
    if action['mode']=='basics':autonomy('start')
    elif action['mode']=='world':_begin_world(action['data'])

world_learning=WorldLearning('data/world-learning.json',{
    'hold_preparation':world_training.hold_preparation,'resume_preparation':world_training.resume_preparation,
    'stop_world':world_training.stop,'cancel':training_jobs.cancel,'job':training_jobs.snapshot,
    'world':lambda:world_training.session,'begin':_begin_world,'train':world_train_skill,
    'protect':protect_world_models,'restore':restore_world_models,'review':review_world_models,'snapshot_replay':capture_world_replay,
    'switch':world_learning_switch,'behavior':behavior_rules.frozen,
    'memory':lambda:copy.deepcopy(world_training.saved.get('first_night_memory',{})),
    'ready':lambda:auto_health(recovering=world_learning.state.get('phase')=='recovering' and world_learning.state.get('recovery_cause')=='memory') is None,
    'counts':lambda:{skill:skill_bank.get(skill,model)['count'] for skill in WORLD_SKILLS}})

@app.post('/world-learning/start',dependencies=[Depends(auth)])
def start_world_learning(d:dict={}):
    with lock:
        if training_jobs.running or curriculum.state.get('restore_pending'):raise HTTPException(409,'Wait for the current model operation to finish.')
        scenario=d.get('scenario',0);size=d.get('size',128);mission=d.get('mission','settlement');progress=d.get('auto_progress',True)
        if type(scenario) is not int or not 0<=scenario<12 or type(size) is not int or size not in (128,256) or mission not in ('settlement','stone_age','iron_age','homestead','home_defense','first_night') or type(progress) is not bool:raise HTTPException(400,'Choose a valid world learning curriculum.')
        extra={}
        if mission=='first_night':
            from .first_night import profile
            try:profile(d.get('night_level',0))
            except ValueError as error:raise HTTPException(400,str(error))
            if size!=128:raise HTTPException(400,'First Night uses 128 by 128 sites for complete natural animal resets.')
            if scenario>=9:raise HTTPException(400,'Sites 10–12 are held out from First Night training. Use policy assessment instead.')
            extra['night_level']=d.get('night_level',0)
        curriculum.pause('Basics saved while automatic world learning is selected.')
        try:return world_learning.start(dict(scenario=scenario,size=size,mission=mission,prepared=True,auto_progress=progress,**extra))
        except ValueError as error:raise HTTPException(409,str(error))

@app.post('/world-learning/stop',dependencies=[Depends(auth)])
def stop_world_learning():
    with lock:return world_learning.stop()
