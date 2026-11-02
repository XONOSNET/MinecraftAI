"""Vanilla moving light sources, owned by invisible marker entities."""
import json
from pathlib import Path
import math
import time
from .config import is_agent


class BotLights:
    def __init__(self,command,clock=time.time,config_path=None):
        self.command=command;self.clock=clock;self.at=0;self.sweep_at=0;self.positions=None
        self.config_path=Path(config_path) if config_path else None;self.enabled=True;self.settings_at=-float("inf")

    def tick(self,agents,ready):
        now=self.clock()
        if not ready or now-self.at<.25:return
        self.at=now
        if self.config_path and now-self.settings_at>=1:
            self.settings_at=now
            try:
                value=json.loads(self.config_path.read_text(encoding='utf-8')).get('enabled',False)
                self.enabled=value is True
            except (OSError,ValueError,AttributeError):self.enabled=False
        if not self.enabled:
            if self.positions is None or self.positions or now-self.sweep_at>=2:
                self.update(set());self.positions=set();self.sweep_at=now
            return
        positions=set()
        for name,a in agents.items():
            p=a.get('position',[])
            if not is_agent(name) or not a.get('connected') or now-a.get('last_seen',0)>8:continue
            if a.get('dimension','overworld') not in ('overworld','minecraft:overworld'):continue
            if len(p)!=3 or any(type(v) not in (int,float) or not math.isfinite(v) for v in p):continue
            x,y,z=map(math.floor,p)
            if -64<=y<319:positions.add((x,y+1,z))
        full=self.positions is None or now-self.sweep_at>=2
        if positions==self.positions and not full:return
        previous=self.positions or set();self.positions=positions
        if full:self.sweep_at=now
        self.update(positions,previous,full)

    def update(self,positions,previous=None,full=True):
        # Mark only sources still needed. Unloaded old markers are swept when
        # their chunks next load; no permanent chunk force loads are required.
        if full:
            self.command('tag @e[type=minecraft:marker,tag=lab_bot_light] remove lab_light_current')
            for x,y,z in sorted(positions):
                key=f'lab_lamp_{x}_{y}_{z}'
                self.command(f'tag @e[type=minecraft:marker,tag={key}] add lab_light_current')
            self.command('execute as @e[type=minecraft:marker,tag=lab_bot_light,tag=!lab_light_current] at @s if block ~ ~ ~ minecraft:light[level=14,waterlogged=false] run setblock ~ ~ ~ minecraft:air')
            self.command('kill @e[type=minecraft:marker,tag=lab_bot_light,tag=!lab_light_current]')
        else:
            for x,y,z in sorted((previous or set())-positions):
                key=f'lab_lamp_{x}_{y}_{z}'
                self.command(f'execute at @e[type=minecraft:marker,tag={key}] if block ~ ~ ~ minecraft:light[level=14,waterlogged=false] run setblock ~ ~ ~ minecraft:air')
                self.command(f'kill @e[type=minecraft:marker,tag={key}]')
        for x,y,z in sorted(positions if full else positions-(previous or set())):
            key=f'lab_lamp_{x}_{y}_{z}'
            # Only air is replaced. Existing light blocks, water, plants and
            # structures never become ours and are never removed by cleanup.
            self.command(f'execute positioned {x} {y} {z} if block ~ ~ ~ minecraft:air unless entity @e[type=minecraft:marker,tag={key}] run summon minecraft:marker ~ ~ ~ {{Tags:["lab_bot_light","lab_light_current","{key}"]}}')
            self.command(f'execute at @e[type=minecraft:marker,tag={key}] if block ~ ~ ~ minecraft:air run setblock ~ ~ ~ minecraft:light[level=14,waterlogged=false]')

    def clear(self):
        self.update(set());self.positions=None
