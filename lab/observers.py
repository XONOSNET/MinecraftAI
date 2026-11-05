"""Persistent, named spectator sessions. Commands contain only validated names/numbers."""
import copy
import json
import math
import re
import time
from pathlib import Path
from .config import is_agent, EPISODES_PER_AGENT

VIEWS=('first_person','trail','side','overhead','orbit','action','shoulder','stationary','cycle')
DIMENSIONS=('minecraft:overworld','minecraft:the_nether','minecraft:the_end')
CAMERA_INTERPOLATION_TICKS=4
MODES=('survival','creative','adventure','spectator')

def trial_timer(world,now):
    if not world or world.get('phase') not in ('running','finished'):return None
    start=world.get('trial_at');end=world.get('finished_at') if world.get('phase')=='finished' else now
    if any(type(v) not in (int,float) or not math.isfinite(v) for v in (start,end)):return None
    seconds=max(0,int(end-start));hours,rest=divmod(seconds,3600);minutes,seconds=divmod(rest,60)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d}' if hours else f'{minutes:02d}:{seconds:02d}'

def latest_policy_result(world,history):
    if not world:return None
    for trial in reversed(history):
        if trial.get('driver')!='student' or trial.get('assessment') or trial.get('mission')!=world.get('mission') or trial.get('night_level')!=world.get('night_level'):continue
        return dict(completed=sum(r.get('state')=='complete' for r in trial.get('results',{}).values()),bots=len(trial['bots']),run=trial['run'])
    return None

def first_night_label(world,last_policy=None):
    prefix='First Night '+str(world['night_level'])
    phase=world['phase'];total=len(world['bots'])
    if phase in ('snapshotting','restoring'):
        detail=('Saving terrain' if phase=='snapshotting' else 'Restoring terrain')+' '+str(round(world.get('progress',0)))+'%'
        if world.get('memory_hold'):detail+=' | Waiting for memory'
    elif phase!='running':detail=phase.replace('_',' ').title()
    else:
        done=sum(r.get('state')=='complete' for r in world['results'].values())
        stopped=sum(r.get('state')=='stopped' for r in world['results'].values())
        driver='Teacher' if world['driver']=='teacher' else 'Policy'
        detail=f'{driver}: {done}/{total} complete'+(f', {stopped} stopped' if stopped else '')
    if last_policy:detail+=f" | Last policy {last_policy['completed']}/{last_policy['bots']}"
    return prefix+' | '+detail

def observer_progress(state,stages,mode,practice,job,episodes,run=None,world=None,world_history=()):
    if world:
        return dict(run=run,mode=mode,label=f"World trial {world['round']}",round=0,stage=1,stages=1,stage_name=world['name'],job=job,phase=world['phase'],examples=0,target=1,episodes=1,world=world,last_policy=latest_policy_result(world,world_history))
    stage=state['stage'];label=(f"Review {state.get('round',0)}" if state.get('round') else '')
    if state.get('queued_active'):label='Queued teacher' if state['queued_active']['driver']=='teacher' else 'Queued test'
    if not state.get('enabled'):
        label='Paused'
        if practice and mode in ('heuristic','evaluate'):
            stage=practice['stage'];label='Teacher reference' if mode=='heuristic' else 'Policy practice'
    return {'run':run,'mode':mode,'label':label,'round':state.get('round',0),'stage':stage+1,'stages':len(stages),
            'stage_name':stages[stage]['name'],'job':job,'phase':state.get('phase'),
            'examples':state.get('collected',0),'target':stages[stage].get('examples_per_cycle',state['examples_per_cycle']),'episodes':episodes}

def player_name(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_]{3,16}',value):raise ValueError('Choose a valid Minecraft player')
    if re.fullmatch(r'LabAI[0-9]+',value,re.IGNORECASE):raise ValueError('The observer must be a human player, not a training bot')
    return value

# Eight framing keyframes blend continuously, including the loop boundary.
ACTION_SHOTS=(('Chase',-math.pi,1,.9),('Right tracking',-math.pi/2,.85,.7),
              ('Front reveal',0,1.15,.8),('Crane sweep',math.pi/2,.65,2.1),
              ('Wide orbit',math.pi,1.4,1.4),('Left tracking',3*math.pi/2,.9,.7),
              ('Low front',2*math.pi,.75,.6),('High establishing',5*math.pi/2,1.3,1.8))

def framing_spline(values,index,u):
    a,b,c,d=(values[(index+i)%len(values)] for i in (-1,0,1,2))
    def tangent(left,right):return 2*left*right/(left+right) if left*right>0 else 0
    m=tangent(b-a,c-b);n=tangent(c-b,d-c)
    return (2*u**3-3*u*u+1)*b+(u**3-2*u*u+u)*m+(-2*u**3+3*u*u)*c+(u**3-u*u)*n


def smooth_heading(heading,target,velocity,dt):
    dt=max(0,min(.25,dt))
    delta=(target-heading+math.pi)%(2*math.pi)-math.pi
    desired=max(-.8,min(.8,delta/.5))
    velocity+=(desired-velocity)*(1-math.exp(-dt/.18))
    step=velocity*dt
    if delta*step>=0 and abs(step)>=abs(delta):return heading+delta,0
    return heading+step,velocity


def action_pose(distance,height,elapsed,heading=0):
    phase=max(0,elapsed)/12;index=int(phase)%len(ACTION_SHOTS);u=phase%1
    # Keep travelling through shot boundaries instead of braking to zero at
    # each keyframe. Monotone framing splines stay within the allowed range.
    angle=heading-math.pi+phase*math.pi/2
    radius=framing_spline([max(1,min(16,distance*s[2])) for s in ACTION_SHOTS],index,u)
    elevation=framing_spline([max(3.2,min(12,height*s[3])) for s in ACTION_SHOTS],index,u)
    return math.cos(angle)*radius,elevation,math.sin(angle)*radius,ACTION_SHOTS[index][0]

def shoulder_context(target,distance,height):
    # Raise the pivot in world space, then orbit behind the full look rotation.
    # Minecraft pitch is negative upward: looking up moves the camera down
    # behind the shoulder while its gaze continues upward along the eye ray.
    elevation=1.6+(height-2)*.15
    return f'execute at {target} positioned ~ ~{elevation:.3f} ~ rotated as {target} positioned ^-0.900 ^0 ^{-distance:.3f}'


def shoulder_aim(target,tag):
    # Aim at the bot's eye ray ahead, rather than at its torso behind the action.
    return f'execute at {target} rotated as {target} anchored eyes positioned ^ ^ ^24 run rotate @e[tag={tag},limit=1] facing ~ ~ ~'


def camera_move(target,tag,view,distance,height,elapsed,heading=0):
    if view=='shoulder':return f'{shoulder_context(target,distance,height)} rotated as {target} run tp @e[tag={tag},limit=1] ~ ~ ~ ~ ~'
    if view=='stationary':return f'execute at {target} run rotate @e[tag={tag},limit=1] facing ~ ~0.9 ~'
    if view=='action':
        x,y,z,_=action_pose(distance,height,elapsed,heading);offset=f'~{x:.3f} ~{y:.3f} ~{z:.3f}';context=''
    elif view=='overhead':offset=f'~ ~{height+distance:.3f} ~';context=''
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
    if view=='action':
        x,y,z,_=action_pose(distance,height,elapsed,heading)
        return math.degrees(math.atan2(x,-z)),math.degrees(math.atan2(y-.9,math.hypot(x,z)))
    if view=='overhead':return 0,90
    angle=elapsed*.22 if view=='orbit' else heading-(math.pi/2 if view=='side' else math.pi)
    x,z=math.cos(angle)*distance,math.sin(angle)*distance
    return math.degrees(math.atan2(x,-z)),math.degrees(math.atan2(height-.9,distance))

def camera_spawn(owner,target,tag,view,distance,height,elapsed,heading=0):
    yaw,pitch=camera_rotation(view,distance,height,elapsed,heading)
    nbt=f'{{Rotation:[{yaw:.5f}f,{pitch:.5f}f],teleport_duration:0,interpolation_duration:3,view_range:2f,Invulnerable:1b,Silent:1b,Tags:["{tag}","lab_observer_camera"]}}'
    if view=='shoulder':return f'{shoulder_context(target,distance,height)} run summon minecraft:item_display ~ ~ ~ {nbt}'
    if view=='stationary':return f'execute at {owner} run summon minecraft:item_display ~ ~ ~ {nbt}'
    prefix,tail=camera_move(target,tag,view,distance,height,elapsed,heading).split(' run tp ',1)
    coordinates=tail.split(' facing ',1)[0].split(' ',1)[1]
    return f'{prefix} positioned {coordinates} run summon minecraft:item_display ~ ~ ~ {nbt}'

class Observers:
    def __init__(self,path,command,clock=time.time,settle_delay=.8):
        self.path=Path(path);self.command=command;self.clock=clock;self.settle_delay=settle_delay;self.sessions={};self.progress_context={};self.camera_mode='paused'
        self.external_motion=False;self.motion_frames={};self.hud_commands={};self.motion_stats={'last_at':None,'ticks':0,'max_gap_ms':0}
        if self.path.exists():self.sessions=json.loads(self.path.read_text(encoding='utf-8'))
        for s in self.sessions.values():s.setdefault('active_only',True);s.update(hud_ready=False,hud_at=None,attached=False,attach_ready_at=None,camera_created=False,status='waiting',message='Waiting for Minecraft and your player to reconnect.')
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
        if not math.isfinite(distance) or not 1<=distance<=16 or not math.isfinite(height) or not 2<=height<=12:raise ValueError('Camera distance must be 1–16 blocks and height 2–12')
        cycle_enabled=request.get('cycle_enabled',view=='cycle')
        if type(cycle_enabled) is not bool:raise ValueError('Cycle bots must be enabled or disabled')
        active_only=request.get('active_only',True)
        if type(active_only) is not bool:raise ValueError('Follow active bots only must be enabled or disabled')
        try:cycle_seconds=float(request.get('cycle_seconds',30))
        except (TypeError,ValueError):raise ValueError('Cycle interval must be 5-3600 seconds')
        if not math.isfinite(cycle_seconds) or not 5<=cycle_seconds<=3600:raise ValueError('Cycle interval must be 5-3600 seconds')
        s=self.sessions.get(owner,{'player':owner,'saved_mode':None,'return_created':False})
        s.update(active_only=active_only,cycle_waiting=False,cycle_enabled=cycle_enabled,cycle_seconds=cycle_seconds,cycle_at=self.clock()+cycle_seconds,enabled=True,target=target,view='trail' if view=='cycle' else view,distance=distance,height=height,attached=False,attach_ready_at=None,
                 camera_created=False,status='waiting',message='Waiting for your player and the selected bot. Follow will start automatically when both are online.',started_at=self.clock())
        self.sessions[owner]=s;self.save();return copy.deepcopy(s)
    def next_bot(self,owner,agents):
        owner=player_name(owner)
        s=next((v for k,v in self.sessions.items() if k.casefold()==owner.casefold()),None)
        if not s or not s.get('enabled'):raise ValueError('Start following a bot before using Next AI')
        self.cycle_target(s,agents)
        self.save();return copy.deepcopy(s)

    def adjust(self,owner,key):
        owner=player_name(owner)
        s=next((v for k,v in self.sessions.items() if k.casefold()==owner.casefold()),None)
        if not s or not s.get('enabled'):raise ValueError('Start following a bot first')
        views=('trail','side','overhead','orbit','action','first_person','shoulder')
        if key=='Enter':
            index=views.index(s['view']) if s['view'] in views else -1
            s.update(view=views[(index+1)%len(views)],attached=False,attach_ready_at=None)
        elif key in ('ArrowUp','ArrowDown','ArrowLeft','ArrowRight'):
            if s['view'] in ('first_person','stationary'):
                return {**copy.deepcopy(s),'message':'Choose a moving external view to adjust distance or height.'}
            field='distance' if key in ('ArrowUp','ArrowDown') else 'height'
            step=1 if key in ('ArrowUp','ArrowRight') else -1
            lower,upper=(1,16) if field=='distance' else (2,12)
            s[field]=max(lower,min(upper,s[field]+step))
        else:raise ValueError('Unsupported camera control')
        s['message']=f"Camera {s['view'].replace('_',' ')} | distance {s['distance']:g} | height {s['height']:g}"
        self.save();return copy.deepcopy(s)
    def cycle_candidates(self,s,agents):
        context=self.progress_context
        available=[]
        for name,agent in sorted(agents.items()):
            if not is_agent(name) or not agent.get('connected') or self.clock()-agent.get('last_seen',0)>=8 or agent.get('health',20)<=0:continue
            world=context.get('world')
            if s.get('active_only',True) and world:
                # World teachers are finite trials too. Use authoritative
                # results immediately, before the next telemetry poll arrives.
                if not world.get('active') or world.get('phase')!='running':continue
                if name not in world.get('bots',[]):continue
                if world.get('results',{}).get(name,{}).get('state') in ('complete','stopped'):continue
            elif s.get('active_only',True) and self.camera_mode!='teacher':
                # Counts belong to a run, never permanently to a bot or stage.
                if context.get('run') and agent.get('run')!=context['run']:continue
                if agent.get('trial_completed',0)>=context.get('episodes',EPISODES_PER_AGENT):continue
            available.append(name)
        return available
    def cycle_target(self,s,agents):
        available=self.cycle_candidates(s,agents)
        s.update(cycle_waiting=not bool(available),cycle_at=self.clock()+s.get('cycle_seconds',30))
        if not available:
            s['message']='No active bots remain; holding the current camera until trials resume.'
            return
        index=available.index(s['target']) if s['target'] in available else -1
        target=available[(index+1)%len(available)]
        if target!=s['target']:s.update(target=target,attached=False,attach_ready_at=None)
    def tags(self,s):
        suffix=s['player'].lower();return 'lab_camera_'+suffix,'lab_return_'+suffix
    def kill_camera(self,s):
        self.motion_frames.pop(s['player'],None)
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
        cache=self.hud_commands.setdefault(s['player'],{})
        if not s.get('hud_ready'):cache.clear()
        def emit(command):
            key=' '.join(command.split(' ')[:4])
            if not s.get('hud_ready') or cache.get(key)!=command:
                self.command(command);cache[key]=command

        display_name=agent.get('display_name') or s['target']
        owner=s['player'];prefix=f'lab:observer_{owner.lower()}'
        labels=('Moving forward','Turning left','Turning right','Jumping forward','Waiting','Gathering wood','Eating')
        action=agent.get('action',4)
        fresh=now-agent.get('last_seen',0)<=8 and agent.get('connected',False)
        activity=labels[action] if type(action) is int and 0<=action<len(labels) else 'Waiting'
        if agent.get('skill')=='expedition':activity=('Moving','Turn left','Turn right','Swim / climb','Waiting','Ascending','Descending')[action] if type(action) is int and 0<=action<7 else 'Waiting'
        if agent.get('skill')=='combat':activity=('Approaching monster','Aim left','Aim right','Back for spacing','Guard / cooldown','Equip gear','Attack monster')[action] if type(action) is int and 0<=action<7 else 'Waiting'
        if agent.get('skill')=='advanced' and action==5:activity='Opening door'
        controller={'teacher':'Teacher demonstration','heuristic':'Teacher reference','evaluate':'Neural policy','untrained':'Untrained policy','random':'Random actions','paused':'Paused / training'}.get(mode,mode)
        if agent.get('activity','').startswith(('Opening shelter door','Closing shelter door','Sheltered:','Sprinting ','Steering ','Turning to align','Opening door while','Waiting for policy','Waiting for valid','Wall ahead:','Reversing ','Crouching ','Recovering:')):activity=agent['activity']
        if not fresh:activity='Waiting for bot telemetry'
        elif mode=='paused':activity=getattr(self,'pause_reason','Movement paused')
        elif s.get('status')!='following':activity=s.get('status','waiting').replace('_',' ')
        health=max(0,min(20,round(agent.get('health',0))))
        lines={'task':f"{display_name} | {agent.get('simulation','Waiting')} | {controller}",
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
        if agent.get('skill')=='combat':
            m=agent.get('metrics') or {};progress=round(100*m.get('kills',0)/max(1,m.get('kill_target',0))) if m.get('kill_target') else (100 if m.get('weapon_equipped') and m.get('armor_equipped') else 0)
        route_progress=progress
        route_visible=bool(fresh and position and goal and mode!='paused');watch_visible=False
        context=getattr(self,'progress_context',{});job=context.get('job',{})
        total=context.get('episodes',3);completed=min(total,agent.get('trial_completed',0))
        trial=min(total,completed+1)
        if (mode in ('evaluate','untrained','random','heuristic') or context.get('phase')=='queued_teacher') and completed>=total:activity='Trials finished; waiting for other bots'
        if context and (mode in ('evaluate','untrained','random','heuristic') or context.get('phase')=='queued_teacher'):
            lines['task']=f"{display_name} | Trial {trial}/{total} | {total-completed} left"
            lines['state']=f"Route {route_progress}% | {activity}"
            if position and goal:lines['state']+=f" | Goal {math.dist(position,goal):.1f} blocks"
            if completed>=total:route_visible=False
            progress=round(100*completed/total)
        elif mode=='teacher':
            count=context.get('examples',0);target=max(1,context.get('target',1500))
            lines['task']=f"{display_name} | Demo {agent.get('trial',1)} | Examples {count}/{target}"
            lines['state']=f"Route {route_progress}% | {activity}"
            progress=min(100,round(100*count/target))
        else:lines['task']+=' | Route progress'
        if job.get('status') in ('running','cancelling'):
            epoch=job.get('epoch',0);epochs=job.get('epochs',100)
            lines['task']=f"Training pass {epoch}/{epochs} | {max(0,epochs-epoch)} left"
            lines['state']=f"{job.get('phase','Preparing').title()} | {job.get('samples',0):,} examples | {job.get('percent',0):.0f}%"
            progress=round(job.get('percent',0))
        if fresh and agent.get('skill')=='combat' and mode!='paused' and job.get('status') not in ('running','cancelling'):
            m=agent.get('metrics') or {};lines['state']=f"{activity} | Kills {m.get('kills',0)}/{m.get('kill_target',0)} | HP {health}/20"
        if mode=='paused' and job.get('status') not in ('running','cancelling'):lines['task']=f"{display_name} | Paused";lines['state']=activity[:95]
        if fresh and mode!='paused' and agent.get('reset_seconds') is not None:
            lines['state']+=f" | Reset ~{agent['reset_seconds']}s ({agent.get('reset_steps_left',0)} steps left)"
        if not fresh:lines['state']='Waiting for bot telemetry';progress=0
        world=context.get('world')
        if world and job.get('status') not in ('running','cancelling'):
            result=world['results'].get(s['target'],{});target=result.get('target_blocks',144);progress=round(100*result.get('blocks',0)/max(1,target))
            lines['task']=f"{display_name} | {result.get('phase',world['phase']).title()} | Hut {result.get('blocks',0)}/{target}"
            if result.get('lesson_total',1)>1:
                progress=round(100*len(result.get('milestones',[]))/result['lesson_total'])
                lines['task']=f"{display_name} | Lesson {result.get('lesson',1)}/{result['lesson_total']} | {result.get('phase',world['phase']).replace('_',' ').title()}"
            lines['state']=str(result.get('message',world['message']))[:110]
            if result.get('wilderness'):
                lines['state']=(result['wilderness'].get('priority','Survival').title()+' | '+str(result.get('message','')))[:110]
            route_visible=False
            if result.get('stall_seconds_left') is not None and result.get('state') not in ('complete','stopped'):
                lines['state']=f"No progress: attempt ends in {result['stall_seconds_left']}s | "+lines['state'][:65]
                route_visible=True;route_progress=round(100*(90-result['stall_seconds_left'])/90)
            sleep=(result.get('wilderness') or {}).get('sleep') or {}
            left=sleep.get('watch_seconds_left');duration=sleep.get('watch_seconds_total');updated=sleep.get('watch_updated_at')
            if fresh and mode!='paused' and world.get('phase')=='running' and result.get('phase')=='night_hold' and result.get('state')=='working' and type(left) in (int,float) and type(duration) in (int,float) and math.isfinite(left) and math.isfinite(duration) and duration>0:
                if type(updated) in (int,float) and math.isfinite(updated):left-=max(0,now-updated)
                # The minimum watch can expire before dawn or server-confirmed
                # waking. Keep its status visible until the lesson actually ends.
                left=max(0,math.ceil(left));watch_visible=True
                route_visible=watch_visible;route_progress=max(0,min(100,round(100*left/duration)))
                lines['state']=f"{display_name} | Shelter watch | {left//60}:{left%60:02d} remaining"
                if left==0:lines['state']=f"{display_name} | Shelter watch | 0:00 | "+str(sleep.get('status') or 'Waiting for survival confirmation')[:100]
        if context.get('stage'):
            lines={'stage':((context.get('label')+' | ') if context.get('label') else (f"Review {context['round']} | " if context.get('round') else ''))+f"Stage {context['stage']} of {context['stages']} | {context['stage_name']}",**lines}
        if world:
            complete=sum(r.get('state')=='complete' for r in world['results'].values())
            label='Sequences' if world.get('mission')!='hut' else 'Huts'
            lines['stage']=f"World trial {world['round']} | {world['name']} | {label} {complete}/{len(world['bots'])}"
            if world.get('learning_cycle'):
                lines['stage']=f"Learning {world['learning_cycle']} | {world.get('learning_phase','').title()} | {label} {complete}/{len(world['bots'])}"
            if world.get('first_night'):lines['stage']=first_night_label(world,context.get('last_policy'))
            elapsed=trial_timer(world,now)
            if elapsed is not None:lines['stage']+=' | Elapsed '+elapsed
        # Keep vitals on the always-visible selected-bot bar. The state bar is
        # hidden for many survival phases or replaced by the shelter countdown.
        def vital_percent(value):
            if not fresh or type(value) not in (int,float) or not math.isfinite(value):return '--'
            return f'{round(max(0,min(20,value))*5)}%'
        lines['task']+=f" | Health {vital_percent(agent.get('health'))} | Food {vital_percent(agent.get('food'))}"
        for suffix in ('stage','task','state'):
            if suffix not in lines:continue
            value=lines[suffix]
            key=prefix+'_'+suffix;name=json.dumps({'text':value,'color':'aqua' if suffix=='task' else 'white'})
            if not s.get('hud_ready'):
                emit(f'bossbar remove {key}')
                emit(f'bossbar add {key} {name}')
                emit(f'bossbar set {key} color '+('yellow' if suffix=='stage' else 'blue' if suffix=='task' else 'green'))
                emit(f'bossbar set {key} max 100')
            emit(f'bossbar set {key} name {name}')
            if suffix=='stage' and world:value=round(world['progress']) if world['phase'] in ('snapshotting','restoring') else round(100*complete/max(1,len(world['bots'])))
            else:value=round(100*(context['stage']-1)/context['stages']) if suffix=='stage' else route_progress if suffix=='state' else progress
            emit(f'bossbar set {key} value {value}')
            emit(f'bossbar set {key} players {owner}')
            if suffix=='state':
                emit(f'bossbar set {key} color '+('purple' if watch_visible else 'green'))
                emit(f'bossbar set {key} visible '+str(route_visible and job.get('status') not in ('running','cancelling')).lower())
        s['hud_ready']=True
    def update_names(self,agents):
        if not hasattr(self,'name_tags'):self.name_tags={}
        for name,agent in agents.items():
            display=agent.get('display_name')
            if not is_agent(name) or not isinstance(display,str) or not re.fullmatch('[A-Za-z]{3,16}',display):continue
            if not agent.get('connected') or self.name_tags.get(name)==(display,agent.get('entity_id')):continue
            team='lab_name_'+name[5:]
            self.command(f'team add {team}')
            self.command(f'team modify {team} prefix '+json.dumps({'text':display+' · ','color':'aqua'}))
            self.command(f'team join {team} {name}')
            self.name_tags[name]=(display,agent.get('entity_id'))
    def update_roster(self,online,agents,mode):
        now=self.clock()
        watched={s['target'] for s in self.sessions.values() if s.get('enabled') and s['player'] in online}
        if now-getattr(self,'roster_at',-100)<1 and watched==getattr(self,'roster_watched',None):return
        self.roster_at=now;self.roster_watched=watched
        active=bool(watched)
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
            if a.get('skill')=='expedition' and fresh and mode!='paused' and action in (3,5,6):activity={3:'Swim / climb',5:'Ascend',6:'Descend'}[action]
            if a.get('skill')=='combat' and fresh and mode!='paused':activity=('Approach','Aim left','Aim right','Back away','Guard / cooldown','Equip gear','Attack')[action] if type(action) is int and 0<=action<7 else 'Wait'
            if a.get('skill')=='advanced' and action==5:activity='Open door'
            if fresh and mode!='paused':activity={'Opening shelter door':'Open shelter','Closing shelter door':'Close shelter','Sheltered: holding safely inside':'Sheltered','Sprinting on clear ground':'Sprinting','Steering left while walking':'Walk + left','Steering right while walking':'Walk + right','Opening door while walking':'Walk + door','Wall ahead: checking escape':'Wall ahead','Reversing out of blocked position':'Reversing','Crouching under low clearance':'Crouching','Recovering: turning toward clear space':'Turn to escape','Recovering: moving around obstacle':'Detouring','Recovering: checking another exit':'Check exit','Recovering: no safe exit; waiting for reset':'No safe exit','Recovering: detour complete':'Detour done'}.get(a.get('activity'),activity)
            if mode=='paused' and getattr(self,'progress_context',{}).get('phase')=='health_wait':activity='Recovering'
            if (mode in ('evaluate','untrained','random','heuristic') or getattr(self,'progress_context',{}).get('phase')=='queued_teacher') and a.get('trial_completed',0)>=getattr(self,'progress_context',{}).get('episodes',3):activity='Done; waiting'
            world=getattr(self,'progress_context',{}).get('world')
            if world and getattr(self,'progress_context',{}).get('job',{}).get('status') not in ('running','cancelling'):activity=world['results'].get(name,{}).get('phase',world['phase']).title()
            stopped=bool(world and world.get('results',{}).get(name,{}).get('state')=='stopped')
            color='gray' if stopped else 'gold' if name in watched else 'aqua'
            row=(a.get('display_name') or name,activity,color)
            previous=self.roster_rows.get(name)
            if previous==row:continue
            holder=f'lab_row_{index}'
            self.command(f'scoreboard players set {holder} lab_bots {100-index}')
            self.command(f'scoreboard players display name {holder} lab_bots '+json.dumps({'text':a.get('display_name') or name,'color':color,'extra':[{'text':': '+activity,'color':'white'}]}))
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
    def move_camera(self,target,tag,view,distance,height,elapsed,heading=0):
        self.command(camera_move(target,tag,view,distance,height,elapsed,heading))
        if view=='shoulder':self.command(shoulder_aim(target,tag))

    def move_cameras(self):
        # Frames are immutable tuples. Movement uses live server-relative targets,
        # so a slow history save cannot freeze position updates behind its lock.
        now=self.clock();frames=[f for f in list(self.motion_frames.values()) if now-f[-1]<8]
        previous=self.motion_stats
        gap=1000*(now-previous['last_at']) if frames and previous['last_at'] is not None else 0
        self.motion_stats=dict(last_at=now if frames else None,ticks=previous['ticks']+bool(frames),gap_ms=gap,max_gap_ms=max(previous['max_gap_ms'],gap))
        for target,tag,view,distance,height,started,heading,updated in frames:
            if now-updated<8:self.move_camera(target,tag,view,distance,height,now-started,heading)

    def tick(self,online,states,agents,ready,mode='paused',pause_reason='Movement paused',progress_context=None):
        if not ready:return
        self.progress_context=progress_context or {}
        self.camera_mode=mode
        self.pause_reason=pause_reason
        self.update_names(agents)
        for s in self.sessions.values():
            owner=s['player']
            if not s['enabled']:
                self.motion_frames.pop(owner,None)
                if s.get('saved_mode') is not None and owner in online:self.release(s,online);self.kill_camera(s);self.save()
                continue
            if owner not in online:
                self.motion_frames.pop(owner,None)
                if s.get('hud_ready'):self.clear_hud(s)
                s.update(attached=False,attach_ready_at=None,status='waiting_player',message='Join Minecraft to start or resume following.');continue
            if s.get('cycle_enabled'):
                available=self.cycle_candidates(s,agents)
                if s.get('cycle_waiting') or self.clock()>=s.get('cycle_at',0) or (s.get('active_only',True) and s['target'] not in available):
                    self.cycle_target(s,agents)
            target=s['target'];agent=agents.get(target,{})
            if not agent.get('connected',False) or self.clock()-agent.get('last_seen',0)>8 or agent.get('health',20)<=0:
                self.motion_frames.pop(owner,None)
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
                s.update(motion_key=list(motion_key),motion_anchor=copy.deepcopy(position),camera_heading=0,travel_heading=0,heading_velocity=0,heading_at=self.clock())
            anchor=s.get('motion_anchor')
            if position is not None and anchor is not None:
                dx,dz=position[0]-anchor[0],position[2]-anchor[2]
                if math.hypot(dx,dz)>=.75:
                    s.update(travel_heading=math.atan2(dz,dx),motion_anchor=copy.deepcopy(position))
            elif position is not None:s['motion_anchor']=copy.deepcopy(position)
            heading=s.get('camera_heading',0)
            s['camera_heading'],s['heading_velocity']=smooth_heading(heading,s.get('travel_heading',heading),s.get('heading_velocity',0),self.clock()-s.get('heading_at',self.clock()-.05))
            s['heading_at']=self.clock()
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
                    self.move_camera(target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0))
                    self.command(f'execute at {target} run data merge entity @e[tag={camera},limit=1] {{teleport_duration:{CAMERA_INTERPOLATION_TICKS}}}')
                    self.command(f"execute at {owner if s['view']=='stationary' else target} run spectate @e[tag={camera},limit=1] {owner}");s['camera_created']=True
                s.update(attached=True,attach_ready_at=None,attached_at=self.clock());self.save()
            if s['view']!='first_person':
                if self.external_motion:self.motion_frames[owner]=(target,camera,s['view'],s['distance'],s['height'],s['started_at'],s.get('camera_heading',0),self.clock())
                else:self.move_camera(target,camera,s['view'],s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0))
            else:self.motion_frames.pop(owner,None)
            s.update(status='following',message=(f"Watching {target} from a stationary position. Switch bots to look around; use a following view to travel between arenas." if s['view']=='stationary' else f"Following {target}: {s['view'].replace('_',' ')}. Camera follows arena transfers and respawns."),simulation=agent.get('simulation','Waiting'),target_position=agent.get('position'))

            if s['view']=='action':
                s['camera_shot']=action_pose(s['distance'],s['height'],self.clock()-s['started_at'],s.get('camera_heading',0))[3]
                s['message']=f"Action camera: {s['camera_shot']}. Smooth automatic shots follow {target} between simulations."
            if s.get('cycle_enabled') and s.get('cycle_waiting'):s['message']+=' No active bots remain; holding this bot until trials resume.'
            self.update_hud(s,agent,mode)
        self.update_roster(online,agents,mode)
