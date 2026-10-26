"""Prepare isolated native verifier input without touching live service state."""
import json
from pathlib import Path
from lab.world_training import WorldTraining
from lab.world_survival import MISSION_LESSONS
commands=[]
path=Path('logs/survival-fixture-world.json')
world=WorldTraining(path,commands.append,Path('logs/unused-fixture.log'))
world.session=dict(active=True,phase='running',run='survival-native',mission='home_defense',prepared=True,bots=['LabAI0'],bounds=[-146,-18,-160,-32],layout=0,template='native',camp_anchor=None)
world.camp('LabAI0',[-82.5,170.1,-96.5])
plot=world.session['camp']['plots'][0];world.quarry('LabAI0')
station=world.survival(dict(agent='LabAI0',run='survival-native',action='station'),'Fixture')
setup=commands[:];commands.clear()
home=world.survival(dict(agent='LabAI0',run='survival-native',action='home',position=[plot['x']+2,plot['y'],plot['z']-1]),'Fixture');home_commands=commands[:];commands.clear()
threat=world.survival(dict(agent='LabAI0',run='survival-native',action='threat'),'Fixture');threat_commands=commands[:]
out=dict(setup=setup,station=station,home=home,home_commands=home_commands,threat=threat,threat_commands=threat_commands,plot=plot,lessons=MISSION_LESSONS['home_defense'])
Path('logs/survival-fixture.json').write_text(json.dumps(out).replace('LabAI0','LabSurvivalChk'),encoding='utf-8')
