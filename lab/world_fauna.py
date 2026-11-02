"""Repeat natural passive animals without inventory grants or duplicated UUIDs."""
import math
SPECIES=('cow','pig','sheep','chicken','rabbit')

def house_plots(session):
    return (session.get('camp') or {}).get('plots') or [r['plot'] for r in session.get('results',{}).values() if isinstance(r.get('plot'),dict) and all(type(r['plot'].get(k)) in (int,float) and math.isfinite(r['plot'][k]) for k in ('x','z'))]

def walked_pastures(session):
    """Candidate grass checks beside actual camp travel, never animal locations."""
    camp=session.get('camp') or {};plots=house_plots(session)
    x0,x1,z0,z1=session['bounds'];spawn=camp.get('spawn') or [(x0+x1)/2,0,(z0+z1)/2];found={}
    for report in session.get('results',{}).values():
        for p in ((report.get('wilderness') or {}).get('memory') or {}).get('roads',[])[:512]:
            if not isinstance(p,list) or len(p)!=3 or any(type(v) not in (int,float) or not math.isfinite(v) for v in p):continue
            x,y,z=math.floor(p[0]),round(p[1]),math.floor(p[2]);distance=math.hypot(x+.5-spawn[0],z+.5-spawn[2])
            if not x0+3<x<x1-4 or not z0+3<z<z1-4 or distance<12 or not -60<=y<190:continue
            if any(abs(x-h['x'])<8 and abs(z-h['z'])<8 for h in plots):continue
            found[(x,z)]=(x,y,z)
    # Keep spatial coverage, rather than retaining only the nearest roads.
    # One representative per small patch bounds work across the whole site.
    patches={}
    for p in found.values():patches[(p[0]//8,p[2]//8)]=p
    points=list(patches.values());result=[]
    if points:
        remaining=set(points);current=min(points,key=lambda p:math.hypot(p[0]-spawn[0],p[2]-spawn[2]))
        nearest={p:float('inf') for p in points}
        while remaining and len(result)<128:
            result.append(current);remaining.remove(current)
            for p in remaining:nearest[p]=min(nearest[p],(p[0]-current[0])**2+(p[2]-current[2])**2)
            if not remaining:break
            current=max(sorted(remaining),key=lambda p:nearest[p])
            if nearest[current]<16:break
    return result


def replenish_commands(bounds,plots,wave,caps,pastures=None,sheep_births=2):
    """Bounded population maintenance on real grassy surface positions."""
    x0,x1,z0,z1=bounds
    area=f'x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1}'
    if type(sheep_births) is not int or not 1<=sheep_births<=32:raise ValueError('Invalid sheep birth limit')
    points=[(x,z) for x in range(x0+10,x1-9,8) for z in range(z0+10,z1-9,8)
            if not any(abs(x-h['x'])<8 and abs(z-h['z'])<8 for h in plots)]
    commands=[]
    if not points:return commands
    for i,(mob,cap) in enumerate(caps.items()):
        if mob not in SPECIES or not isinstance(cap,int) or not 1<=cap<=32:raise ValueError('Invalid livestock population cap')
        if mob=='sheep':
            # Count uniquely tagged births, not execute-command success callbacks.
            # Failed conditions must not increment the successful-wave counter.
            wave_score='#fauna_wave_sheep';score='#fauna_sheep'
            commands.extend([f'tag @e[type=minecraft:sheep,tag=lab_refill_new,{area}] remove lab_refill_new',
                             f'scoreboard players set {wave_score} lab_world 0'])
            candidates=list(pastures or [])
            # Regional fallback checks the actual surface, including beyond old roads.
            samples=[]
            for j in range(min(16,len(candidates))):
                x,y,z=candidates[(wave*7+j)%len(candidates)];samples.append(f'positioned {x+.5} {y} {z+.5}')
            for j in range(min(24,len(points))):
                x,z=points[(wave*17+j*7)%len(points)];samples.append(f'positioned {x+.5} 0 {z+.5} positioned over motion_blocking_no_leaves')
            for position in samples:
                commands.extend([
                    f'scoreboard players set {score} lab_world 0',
                    f'execute store result score {score} lab_world run execute if entity @e[type=minecraft:sheep,{area}]',
                    f'execute if score {wave_score} lab_world matches ..{sheep_births-1} if score {score} lab_world matches ..{cap-1} {position} if block ~ ~-1 ~ #minecraft:animals_spawnable_on if block ~ ~ ~ minecraft:air if block ~ ~1 ~ minecraft:air unless entity @a[distance=..8] unless entity @e[type=minecraft:sheep,distance=..6] run summon minecraft:sheep ~ ~ ~ {{Tags:["lab_natural_fauna","lab_replenished_fauna","lab_refill_new"],PersistenceRequired:1b,Color:0b,Age:0}}',
                    f'scoreboard players set {wave_score} lab_world 0',
                    f'execute store result score {wave_score} lab_world run execute if entity @e[type=minecraft:sheep,tag=lab_refill_new,{area}]'])
            commands.extend([f'scoreboard players set {score} lab_world 0',
                             f'execute store result score {score} lab_world run execute if entity @e[type=minecraft:sheep,{area}]',
                             f'scoreboard players get {wave_score} lab_world',f'scoreboard players get {score} lab_world'])
            continue
        for j in range(2):
            x,z=points[(wave*17+i*11+j*7)%len(points)];score='#fauna_'+mob
            commands.append(f'execute store result score {score} lab_world run execute if entity @e[type=minecraft:{mob},{area}]')
            color=',Color:0b' if mob=='sheep' else ''
            checks=' '.join(f'if block ~{dx if dx else ""} ~-1 ~{dz if dz else ""} #minecraft:animals_spawnable_on' for dx,dz in [(0,0),(1,0),(-1,0),(0,1),(0,-1)])
            commands.append(f'execute if score {score} lab_world matches ..{cap-1} positioned {x+.5} 0 {z+.5} positioned over motion_blocking_no_leaves {checks} if block ~ ~ ~ minecraft:air if block ~ ~1 ~ minecraft:air unless entity @a[distance=..8] run summon minecraft:{mob} ~ ~ ~ {{Tags:["lab_natural_fauna","lab_replenished_fauna"],PersistenceRequired:1b{color}}}')
    return commands

def fauna_commands(bounds,key,snapshot):
    x0,x1,z0,z1=bounds;path='sites.s'+key.replace('-','_');tag_key=key.replace('-','_')
    selector=f'x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1}'
    commands=[]
    if snapshot:
        commands.append('data modify storage lab:first_night '+path+' set value {'+','.join(m+':[]' for m in SPECIES)+'}')
        for mob in SPECIES:commands.append(f'execute as @e[type=minecraft:{mob},tag=!lab_world_survival,{selector}] run data modify storage lab:first_night {path}.{mob} append from entity @s')
    else:
        for mob in SPECIES:
            commands.append(f'kill @e[type=minecraft:{mob},tag=!lab_world_survival,{selector}]')
            for index in range(32):
                tag=f'lab_fauna_{tag_key}_{mob}_{index}';entry=f'{path}.{mob}[{index}]';target=f'@e[tag={tag},limit=1]'
                commands.extend([
                    f'execute if data storage lab:first_night {entry} run summon minecraft:{mob} {(x0+x1)/2} 195 {(z0+z1)/2} {{Tags:["{tag}","lab_natural_fauna"],PersistenceRequired:1b}}',
                    f'execute if entity {target} run data modify entity {target} Pos set from storage lab:first_night {entry}.Pos',
                    f'execute if entity {target} run data modify entity {target} Age set from storage lab:first_night {entry}.Age'])
                if mob=='sheep':commands.append(f'execute if entity {target} run data modify entity {target} Color set from storage lab:first_night {entry}.Color')
    return commands


def fauna_extend_commands(bounds,core,key,old_margin=0):
    """Snapshot an untouched ring once; never overwrite the pristine core animal list."""
    x0,x1,z0,z1=bounds;cx0,cx1,cz0,cz1=core
    cx0-=old_margin;cx1+=old_margin;cz0-=old_margin;cz1+=old_margin
    strips=[(x0,cx0,z0,z1),(cx1,x1,z0,z1),(cx0,cx1,z0,cz0),(cx0,cx1,cz1,z1)]
    path='sites.s'+(key+'-ring16').replace('-','_');guard=f'execute unless data storage lab:first_night {path}.Saved run '
    result=[guard+'data modify storage lab:first_night '+path+' set value {'+','.join(m+':[]' for m in SPECIES)+'}']
    for a,b,c,d in strips:
        if a>=b or c>=d:continue
        selector=f'x={a},y=-64,z={c},dx={b-a-1},dy=383,dz={d-c-1}'
        for mob in SPECIES:result.append(guard+f'execute as @e[type=minecraft:{mob},tag=!lab_world_survival,{selector}] run data modify storage lab:first_night {path}.{mob} append from entity @s')
    result.append(f'data modify storage lab:first_night {path}.Saved set value 1b')
    return result
