"""Prerequisite-first course order. Numbers below identify the original v6 catalogue."""
import re

TIERS=(
 ('Navigation foundations',[1,2,3,4]),
 ('Basic survival and movement',[13,11,15,9,5,63,64]),
 ('Everyday skills and doors',[14,27,12,16,10,17,46,6,18,47,48]),
 ('Precision and water safety',[25,26,29,30,28,23,24,19,20,7,21,41,50]),
 ('Terrain and route changes',[33,34,37,38,65,42,44,51,49,66]),
 ('Hazards and difficult crossings',[8,22,52,53,43,35,36,61,45,62]),
 ('Combined skill courses',[31,32,39,40,54,55,56,57]),
 ('Final gauntlets',[58,59,60,67,68,69,70]),
)

def ordered_stages(legacy):
    indices=[number-1 for _,numbers in TIERS for number in numbers]
    if sorted(indices)!=list(range(len(legacy))):raise ValueError('Course order must include every stage exactly once')
    result=[]
    for tier,(label,numbers) in enumerate(TIERS,1):
        for number in numbers:
            stage=dict(legacy[number-1])
            stage.update(id=re.sub(r'[^a-z0-9]+','-',stage['name'].lower()).strip('-'),tier=tier,tier_name=label,legacy_stage=number)
            result.append(stage)
    return result
