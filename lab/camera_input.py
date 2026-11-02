"""Vanilla spectator input edges and private chat controls; no client mod."""
import json
import re
import time
from pathlib import Path

BINDINGS=[('jump','advance',None),('sprint','view','Enter'),('forward','far','ArrowUp'),('backward','near','ArrowDown'),('left','lower','ArrowLeft'),('right','higher','ArrowRight')]

def install_camera_pack(path):
    root=Path(path);lines=[]
    for key,tag,_ in BINDINGS:
        predicate='{condition:"minecraft:entity_properties",entity:"this",predicate:{type_specific:{type:"minecraft:player",input:{'+key+':true}}}}'
        held='lab_cam_space_held' if key=='jump' else 'lab_cam_'+tag+'_held'
        edge=f'execute if predicate {predicate} unless entity @s[tag={held}] run tag @s add '
        lines.extend([edge+'lab_cam_event',edge+'lab_cam_'+tag,f'execute if predicate {predicate} run tag @s add {held}',f'execute unless predicate {predicate} run tag @s remove {held}'])
    events=['lab_cam_event']+['lab_cam_'+tag for _,tag,_ in BINDINGS]
    held=['lab_cam_space_held']+['lab_cam_'+tag+'_held' for key,tag,_ in BINDINGS if key!='jump']
    files={'pack.mcmeta':json.dumps({'pack':{'pack_format':61,'description':'AI Laboratory spectator controls'}}),
      'data/minecraft/tags/function/tick.json':json.dumps({'values':['lab_camera:tick']}),
      'data/minecraft/tags/function/load.json':json.dumps({'values':['lab_camera:load']}),
      'data/lab_camera/function/load.mcfunction':'scoreboard objectives add lab_camera trigger\n',
      'data/lab_camera/function/tick.mcfunction':'execute as @a[tag=lab_camera_controls] run function lab_camera:input\nscoreboard players enable @a[tag=lab_camera_controls] lab_camera\n',
      'data/lab_camera/function/input.mcfunction':'\n'.join(lines)+'\n',
      'data/lab_camera/function/consume.mcfunction':'\n'.join('tag @s remove '+tag for tag in events)+'\n',
      'data/lab_camera/function/reset.mcfunction':'\n'.join('tag @s remove '+tag for tag in events+held+['lab_camera_controls','lab_cam_cycle'])+'\n'}
    for name,text in files.items():
        dest=root/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text,encoding='utf-8')

class CameraInput:
    def __init__(self,path,command,pack_path=None):
        self.path=Path(path);self.command=command;self.offset=self.path.stat().st_size if self.path.exists() else 0;self.active=set();self.cycling=set();self.pack=pack_path;self.at=0;self.partial=''
        if pack_path:install_camera_pack(pack_path)
    def tick(self,observers,online,agents):
        active={s['player'] for s in observers.sessions.values() if s.get('enabled') and s['player'] in online}
        cycling={s['player'] for s in observers.sessions.values() if s.get('enabled') and s.get('cycle_enabled') and s['player'] in online}
        data=''
        if self.path.exists():
            size=self.path.stat().st_size
            if size<self.offset:self.offset=0
            with self.path.open('rb') as stream:
                stream.seek(self.offset);data=stream.read(262144).decode('utf-8',errors='replace');self.offset=stream.tell()
        data=self.partial+re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',data).replace('\r','\n')
        if '\n' in data:data,self.partial=data.rsplit('\n',1);data+='\n'
        else:self.partial=data;data=''
        requests=[]
        # Native feedback only. Player chat cannot impersonate an input event.
        for owner,tags in re.findall(r'^\[\d{2}:\d{2}:\d{2} INFO\]: ([A-Za-z0-9_]{3,16}) has (?:the following )?\d+ (?:entity )?tags?: ([^\r\n]+)',data,re.MULTILINE):
            found=set(re.findall(r'\blab_cam_(?:advance|view|far|near|lower|higher)\b',tags))
            requests.extend((owner,tag,key) for _,tag,key in BINDINGS if 'lab_cam_'+tag in found)
        for owner,value in re.findall(r'^\[\d{2}:\d{2}:\d{2} INFO\]: \[([A-Za-z0-9_]{3,16}): Triggered \[lab_camera\] \(set value to ([1-5])\)\]\s*$',data,re.MULTILINE):
            _,tag,key=BINDINGS[int(value)];requests.append((owner,tag,key))
        if not self.pack:
            requests.extend((owner,'advance',None) for owner in re.findall(r"^\[\d{2}:\d{2}:\d{2} INFO\]: Added tag 'lab_cam_advance' to ([A-Za-z0-9_]{3,16})",data,re.MULTILINE))
        for owner,tag,key in requests:
            if owner not in active:continue
            try:
                if tag=='advance':
                    observers.next_bot(owner,agents)
                else:observers.adjust(owner,key)
            except ValueError:pass
            if not self.pack:self.command(f'tag {owner} remove lab_cam_advance')
        if self.pack:
            for owner in self.active-active:
                if owner in online:self.command(f'execute as {owner} run function lab_camera:reset')
            for owner in active-self.active:
                self.command(f'execute as {owner} run function lab_camera:reset');self.command(f'tag {owner} add lab_camera_controls')
            for owner in cycling-self.cycling:self.command(f'tag {owner} add lab_cam_cycle')
            for owner in self.cycling-cycling:
                if owner in online:self.command(f'tag {owner} remove lab_cam_cycle')
            # Only new presses produce feedback. Native functions handle all
            # twenty-Hz input checks without flooding the console with predicates.
            if time.monotonic()-self.at>=.1:
                self.at=time.monotonic()
                self.command('execute as @a[tag=lab_camera_controls,tag=lab_cam_event] run tag @s list')
                self.command('execute as @a[tag=lab_camera_controls,tag=lab_cam_event] run function lab_camera:consume')
        else:
            predicate='{condition:"minecraft:entity_properties",entity:"this",predicate:{type_specific:{type:"minecraft:player",input:{jump:true}}}}'
            for owner in active:
                self.command(f'execute as {owner} if predicate {predicate} unless entity @s[tag=lab_cam_space_held] run tag @s add lab_cam_advance')
                self.command(f'execute as {owner} if predicate {predicate} run tag @s add lab_cam_space_held')
                self.command(f'execute as {owner} unless predicate {predicate} run tag @s remove lab_cam_space_held')
        self.active=active;self.cycling=cycling
