"""Automatic world transitions retain configured bots across slow replay capture."""
import ast
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace as NS
import pytest
from fastapi import HTTPException


def fixture(automatic=True):
    selected=[];world=NS(session=None,park=lambda names:None)
    def start(data,names):
        selected.extend(names);world.session={'run':'next-world'};return {'session':world.session}
    world.start=start
    env=dict(lock=nullcontext(),HTTPException=HTTPException,AGENT_COUNT=8,
        agents={f'LabAI{i}':{'connected':True,'last_seen':80 if i==1 else 99} for i in range(8)},
        is_agent=lambda n:n.startswith('LabAI'),time=NS(time=lambda:100),training_jobs=NS(running=False),
        server_control=NS(snapshot=lambda:{'busy':False}),server_ready=lambda:True,
        curriculum=NS(state={},pause=lambda reason:None),world_learning=NS(state={'enabled':automatic}),
        behavior_rules=NS(frozen=lambda *args:{}),world_training=world,record_run=lambda:None,console=lambda c:None,event=lambda *args:None)
    tree=ast.parse((Path(__file__).parents[1]/'lab/service.py').read_text(encoding='utf8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_begin_world')
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'world-roster','exec'),env)
    return env,selected


def test_slow_locked_phase_preparation_cannot_shrink_the_automatic_roster():
    env,selected=fixture();env['_begin_world']({})
    assert selected==[f'LabAI{i}' for i in range(8)]


def test_a_known_disconnection_cannot_start_a_partial_automatic_world():
    env,selected=fixture();env['agents']['LabAI1']['connected']=False
    with pytest.raises(HTTPException):env['_begin_world']({})
    assert selected==[]


def test_manual_world_keeps_its_existing_connected_subset_behavior():
    env,selected=fixture(automatic=False);env['_begin_world']({})
    assert len(selected)==7 and 'LabAI1' not in selected
