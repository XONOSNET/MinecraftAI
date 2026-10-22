"""Persistent, named spectator sessions. Commands contain only validated names/numbers."""
import copy
import json
import math
import re
import time
from pathlib import Path
from .config import is_agent

VIEWS=('first_person','trail','side','overhead','orbit','stationary','cycle')
DIMENSIONS=('minecraft:overworld','minecraft:the_nether','minecraft:the_end')
MODES=('survival','creative','adventure','spectator')

def player_name(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_]{3,16}',value):raise ValueError('Choose a valid Minecraft player')
    if re.fullmatch(r'LabAI[0-9]+',value,re.IGNORECASE):raise ValueError('The observer must be a human player, not a training bot')
    return value

def camera_move(target,tag,view,distance,height,elapsed,heading=0):
    if view=='stationary':return f'execute at {target} run rotate @e[tag={tag},limit=1] facing ~ ~0.9 ~'
    if view=='overhead':offset=f'~ ~{height+distance:.3f} ~';context=''
    elif view=='orbit':
        angle=elapsed*.22;offset=f'~{math.cos(angle)*distance:.3f} ~{height:.3f} ~{math.sin(angle)*distance:.3f}';context=''
    else:
        angle=heading-(math.pi/2 if view=='side' else math.pi)
        offset=f'~{math.cos(angle)*distance:.3f} ~{height:.3f} ~{math.sin(angle)*distance:.3f}';context=''
    return f'execute at {target}{context} run tp @e[tag={tag},limit=1] {offset} facing ~ ~0.9 ~'

def viewer_transfer(owner,target,view,distance,height,elapsed,heading=0):
    if view=='first_person':return f'tp {owner} {target}'
    return camera_move(target,'transfer',view,distance,height,elapsed,heading).replace('@e[tag=transfer,limit=1]',owner)

def camera_rotation(view,distance,height,elapsed,heading=0):
    if view=='overhead':return 0,90
    angle=elapsed*.22 if view=='orbit' else heading-(math.pi/2 if view=='side' else math.pi)
    x,z=math.cos(angle)*distance,math.sin(angle)*distance
    return math.degrees(math.atan2(x,-z)),math.degrees(math.atan2(height-.9,distance))

def camera_spawn(owner,target,tag,view,distance,height,elapsed,heading=0):
    yaw,pitch=camera_rotation(view,distance,height,elapsed,heading)
    nbt=f'{{Rotation:[{yaw:.5f}f,{pitch:.5f}f],teleport_duration:0,interpolation_duration:3,view_range:2f,Invulnerable:1b,Silent:1b,Tags:["{tag}","lab_observer_camera"]}}'
    if view=='stationary':return f'execute at {owner} run summon minecraft:item_display ~ ~ ~ {nbt}'
    prefix,tail=camera_move(target,tag,view,distance,height,elapsed,heading).split(' run tp ',1)
    coordinates=tail.split(' facing ',1)[0].split(' ',1)[1]
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
        if not math.isfinite(distance) or not 3<=distance<=16 or not math.isfinite(height) or not 2<=height<=12:raise ValueError('Camera distance must be 3â€“16 blocks and height 2â€“12')
        cycle_enabled=request.get('cycle_enabled',view=='cycle')
        if type(cycle_enabled) is not bool:raise ValueError('Cycle bots must be enabled or disabled')
        try:cycle_seconds=float(request.get('cycle_seconds',30))
        except (TypeError,ValueError):raise ValueError('Cycle interval must be 5-3600 seconds')
        if not math.isfinite(cycle_seconds) or not 5<=cycle_seconds<=3600:raise ValueError('Cycle interval must be 5-3600 seconds')
        s=self.sessions.get(owner,{'player':owner,'saved_mode':None,'return_created':False})
        s.update(cycle_enabled=cycle_enabled,cycle_seconds=cycle_seconds,cycle_at=self.clock()+cycle_seconds,enabled=True,target=target,view='trail' if view=='cycle' else view,distance=distance,height=height,attached=False,attach_ready_at=None,
                 camera_created=False,status='waiting',message='Waiting for your player and the selected bot. Follow will start automatically when both are online.',started_at=self.clock())
        self.sessions[owner]=s;self.save();return copy.deepcopy(s)
    def next_bot(self,owner,agents):
        owner=player_name(owner)
        s=next((v for k,v in self.sessions.items() if k.casefold()==owner.casefold()),None)
        if not s or not s.get('enabled') or not s.get('cycle_enabled'):raise ValueError('Enable Cycle bots before using Next AI')
        available=sorted(n for n,a in agents.items() if is_agent(n) and a.get('connected') and self.clock()-a.get('last_seen',0)<8 and a.get('health',20)>0)
        if not available:raise ValueError('No AI bots are online')
        index=available.index(s['target']) if s['target'] in available else -1
        s.update(target=available[(index+1)%len(available)],attached=False,attach_ready_at=None,cycle_at=self.clock()+s.get('cycle_seconds',30))
        self.save();return copy.deepcopy(s)
    def tags(self,s):
        suffix=s['player'].lower();return 'lab_camera_'+suffix,'lab_return_'+suffix
    def kill_camera(self,s):
        camera,_=self.tags(s)
        for dimension in DIMENSIONS:self.command(f'execute in {dimension} run kill @e[tag={camera}]')
        s.update(camera_created=False,attached=False,attach_ready_at=None)
    def clear_hud(self,s):
        for suffix in ('stage','task','state'):
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
        if agent.get('skill')=='advanced' and action==5:activity='Opening door'
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
        if mode in ('evaluate','untrained','random','heuristic') and completed>=total:activity='Trials finished; waiting for other bots'
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
        if fresh and mode!='paused' and agent.get('reset_seconds') is not None:
            lines['state']+=f" | Reset ~{agent['reset_seconds']}s ({agent.get('reset_steps_left',0)} steps left)"
        if not fresh:lines['state']='Waiting for bot telemetry';progress=0
        if context.get('stage'):
            lines={'stage':(f"Review {context['round']} | " if context.get('round') else '')+f"Stage {context['stage']} of {context['stages']} | {context['stage_name']}",**lines}
        for suffix,value in lines.items():
            key=prefix+'_'+suffix;name=json.dumps({'text':value,'color':'aqua' if suffix=='task' else 'white'})
            if not s.get('hud_ready'):
                self.command(f'bossbar remove {key}')
                self.command(f'bossbar add {key} {name}')
                self.command(f'bossbar set {key} color '+('yellow' if suffix=='stage' else 'blue' if suffix=='task' else 'green'))
                self.command(f'bossbar set {key} max 100')
            self.command(f'bossbar set {key} name {name}')
            value=round(100*(context['stage']-1)/context['stages']) if suffix=='stage' else progress
            self.command(f'bossbar set {key} value {value}')
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
            activity='Offline' if not fresh else 'Training' if mode=='paused' and getattr(self,'progress_context',{}).get('job',{}).get('status') in ('running','cancelling') else 'Paused' if mode=='paused' else labels[action] if type(action) is int and 0<=action<len(labels) else 'Wait'
            if fresh and mode!='paused' and a.get('speed',1)<.05 and action in (0,3):activity='Blocked'
            if fresh and mode!='paused' and a.get('reset_seconds') is not None:activity+=f" ~{a['reset_seconds']}s"
            if a.get('skill')=='advanced' and action==5:activity='Open door'
            if mode in ('evaluate','untrained','random','heuristic') and a.get('trial_completed',0)>=getattr(self,'progress_context',{}).get('episodes',3):activity='Done; waiting'
            row=f"{name}: {activity}"
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
            if s.get('cycle_enabled') and self.clock()>=s.get('cycle_at',0):
                available=sorted(n for n,a in agents.items() if is_agent(n) and a.get('connected') and self.clock()-a.get('last_seen',0)<8 and a.get('health',20)>0)
                if available:
                    current=available.index(s['target']) if s['target'] in available else -1
                    s.update(target=available[(current+1)%len(available)],attached=False,attach_ready_at=None,cycle_at=self.clock()+s.get('cycle_seconds',30))
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
            # Travel bearing is independent of the bot's head/look rotation.
            motion_key=(target,*token,agent.get('run'))
            if list(motion_key)!=s.get('motion_key') or jumped:
                s.update(motion_key=list(motion_key),motion_anchor=copy.deepcopy(position),camera_heading=0,travel_heading=0)
            anchor=s.get('motion_anchor')
            if position is not None and anchor is not None:
                dx,dz=position[0]-anchor[0],position[2]-anchor[2]
                if math.hypot(dx,dz)>=.75:
                    s.update(travel_heading=math.atan2(dz,dx),motion_anchor=copy.deepcopy(position))
            elif position is not None:s['motion_anchor']=copy.deepcopy(position)
            heading=s.get('camera_heading',0)
            delta=(s.get('travel_heading',heading)-heading+math.pi)%(2*math.pi)-math.pi
            s['camera_heading']=heading+max(-.025,min(.025,delta))
            s.update(last_target_position=copy.deepcopy(position),follow_run=agent.get('run'))
            camera,ret=self.tags(s)
            if not s['attached']:
                if s.get('attach_ready_at') is None:
                    # Align the player's own view before detaching from the old camera.
                    if s['view']!='first_person':self.command(viewer_transfer(owner,target,s['view'],s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0)))
                    self.command(f'execute as {owner} run spectate')
                    self.command(f'gamemode spectator {owner}')
                    self.kill_camera(s)
                    if mobile:self.command(viewer_transfer(owner,target,s['view'],s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0)))
                    s.update(attach_ready_at=self.clock()+(self.settle_delay if mobile else 0),status='transferring',message=f'Moving your viewpoint to {target} and loading the simulation before attaching the camera.')
                    self.save()
                if self.clock()<s['attach_ready_at']:
                    self.update_hud(s,agent,mode);continue
                if s['view']=='first_person':self.command(f'spectate {target} {owner}')
                else:
                    self.kill_camera(s)
                    anchor=owner if s['view']=='stationary' else target
                    self.command(camera_spawn(owner,target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0)))
                    self.command(camera_move(target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0)))
                    self.command(f'execute at {target} run data merge entity @e[tag={camera},limit=1] {{teleport_duration:3}}')
                    self.command(f"execute at {owner if s['view']=='stationary' else target} run spectate @e[tag={camera},limit=1] {owner}");s['camera_created']=True
                s.update(attached=True,attach_ready_at=None,attached_at=self.clock());self.save()
            if s['view']!='first_person':self.command(camera_move(target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0)))
            s.update(status='following',message=(f"Watching {target} from a stationary position. Switch bots to look around; use a following view to travel between arenas." if s['view']=='stationary' else f"Following {target}: {s['view'].replace('_',' ')}. Camera follows arena transfers and respawns."),simulation=agent.get('simulation','Waiting'),target_position=agent.get('position'))

            self.update_hud(s,agent,mode)
