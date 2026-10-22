"""Bounded survival-skill exercises in owned practice lanes, never the player's builds."""
import math
import random

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
]
for stage in EXTRA_STAGES:
    stage.update(threshold=.8)
    if stage['skill']=='nutrition':stage['examples_per_cycle']=150
SKILLS=['navigation','traversal','hazards','exploration','gathering','nutrition','shelter']

def task_spec(stage,seed,index,evaluation):
    if not 0<=index<5:raise ValueError('Unknown practice lane')
    rng=random.Random(seed);center=480 if evaluation else 320;z=index*12
    x=center+rng.randint(-3,3);difficulty=stage['difficulty'];kind=stage['task']
    start=[center-16,181.1,z+rng.uniform(-1,1)];goal=[center+16,181.1,z]
    if kind=='gather':goal=[x+10,181.1,z]
    if kind=='shelter':goal=[x+10,181.1,z];start[0]=center-(10 if difficulty==1 else 18)
    return {'kind':kind,'skill':stage['skill'],'difficulty':difficulty,'center':center,'lane_z':z,'feature_x':x,
            'start':start,'goal':goal,'yaw':-math.pi/2+rng.uniform(-.35,.35),'max_steps':240,
            'wood_target':1 if difficulty==1 else 3,'coverage_target':10 if difficulty==1 else 18,
            'waypoints':[[x-4,181.1,z+4],[x+4,181.1,z+4],goal] if kind=='hazard' else [goal],
            'bounds':[center-23,center+24,z-5,z+6], 'reset_wait':(5.5 if difficulty==1 else 6.5) if kind=='eat' else .7}

def arena_commands(center):
    # Each fill stays under vanilla's 32,768-block limit.
    commands=[f'fill {center-24} 179 -6 {center+24} 180 54 minecraft:sea_lantern',
              f'fill {center-24} 181 -6 {center+24} 186 54 minecraft:air']
    for z in (-6,6,18,30,42,54):commands.append(f'fill {center-24} 181 {z} {center+24} 183 {z} minecraft:glass')
    for x in (center-24,center+24):commands.append(f'fill {x} 181 -6 {x} 183 54 minecraft:glass')
    return commands

def reset_commands(task,name):
    if name not in [f'LabAI{i}' for i in range(5)]:raise ValueError('Unknown bot')
    c,z,x=task['center'],task['lane_z'],task['feature_x'];kind=task['kind'];level=task['difficulty']
    commands=[f'fill {c-23} 179 {z-5} {c+23} 180 {z+5} minecraft:sea_lantern',
              f'fill {c-23} 181 {z-5} {c+23} 185 {z+5} minecraft:air',
              f'kill @e[type=minecraft:item,x={c-23},y=179,z={z-5},dx=46,dy=7,dz=10]',
              f'clear {name}',f'effect clear {name}',f'effect give {name} minecraft:instant_health 1 5 true']
    if kind=='jump':
        for offset in ([-3] if level==1 else [-7,0,7]):commands.append(f'fill {x+offset} 181 {z-5} {x+offset} 181 {z+5} minecraft:oak_planks')
    elif kind=='hazard':
        block='water' if level==1 else 'magma_block'
        commands.append(f'fill {x-1} 180 {z-1} {x+1} 180 {z+1} minecraft:{block}')
    elif kind=='gather':
        for offset in ([0] if level==1 else [0,1,2]):commands.append(f'setblock {x+10} {181+offset} {z} minecraft:oak_log')
    elif kind=='eat':
        commands.extend([f'give {name} minecraft:bread 6',f'effect give {name} minecraft:hunger {5 if level==1 else 6} 255 true'])
    elif kind=='shelter':commands.append(f'fill {x+7} 184 {z-3} {x+14} 184 {z+3} minecraft:sea_lantern')
    if kind!='eat':commands.append(f'effect give {name} minecraft:saturation 2 5 true')
    return commands

def task_success(task,metrics):
    if metrics.get('health',0)<=0 or not metrics.get('inside',False) or abs(metrics.get('y',0)-181)>1.5:return False
    kind=task['kind']
    if kind=='gather':return metrics.get('wood',0)>=task['wood_target']
    if kind=='eat':return metrics.get('food',0)>=18 and metrics.get('eaten',0)>=1 and metrics.get('hunger_observed',False)
    if kind=='explore':return metrics.get('coverage',0)>=task['coverage_target']
    if kind=='shelter':return metrics.get('sheltered',False) and metrics.get('distance',100)<3
    return metrics.get('distance',100)<1.25 and metrics.get('health',0)>=18 and metrics.get('hazard_contacts',0)==0 and abs(metrics.get('y',0)-181)<1.5


def minecraft_yaw(radians):
    # Mineflayer uses PI - server yaw, as specified by its installed conversions module.
    return (180-radians*180/math.pi)%360
