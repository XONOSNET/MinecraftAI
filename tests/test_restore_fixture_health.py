"""Fixture validation must distinguish normal play from owned maintenance."""
import copy
import io
import json
import os
from types import SimpleNamespace

import pytest

from scripts import verify_restore_throughput as probe


def running():
    return dict(protocol='fixture-health-v1',stopped=False,ram_percent=80,
                server=dict(pid=36160,ready=True,busy=False,desired_running=True,error=None,
                            phase='starting',bots_online=8),
                world_training=dict(session=dict(phase='running')),
                world_learning=dict(phase='baseline',restore_pending=False),
                performance=dict(persistence=dict(pending=0,error=None)))


def stopped():
    sample=running()
    sample.update(stopped=True)
    sample['server'].update(pid=None,ready=False,desired_running=False,phase='stopped',bots_online=0)
    sample['world_learning'].update(phase='paused')
    sample['world_training']['session'].update(phase='paused')
    return sample


@pytest.fixture
def responses(monkeypatch):
    def set_response(sample):
        frozen=copy.deepcopy(sample)
        monkeypatch.setattr(probe.urllib.request,'urlopen',
                            lambda *args,**kwargs:io.BytesIO(json.dumps(frozen).encode('utf8')))
    monkeypatch.setattr(probe.psutil,'virtual_memory',lambda:SimpleNamespace(available=5*2**30))
    return set_response


@pytest.fixture
def ownership(tmp_path,monkeypatch):
    monkeypatch.setattr(probe,'ROOT',tmp_path)
    (tmp_path/'logs').mkdir()
    (tmp_path/'data').mkdir()
    marker=tmp_path/'data/lab-stopped'
    marker.write_text('owned-throughput-maintenance-unique\n',encoding='utf8')
    manifest=tmp_path/'logs/native-maintenance.json'
    payload=dict(phase='paper_saved_for_native',owned_marker=marker.read_text(encoding='utf8'),
                 old_paper_pid=36160,old_paper_creation_time=1700000000.25)
    manifest.write_text(json.dumps(payload),encoding='utf8')
    def absent(pid):
        raise probe.psutil.NoSuchProcess(pid)
    monkeypatch.setattr(probe.psutil,'Process',absent)
    monkeypatch.setattr(probe,'port_open',lambda port:False)
    return manifest,marker,payload


def test_normal_play_health_accepts_same_ready_paper_and_eight_bots(responses):
    sample=running();responses(sample)
    assert probe.health(36160,initial=True)==sample


@pytest.mark.parametrize('section,key,value',[
    ('server','ready',False),('server','busy',True),('server','error','lifecycle failed'),
    ('server','desired_running',False),('server','bots_online',7),
    ('world_learning','phase','recovering'),('world_learning','phase','paused'),
    ('world_learning','phase','stopping'),('world_learning','phase','error'),
])
def test_normal_play_rejects_unhealthy_lifecycle(responses,section,key,value):
    sample=running();sample[section][key]=value;responses(sample)
    with pytest.raises(RuntimeError,match='health veto'):
        probe.health(36160)


@pytest.mark.parametrize('change', ['stopped','restoring','persistence','ram_initial','ram_running','wrong_pid'])
def test_normal_play_rejects_release_vetoes(responses,change):
    sample=running()
    if change=='stopped':sample['stopped']=True
    if change=='restoring':sample['world_training']['session']['phase']='restoring'
    if change=='persistence':sample['performance']['persistence']['error']='write failed'
    if change=='ram_initial':sample['ram_percent']=87
    if change=='ram_running':sample['ram_percent']=89
    if change=='wrong_pid':sample['server']['pid']=12345
    responses(sample)
    with pytest.raises(RuntimeError):
        probe.health(36160,initial=change=='ram_initial')


def test_initial_free_memory_requirement_remains(responses,monkeypatch):
    responses(running())
    monkeypatch.setattr(probe.psutil,'virtual_memory',lambda:SimpleNamespace(available=4*2**30-1))
    with pytest.raises(RuntimeError,match='4 GiB'):
        probe.health(36160,initial=True)


def test_stopped_service_is_never_accepted_by_default_mode(responses):
    responses(stopped())
    with pytest.raises(RuntimeError,match='Production health veto'):
        probe.health(initial=True)


def test_owned_maintenance_accepts_only_saved_stopped_paper(ownership,responses):
    manifest,_,payload=ownership
    guard=probe.MaintenanceGuard(manifest)
    sample=stopped();responses(sample)
    assert probe.health(initial=True,maintenance=guard)==sample
    description=guard.description()
    assert description['old_paper_pid']==payload['old_paper_pid']
    assert description['production_expected_stopped'] is True
    assert 'owned_marker' not in description


@pytest.mark.parametrize('section,key,value',[
    ('server','pid',12345),('server','ready',True),('server','busy',True),
    ('server','desired_running',True),('server','error','restart failed'),
    ('server','phase','starting'),('world_learning','phase','recovering'),
    ('world_learning','phase','baseline'),('world_learning','restore_pending',True),
])
def test_maintenance_rejects_lifecycle_change(ownership,responses,section,key,value):
    guard=probe.MaintenanceGuard(ownership[0])
    sample=stopped();sample[section][key]=value;responses(sample)
    with pytest.raises(RuntimeError,match='maintenance lifecycle veto'):
        probe.health(maintenance=guard)


@pytest.mark.parametrize('change',['not_stopped','ram_initial','ram_running','persistence'])
def test_maintenance_keeps_explicit_health_and_memory_vetoes(ownership,responses,change):
    guard=probe.MaintenanceGuard(ownership[0]);sample=stopped()
    if change=='not_stopped':sample['stopped']=False
    if change=='ram_initial':sample['ram_percent']=87
    if change=='ram_running':sample['ram_percent']=89
    if change=='persistence':sample['performance']['persistence']['error']='write failed'
    responses(sample)
    with pytest.raises(RuntimeError):
        probe.health(initial=change=='ram_initial',maintenance=guard)


@pytest.mark.parametrize('mutation',['marker_removed','marker_changed','marker_overwritten',
                                    'manifest_removed','manifest_changed'])
def test_owned_proof_mutations_fail_closed(ownership,responses,mutation):
    manifest,marker,payload=ownership
    guard=probe.MaintenanceGuard(manifest);responses(stopped())
    if mutation=='marker_removed':marker.unlink()
    if mutation=='marker_changed':marker.write_text('Stopped by human',encoding='utf8')
    if mutation=='marker_overwritten':
        old=marker.stat();os.utime(marker,ns=(old.st_atime_ns,old.st_mtime_ns+1_000_000))
    if mutation=='manifest_removed':manifest.unlink()
    if mutation=='manifest_changed':
        payload['phase']='completed';manifest.write_text(json.dumps(payload),encoding='utf8')
    with pytest.raises((RuntimeError,OSError)):
        probe.health(maintenance=guard)


def test_foreign_manifest_path_cannot_authorize_maintenance(ownership,tmp_path):
    foreign=tmp_path/'proof.json'
    foreign.write_text(ownership[0].read_text(encoding='utf8'),encoding='utf8')
    with pytest.raises(ValueError,match='under ignored logs'):
        probe.MaintenanceGuard(foreign)


@pytest.mark.parametrize('change',['wrong_marker','wrong_phase','bad_pid','bad_creation'])
def test_invalid_initial_manifest_is_rejected(ownership,change):
    manifest,_,payload=ownership
    if change=='wrong_marker':payload['owned_marker']='another owner'
    if change=='wrong_phase':payload['phase']='active'
    if change=='bad_pid':payload['old_paper_pid']=True
    if change=='bad_creation':payload['old_paper_creation_time']=float('nan')
    manifest.write_text(json.dumps(payload),encoding='utf8')
    with pytest.raises(ValueError,match='ownership manifest'):
        probe.MaintenanceGuard(manifest)


def test_original_paper_process_must_have_exited(ownership,monkeypatch):
    created=ownership[2]['old_paper_creation_time']
    monkeypatch.setattr(probe.psutil,'Process',lambda pid:SimpleNamespace(create_time=lambda:created,is_running=lambda:True))
    with pytest.raises(RuntimeError,match='still running'):
        probe.MaintenanceGuard(ownership[0])


def test_unrelated_reused_pid_is_not_mistaken_for_the_old_paper(ownership,monkeypatch,responses):
    created=ownership[2]['old_paper_creation_time']+60
    monkeypatch.setattr(probe.psutil,'Process',lambda pid:SimpleNamespace(create_time=lambda:created,is_running=lambda:True))
    guard=probe.MaintenanceGuard(ownership[0]);responses(stopped())
    assert probe.health(maintenance=guard)['stopped'] is True


def test_reopened_production_port_rejects_offline_maintenance(ownership,monkeypatch,responses):
    guard=probe.MaintenanceGuard(ownership[0]);responses(stopped())
    monkeypatch.setattr(probe,'port_open',lambda port:port==25565)
    with pytest.raises(RuntimeError,match='reopened'):
        probe.health(maintenance=guard)
