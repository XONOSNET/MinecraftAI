import sqlite3
from lab.identities import Identities
from lab.camera_input import CameraInput

def test_serials_survive_restarts_and_death_events_deduplicate():
    db=sqlite3.connect(':memory:');db.execute('CREATE TABLE episodes(agent TEXT,success INTEGER)')
    registry=Identities(db,8);before=registry.get('LabAI0')
    registry.record('LabAI0','death','one');registry.record('LabAI0','death','one')
    after=Identities(db,8).get('LabAI0')
    assert before['serial']==after['serial']=='A0001' and after['deaths']==1
    assert registry.get('LabAI1')['deaths']==0

def test_game_jump_detection_is_scoped_and_consumes_each_edge_once(tmp_path):
    path=tmp_path/'console';path.write_text('');commands=[];reader=CameraInput(path,commands.append)
    class Observers:
        sessions={'Xonosnet':{'player':'Xonosnet','enabled':True,'cycle_enabled':True}}
        advances=0
        def next_bot(self,*args):self.advances+=1
    observers=Observers();reader.tick(observers,['Xonosnet'],{})
    assert any('input:{jump:true}' in c for c in commands)
    path.write_text("[12:00:00 INFO]: Added tag 'lab_cam_advance' to Xonosnet\n")
    reader.tick(observers,['Xonosnet'],{});reader.tick(observers,['Xonosnet'],{})
    assert observers.advances==1
