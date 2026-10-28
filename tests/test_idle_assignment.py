"""Paused heartbeats must not scan the episode archive."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
from contextlib import nullcontext
import pytest
from fastapi import HTTPException


def test_paused_assignment_returns_before_episode_queries_without_bypassing_agent_validation():
    class NoQueries:
        def execute(self,*args):raise AssertionError('Paused heartbeat queried historical episodes')
    env=dict(lock=nullcontext(),is_agent=lambda n:n=='LabAI0',HTTPException=HTTPException,
        agents={'LabAI0':{}},world_training=NS(session=None),mode='paused',run='idle',db=NoQueries())
    tree=ast.parse((Path(__file__).parents[1]/'lab/service.py').read_text(encoding='utf-8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_assignment');fn.decorator_list=[]
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'idle-assignment','exec'),env)
    reply=env['_assignment']({'agent':'LabAI0','index':0,'episode':0})
    assert reply['mode']=='paused' and reply['run']=='idle'
    with pytest.raises(HTTPException):env['_assignment']({'agent':'other','index':0})
