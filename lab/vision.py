"""Bounded, native particle outlines for the actual adaptive peripheral field of view."""
import json
import math
import time
from pathlib import Path

class VisionLines:
    def __init__(self,path,command,clock=time.time):
        self.path=Path(path);self.command=command;self.clock=clock;self.last=0
        self.settings={'enabled':False,'scope':'followed'}
        if self.path.exists():self.configure(json.loads(self.path.read_text()),save=False)
    def configure(self,data,save=True):
        if type(data.get('enabled')) is not bool or data.get('scope','followed') not in ('followed','all'):raise ValueError('Choose enabled and a valid vision scope')
        self.settings={'enabled':data['enabled'],'scope':data.get('scope','followed')}
        if save:self.path.write_text(json.dumps(self.settings),encoding='utf-8')
        return dict(self.settings)
    def tick(self,agents,sessions,ready):
        now=self.clock()
        if not ready or not self.settings['enabled'] or now-self.last<1:return
        self.last=now
        targets={s.get('target') for s in sessions.values() if s.get('enabled')}
        if not targets:targets={'LabAI0'}
        for name,a in agents.items():
            if self.settings['scope']=='followed' and name not in targets:continue
            if not a.get('connected') or now-a.get('last_seen',0)>3:continue
            v=a.get('vision') or {};p=a.get('position')
            values=[*(p or []),*[v.get(k) for k in ('yaw','hfov','vfov','range','eye_height')]]
            if len(values)!=8 or not all(type(x) in (int,float) and math.isfinite(x) for x in values):continue
            x,y,z,yaw,hfov,vfov,length,eye=values
            if not 1<=hfov<=3 or not 0<vfov<2 or not 0<length<=16 or not 0<eye<=2:continue
            origin=(x,y+eye,z);corners=[]
            for h,w in ((-1,-1),(1,-1),(1,1),(-1,1)):
                az=yaw+h*hfov/2;el=w*vfov/2
                corners.append((x-math.sin(az)*math.cos(el)*length,y+eye+math.sin(el)*length,z-math.cos(az)*math.cos(el)*length))
            edges=[(origin,c) for c in corners]+[(corners[i],corners[(i+1)%4]) for i in range(4)]
            for start,end in edges:
                for step in range(1,6):
                    point=[a+(b-a)*step/5 for a,b in zip(start,end)]
                    # Simple built-in particle works on the pinned server without a resource pack.
                    self.command('execute positioned %.3f %.3f %.3f run particle minecraft:end_rod ~ ~ ~ 0 0 0 0 1 force @a[distance=..48]'%tuple(point))
