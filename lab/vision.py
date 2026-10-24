"""Five solid, non-colliding native display beams for the adaptive vision cone."""
import hashlib
import json
import math
import time
from pathlib import Path


def beam_transform(direction, length, width):
    """Rotate a centered, thin +Y block column into a unit direction."""
    dx, dy, dz = direction
    q = [dz, 0., -dx, 1 + dy]
    norm = math.sqrt(sum(v*v for v in q))
    q = [v/norm for v in q]
    x, y, z, w = q
    # Rotated local X and Z axes; center the beam's square cross section.
    u = [1-2*(y*y+z*z), 2*(x*y+w*z), 2*(x*z-w*y)]
    v = [2*(x*z+w*y), 2*(y*z-w*x), 1-2*(x*x+y*y)]
    translation = [-width*(a+b)/2 for a,b in zip(u,v)]
    floats = lambda values: '['+','.join(f'{value:.6f}f' for value in values)+']'
    return '{translation:'+floats(translation)+',scale:'+floats([width,length,width])+',left_rotation:'+floats(q)+',right_rotation:[0f,0f,0f,1f]}'


class VisionLines:
    def __init__(self,path,command,clock=time.time):
        self.path=Path(path);self.command=command;self.clock=clock;self.last=-math.inf
        self.live={};self.cleaned=False
        self.settings={'enabled':False,'scope':'followed'}
        if self.path.exists():self.configure(json.loads(self.path.read_text(encoding='utf-8')),save=False)
    def configure(self,data,save=True):
        if type(data.get('enabled')) is not bool or data.get('scope','followed') not in ('followed','all'):raise ValueError('Choose enabled and a valid vision scope')
        self.settings={'enabled':data['enabled'],'scope':data.get('scope','followed')}
        if save:self.path.write_text(json.dumps(self.settings),encoding='utf-8')
        self.last=-math.inf
        return dict(self.settings)
    def clear(self):
        self.command('kill @e[type=minecraft:block_display,tag=lab_vision_beam]')
        self.live.clear();self.cleaned=True;self.last=-math.inf
    def tick(self,agents,sessions,ready):
        now=self.clock()
        if not ready:
            self.live.clear();self.cleaned=False
            return
        if not self.cleaned:self.clear()
        if not self.settings['enabled']:
            if self.live:self.clear()
            return
        if now-self.last<.2:return
        self.last=now
        targets={s.get('target') for s in sessions.values() if s.get('enabled')}
        if not targets:targets={'LabAI0'}
        valid={}
        for name,a in agents.items():
            if self.settings['scope']=='followed' and name not in targets:continue
            if not a.get('connected') or now-a.get('last_seen',0)>3:continue
            vision=a.get('vision') or {};position=a.get('position')
            values=[*(position or []),*[vision.get(k) for k in ('yaw','hfov','vfov','range','eye_height')]]
            if len(values)!=8 or not all(type(x) in (int,float) and math.isfinite(x) for x in values):continue
            x,y,z,yaw,hfov,vfov,length,eye=values
            if not 1<=hfov<=3 or not 0<vfov<2 or not 0<length<=16 or not 0<eye<=2:continue
            valid[name]=(x,y+eye,z,yaw,hfov,vfov,length)
        for name in self.live.keys()-valid.keys():
            self.command(f'kill @e[type=minecraft:block_display,tag={self.live.pop(name)}]')
        for name,(x,y,z,yaw,hfov,vfov,length) in valid.items():
            tag='lab_vision_'+hashlib.sha256(name.encode()).hexdigest()[:12]
            directions=[]
            for h,v in ((-1,-1),(1,-1),(1,1),(-1,1)):
                az=yaw+h*hfov/2;el=v*vfov/2
                directions.append((-math.sin(az)*math.cos(el),math.sin(el),-math.cos(az)*math.cos(el)))
            directions.append((-math.sin(yaw),0,-math.cos(yaw)))
            fresh=name not in self.live
            if not fresh:
                self.command(f'tp @e[type=minecraft:block_display,tag={tag}] {x:.4f} {y:.4f} {z:.4f}')
            for index,direction in enumerate(directions):
                transform=beam_transform(direction,length if index==4 else length*.6,.035 if index==4 else .025)
                if fresh:
                    block='yellow_concrete' if index==4 else 'cyan_concrete'
                    nbt=f'{{Tags:["lab_vision_beam","{tag}","{tag}_{index}"],block_state:{{Name:"minecraft:{block}"}},transformation:{transform},brightness:{{block:15,sky:15}},width:40f,height:40f,view_range:2f,teleport_duration:4,interpolation_duration:4,Invulnerable:1b,Silent:1b}}'
                    self.command(f'summon minecraft:block_display {x:.4f} {y:.4f} {z:.4f} {nbt}')
                else:
                    self.command(f'data merge entity @e[type=minecraft:block_display,tag={tag}_{index},limit=1] {{start_interpolation:0,transformation:{transform}}}')
            self.live[name]=tag
