"""A physical enclosed shelter, scoped to the doorway shelter course."""
def layout(x,z):
    gx=x+10;r=3;door=[gx-r,z]
    return {'shelter_box':[gx-r,gx+r,z-r,z+r],'shelter_door':door,
            'shelter_hold_seconds':2,'goal':[gx+.5,181.1,z+.5],
            'waypoints':[[door[0]-2,181.1,z+.5],[door[0]+1.8,181.1,z+.5],[gx+.5,181.1,z+.5]]}


def commands(task):
    lo,hi,zlo,zhi=task['shelter_box'];dx,dz=task['shelter_door'];gx=(lo+hi)//2;z=(zlo+zhi)//2
    result=[f'fill {lo} 180 {zlo} {hi} 180 {zhi} minecraft:oak_planks',
            f'fill {lo} 184 {zlo} {hi} 184 {zhi} minecraft:stone_bricks']
    for xx in (lo,hi):result.append(f'fill {xx} 181 {zlo} {xx} 183 {zhi} minecraft:cobblestone')
    for zz in (zlo,zhi):result.append(f'fill {lo} 181 {zz} {hi} 183 {zz} minecraft:cobblestone')
    for zz in (zlo,zhi):result.append(f'setblock {gx} 182 {zz} minecraft:glass')
    result += [f'setblock {dx} 181 {dz} minecraft:oak_door[facing=east,half=lower,hinge=left,open=false]',
               f'setblock {dx} 182 {dz} minecraft:oak_door[facing=east,half=upper,hinge=left,open=false]',
               f'setblock {gx} 183 {z+1} minecraft:lantern[hanging=true]']
    return result


def success(task,metrics):
    return (metrics.get('shelter_secure',False) and metrics.get('shelter_seconds',0)>=task['shelter_hold_seconds']
        and metrics.get('health',0)>=18 and metrics.get('inside',False) and abs(metrics.get('y',0)-181)<1.5)
