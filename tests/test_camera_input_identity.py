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


def test_native_camera_pack_and_feedback_are_private_and_do_not_repeat(tmp_path):
    path=tmp_path/'console';path.write_text('');commands=[];pack=tmp_path/'pack';reader=CameraInput(path,commands.append,pack)
    class Observers:
        sessions={'Xonosnet':{'player':'Xonosnet','enabled':True,'cycle_enabled':False}}
        changes=[]
        def adjust(self,owner,key):self.changes.append((owner,key))
    o=Observers();reader.tick(o,['Xonosnet'],{})
    assert 'input:{sprint:true}' in (pack/'data/lab_camera/function/input.mcfunction').read_text()
    assert 'lab_camera:tick' in (pack/'data/minecraft/tags/function/tick.json').read_text()
    path.write_bytes(b'> console\r\x1b[2K[12:00:00 INFO]: Xonosnet has 4 tags: lab_camera_controls, lab_cam_event, lab_cam_far, lab_cam_view\n[12:00:00 INFO]: <Stranger> Xonosnet has the following 1 entity tags: lab_cam_near\n[12:00:00 INFO]: [Stranger: Triggered [lab_camera] (set value to 5)]\n')
    reader.tick(o,['Xonosnet'],{});reader.tick(o,['Xonosnet'],{})
    assert o.changes==[('Xonosnet','Enter'),('Xonosnet','ArrowUp')]
    with path.open('a') as f:f.write('[12:00:01 INFO]: \x1b[3m\x1b[37m[Xonosnet: Triggered [lab_camera] (set value to 4)]\x1b[0m\n')
    reader.tick(o,['Xonosnet'],{});assert o.changes[-1]==('Xonosnet','ArrowLeft')

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


def test_space_advances_with_automatic_cycling_off_and_stays_scoped(tmp_path):
    path=tmp_path/'console';path.write_text('');commands=[];pack=tmp_path/'pack'
    reader=CameraInput(path,commands.append,pack)
    class Observers:
        sessions={'Xonosnet':{'player':'Xonosnet','enabled':True,'cycle_enabled':False}}
        advances=[]
        def next_bot(self,owner,agents):self.advances.append(owner)
    o=Observers();reader.tick(o,['Xonosnet'],{})
    source=(pack/'data/lab_camera/function/input.mcfunction').read_text()
    assert 'execute if predicate' in source and 'if entity @s[tag=lab_cam_cycle]' not in source
    assert 'unless entity @s[tag=lab_cam_space_held]' in source
    with path.open('a') as f:f.write('[12:00:00 INFO]: Xonosnet has 3 tags: lab_camera_controls, lab_cam_event, lab_cam_advance\n[12:00:00 INFO]: Stranger has 1 tags: lab_cam_advance\n')
    reader.tick(o,['Xonosnet'],{});reader.tick(o,['Xonosnet'],{})
    assert o.advances==['Xonosnet']


def test_legacy_space_detection_is_enabled_for_manual_followers(tmp_path):
    path=tmp_path/'console';path.write_text('');commands=[];reader=CameraInput(path,commands.append)
    class Observers:
        sessions={'Xonosnet':{'player':'Xonosnet','enabled':True,'cycle_enabled':False}}
    reader.tick(Observers(),['Xonosnet'],{})
    assert any('execute as Xonosnet if predicate' in c and 'jump:true' in c for c in commands)
