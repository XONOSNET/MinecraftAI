"""Owned sky lounge for bots waiting on real-world terrain restoration."""
import json
import math
from .protection import HOSTILES

X,Y,Z,RADIUS=-160,224,160,14
SLOTS=((6,0),(4,4),(0,6),(-4,4),(-6,0),(-4,-4),(0,-6),(4,-4))

def position(index):
    dx,dz=SLOTS[index%len(SLOTS)]
    return [X+dx+.5,Y+1.1,Z+dz+.5]

def build_commands():
    commands=[]
    def material(dx,dz,layer):
        d=dx*dx+dz*dz
        if d>RADIUS**2:return None
        if layer==-1:return 'polished_deepslate'
        if layer==1:return 'cyan_stained_glass' if d>13**2 else None
        if d>13**2:return 'polished_deepslate'
        if d>=12**2:return 'cyan_concrete'
        if d>=11**2:return 'smooth_quartz'
        if d>=10**2:return 'polished_deepslate'
        if d<=4 or dx==0 or dz==0 or abs(dx)==abs(dz):return 'sea_lantern'
        if d<=9:return 'cyan_concrete'
        return 'calcite'
    # Merge equal neighbouring blocks into short rows instead of issuing a
    # command for every block. No clearing outside the owned circular deck.
    for layer in (-1,0,1):
        for dz in range(-RADIUS,RADIUS+1):
            start=-RADIUS
            while start<=RADIUS:
                block=material(start,dz,layer);end=start
                while end<RADIUS and material(end+1,dz,layer)==block:end+=1
                if block:commands.append(f'fill {X+start} {Y+layer} {Z+dz} {X+end} {Y+layer} {Z+dz} minecraft:{block}')
                start=end+1
    for dx,dz in SLOTS:
        commands.extend([f'setblock {X+dx} {Y} {Z+dz} minecraft:sea_lantern',f'setblock {X+dx} {Y+1} {Z+dz} minecraft:cyan_carpet'])
    for dx,dz in ((10,0),(-10,0),(0,10),(0,-10)):
        commands.extend([f'fill {X+dx} {Y+1} {Z+dz} {X+dx} {Y+3} {Z+dz} minecraft:quartz_pillar',f'setblock {X+dx} {Y+4} {Z+dz} minecraft:lantern'])
    commands.extend([f'setblock {X} {Y+1} {Z} minecraft:polished_blackstone',f'setblock {X} {Y+2} {Z} minecraft:amethyst_block',f'fill {X} {Y+3} {Z} {X} {Y+5} {Z} minecraft:end_rod',
                     'kill @e[type=minecraft:text_display,tag=lab_staging_ui]'])
    for height,text,color,scale in ((7,'AI LAB · SKY LOUNGE','aqua',1.2),(6,'Preparing the next adventure','white',.65)):
        payload=dict(Tags=['lab_staging_ui'],text=json.dumps(dict(text=text,color=color)),billboard='center',background=0,shadow=True,brightness=dict(block=15,sky=15),transformation=dict(scale=[scale,scale,scale]))
        commands.append(f'summon minecraft:text_display {X+.5} {Y+height} {Z+.5} '+json.dumps(payload,separators=(',',':')))
    return commands

class StagingPad:
    def __init__(self,command):
        self.command=command;self.pid=None;self.loading_at=None;self.ready=False;self.pending=set();self.last_sweep=-100

    def park(self,names):
        self.pending.update(names)
        if self.ready:self._park_pending()

    def _park_pending(self):
        for name in sorted(self.pending):
            index=int(name.removeprefix('LabAI'));x,y,z=position(index);dx,dz=SLOTS[index%len(SLOTS)]
            yaw=round(math.degrees(math.atan2(dx,dz)),1)
            self.command(f'effect give {name} minecraft:slow_falling 120 0 true')
            self.command(f'tp {name} {x} {y} {z} {yaw} 0')
            self.command(f'gamemode survival {name}')
        self.pending.clear()

    def tick(self,pid,now):
        if pid!=self.pid:
            self.pid=pid;self.ready=False;self.loading_at=now
            self.command(f'forceload add {X-RADIUS} {Z-RADIUS} {X+RADIUS} {Z+RADIUS}')
        if not self.ready and now-self.loading_at>=2:
            for command in build_commands():self.command(command)
            self.ready=True;self._park_pending()
        if self.ready and now-self.last_sweep>=2:
            for mob in ('phantom',*HOSTILES):self.command(f'kill @e[type=minecraft:{mob},x={X-18},y={Y},z={Z-18},dx=36,dy=30,dz=36]')
            self.last_sweep=now
