"""Read-only human descriptions derived from the canonical executable stage definitions."""
import copy

FAMILIES={
 'navigation':'Find a goal from a seeded starting position and heading, using depth rays and the goal bearing.',
 'jump':'Navigate a lane with low hurdles or a raised causeway, timing jumps while keeping a safe landing.',
 'hazard':'Reach the goal by detouring around water or magma rather than crossing the hazardous surface.',
 'mixed':'Combine low-hurdle jumps with a safe route around water or magma.',
 'explore':'Visit distinct spatial cells instead of repeatedly pacing the same patch of ground.',
 'gather':'Find visible oak logs, harvest them, and physically collect the dropped wood.',
 'eat':'Use supplied bread after hunger is observed, recovering food to the target.',
 'eat_route':'Eat supplied bread after hunger is observed, then travel to the destination.',
 'shelter':'Find the designated overhead canopy and arrive beneath it.',
 'detour':'Navigate offset wall openings; these openings are gaps rather than interactive doors.',
 'terrain':'Follow a seeded route across terrain geometry, maintaining safe footing and clearance.',
 'advanced':'Combine precision traversal with the explicit bridges, doors, floor surfaces and traps listed below.',
 'expedition':'Follow three-dimensional checkpoints, accounting for height, water, breath and footholds.',
 'combat':'Equip the supplied gear and fight only the assigned monsters in an enclosed practice lane.',
}
EXPEDITIONS={
 'swim':'Swim across a pool; later variants require reaching higher or more distant exits.',
 'stairs':'Climb increasingly demanding rock steps and land at the destination height.',
 'ladder':'Approach and climb ladders to an elevated platform.',
 'cave':'Navigate enclosed cave passages with limited clearance.',
 'catwalk':'Cross a narrow elevated walkway with safe foot placement.',
 'waterfall':'Swim upward through a waterfall to reach an upper landing.',
 'flooded':'Traverse a flooded cave while managing breath and finding the exit.',
 'cave_steps':'Ascend stepped passages within a cave.',
 'bent_catwalk':'Follow turns along elevated narrow walkways.',
 'summit':'Combine waterfall ascent and upper-platform traversal.',
 'realistic':'Traverse natural-looking terrain, buildings or volcanic obstacles using the listed features.',
}


def describe(stage, index):
    kind=stage.get('task','navigation');details=[]
    if kind=='navigation':
        details=[f"Goal distance {stage['min_distance']}–{stage['max_distance']} blocks",f"Starting heading variation up to {stage['yaw']:.2f} radians"]
    if kind=='jump':details.append('Raised causeway' if stage.get('causeway') else f"{len(stage.get('hurdles',[-3] if stage['difficulty']==1 else [-7,0,7]))} hurdle rows")
    if kind in ('hazard','mixed'):details.append(('Water' if stage['difficulty']==1 else 'Magma')+' hazards; contact invalidates the task')
    if kind=='gather':details.append(f"Collect {stage.get('wood_target',1 if stage['difficulty']==1 else 3)} oak logs")
    if kind=='explore':details.append(f"Visit {stage.get('coverage_target',10 if stage['difficulty']==1 else 18)} distinct spatial cells")
    if kind in ('eat','eat_route'):details.append(f"Reach food {stage.get('food_target',18)}/20 and consume bread after hunger")
    if kind=='shelter':details.append(f"Canopy radius {stage.get('roof_radius',3)} blocks; arrive within 3 blocks of its goal")
    if stage.get('doors'):details.append(f"{stage['doors']} offset wall openings")
    if stage.get('terrain_profile'):details.append('Terrain profile: '+stage['terrain_profile'])
    if stage.get('terrain'):details.append('Terrain style: '+stage['terrain'].replace('_',' '))
    for label,features in (('Layout',stage.get('features',{})),('Terrain features',stage.get('realistic_features',{}))):
        for key,value in features.items():
            if value is not False and value is not None:details.append(key.replace('_',' ').capitalize()+(': '+str(value) if value is not True else ''))
    if stage.get('expedition'):
        details.insert(0,EXPEDITIONS.get(stage['expedition'],FAMILIES['expedition']))
        details.append('Difficulty variant '+str(stage['difficulty']))
        if stage.get('realistic'):details.append('Terrain recipe: '+str(stage['realistic']).replace('_',' '))
    if kind=='combat':
        details.extend(['Weapon: '+stage['weapon'].replace('_',' '),'Armor: '+(stage.get('armor') or 'none required'),
            'Enemies: '+(', '.join(stage['mobs']) or 'equipment exercise only'),
            'Shield required' if stage.get('shield') else 'No shield required'])
        if stage.get('stationary'):details.append('Stationary target; actual kill required')
        if stage.get('cover'):details.append('Pursue around solid cover')
        if stage.get('close'):details.append('Enemy starts close to exercise spacing')
    if kind=='navigation':objective='Reach within 1.25 blocks of the goal while alive and within 1.5 blocks of its height.'
    elif kind=='combat':objective='Equip all required gear; defeat every assigned monster; stay in bounds with at least 4 health.'
    elif kind=='expedition':objective='Reach all required checkpoints and the goal height with at least 18 health; avoid hazards and satisfy any water/jump requirements.'
    elif kind in ('gather','explore','eat','eat_route','shelter'):objective='Complete the stated resource, coverage, nutrition or shelter target while alive and inside the practice lane.'
    else:objective='Reach the destination with at least 18 health and no hazard contacts; advanced door courses also require opening their doors.'
    return {'id':stage['id'],'stage':index,'number':index+1,'name':stage['name'],'skill':stage.get('skill','navigation'),
        'tier':stage['tier'],'tier_name':stage['tier_name'],'kind':kind,'description':FAMILIES[kind],
        'details':details,'objective':objective,'threshold':stage.get('threshold',.9),
        'examples_per_cycle':stage.get('examples_per_cycle',1500),
        'definition':copy.deepcopy(stage)}


def catalogue(stages):
    return [describe(stage,index) for index,stage in enumerate(stages)]
