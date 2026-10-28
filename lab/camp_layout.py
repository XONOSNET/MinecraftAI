"""Small prepared home plots and lanes, preserving the surrounding natural grove."""
def clear_areas(x,y,z,plots):
    areas=[]
    for p in plots:
        px,pz=p['x'],p['z']
        areas.append([px-3,px+3,pz-3,pz+3,y+4])
        areas.append([px-1,px+1,pz-5,pz-3,y+2])
    for row in sorted({p['z'] for p in plots}):
        xs=[p['x'] for p in plots if p['z']==row]
        areas.append([min(xs)-1,max(xs)+1,row-5,row-4,y+2])
    areas.append([x-1,x+1,z-10,z,y+2])
    return areas

def commands(x,y,z,plots):
    result=[]
    for x0,x1,z0,z1,top in clear_areas(x,y,z,plots):
        result.append(f'fill {x0} {y-1} {z0} {x1} {y-1} {z1} minecraft:grass_block')
        result.append(f'fill {x0} {y} {z0} {x1} {top} {z1} minecraft:air')
    return result
