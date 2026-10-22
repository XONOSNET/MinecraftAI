"""Detect vanilla jump-input edges for cycling observers, without a client mod."""
import re
from pathlib import Path

class CameraInput:
    def __init__(self,path,command):
        self.path=Path(path);self.command=command;self.offset=self.path.stat().st_size if self.path.exists() else 0;self.active=set()
    def tick(self,observers,online,agents):
        active={s['player'] for s in observers.sessions.values() if s.get('enabled') and s.get('cycle_enabled') and s['player'] in online}
        if self.path.exists():
            size=self.path.stat().st_size
            if size<self.offset:self.offset=0
            with self.path.open('rb') as stream:
                stream.seek(self.offset);data=stream.read(262144);self.offset=stream.tell()
            for owner in re.findall(r"INFO\]: Added tag 'lab_cam_advance' to ([A-Za-z0-9_]{3,16})",data.decode('utf-8',errors='replace')):
                if owner in active:
                    
                    try:observers.next_bot(owner,agents)
                    except ValueError:pass
                    self.command(f'tag {owner} remove lab_cam_advance')
        predicate='{condition:"minecraft:entity_properties",entity:"this",predicate:{type_specific:{type:"minecraft:player",input:{jump:true}}}}'
        for owner in self.active-active:
            if owner in online:
                self.command(f'tag {owner} remove lab_cam_space_held');self.command(f'tag {owner} remove lab_cam_advance')
        for owner in active:
            if owner not in self.active:
                self.command(f'tag {owner} remove lab_cam_space_held');self.command(f'tag {owner} remove lab_cam_advance')
            self.command(f'execute as {owner} if predicate {predicate} unless entity @s[tag=lab_cam_space_held] run tag @s add lab_cam_advance')
            self.command(f'execute as {owner} if predicate {predicate} run tag @s add lab_cam_space_held')
            self.command(f'execute as {owner} unless predicate {predicate} if entity @s[tag=lab_cam_space_held] run tag @s remove lab_cam_space_held')
        self.active=active
