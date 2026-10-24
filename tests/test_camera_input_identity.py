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

def test_generated_names_migrate_persist_and_remain_unique():
    db=sqlite3.connect(':memory:');db.execute('CREATE TABLE episodes(agent TEXT,success INTEGER)')
    db.execute('CREATE TABLE agent_identity(agent TEXT PRIMARY KEY,serial TEXT UNIQUE,tracked_since REAL)')
    db.execute("INSERT INTO agent_identity VALUES('LabAI0','A0001',123)")
    first=Identities(db,8)
    names=[first.get(f'LabAI{i}')['display_name'] for i in range(8)]
    assert len(set(names))==8 and all(name.isalpha() and len(name)<=16 for name in names)
    second=Identities(db,10)
    assert [second.get(f'LabAI{i}')['display_name'] for i in range(8)]==names
    second.record('LabAI0','death','unique-event')
    assert second.get('LabAI0')['display_name']==names[0]
    assert second.get('LabAI0')['tracked_since']==123
    assert len({second.get(f'LabAI{i}')['display_name'] for i in range(10)})==10
