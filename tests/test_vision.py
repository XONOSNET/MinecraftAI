import math
import pytest
from lab.vision import VisionLines

def test_vision_toggle_persistence_scope_and_bounds(tmp_path):
    commands=[];now=[100];v=VisionLines(tmp_path/'vision.json',commands.append,clock=lambda:now[0])
    agent={'connected':True,'last_seen':100,'position':[1,181,2],'vision':dict(yaw=0,hfov=math.pi/2,vfov=1,range=16,eye_height=1.62)}
    agents={'LabAI0':agent,'LabAI1':agent}
    v.tick(agents,{},True);assert not commands
    v.configure({'enabled':True});v.tick(agents,{},True);assert len(commands)==40
    v.tick(agents,{},True);assert len(commands)==40
    assert all('minecraft:end_rod' in c and '@a[distance=..48]' in c for c in commands)
    assert VisionLines(tmp_path/'vision.json',commands.append).settings['enabled']
    now[0]+=1;v.configure({'enabled':True,'scope':'all'});v.tick(agents,{},True);assert len(commands)==120
    now[0]+=1;agent['vision']['yaw']=float('nan');v.tick(agents,{},True);assert len(commands)==120
    with pytest.raises(ValueError):v.configure({'enabled':'yes'})
