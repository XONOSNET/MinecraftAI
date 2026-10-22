"""Bounded survival-skill exercises in owned practice lanes, never the player's builds."""
import math
import random
from .config import AGENT_COUNT, LANE_END, is_agent

EXTRA_STAGES=[
 {'name':'Single-block hurdles','skill':'traversal','task':'jump','difficulty':1},
 {'name':'Repeated hurdles','skill':'traversal','task':'jump','difficulty':2},
 {'name':'Avoid water hazards','skill':'hazards','task':'hazard','difficulty':1},
 {'name':'Avoid magma hazards','skill':'hazards','task':'hazard','difficulty':2},
 {'name':'Explore new ground','skill':'exploration','task':'explore','difficulty':1},
 {'name':'Explore a larger area','skill':'exploration','task':'explore','difficulty':2},
 {'name':'Harvest and collect a log','skill':'gathering','task':'gather','difficulty':1},
 {'name':'Harvest and collect three logs','skill':'gathering','task':'gather','difficulty':2},
 {'name':'Eat when hungry','skill':'nutrition','task':'eat','difficulty':1},
 {'name':'Recover from severe hunger','skill':'nutrition','task':'eat','difficulty':2},
 {'name':'Find overhead shelter','skill':'shelter','task':'shelter','difficulty':1},
 {'name':'Seek shelter from farther away','skill':'shelter','task':'shelter','difficulty':2},
 {'name':'Offset doorway','skill':'traversal','task':'detour','difficulty':1,'doors':1},
 {'name':'Alternating doorways','skill':'traversal','task':'detour','difficulty':2,'doors':2},
 {'name':'Four hurdles','skill':'traversal','task':'jump','difficulty':3,'hurdles':[-9,-3,3,9]},
 {'name':'Raised causeway','skill':'traversal','task':'jump','difficulty':3,'causeway':True},
 {'name':'Long water trench','skill':'hazards','task':'hazard','difficulty':1,'hazard_length':5},
 {'name':'Twin magma islands','skill':'hazards','task':'hazard','difficulty':2,'twin_hazards':True},
 {'name':'Explore around pillars','skill':'exploration','task':'explore','difficulty':3,'coverage_target':22,'pillars':True},
 {'name':'Explore the perimeter','skill':'exploration','task':'explore','difficulty':3,'coverage_target':32},
 {'name':'Harvest four logs','skill':'gathering','task':'gather','difficulty':3,'wood_target':4},
 {'name':'Harvest five logs','skill':'gathering','task':'gather','difficulty':3,'wood_target':5},
 {'name':'Eat until full','skill':'nutrition','task':'eat','difficulty':2,'food_target':20},
 {'name':'Eat then reach safety','skill':'nutrition','task':'eat_route','difficulty':2,'food_target':18},
 {'name':'Find a compact canopy','skill':'shelter','task':'shelter','difficulty':2,'roof_radius':1},
 {'name':'Reach shelter through a doorway','skill':'shelter','task':'shelter','difficulty':2,'doors':1},
 {'name':'Hurdle and water course','skill':'integration','task':'mixed','difficulty':1},
 {'name':'Hurdles and magma course','skill':'integration','task':'mixed','difficulty':2},
]
for stage in EXTRA_STAGES:
    stage.update(threshold=.8)
    if stage['skill']=='nutrition':stage['examples_per_cycle']=150
SKILLS=['navigation','traversal','hazards','exploration','gathering','nutrition','shelter','integration']

def task_spec(stage,seed,index,evaluation):
    if not 0<=index<AGENT_COUNT:raise ValueError('Unknown practice lane')
    rng=random.Random(seed);center=480 if evaluation else 320;z=index*12
    x=center+rng.randint(-3,3);difficulty=stage['difficulty'];kind=stage['task']
    start=[center-16,181.1,z+rng.uniform(-1,1)];goal=[center+16,181.1,z]
    if kind=='gather':goal=[x+10,181.1,z]
    if kind=='gather' and stage.get('wood_target',0)>3:goal=[x+11,181.1,z+.5]
    if kind=='shelter':goal=[x+10,181.1,z];start[0]=center-(10 if difficulty==1 else 18)
    waypoints=[[x-4,181.1,z+4],[x+4,181.1,z+4],goal] if kind in ('hazard','mixed') else [goal]
    doors=[]
    for j in range(stage.get('doors',0)):
        wall=x-5+j*10;gap=z+(3 if j%2==0 else -3);doors.append([wall,gap])
    if doors:
        waypoints=[]
        for wall,gap in doors:waypoints.extend([[wall-2,181.1,gap],[wall+2,181.1,gap]])
        waypoints.append(goal)
    if stage.get('hazard_length'):waypoints=[[x-5,181.1,z+4],[x+5,181.1,z+4],goal]
    if stage.get('twin_hazards'):waypoints=[[x-9,181.1,z+4],[x+9,181.1,z+4],goal]
    return {'kind':kind,'skill':stage['skill'],'difficulty':difficulty,'center':center,'lane_z':z,'feature_x':x,
            'start':start,'goal':goal,'yaw':-math.pi/2+rng.uniform(-.35,.35),'max_steps':240,
            'wood_target':stage.get('wood_target',1 if difficulty==1 else 3),'coverage_target':stage.get('coverage_target',10 if difficulty==1 else 18),'food_target':stage.get('food_target',18),
            'doors':doors,'hurdles':stage.get('hurdles',[-3] if difficulty==1 else [-7,0,7]),'causeway':stage.get('causeway',False),'pillars':stage.get('pillars',False),'roof_radius':stage.get('roof_radius',3),'hazard_length':stage.get('hazard_length',3),'twin_hazards':stage.get('twin_hazards',False),
            'waypoints':waypoints,
            'bounds':[center-23,center+24,z-5,z+6], 'reset_wait':(5.5 if difficulty==1 else 6.5) if kind in ('eat','eat_route') else .7}

def arena_commands(center):
    # Each fill stays under vanilla's 32,768-block limit.
    commands=[f'fill {center-24} 179 -6 {center+24} 180 {LANE_END} minecraft:sea_lantern']
    for lo in range(-6,LANE_END+1,40):
        commands.append(f'fill {center-24} 181 {lo} {center+24} 186 {min(lo+39,LANE_END)} minecraft:air')
    for z in range(-6,LANE_END+1,12):commands.append(f'fill {center-24} 181 {z} {center+24} 183 {z} minecraft:glass')
    for x in (center-24,center+24):commands.append(f'fill {x} 181 -6 {x} 183 {LANE_END} minecraft:glass')
    return commands

def reset_commands(task,name):
    if not is_agent(name):raise ValueError('Unknown bot')
    c,z,x=task['center'],task['lane_z'],task['feature_x'];kind=task['kind'];level=task['difficulty']
    commands=[f'fill {c-23} 179 {z-5} {c+23} 180 {z+5} minecraft:sea_lantern',
              f'fill {c-23} 181 {z-5} {c+23} 185 {z+5} minecraft:air',
              f'kill @e[type=minecraft:item,x={c-23},y=179,z={z-5},dx=46,dy=7,dz=10]',
              f'clear {name}',f'effect clear {name}',f'effect give {name} minecraft:instant_health 1 5 true']
    if kind=='jump' and not task.get('causeway'):
        for offset in task['hurdles']:commands.append(f'fill {x+offset} 181 {z-5} {x+offset} 181 {z+5} minecraft:oak_planks')
    elif kind=='jump' and task.get('causeway'):
        commands.append(f'fill {x-5} 181 {z-5} {x+5} 181 {z+5} minecraft:oak_planks')
    elif kind in ('hazard','mixed'):
        block='water' if level==1 else 'magma_block'
        half=task.get('hazard_length',3)//2
        for offset in ([-5,5] if task.get('twin_hazards') else [0]):
            commands.append(f'fill {x+offset-half} 180 {z-1} {x+offset+half} 180 {z+1} minecraft:{block}')
        if kind=='mixed':
            for offset in ([-10] if level==1 else [-10,10]):commands.append(f'fill {x+offset} 181 {z-5} {x+offset} 181 {z+5} minecraft:oak_planks')
    elif kind=='gather':
        # Compact adjacent trunks keep higher targets observable by the current camera
        # and let the player collect drops without an undisclosed look-up action.
        for offset in range(task['wood_target']):commands.append(f'setblock {x+10+offset//3} {181+offset%3} {z} minecraft:oak_log')
    elif kind in ('eat','eat_route'):
        commands.extend([f'give {name} minecraft:bread 6',f'effect give {name} minecraft:hunger {5 if level==1 else 6} 255 true'])
    elif kind=='shelter':
        radius=task.get('roof_radius',3)
        commands.append(f'fill {x+10-radius} 184 {z-radius} {x+10+radius} 184 {z+radius} minecraft:sea_lantern')
    for wall,gap in task.get('doors',[]):
        commands.append(f'fill {wall} 181 {z-5} {wall} 183 {z+5} minecraft:oak_planks')
        commands.append(f'fill {wall} 181 {gap-1} {wall} 183 {gap+1} minecraft:air')
    if task.get('pillars'):
        for offset in (-6,2,10):commands.append(f'fill {x+offset} 181 {z-1} {x+offset} 183 {z+1} minecraft:oak_planks')
    if kind not in ('eat','eat_route'):commands.append(f'effect give {name} minecraft:saturation 2 5 true')
    return commands

def task_success(task,metrics):
    if metrics.get('health',0)<=0 or not metrics.get('inside',False) or abs(metrics.get('y',0)-181)>1.5:return False
    kind=task['kind']
    if kind=='gather':return metrics.get('wood',0)>=task['wood_target']
    if kind in ('eat','eat_route'):return metrics.get('food',0)>=task.get('food_target',18) and metrics.get('eaten',0)>=1 and metrics.get('hunger_observed',False) and (kind=='eat' or metrics.get('distance',100)<1.25)
    if kind=='explore':return metrics.get('coverage',0)>=task['coverage_target']
    if kind=='shelter':return metrics.get('sheltered',False) and metrics.get('distance',100)<3
    return metrics.get('distance',100)<1.25 and metrics.get('health',0)>=18 and metrics.get('hazard_contacts',0)==0 and abs(metrics.get('y',0)-181)<1.5


def minecraft_yaw(radians):
    # Mineflayer uses PI - server yaw, as specified by its installed conversions module.
    return (180-radians*180/math.pi)%360
