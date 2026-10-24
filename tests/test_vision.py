import math
import re

import pytest

from lab.vision import VisionLines, beam_transform


def agent(now=100):
    return {'connected':True,'last_seen':now,'position':[1,181,2],
            'vision':dict(yaw=0,hfov=math.pi/2,vfov=1,range=16,eye_height=1.62)}


def test_five_solid_beams_scope_toggle_and_throttle(tmp_path):
    commands=[];now=[100]
    v=VisionLines(tmp_path/'vision.json',commands.append,clock=lambda:now[0])
    agents={'LabAI0':agent(),'LabAI1':agent()}
    v.tick(agents,{},True)
    assert len(commands)==1 and commands[0].startswith('kill ')
    v.configure({'enabled':True});v.tick(agents,{},True)
    summons=[c for c in commands if c.startswith('summon ')]
    assert len(summons)==5
    assert sum('cyan_concrete' in c for c in summons)==4
    assert sum('yellow_concrete' in c for c in summons)==1
    assert all('particle' not in c for c in commands)
    assert 'scale:[0.035000f,16.000000f,0.035000f]' in summons[-1]
    assert 'scale:[0.025000f,9.600000f,0.025000f]' in summons[0]
    count=len(commands);v.tick(agents,{},True);assert len(commands)==count
    now[0]+=.21;v.tick(agents,{},True)
    assert len(commands)==count+6  # One grouped teleport and five transform updates.
    assert VisionLines(tmp_path/'vision.json',commands.append).settings['enabled']
    v.configure({'enabled':True,'scope':'all'});v.tick(agents,{},True)
    assert len(v.live)==2
    v.configure({'enabled':False});v.tick(agents,{},True)
    assert not v.live and commands[-1].startswith('kill ')
    with pytest.raises(ValueError):v.configure({'enabled':'yes'})


def test_invalid_stale_and_unfollowed_beams_are_removed(tmp_path):
    commands=[];now=[100]
    v=VisionLines(tmp_path/'vision.json',commands.append,clock=lambda:now[0])
    agents={'LabAI0':agent(),'LabAI1':agent()}
    v.configure({'enabled':True,'scope':'all'});v.tick(agents,{},True)
    now[0]+=.21;agents['LabAI0']['vision']['yaw']=float('nan')
    v.tick(agents,{},True);assert set(v.live)=={'LabAI1'}
    v.configure({'enabled':True,'scope':'followed'})
    v.tick(agents,{'viewer':{'enabled':True,'target':'LabAI0'}},True)
    assert not v.live
    agents['LabAI0']=agent();now[0]=104
    v.tick(agents,{},True);assert not v.live
    now[0]=105;agents['LabAI0']=agent(105);v.tick(agents,{},True)
    assert len(v.live)==1
    v.tick(agents,{},False);assert not v.live
    count=len(commands);v.tick(agents,{},True)
    assert commands[count].startswith('kill ') and len(v.live)==1


@pytest.mark.parametrize('direction',[(0,0,-1),(1,0,0),(-.5,.5,math.sqrt(.5)),(0,-.8,.6)])
def test_beam_transform_endpoints_and_orientation(direction):
    transform=beam_transform(direction,16,.025)
    values=[float(v) for v in re.findall(r'(-?\d+\.\d+)f',transform)]
    translation=values[:3];scale=values[3:6];x,y,z,w=values[6:10]
    # Quaternion rotate the block's centerline endpoints.
    def rotate(p):
        q=(x,y,z)
        cross=lambda a,b:(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
        uv=cross(q,p);uuv=cross(q,uv)
        return [p[i]+2*w*uv[i]+2*uuv[i] for i in range(3)]
    for end in (0,1):
        local=[scale[0]/2,scale[1]*end,scale[2]/2]
        point=[a+b for a,b in zip(translation,rotate(local))]
        assert point==pytest.approx([d*16*end for d in direction],abs=3e-5)
