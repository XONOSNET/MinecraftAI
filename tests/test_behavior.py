import copy
import json

import pytest

from lab.behavior import BehaviorRules


def rules(tmp_path):
    return BehaviorRules(tmp_path/'behavior.json',['LabAI0','LabAI1'])


def save(r,scope,values):
    return r.update({'scope':scope,'values':values,'revision':r.frozen()['revision']})


def test_inheritance_bot_override_global_minimum_and_restart(tmp_path):
    r=rules(tmp_path)
    save(r,'LabAI1',{'player_clearance':2.5,'aim_pitch_deg_per_sec':165})
    save(r,'global',{'player_clearance':3,'aim_pitch_deg_per_sec':210})
    assert r.effective('LabAI0')['values']['aim_pitch_deg_per_sec']==210
    bot=r.effective('LabAI1')
    assert bot['values']['aim_pitch_deg_per_sec']==165
    assert bot['values']['player_clearance']==3 and bot['sources']['player_clearance']=='global minimum'
    assert rules(tmp_path).snapshot()==r.snapshot()
    save(r,'LabAI1',{})
    assert r.effective('LabAI1')['values']['aim_pitch_deg_per_sec']==210


@pytest.mark.parametrize('scope,values',[
    ('LabAI2',{}),('global',{'unknown':3}),('global',{'player_clearance':True}),
    ('global',{'player_clearance':1}),('global',{'route_replan_ms':float('nan')}),
    ('global',{'route_replan_ms':float('inf')}),('LabAI0',{'stationary_timeout_seconds':120}),
    ('LabAI0',{'reservation_seconds':10}),('LabAI0',{'aim_yaw_deg_per_sec':999})])
def test_rejects_invalid_rules_without_changing_saved_settings(tmp_path,scope,values):
    r=rules(tmp_path);before=r.snapshot()
    with pytest.raises(ValueError):save(r,scope,values)
    assert r.snapshot()==before and not r.path.exists()


def test_revision_conflicts_and_pinned_snapshot_do_not_follow_live_edits(tmp_path):
    r=rules(tmp_path);frozen=r.frozen();original=copy.deepcopy(frozen)
    save(r,'global',{'aim_yaw_deg_per_sec':400})
    with pytest.raises(ValueError,match='reload'):r.update({'scope':'global','values':{},'revision':frozen['revision']})
    assert r.effective('LabAI0',frozen)['values']['aim_yaw_deg_per_sec']==300
    assert frozen==original and r.effective('LabAI0')['values']['aim_yaw_deg_per_sec']==400
    assert r.frozen()['revision']!=frozen['revision']


def test_checked_in_overrides_only_change_bounded_turning_speeds(tmp_path):
    from pathlib import Path
    config=json.loads(Path('config/behavior.json').read_text(encoding='utf-8'))
    r=BehaviorRules(tmp_path/'behavior.json',[f'LabAI{i}' for i in range(8)])
    frozen=r.frozen(config)
    assert len({r.effective(f'LabAI{i}',frozen)['values']['walk_yaw_deg_per_sec'] for i in range(8)})==3
    assert all(r.effective(f'LabAI{i}',frozen)['values']['player_clearance']==2 for i in range(8))
