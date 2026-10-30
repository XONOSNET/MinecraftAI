import json
import sqlite3
import threading
import time
import numpy as np
import pytest
from lab.persistence import TelemetryPersistence
from lab.skills import SkillBank
from lab.model import Policy


def database(path):
    with sqlite3.connect(path) as db:
        db.executescript('PRAGMA journal_mode=WAL;CREATE TABLE agents(id PRIMARY KEY,profile,state);CREATE TABLE memory(agent,x,y,z,block,seen,PRIMARY KEY(agent,x,y,z));')


def row(root,i):
    return dict(agent='LabAI0',profile='{}',state=json.dumps({'step':i}),hits=[('LabAI0',i,64,0,'oak_log',float(i))],trajectory=str(root/'transitions.f32'),transition=np.asarray([i,5,.25],dtype=np.float32).tobytes())


def test_ordered_telemetry_flush_preserves_every_transition_and_final_state(tmp_path):
    db=tmp_path/'lab.sqlite';database(db);writer=TelemetryPersistence(db,capacity=4)
    for i in range(60):writer.step(row(tmp_path,i))
    writer.flush()
    with sqlite3.connect(db) as conn:
        assert json.loads(conn.execute('SELECT state FROM agents').fetchone()[0])=={'step':59}
        assert conn.execute('SELECT count(*) FROM memory').fetchone()[0]==60
    a=np.fromfile(tmp_path/'transitions.f32',dtype=np.float32).reshape(-1,3)
    assert a[:,0].tolist()==list(range(60))
    writer.close();assert not writer.thread.is_alive()


def test_slow_replay_compression_does_not_block_inference_submission(tmp_path):
    db=tmp_path/'lab.sqlite';database(db);writer=TelemetryPersistence(db);entered=threading.Event();release=threading.Event();original=writer._replay
    def slow(payload):entered.set();assert release.wait(5);original(payload)
    writer._replay=slow
    samples=[([1.]*82,5)];writer.replay(tmp_path/'skill.npz',samples,2,100,tmp_path/'skill.json');assert entered.wait(2)
    # The replay snapshot cannot change when the live deque appends a new example.
    samples.append(([2.]*82,0));writer.step(row(tmp_path,1));assert writer.pending==2
    release.set();writer.flush()
    with np.load(tmp_path/'skill.npz') as data:assert len(data['actions'])==1 and int(data['observation_version'])==2
    assert json.loads((tmp_path/'skill.json').read_text())['samples']==1
    writer.close()


def test_queue_applies_backpressure_without_dropping_rows(tmp_path):
    db=tmp_path/'lab.sqlite';database(db);writer=TelemetryPersistence(db,capacity=1);entered=threading.Event();release=threading.Event();original=writer._replay
    def slow(payload):entered.set();assert release.wait(5);original(payload)
    writer._replay=slow;writer.replay(tmp_path/'skill.npz',[([1.],0)]);assert entered.wait(2)
    writer.step(row(tmp_path,1));done=threading.Event()
    thread=threading.Thread(target=lambda:(writer.step(row(tmp_path,2)),done.set()));thread.start();assert not done.wait(.1)
    release.set();assert done.wait(3);thread.join();writer.close()
    assert np.fromfile(tmp_path/'transitions.f32',dtype=np.float32).reshape(-1,3)[:,0].tolist()==[1,2]


def test_disk_failure_is_reported_to_flush_and_new_submissions(tmp_path):
    db=tmp_path/'lab.sqlite';database(db);writer=TelemetryPersistence(db)
    writer.step({**row(tmp_path,1),'trajectory':str(tmp_path/'missing'/'out.f32')})
    with pytest.raises(RuntimeError,match='Persistence writer failed'):writer.flush()
    with pytest.raises(RuntimeError,match='Persistence writer failed'):writer.step(row(tmp_path,2))
    writer.thread.join(2)
    with sqlite3.connect(db) as conn:assert conn.execute('SELECT count(*) FROM agents').fetchone()[0]==0


def test_skill_replay_callback_freezes_buffer_and_still_loads_compatible_archive(tmp_path):
    db=tmp_path/'lab.sqlite';database(db);writer=TelemetryPersistence(db);bank=SkillBank(tmp_path/'skills',tmp_path/'weights',persist=writer.replay)
    bank.get('expedition',Policy(16))
    for i in range(100):bank.record('expedition',[float(i)]*82,i%7)
    writer.flush()
    reloaded=SkillBank(tmp_path/'skills',tmp_path/'weights').get('expedition',Policy(16))
    assert len(reloaded['samples'])==100 and reloaded['samples'][0][0][0]==0
    writer.close()


def test_pending_world_snapshots_coalesce_to_latest_complete_state(tmp_path):
    db=tmp_path/'lab.sqlite';database(db);writer=TelemetryPersistence(db);entered=threading.Event();release=threading.Event();original=writer._replay
    def slow(payload):entered.set();assert release.wait(5);original(payload)
    writer._replay=slow;writer.replay(tmp_path/'skill.npz',[([1.],0)]);assert entered.wait(2)
    path=tmp_path/'world.json';writer.document(path,{'history':[1],'home':None});writer.document(path,{'history':[1,2],'home':'bed'})
    assert writer.pending==2
    release.set();writer.close();assert json.loads(path.read_text())=={'history':[1,2],'home':'bed'}


def test_world_save_freezes_live_metadata_and_retains_immutable_history(tmp_path):
    from lab.world_training import WorldTraining
    captured=[];world=WorldTraining(tmp_path/'world.json',lambda _:None,tmp_path/'log',persist=lambda p,d:captured.append(d))
    world.saved.update(history=[{'run':'completed'}],homes={'LabAI0':{'position':[1,64,2]}},first_night_memory={'site':{'LabAI0':{'resources':[]}}})
    world.save();world.saved['history'].append({'run':'next'});world.saved['homes']['LabAI0']['position'][0]=99
    world.saved['first_night_memory']['site']['LabAI0']['resources'].append({'kind':'wood'})
    assert captured[0]['history']==[{'run':'completed'}]
    assert captured[0]['homes']['LabAI0']['position'][0]==1
    assert captured[0]['first_night_memory']['site']['LabAI0']['resources']==[]
