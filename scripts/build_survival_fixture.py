"""Prepare isolated native verifier input without touching live service state."""
import json
import sys
from pathlib import Path
from lab.world_training import WorldTraining
from lab.world_survival import MISSION_LESSONS
south='--south-mine' in sys.argv
name='LabAI4' if south else 'LabAI0'
commands=[]
path=Path('logs/survival-fixture-world.json')
world=WorldTraining(path,commands.append,Path('logs/unused-fixture.log'))
world.session=dict(active=True,phase='running',run='survival-native',mission='home_defense',prepared=True,bots=[f'LabAI{i}' for i in range(8)] if south else ['LabAI0'],bounds=[-146,-18,-160,-32],layout=0,template='native',camp_anchor=None)
world.camp('LabAI0',[-82.5,170.1,-96.5])
plot=world.session['camp']['plots'][4 if south else 0];world.quarry(name)
station=world.survival(dict(agent=name,run='survival-native',action='station'),'Fixture')
setup=commands[:];commands.clear()
home=world.survival(dict(agent=name,run='survival-native',action='home',position=[plot['x']+2,plot['y'],plot['z']-1]),'Fixture');home_commands=commands[:];commands.clear()
threat=world.survival(dict(agent=name,run='survival-native',action='threat'),'Fixture');threat_commands=commands[:]
out=dict(setup=setup,station=station,home=home,home_commands=home_commands,threat=threat,threat_commands=threat_commands,plot=plot,lessons=MISSION_LESSONS['home_defense'])
points=[]
for command in setup:
    parts=command.split()
    if parts[0]=='fill':points.extend([list(map(int,parts[1:4])),list(map(int,parts[4:7]))])
    elif parts[0]=='setblock':points.append(list(map(int,parts[1:4])))
out['region']=dict(minX=min(q[0] for q in points)-1,maxX=max(q[0] for q in points)+1,minY=min(q[1] for q in points),maxY=max(q[1] for q in points),minZ=min(q[2] for q in points)-1,maxZ=max(q[2] for q in points)+1)
out['orientation']='south' if south else 'north'
Path('logs/survival-fixture.json').write_text(json.dumps(out).replace(name,'LabSurvivalChk'),encoding='utf-8')
