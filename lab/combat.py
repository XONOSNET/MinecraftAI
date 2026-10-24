"""Bounded, tagged equipment and real-monster combat exercises."""
import json
import math
import random

COMBAT_STAGES = [
    dict(name='Equip a wooden sword', weapon='wooden_sword', armor=None, mobs=[]),
    dict(name='Equip sword and leather armor', weapon='stone_sword', armor='leather', mobs=[]),
    dict(name='Practice timed strikes on a stationary zombie', weapon='stone_sword', armor='leather', mobs=['zombie'], stationary=True),
    dict(name='Defeat a moving zombie', weapon='stone_sword', armor='chainmail', mobs=['zombie']),
    dict(name='Recover spacing against a husk', weapon='iron_sword', armor='chainmail', mobs=['husk'], close=True),
    dict(name='Defeat two separated zombies', weapon='iron_sword', armor='iron', mobs=['zombie','zombie']),
    dict(name='Pursue a zombie around cover', weapon='iron_sword', armor='iron', mobs=['zombie'], cover=True),
    dict(name='Equip shield and fight a husk', weapon='iron_sword', armor='iron', mobs=['husk'], shield=True),
    dict(name='Close on a skeleton with a shield', weapon='iron_sword', armor='iron', mobs=['skeleton'], shield=True),
    dict(name='Clear a mixed monster room', weapon='iron_sword', armor='iron', mobs=['zombie','skeleton','zombie'], shield=True),
]
for index, stage in enumerate(COMBAT_STAGES):
    stage.update(skill='combat', task='combat', difficulty=index+1, threshold=.8, examples_per_cycle=1800)


def spec(stage, seed, index, evaluation):
    rng=random.Random(seed);c=480 if evaluation else 320;z=index*12
    return dict(kind='combat',skill='combat',difficulty=stage['difficulty'],center=c,lane_z=z,feature_x=c,
        start=[c-10,181.1,z+.5],goal=[c+9,181.1,z+.5],yaw=-math.pi/2+rng.uniform(-.2,.2),
        max_steps=40 if not stage['mobs'] else 500,reset_wait=1,waypoints=[[c+9,181.1,z+.5]],bounds=[c-22,c+23,z-5,z+6],
        terrain_blocks=[],actual_doors=[],doors=[],wood_target=0,coverage_target=1,food_target=18,
        weapon=stage['weapon'],armor=stage['armor'],shield=stage.get('shield',False),
        mobs=stage['mobs'],stationary=stage.get('stationary',False),cover=stage.get('cover',False),
        close=stage.get('close',False),mob_jitter=rng.uniform(-.5,.5),
        mob_label=f'LabCombat{index}-{seed}',mob_tag=f'lab_combat_LabAI{index}',kill_target=len(stage['mobs']),min_health=4)


def commands(task, name):
    c,z=task['center'],task['lane_z']
    result=[f'give {name} minecraft:{task["weapon"]} 1']
    if task['armor']:
        result += [f'give {name} minecraft:{task["armor"]}_{part} 1' for part in ('helmet','chestplate','leggings','boots')]
    if task['shield']:result.append(f'give {name} minecraft:shield 1')
    # Enclose the lane so monsters cannot enter neighbouring trials or the world.
    for zz in (z-5,z+5):result.append(f'fill {c-22} 181 {zz} {c+22} 184 {zz} minecraft:glass')
    for xx in (c-22,c+22):result.append(f'fill {xx} 181 {z-5} {xx} 184 {z+5} minecraft:glass')
    result.append(f'fill {c-22} 185 {z-5} {c+22} 185 {z+5} minecraft:glass')
    if task['cover']:result.append(f'fill {c-2} 181 {z} {c} 183 {z+1} minecraft:stone_bricks')
    for i,mob in enumerate(task['mobs']):
        x=c-7 if task['close'] else c+2+i*3
        zz=z+.5+([-2,2,0][i] if len(task['mobs'])>1 else task['mob_jitter'])
        label=json.dumps(json.dumps({'text':task['mob_label']}))
        nbt=f'{{Tags:["lab_combat","{task["mob_tag"]}"],CustomName:{label},CustomNameVisible:0b,PersistenceRequired:1b,CanPickUpLoot:0b,NoAI:{1 if task["stationary"] else 0}b,DeathLootTable:"minecraft:empty"}}'
        result.append(f'summon minecraft:{mob} {x} 181 {zz:.3f} {nbt}')
    return result


def success(task, metrics):
    return (metrics.get('health',0)>=task['min_health'] and metrics.get('inside',False)
        and abs(metrics.get('y',0)-181)<1.5 and metrics.get('weapon_equipped',False)
        and metrics.get('armor_equipped',False) and (not task['shield'] or metrics.get('shield_equipped',False))
        and metrics.get('kills',0)>=task['kill_target']
        and (not task['kill_target'] or metrics.get('hits',0)>=task['kill_target']))
