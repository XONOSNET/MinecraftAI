"""Persistent, named spectator sessions. Commands contain only validated names/numbers."""
import copy
import json
import math
import re
import time
from pathlib import Path
from .config import is_agent

VIEWS=('first_person','trail','side','overhead','orbit','stationary')
DIMENSIONS=('minecraft:overworld','minecraft:the_nether','minecraft:the_end')
MODES=('survival','creative','adventure','spectator')

def player_name(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_]{3,16}',value):raise ValueError('Choose a valid Minecraft player')
    if re.fullmatch(r'LabAI[0-9]+',value,re.IGNORECASE):raise ValueError('The observer must be a human player, not a training bot')
    return value

def camera_move(target,tag,view,distance,height,elapsed):
    if view=='stationary':return f'execute as @e[tag={tag},limit=1] at @s run tp @s ~ ~ ~ facing entity {target} eyes'
    if view=='overhead':offset=f'~ ~{height+distance:.3f} ~';context=''
    elif view=='orbit':
        angle=elapsed*.22;offset=f'~{math.cos(angle)*distance:.3f} ~{height:.3f} ~{math.sin(angle)*distance:.3f}';context=''
    else:
        offset=f"^{distance if view=='side' else 0:.3f} ^{height:.3f} ^{-distance if view=='trail' else 0:.3f}";context=f' rotated as {target} rotated ~ 0'
    return f'execute at {target}{context} run tp @e[tag={tag},limit=1] {offset} facing entity {target} eyes'

def viewer_transfer(owner,target,view,distance,height,elapsed):
    if view=='first_person':return f'tp {owner} {target}'
    return camera_move(target,'transfer',view,distance,height,elapsed).replace('@e[tag=transfer,limit=1]',owner)

def camera_spawn(owner,target,tag,view,distance,height,elapsed):
    nbt=f'{{teleport_duration:3,interpolation_duration:3,view_range:2f,Invulnerable:1b,Silent:1b,Tags:["{tag}","lab_observer_camera"]}}'
    if view=='stationary':return f'execute at {owner} run summon minecraft:item_display ~ ~ ~ {nbt}'
    prefix,tail=camera_move(target,tag,view,distance,height,elapsed).split(' run tp ',1)
    coordinates=tail.split(' facing entity ',1)[0].split(' ',1)[1]
    return f'{prefix} positioned {coordinates} run summon minecraft:item_display ~ ~ ~ {nbt}'

class Observers:
    def __init__(self,path,command,clock=time.time,settle_delay=.8):
        self.path=Path(path);self.command=command;self.clock=clock;self.settle_delay=settle_delay;self.sessions={}
        if self.path.exists():self.sessions=json.loads(self.path.read_text(encoding='utf-8'))
        for s in self.sessions.values():s.update(hud_ready=False,hud_at=None,attached=False,attach_ready_at=None,camera_created=False,status='waiting',message='Waiting for Minecraft and your player to reconnect.')
    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True);tmp=self.path.with_suffix('.tmp');tmp.write_text(json.dumps(self.sessions,indent=2),encoding='utf-8');tmp.replace(self.path)
    def snapshot(self):return {'views':list(VIEWS),'sessions':copy.deepcopy(list(self.sessions.values()))}
    def start(self,request,known):
        owner=player_name(request.get('player','Xonosnet'));names={n.casefold():n for n in known}
        if owner.casefold() not in names:raise ValueError('That observer has not joined this server yet')
        owner=names[owner.casefold()];target=request.get('target');view=request.get('view','trail')
        if not isinstance(target,str) or not is_agent(target):raise ValueError('Choose a configured training bot')
        if view not in VIEWS:raise ValueError('Choose a supported camera view')
        try:distance=float(request.get('distance',7));height=float(request.get('height',4))
        except (ValueError,TypeError):raise ValueError('Enter numeric camera distance and height')
        if not math.isfinite(distance) or not 3<=distance<=16 or not math.isfinite(height) or not 2<=height<=12:raise ValueError('Camera distance must be 3–16 blocks and height 2–12')
        s=self.sessions.get(owner,{'player':owner,'saved_mode':None,'return_created':False})
        s.update(enabled=True,target=target,view=view,distance=distance,height=height,attached=False,attach_ready_at=None,
                 camera_created=False,status='waiting',message='Waiting for your player and the selected bot. Follow will start automatically when both are online.',started_at=self.clock())
        self.sessions[owner]=s;self.save();return copy.deepcopy(s)
    def tags(self,s):
        suffix=s['player'].lower();return 'lab_camera_'+suffix,'lab_return_'+suffix
    def kill_camera(self,s):
        camera,_=self.tags(s)
        for dimension in DIMENSIONS:self.command(f'execute in {dimension} run kill @e[tag={camera}]')
        s.update(camera_created=False,attached=False,attach_ready_at=None)
    def clear_hud(self,s):
        for suffix in ('task','state'):
            self.command(f"bossbar remove lab:observer_{s['player'].lower()}_{suffix}")
        s.pop('hud_ready',None);s.pop('hud_at',None)
    def update_hud(self,s,agent,mode):
        now=self.clock()
        if s.get('hud_at') is not None and now-s['hud_at']<1:return
        s['hud_at']=now
        owner=s['player'];prefix=f'lab:observer_{owner.lower()}'
        labels=('Moving forward','Turning left','Turning right','Jumping forward','Waiting','Gathering wood','Eating')
        action=agent.get('action',4)
        fresh=now-agent.get('last_seen',0)<=8 and agent.get('connected',False)
        activity=labels[action] if type(action) is int and 0<=action<len(labels) else 'Waiting'
        controller={'teacher':'Teacher demonstration','heuristic':'Teacher reference','evaluate':'Neural policy','untrained':'Untrained policy','random':'Random actions','paused':'Paused / training'}.get(mode,mode)
        if not fresh:activity='Waiting for bot telemetry'
        elif mode=='paused':activity=getattr(self,'pause_reason','Movement paused')
        elif s.get('status')!='following':activity=s.get('status','waiting').replace('_',' ')
        health=max(0,min(20,round(agent.get('health',0))))
        lines={'task':f"{s['target']} | {agent.get('simulation','Waiting')} | {controller}",
               'state':f"{activity} | HP {health}/20 | Food {agent.get('food',0):.0f}/20"}
        position=agent.get('position');goal=agent.get('goal')
        if fresh and position and goal:
            lines['state']+=f" | Goal {math.dist(position,goal):.1f} blocks"
        progress=0
        if fresh and position and goal:
            distance=math.dist(position,goal)
            if s.get('progress_run')!=agent.get('run') or agent.get('steps',0)<s.get('progress_steps',0) or s.get('progress_goal')!=goal:
                s.update(progress_start=max(distance,1),progress_run=agent.get('run'),progress_goal=copy.deepcopy(goal))
            s['progress_steps']=agent.get('steps',0)
            progress=round(100*max(0,min(1,1-distance/s.get('progress_start',max(distance,1)))))
        context=getattr(self,'progress_context',{});job=context.get('job',{})
        total=context.get('episodes',3);completed=min(total,agent.get('trial_completed',0))
        trial=min(total,completed+1)
        if context and mode in ('evaluate','untrained','random','heuristic'):
            lines['task']=f"{s['target']} | Trial {trial}/{total} | {total-completed} left"
            lines['state']=f"{activity} | Trials completed {completed}/{total}"
            progress=round(100*completed/total)
        elif mode=='teacher':
            count=context.get('examples',0);target=max(1,context.get('target',1500))
            lines['task']=f"{s['target']} | Demo pass {agent.get('trial',1)}"
            lines['state']=f"Examples {count}/{target} | {max(0,target-count)} left"
            progress=min(100,round(100*count/target))
        else:lines['task']+=' | Route progress'
        if job.get('status') in ('running','cancelling'):
            epoch=job.get('epoch',0);epochs=job.get('epochs',100)
            lines['task']=f"Training pass {epoch}/{epochs} | {max(0,epochs-epoch)} left"
            lines['state']=f"{job.get('phase','Preparing').title()} | {job.get('samples',0):,} examples | {job.get('percent',0):.0f}%"
            progress=round(job.get('percent',0))
        if mode=='paused' and job.get('status') not in ('running','cancelling'):lines['task']=f"{s['target']} | Paused";lines['state']=activity[:95]
        if not fresh:lines['state']='Waiting for bot telemetry';progress=0
        for suffix,value in lines.items():
            key=prefix+'_'+suffix;name=json.dumps({'text':value,'color':'aqua' if suffix=='task' else 'white'})
            if not s.get('hud_ready'):
                self.command(f'bossbar remove {key}')
                self.command(f'bossbar add {key} {name}')
                self.command(f'bossbar set {key} color '+('blue' if suffix=='task' else 'green'))
                self.command(f'bossbar set {key} max 100')
            self.command(f'bossbar set {key} name {name}')
            self.command(f'bossbar set {key} value {progress}')
            self.command(f'bossbar set {key} players {owner}')
        s['hud_ready']=True
    def update_roster(self,online,agents,mode):
        now=self.clock()
        if now-getattr(self,'roster_at',-100)<1:return
        self.roster_at=now
        active=any(s.get('enabled') and s['player'] in online for s in self.sessions.values())
        if not active:
            if getattr(self,'roster_ready',False):self.command('scoreboard objectives remove lab_bots');self.roster_ready=False
            return
        if not getattr(self,'roster_ready',False):
            self.command('scoreboard objectives remove lab_bots')
            self.command('scoreboard objectives add lab_bots dummy {"text":"AI activity","color":"aqua"}')
            self.command('scoreboard objectives modify lab_bots numberformat blank')
            self.command('scoreboard objectives setdisplay sidebar lab_bots')
            self.roster_ready=True;self.roster_rows={}
        labels=('Forward','Turn left','Turn right','Jump','Wait','Gather','Eat')
        from .config import AGENT_COUNT
        for index in range(AGENT_COUNT):
            name=f'LabAI{index}';a=agents.get(name,{})
            fresh=a.get('connected') and now-a.get('last_seen',0)<8
            action=a.get('action',4)
            activity='Offline' if not fresh else 'Training / paused' if mode=='paused' else labels[action] if type(action) is int and 0<=action<len(labels) else 'Wait'
            if fresh and mode!='paused' and a.get('speed',1)<.05 and action in (0,3):activity='Blocked / no movement'
            row=f'{name}: {activity}'
            previous=self.roster_rows.get(name)
            if previous==row:continue
            self.command(f'scoreboard players set {name} lab_bots {100-index}')
            self.command(f'scoreboard players display name {name} lab_bots '+json.dumps({'text':row}))
            self.roster_rows[name]=row
    def release(self,s,online,mode_restore=True):
        self.clear_hud(s)
        owner=s['player'];_,ret=self.tags(s)
        if owner not in online:
            s.update(status='restore_pending',message='Your previous game mode and return point will be restored when you reconnect.');return False
        self.command(f'execute as {owner} run spectate')
        if s.get('return_created'):
            for dimension in DIMENSIONS:
                self.command(f'execute in {dimension} as @e[tag={ret},limit=1] at @s run tp {owner} ~ ~ ~ ~ ~')
                self.command(f'execute in {dimension} run kill @e[tag={ret}]')
        if mode_restore and s.get('saved_mode') is not None:self.command(f"gamemode {MODES[s['saved_mode']]} {owner}")
        s.update(saved_mode=None,return_created=False,attached=False,status='stopped',message='Follow stopped. Your previous game mode and starting position were restored.')
        return True
    def stop(self,owner,online,ready=True):
        owner=player_name(owner);key=next((n for n in self.sessions if n.casefold()==owner.casefold()),owner)
        if key not in self.sessions:return {'enabled':False,'player':owner,'status':'stopped','message':'No follow session is active.'}
        s=self.sessions[key];s['enabled']=False
        if ready:self.clear_hud(s)
        if not ready:
            s.update(attached=False,status='restore_pending' if s.get('saved_mode') is not None else 'stopped',message='Follow disabled. Your previous game mode and return point will be restored when Minecraft and your player reconnect.')
            self.save();return copy.deepcopy(s)
        if s.get('saved_mode') is not None:self.release(s,online)
        else:s.update(status='stopped',message='Follow stopped.')
        self.kill_camera(s);self.save();return copy.deepcopy(s)
    def suspend(self,online):
        for s in self.sessions.values():
            if s.get('saved_mode') is not None:self.release(s,online)
            self.kill_camera(s)
            if s['enabled']:s.update(status='waiting',message='Waiting for the server and player to reconnect.')
        self.save()
    def tick(self,online,states,agents,ready,mode='paused',pause_reason='Movement paused',progress_context=None):
        if not ready:return
        self.progress_context=progress_context or {}
        self.pause_reason=pause_reason
        self.update_roster(online,agents,mode)
        for s in self.sessions.values():
            owner=s['player']
            if not s['enabled']:
                if s.get('saved_mode') is not None and owner in online:self.release(s,online);self.kill_camera(s);self.save()
                continue
            if owner not in online:
                if s.get('hud_ready'):self.clear_hud(s)
                s.update(attached=False,attach_ready_at=None,status='waiting_player',message='Join Minecraft to start or resume following.');continue
            target=s['target'];agent=agents.get(target,{})
            if not agent.get('connected',False) or self.clock()-agent.get('last_seen',0)>8 or agent.get('health',20)<=0:
                s.update(attached=False,attach_ready_at=None,status='waiting_target',message=f'Waiting for {target} to connect or respawn.')
                self.update_hud(s,agent,mode);continue
            state=states.get(owner,{})
            if s.get('saved_mode') is None:
                if self.clock()-state.get('seen',0)>15 or state.get('mode') not in range(4):
                    s.update(status='waiting_player_state',message='Reading your current game mode before entering spectator view.');continue
                s['saved_mode']=state['mode'];camera,ret=self.tags(s)
                for dimension in DIMENSIONS:self.command(f'execute in {dimension} run kill @e[tag={ret}]')
                self.command(f'execute at {owner} run summon minecraft:marker ~ ~ ~ {{Tags:["{ret}","lab_observer_return"]}}')
                self.command(f'execute at {owner} rotated as {owner} run tp @e[tag={ret},limit=1] ~ ~ ~ ~ ~')
                s['return_created']=True;self.command(f'gamemode spectator {owner}');self.save()
            dimension=agent.get('dimension','overworld');token=(agent.get('entity_id'),dimension)
            position=agent.get('position');previous=s.get('last_target_position')
            jumped=position is not None and previous is not None and math.dist(position,previous)>24
            changed_run=s.get('follow_run')!=agent.get('run')
            mobile=s['view']!='stationary'
            if token!=tuple(s.get('target_token',[])) or (mobile and (jumped or changed_run)):
                s.update(target_token=list(token),attached=False,attach_ready_at=None)
            s.update(last_target_position=copy.deepcopy(position),follow_run=agent.get('run'))
            camera,ret=self.tags(s)
            if not s['attached']:
                if s.get('attach_ready_at') is None:
                    self.command(f'execute as {owner} run spectate')
                    self.command(f'gamemode spectator {owner}')
                    self.kill_camera(s)
                    if mobile:self.command(viewer_transfer(owner,target,s['view'],s['distance'],s['height'],self.clock()-s['started_at']))
                    s.update(attach_ready_at=self.clock()+(self.settle_delay if mobile else 0),status='transferring',message=f'Moving your viewpoint to {target} and loading the simulation before attaching the camera.')
                    self.save()
                if self.clock()<s['attach_ready_at']:
                    self.update_hud(s,agent,mode);continue
                if s['view']=='first_person':self.command(f'spectate {target} {owner}')
                else:
                    self.kill_camera(s)
                    anchor=owner if s['view']=='stationary' else target
                    self.command(camera_spawn(owner,target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at']))
                    self.command(camera_move(target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at']))
                    self.command(f"execute at {owner if s['view']=='stationary' else target} run spectate @e[tag={camera},limit=1] {owner}");s['camera_created']=True
                s.update(attached=True,attach_ready_at=None,attached_at=self.clock());self.save()
            if s['view']!='first_person':self.command(camera_move(target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at']))
            s.update(status='following',message=(f"Watching {target} from a stationary position. Switch bots to look around; use a following view to travel between arenas." if s['view']=='stationary' else f"Following {target}: {s['view'].replace('_',' ')}. Camera follows arena transfers and respawns."),simulation=agent.get('simulation','Waiting'),target_position=agent.get('position'))

            self.update_hud(s,agent,mode)
