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
        if now-self.last<.5:return
        self.last=now;valid={}
        if self.settings['enabled'] and session and session.get('active'):
            bounds=session.get('bounds',[])
            for name,r in session.get('results',{}).items():
                a=agents.get(name,{})
                if r.get('state')!='working' or not a.get('connected') or now-a.get('last_seen',0)>5:continue
                p=r.get('harvest_target')
                if not isinstance(p,list) or len(p)!=3 or not all(type(v) in (int,float) and math.isfinite(v) for v in p):continue
                x,y,z=p
                if len(bounds)!=4 or not bounds[0]<=x<=bounds[1] or not bounds[2]<=z<=bounds[3] or not -64<=y<=319:continue
                valid[name]=tuple(p)
        for name in self.live.keys()-valid.keys():
            self.command(f'kill @e[type=minecraft:block_display,tag={self.live.pop(name)[0]}]')
        for name,(x,y,z) in valid.items():
            tag='lab_harvest_'+hashlib.sha256(name.encode()).hexdigest()[:12]
            if name not in self.live:
                label=json.dumps(json.dumps({'text':name+' target','color':'gold'}))
                self.command(f'summon minecraft:block_display {x+.5:.3f} {y+1:.3f} {z+.5:.3f} '+
                    '{Tags:["lab_harvest_target","'+tag+'"],block_state:{Name:"minecraft:yellow_stained_glass"},'+
                    'transformation:{translation:[-0.06f,0f,-0.06f],scale:[0.12f,12f,0.12f]},'+
                    'brightness:{block:15,sky:15},view_range:4f,width:2f,height:26f,CustomName:'+label+',CustomNameVisible:1b,Invulnerable:1b,Silent:1b}')
            elif self.live[name][1]!=(x,y,z):
                self.command(f'tp @e[type=minecraft:block_display,tag={tag}] {x+.5:.3f} {y+1:.3f} {z+.5:.3f}')
            self.live[name]=(tag,(x,y,z))
