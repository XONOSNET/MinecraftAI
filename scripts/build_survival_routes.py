"""Generate all eight production station geometries for offline path validation."""
import json
from pathlib import Path
from lab.world_training import WorldTraining
commands=[]
world=WorldTraining(Path('logs/survival-route-world.json'),commands.append,Path('logs/unused-fixture.log'))
world.session=dict(active=True,phase='running',run='routes',mission='home_defense',prepared=True,bots=[f'LabAI{i}' for i in range(8)],bounds=[16384,16512,16384,16512],layout=0,template='routes',camp_anchor=None)
world.camp('LabAI0',[16448.5,70.1,16448.5]);stations=[]
for name in world.session['bots']:
    world.quarry(name);stations.append(world.survival(dict(agent=name,run='routes',action='station'),name))
Path('logs/survival-routes-input.json').write_text(json.dumps(dict(commands=commands,stations=stations,camp=world.session['camp'],bounds=world.session['bounds'])),encoding='utf-8')
