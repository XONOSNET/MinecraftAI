"""Repeat natural passive animals without inventory grants or duplicated UUIDs."""
SPECIES=('cow','pig','sheep','chicken','rabbit')

def fauna_commands(bounds,key,snapshot):
    x0,x1,z0,z1=bounds;path='sites.s'+key.replace('-','_')
    selector=f'x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1}'
    commands=[]
    if snapshot:
        commands.append('data modify storage lab:first_night '+path+' set value {'+','.join(m+':[]' for m in SPECIES)+'}')
        for mob in SPECIES:commands.append(f'execute as @e[type=minecraft:{mob},tag=!lab_world_survival,{selector}] run data modify storage lab:first_night {path}.{mob} append from entity @s')
    else:
        for mob in SPECIES:
            commands.append(f'kill @e[type=minecraft:{mob},tag=!lab_world_survival,{selector}]')
            for index in range(32):
                tag=f'lab_fauna_{mob}_{index}';entry=f'{path}.{mob}[{index}]';target=f'@e[tag={tag},limit=1]'
                commands.extend([
                    f'execute if data storage lab:first_night {entry} run summon minecraft:{mob} {(x0+x1)/2} 195 {(z0+z1)/2} {{Tags:["{tag}","lab_natural_fauna"],PersistenceRequired:1b}}',
                    f'execute if entity {target} run data modify entity {target} Pos set from storage lab:first_night {entry}.Pos',
                    f'execute if entity {target} run data modify entity {target} Age set from storage lab:first_night {entry}.Age'])
                if mob=='sheep':commands.append(f'execute if entity {target} run data modify entity {target} Color set from storage lab:first_night {entry}.Color')
    return commands
