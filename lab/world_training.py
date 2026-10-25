"""Reserved, resettable natural-world hut trials with native chat controls."""
import copy
import json
import math
import re
import time
from pathlib import Path

SCENARIOS=[dict(id=i,name=name,description=description,spread=spread) for i,(name,description,spread) in enumerate([
 ('Natural settlement','A shared natural spawn and independent hut plots.',9),
 ('Spread-out homestead','Build plots farther from the common spawn.',14),
 ('Long resource search','A wider search area between harvesting and construction.',18),
 ('Natural site expedition','A different natural terrain site with fresh resource distribution.',12),
 ('Remote shelters','Longer journeys back to widely separated plots.',22),
 ('Mixed terrain settlement','A further natural site; locate safe ground before committing to a hut.',16),
 ('Unseen natural site 7','The same shelter objective in another previously untested landscape.',12),
 ('Unseen natural site 8','Repeat the task with a new distribution of exposed terrain and trees.',14),
 ('Unseen natural site 9','Find safe approaches to resources and a build plot in another region.',16),
 ('Unseen natural site 10','Test gathering and returning across a separate natural landscape.',18),
 ('Unseen natural site 11','A further terrain generalization trial with the same measurable hut goal.',20),
 ('Unseen natural site 12','A final separate natural site for comparing teacher and policy navigation.',22)])]


class WorldTraining:
    def __init__(self,path,command,logpath,clock=time.time):
        self.path=Path(path);self.command=command;self.logpath=Path(logpath);self.clock=clock
        self.saved=json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'templates':{},'history':[]}
        self.session=None;self.jobs=[];self.job=None;self.offset=0;self.serial=0;self.ui_at=0;self.ui_offset=self.logpath.stat().st_size if self.logpath.exists() else 0

    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        temp=self.path.with_suffix('.tmp');temp.write_text(json.dumps(self.saved,indent=2),encoding='utf-8');temp.replace(self.path)

    def start(self,data,names):
        if self.session and self.session['active']:raise ValueError('Stop the current world trial before starting another.')
        if not names or any(not re.fullmatch(r'LabAI[0-9]',name) for name in names):raise ValueError('Choose configured lab bots.')
        scenario=data.get('scenario',0);size=data.get('size',128)
        if type(scenario) is not int or not 0<=scenario<len(SCENARIOS):raise ValueError('Unknown natural-world scenario.')
        if type(size) is not int or size not in (128,256):raise ValueError('Choose 128 or 256 blocks.')
        prepared=data.get('prepared',True)
        if type(prepared) is not bool:raise ValueError('Prepared camp must be enabled or disabled.')
        driver=data.get('driver','teacher')
        if driver not in ('teacher','student'):raise ValueError('Choose teacher assistance or policy navigation.')
        loop=data.get('loop',True)
        if type(loop) is not bool:raise ValueError('Repeat trials must be enabled or disabled.')
        x=16384+scenario*4096+(2048 if size==256 else 0);z=16384
        key=f'{scenario}-{size}';restore=key in self.saved['templates']
        self.session=dict(active=True,phase='restoring' if restore else 'snapshotting',run='world-'+str(time.time_ns()),
            scenario=scenario,name=SCENARIOS[scenario]['name'],size=size,bounds=[x,x+size,z,z+size],driver=driver,
            bots=list(names),prepared=prepared,loop=loop,results={},started_at=self.clock(),round=self.saved.get('round',max((r.get('round',0) for r in self.saved['history']),default=0))+1,
            progress=0,message='Restoring the saved natural terrain.' if restore else 'Saving pristine natural terrain before the first trial.',template=key)
        self.jobs=[];self.job=None
        # Incremental two-chunk work avoids permanent force loads and the global limit.
        for xx in range(x,x+size,16):
            for zz in range(z,z+size,16):
                source=xx+1024 if restore else xx;dest=xx if restore else xx+1024
                self.jobs.append((source,dest,zz))
        self.total=len(self.jobs);return self.snapshot()

    def next_batch(self,connected):
        s=self.session
        if not s or not s.get('loop') or s['phase']!='finished' or self.clock()<s['restart_at']:return None
        if not set(s['bots']).issubset(connected):
            s['message']='Waiting for all trial bots to reconnect before restoring terrain.';return None
        return {key:s[key] for key in ('scenario','size','driver','prepared','loop')}

    def finish(self):
        s=self.session
        s.update(active=False,phase='finished',restart_at=self.clock()+10,message='Batch finished. Restoring terrain for the next batch in 10 seconds.' if s.get('loop') else 'Trial finished. Review each bot’s result; reset starts from the saved natural terrain.')
        self.saved['round']=s['round']
        self.saved['history'].append(copy.deepcopy(s));self.saved['history']=self.saved['history'][-30:];self.save()

    def _read(self,offset):
        if not self.logpath.exists():return '',offset
        with self.logpath.open('rb') as stream:
            stream.seek(min(offset,self.logpath.stat().st_size));data=stream.read(262144);return data.decode('utf-8',errors='replace'),stream.tell()

    def tick(self):
        s=self.session
        if not s:return
        if s['phase'] not in ('snapshotting','restoring') and self.clock()-s.get('sweep_at',0)>1:
            x0,x1,z0,z1=s['bounds']
            for mob in ('phantom','creeper','zombie','skeleton','spider','witch','enderman','slime','husk','drowned'):
                self.command(f'kill @e[type=minecraft:{mob},tag=!lab_combat,x={x0},y=-64,z={z0},dx={x1-x0},dy=320,dz={z1-z0}]')
            s['sweep_at']=self.clock()
        if not s['active']:return
        if s['phase'] in ('snapshotting','restoring'):
            if not self.job:
                if not self.jobs:
                    self.saved['templates'][s['template']]=dict(bounds=s['bounds'],saved_at=self.clock());self.save()
                    s.update(phase='running',message='Hut trial running. Gathering, crafting and building use a scripted teacher; navigation can use the learned policy.',progress=100,trial_at=self.clock())
                    x0,x1,z0,z1=s['bounds']
                    self.command(f'kill @e[type=minecraft:item,x={x0},y=-64,z={z0},dx={x1-x0},dy=256,dz={z1-z0}]')
                    for name in s['bots']:
                        self.command(f'gamemode survival {name}')
                        self.command(f'clear {name}')
                        self.command(f'effect clear {name}')
                        self.command(f'effect give {name} minecraft:instant_health 1 5 true')
                        self.command(f'effect give {name} minecraft:resistance 30 4 true')
                        self.command(f'effect give {name} minecraft:fire_resistance 30 0 true')
                        self.command(f'effect give {name} minecraft:slow_falling 30 0 true')
                        self.command(f'effect give {name} minecraft:saturation 1 5 true')
                        self.command(f'tp {name} {(x0+x1)/2} 196 {(z0+z1)/2}')
                    return
                source,dest,z=self.jobs.pop(0);self.job=dict(source=source,dest=dest,z=z,phase='loading',at=self.clock())
                for xx in (source,dest):self.command(f'forceload add {xx} {z} {xx+15} {z+15}')
                return
            j=self.job
            if j['phase']=='loading' and self.clock()-j['at']>=.8:
                self.offset=self.logpath.stat().st_size if self.logpath.exists() else 0
                for y in range(-64,192,64):self.command(f"clone {j['source']} {y} {j['z']} {j['source']+15} {y+63} {j['z']+15} {j['dest']} {y} {j['z']} replace force")
                self.serial+=1;self.command(f'scoreboard players set #world_ack lab_world {self.serial}')
                j.update(phase='waiting',at=self.clock(),serial=self.serial,log='');return
            if j['phase']=='waiting':
                text,self.offset=self._read(self.offset);j['log']+=text
                if f'to {j["serial"]}' in j['log'] and '#world_ack' in j['log']:
                    # Acknowledge clone success before considering terrain safe to use.
                    if j['log'].count('Successfully cloned')<4:
                        self.stop('Terrain copy failed; trial stopped before deploying bots. Inspect the Minecraft console.');return
                    x0,x1,z0,z1=s['bounds'];xx=j['dest'] if s['phase']=='restoring' else j['source'];zz=j['z']
                    if xx==x0:self.command(f'fill {xx} -64 {zz} {xx} 191 {zz+15} minecraft:glass')
                    if xx+16==x1:self.command(f'fill {xx+15} -64 {zz} {xx+15} 191 {zz+15} minecraft:glass')
                    if zz==z0:self.command(f'fill {xx} -64 {zz} {xx+15} 191 {zz} minecraft:glass')
                    if zz+16==z1:self.command(f'fill {xx} -64 {zz+15} {xx+15} 191 {zz+15} minecraft:glass')
                    for xx in (j['source'],j['dest']):self.command(f"forceload remove {xx} {j['z']} {xx+15} {j['z']+15}")
                    self.job=None;s['progress']=round(100*(self.total-len(self.jobs))/self.total,1)
                elif self.clock()-j['at']>20:self.stop('Terrain copy acknowledgement timed out.');return
        elif s['phase']=='running':
            if self.clock()-s['trial_at']>1200:
                for name in s['bots']:
                    if s['results'].get(name,{}).get('state') not in ('complete','stopped'):
                        self.report(name,dict(run=s['run'],state='stopped',phase='stopped',message='Twenty-minute trial limit reached.',seconds=1200))

    def assignment(self,name):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or name not in s['bots']:return None
        if s['results'].get(name,{}).get('state') in ('complete','stopped'):return None
        return dict(mode='teacher' if s['driver']=='teacher' else 'evaluate',run=s['run'],world=dict(bounds=s['bounds'],index=s['bots'].index(name),count=len(s['bots']),spread=SCENARIOS[s['scenario']]['spread'],driver=s['driver'],prepared=s['prepared']))

    def camp(self,name,position):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or name not in s['bots'] or not s['prepared']:raise ValueError('No prepared camp assignment.')
        if s.get('camp'):return copy.deepcopy(s['camp'])
        if not isinstance(position,list) or len(position)!=3 or any(type(v) not in (int,float) or not math.isfinite(v) for v in position):raise ValueError('Invalid camp position.')
        x,y,z=[math.floor(v) for v in position];x0,x1,z0,z1=s['bounds']
        if not x0+19<x<x1-19 or not z0+19<z<z1-19 or not 0<y<180:raise ValueError('Camp must fit safely inside the reserved terrain.')
        self.command(f'fill {x-18} {y-1} {z-18} {x+18} {y-1} {z+18} minecraft:grass_block')
        self.command(f'fill {x-18} {y} {z-18} {x+18} {y+9} {z+18} minecraft:air')
        plots=[];groves=[]
        for index in range(len(s['bots'])):
            px=x+(index%4)*8-12;pz=z+(index//4)*8-4;direction=-1 if index<4 else 1
            plots.append(dict(x=px,y=y,z=pz,tableY=y));trees=[]
            for dx in (-2,2):
                for distance in (5,9):
                    tx=px+dx;tz=pz+direction*distance;trees.append([tx,y,tz])
                    self.command(f'fill {tx} {y} {tz} {tx} {y+3} {tz} minecraft:oak_log')
                    self.command(f'fill {tx-1} {y+4} {tz-1} {tx+1} {y+5} {tz+1} minecraft:oak_leaves[persistent=true]')
            groves.append(trees)
        s['camp']=dict(spawn=[x+.5,y+.1,z+.5],plots=plots,groves=groves)
        return copy.deepcopy(s['camp'])

    def spawn(self,name,position):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or name not in s['bots']:raise ValueError('No active world assignment.')
        if not isinstance(position,list) or len(position)!=3 or any(type(v) not in (float,int) or not math.isfinite(v) for v in position):raise ValueError('Invalid spawn.')
        x0,x1,z0,z1=s['bounds'];x,y,z=position
        if not x0+2<x<x1-2 or not z0+2<z<z1-2 or not -60<y<185:raise ValueError('Spawn must be inside the reserved trial and below the snapshot ceiling.')
        self.command(f'tp {name} {x} {y} {z}')
        self.command(f'effect clear {name} minecraft:slow_falling')
        self.command(f'effect give {name} minecraft:resistance 3 4 true')

    def report(self,name,data):
        s=self.session
        if not s or not s['active'] or data.get('run')!=s['run'] or name not in s['bots']:return
        if data.get('state')=='stopped' and s['results'].get(name,{}).get('state')!='stopped':
            self.command(f'effect give {name} minecraft:fire_resistance 20 0 true');self.command(f'tp {name} 0 181 0')
        allowed=('state','phase','message','logs','blocks','target_blocks','distance','travelled','health','plot','seconds')
        s['results'][name]={k:copy.deepcopy(data[k]) for k in allowed if k in data}
        if len(s['results'])==len(s['bots']) and all(r.get('state') in ('complete','stopped') for r in s['results'].values()):
            self.finish()

    def stop(self,reason='World trial paused by you.'):
        if self.job:
            j=self.job
            for xx in (j['source'],j['dest']):
                try:self.command(f"forceload remove {xx} {j['z']} {xx+15} {j['z']+15}")
                except RuntimeError:pass
        self.jobs=[];self.job=None
        if self.session:
            if self.session['active']:
                for name in self.session['bots']:
                    try:self.command(f'tp {name} 0 181 0')
                    except RuntimeError:pass
            self.session.update(active=False,loop=False,phase='paused',message=reason)

    def snapshot(self):return dict(session=copy.deepcopy(self.session),scenarios=SCENARIOS,history=copy.deepcopy(self.saved['history'][-10:]))

    def menu(self,player):
        parts=[{'text':'AI Laboratory\n','color':'gold','bold':True}]
        for label,choice in [('Basics training',1),('Real world: repeat teacher hut trials',2),('Real world: repeat policy navigation + hut teacher',3),('Stop current mode',4),('Train gathering from examples',5),('Train navigation from examples',6)]:
            parts.extend([{'text':'['+label+']\n','color':'aqua','clickEvent':{'action':'run_command','value':f'/trigger lab_world set {choice}'}}])
        parts.append({'text':'World trials use a reserved natural area, restored between trials. Hut construction is teacher assisted. Dashboard: 127.0.0.1:8000','color':'gray'})
        self.command(f'tellraw {player} '+json.dumps(parts))

    def ui(self,online,operators):
        if self.clock()-self.ui_at<1:return []
        self.ui_at=self.clock();text,self.ui_offset=self._read(self.ui_offset);requests=[]
        for player,value in re.findall(r'^\[\d{2}:\d{2}:\d{2} INFO\]: \[([A-Za-z0-9_]{1,16}): Triggered \[lab_world\] \(set value to (\d+)\)\]\s*$',text,re.MULTILINE):
            if player in online and player in operators:requests.append((player,int(value)))
        for player in online:
            if player in operators:self.command(f'scoreboard players enable {player} lab_world')
        return requests
