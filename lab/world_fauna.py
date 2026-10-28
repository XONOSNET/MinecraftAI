"""Repeat natural passive animals without inventory grants or duplicated UUIDs."""
SPECIES=('cow','pig','sheep','chicken','rabbit')

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
