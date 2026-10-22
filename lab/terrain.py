"""Seeded terrain geometry for owned practice lanes. No policy-visible world oracle."""
TERRAIN_STAGES=[
 {'name':'Climb and descend a stepped ridge','terrain':'ridge'},
 {'name':'Cross rolling hills','terrain':'rolling'},
 {'name':'Cross a narrow raised bridge','terrain':'bridge'},
 {'name':'Find an offset raised crossing','terrain':'offset_bridge'},
 {'name':'Navigate a boulder slalom','terrain':'boulders'},
 {'name':'Navigate a low-ceiling passage','terrain':'tunnel'},
 {'name':'Cross ridges and avoid magma','terrain':'ridge_hazard'},
 {'name':'Navigate varied held-out terrain','terrain':'varied'},
]
for s in TERRAIN_STAGES:s.update(skill='terrain',task='terrain',difficulty=3,threshold=.8)

def layout(style,rng,x,z,goal):
    blocks=[];waypoints=[goal];direction=rng.choice((-1,1))
    def box(x1,y1,z1,x2,y2,z2,block='cobblestone'):
        blocks.append([x1,y1,z1,x2,y2,z2,block])
    if style in ('ridge','rolling','varied'):
        heights=([1,2,3,3,2,1] if style=='ridge' else [1,2,1,0,1,2,1])
        if style=='varied':heights=rng.choice(([1,2,1,0,1,2,1],[1,1,2,2,1,0,1],[0,1,2,3,2,1,0]))
        for i,h in enumerate(heights):
            if h:box(x-10+i*3,181,z-5,x-8+i*3,180+h,z+5)
        if style=='varied':
            box(x+12,180,z-3,x+14,180,z+3,'blue_ice')
    elif style in ('bridge','offset_bridge'):
        gap=z+(direction*3 if style=='offset_bridge' else 0)
        box(x-7,180,z-5,x+7,180,z+5,'water')
        radius=1
        box(x-7,181,gap-radius,x+7,181,gap+radius,'oak_planks')
        waypoints=[[x-10,181.1,gap+.5],[x+10,181.1,gap+.5],goal]
    elif style in ('boulders','tunnel'):
        waypoints=[]
        for i,offset in enumerate((-7,3)):
            gap=z+direction*(3 if i==0 else -3);width=rng.choice((1,2))
            box(x+offset,181,z-5,x+offset+width-1,183,z+5,'mossy_cobblestone')
            box(x+offset,181,gap-1,x+offset+width-1,183,gap+1,'air')
            waypoints.extend([[x+offset-2,181.1,gap+.5],[x+offset+width+1,181.1,gap+.5]])
        waypoints.append(goal)
        if style=='tunnel':box(x-10,183,z-5,x+8,183,z+5,'stone')
    elif style=='ridge_hazard':
        for offset in (-11,9):box(x+offset,181,z-5,x+offset+2,181,z+5)
        box(x-2,180,z-1,x+2,180,z+1,'magma_block')
        waypoints=[[x-5,181.1,z+direction*4],[x+5,181.1,z+direction*4],goal]
    else:raise ValueError('Unknown terrain course')
    return blocks,waypoints
