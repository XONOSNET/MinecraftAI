"""Exercise the real route without importing the service or touching live data."""
import ast
import json
import copy
import sqlite3
from pathlib import Path
from types import SimpleNamespace as NS
from fastapi.responses import JSONResponse
from lab.dashboard_state import world_view,learning_view,compact_status


def test_status_encodes_outside_control_lock_freezes_bots_and_reuses_bounded_cache():
    class Lock:
        held=False
        def __enter__(self):self.held=True
        def __exit__(self,*args):self.held=False
    lock=Lock();db=sqlite3.connect(':memory:')
    db.executescript('CREATE TABLE run_config(run,agents,trials);CREATE TABLE events(id,time,event,payload);')
    now=[100.0];calls=[];agents={'LabAI0':{'position':[1,2,3]}}
    def encode(payload,**kwargs):
        assert not lock.held
        calls.append(payload);agents['LabAI0']['position'][0]=99
        return JSONResponse(payload,**kwargs)
    snapshot=NS(snapshot=lambda:{})
    memory=NS(total=1,percent=20)
    env=dict(lock=lock,db=db,copy=copy,JSONResponse=encode,time=NS(monotonic=lambda:now[0],time=lambda:100),
        dashboard_cache={'at':0,'response':None},episode_metrics=lambda:[],episode_cache={'raw':0},
        world_training=NS(session=None,saved={'history':[]}),world_learning=NS(state={'history':[]}),
        world_view=world_view,learning_view=learning_view,compact_status=compact_status,SCENARIOS=[],LEVELS=[],readiness=lambda _: {},
        evolution=NS(snapshot=lambda *a,**kw:{'history':[]}),active_skill=lambda:'navigation',
        vision_lines=NS(settings={}),harvest_markers=NS(settings={}),behavior_rules=snapshot,
        practice_protection=snapshot,AGENT_COUNT=1,trial_limit=lambda:3,observers=snapshot,
        psutil=NS(virtual_memory=lambda:memory,cpu_count=lambda:1),mode='paused',run='test',agents=agents,
        learning_context=lambda:(NS(parameters_count=4),None,[]),practice=None,server_alive=lambda:True,
        server_details=lambda:{},online_players=lambda:[],operators=lambda:[],system_cpu=0,started=0,
        training=False,training_jobs=snapshot,training_results={},curriculum=snapshot,skill_status=lambda:{},
        lan_bridge=None,lan_error=None,json=json,STAGES_V9=[],STAGES_V8=[],LEGACY_STAGES=[])
    tree=ast.parse((Path(__file__).parents[1]/'lab/service.py').read_text(encoding='utf-8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='status');fn.decorator_list=[]
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'status-route','exec'),env)
    route=env['status'];first=route()
    assert json.loads(first.body)['agents']['LabAI0']['position']==[1,2,3]
    assert route() is first and len(calls)==1
    assert route(fresh=True) is not first and len(calls)==2
    now[0]+=.3;route();assert len(calls)==3
    route(compact=False);assert len(calls)==4
    db.close()
