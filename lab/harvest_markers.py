"""Native visual target columns: no blocks, collision, client mods or particles."""
import hashlib
import json
import math
import time
from pathlib import Path


class HarvestMarkers:
    def __init__(self, path, command, clock=time.time):
        self.path=Path(path);self.command=command;self.clock=clock
        self.settings={'enabled':True};self.live={};self.cleaned=False;self.last=-math.inf
        if self.path.exists():self.configure(json.loads(self.path.read_text(encoding='utf-8')),save=False)

    def configure(self, data, save=True):
        if type(data.get('enabled')) is not bool:raise ValueError('Choose enabled or disabled')
        self.settings={'enabled':data['enabled']}
        if save:self.path.write_text(json.dumps(self.settings),encoding='utf-8')
        self.last=-math.inf
        return dict(self.settings)

    def tick(self, session, agents, ready):
        if not ready:self.cleaned=False;self.live.clear();return
        if not self.cleaned:
            self.command('kill @e[type=minecraft:block_display,tag=lab_harvest_target]')
            self.live.clear();self.cleaned=True
        now=self.clock()
        if now-self.last<.2:return
        self.last=now;valid={}
        if self.settings['enabled'] and session and session.get('active') and session.get('phase')=='running':
            for name,a in agents.items():
                if not a.get('connected') or now-a.get('last_seen',0)>2:continue
                if session.get('results',{}).get(name,{}).get('state') in ('complete','stopped'):continue
                intent=a.get('harvest_intent')
                if not intent or now-intent.get('seen',0)>2:continue
                intent=validate_intent(intent,session,name,now)
                if intent:valid[name]=(intent,a.get('display_name') or a.get('name') or name)
        for name in self.live.keys()-valid.keys():
            self.command(f'kill @e[type=minecraft:block_display,tag={self.live.pop(name)[0]}]')
        for name,(intent,display_name) in valid.items():
            x,y,z=intent['position'];position=(x,y,z);kind=intent['kind']
            tag='lab_harvest_'+hashlib.sha256(name.encode()).hexdigest()[:12]
            condition=f'block {x} {y} {z} minecraft:'+intent['block']
            # Server block checks also remove markers during the heartbeat gap.
            self.command(f'execute unless {condition} run kill @e[type=minecraft:block_display,tag={tag}]')
            label=json.dumps(json.dumps({'text':display_name+(' — Mining' if kind=='mining' else ' — Approaching'),'color':'green' if kind=='mining' else 'gold'}))
            color='lime_stained_glass' if kind=='mining' else 'yellow_stained_glass'
            parts=[] if name in self.live and self.live[name][1]==position else [('beam','[0.44f,1f,0.44f]','[0.12f,12f,0.12f]'),('block','[-0.01f,-0.01f,-0.01f]','[1.02f,1.02f,1.02f]')]
            for part,translation,scale in parts:
                nbt='{Tags:["lab_harvest_target","'+tag+'","'+tag+'_'+part+'"],block_state:{Name:"minecraft:'+color+'"},transformation:{translation:'+translation+',scale:'+scale+'},brightness:{block:15,sky:15},view_range:4f,width:2f,height:26f,CustomName:'+label+',CustomNameVisible:'+('1b' if part=='beam' else '0b')+',Invulnerable:1b,Silent:1b}'
                self.command(f'execute if {condition} unless entity @e[type=minecraft:block_display,tag={tag}_{part}] run summon minecraft:block_display {x:.3f} {y:.3f} {z:.3f} '+nbt)
            if name in self.live and self.live[name][1]!=position:
                self.command(f'tp @e[type=minecraft:block_display,tag={tag}] {x:.3f} {y:.3f} {z:.3f}')
            if name in self.live and self.live[name][2:]!=(kind,display_name):
                self.command(f'execute as @e[type=minecraft:block_display,tag={tag}] run data merge entity @s '+ '{block_state:{Name:"minecraft:'+color+'"},CustomName:'+label+'}')
            self.live[name]=(tag,position,kind,display_name)


def validate_intent(intent,session,name,now):
    if not isinstance(intent,dict) or not session or not session.get('active') or session.get('phase')!='running' or name not in session.get('bots',[]):return None
    if intent.get('run')!=session.get('run') or intent.get('kind') not in ('approach','mining'):return None
    block=intent.get('block')
    if block not in ('stone','oak_log','birch_log','spruce_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log'):return None
    p=intent.get('position');bounds=session.get('bounds',[])
    if not isinstance(p,list) or len(p)!=3 or not all(type(v) in (float,int) and math.isfinite(v) and int(v)==v for v in p):return None
    x,y,z=map(int,p)
    if len(bounds)!=4 or not bounds[0]<=x<bounds[1] or not bounds[2]<=z<bounds[3] or not -64<=y<=319:return None
    return {'run':intent['run'],'kind':intent['kind'],'block':block,'position':[x,y,z],'seen':now}
