"""Persistent curriculum scheduler; all hooks run under the service's shared RLock."""
import hashlib
import math
import random
import copy
import json
import time
from pathlib import Path
from .tasks import EXTRA_STAGES
from .config import AGENT_COUNT

STAGES=[{'name':'Short routes','min_distance':3,'max_distance':7,'yaw':.6},
        {'name':'Longer routes','min_distance':7,'max_distance':14,'yaw':1.5},
        {'name':'Full turns','min_distance':10,'max_distance':22,'yaw':3.141593},
        {'name':'Long routes and full turns','min_distance':20,'max_distance':30,'yaw':3.141593}]
STAGES.extend(EXTRA_STAGES)

def route_seed(cycle_seed,agent,episode,evaluation):
    identity=f"{cycle_seed}:{agent}:{episode}:{'test' if evaluation else 'teacher'}"
    return int.from_bytes(hashlib.sha256(identity.encode()).digest()[:8],'big')

def sample_route(stage_index,seed,center):
    stage=STAGES[stage_index];rng=random.Random(seed)
    distance=rng.uniform(stage['min_distance'],stage['max_distance']);angle=rng.uniform(-math.pi,math.pi)
    dx=math.sin(angle)*distance/2;dz=math.cos(angle)*distance/2
    ox=rng.uniform(-1,1);oz=rng.uniform(-1,1)
    start=[center+ox-dx,181.1,oz-dz];goal=[center+ox+dx,181.1,oz+dz]
    yaw=math.atan2(-(goal[0]-start[0]),-(goal[2]-start[2]))+rng.uniform(-stage['yaw'],stage['yaw'])
    return start,goal,yaw

class Curriculum:
    def __init__(self,path,hooks,clock=time.time):
        self.path=Path(path);self.h=hooks;self.clock=clock
        self.state={'enabled':False,'phase':'idle','stage':0,'cycle':0,'streak':0,'history':[],
                    'message':'Ready for autonomous navigation training.','max_cycles':112,'max_hours':6,
                    'examples_per_cycle':1500,'threshold':.9,'restore_pending':False}
        if self.path.exists():
            saved=json.loads(self.path.read_text(encoding='utf-8'));self.state.update(saved)
            if self.state.get('catalog_version',1)<2:
                if self.state['max_cycles']==12:self.state['max_cycles']=48
                if self.state['phase']=='completed' and self.state['stage']==3:
                    self.state.update(stage=4,phase='paused',streak=0,message='Navigation passed. Broader skills are ready to resume.')
            if self.state['enabled']:
                self.state.update(phase='recovering',phase_at=self.clock(),message='Recovering the saved curriculum after restart.')
        if self.state.get('catalog_version',1)<3:
            if self.state['max_cycles']==48:self.state['max_cycles']=80
            if self.state['phase']=='completed' and self.state['stage']==15:
                self.state.update(stage=16,phase='paused',streak=0,message='More simulations are ready. Resume to continue.')
        if self.state.get('agent_count',5)!=AGENT_COUNT:
            self.state['streak']=0
        if self.state.get('catalog_version',1)<4:
            if self.state['max_cycles']==80:self.state['max_cycles']=112
            if self.state['phase']=='completed' and self.state['stage']==31:
                self.state.update(stage=32,phase='paused',streak=0,message='Terrain curricula are ready to resume.')
        self.state.update(catalog_version=4,agent_count=AGENT_COUNT)
    def save(self):
        self.path.parent.mkdir(exist_ok=True,parents=True)
        tmp=self.path.with_suffix('.tmp');tmp.write_text(json.dumps(self.state,indent=2),encoding='utf-8');tmp.replace(self.path)
    def snapshot(self):
        s=copy.deepcopy(self.state);s['stages']=STAGES;s['stage_name']=STAGES[s['stage']]['name'];s['skill']=STAGES[s['stage']].get('skill','navigation');s['active_examples']=STAGES[s['stage']].get('examples_per_cycle',s['examples_per_cycle']);s['active_threshold']=STAGES[s['stage']].get('threshold',s['threshold']);return s
    def start(self):
        s=self.state
        if s['enabled']:return self.snapshot()
        if s['phase']=='completed':raise ValueError('All implemented curricula are complete. Review the results before adding further skills.')
        self.h['pause']()
        s.update(enabled=True,phase='waiting',session_cycles=0,started_at=self.clock(),phase_at=self.clock(),message='Waiting for Minecraft and all configured bots.');self.save();return self.snapshot()
    def pause(self,reason='Autonomous training paused by you.'):
        s=self.state;s.update(enabled=False,phase='paused',message=reason)
        self.h['pause']();self.h['cancel']();self.save();return self.snapshot()
    def phase(self,name,message):
        self.state.update(phase=name,phase_at=self.clock(),message=message);self.save()
    def evaluate(self,phase):
        s=self.state;s['run']=f"auto-{s['cycle']}-{phase}-{time.time_ns()}";self.h['mode']('evaluate',s['run']);self.phase(phase,'Testing '+('the saved model before training.' if phase=='baseline' else 'the candidate on the same held-out routes.'))
    def finish_cycle(self):
        s=self.state
        if s['streak']>=2:
            if s['stage']==len(STAGES)-1:
                s.update(enabled=False,phase='completed',message='All implemented skill stages passed their promotion gates twice. Curriculum complete; bots paused.');self.save();return
            s['stage']+=1;s['streak']=0
        recent=[r for r in s['history'][-3:] if r['stage']==s['stage']]
        if len(recent)==3 and (all(not r['accepted'] for r in recent) or (all(r['score']<STAGES[s['stage']].get('threshold',s['threshold']) for r in recent) and max(r['score'] for r in recent)-min(r['score'] for r in recent)<.07)):
            return self.pause('No useful model progress for three cycles. Best model kept. Review results before resuming.')
        if s['session_cycles']>=s['max_cycles']:return self.pause('Cycle limit reached. Best model and curriculum saved; resume when ready.')
        self.phase('waiting','Cycle complete. Preparing the next routes.');return
    def tick(self):
        s=self.state;job=self.h['job']()
        if s['restore_pending'] and (not s['enabled'] or s['phase']=='recovering') and job['status'] not in ('running','cancelling'):
            self.h['restore']();s['restore_pending']=False;self.save()
        if not s['enabled']:return
        if self.clock()-s['started_at']>s['max_hours']*3600:return self.pause('Session time limit reached. Progress saved; resume when ready.')
        problem=self.h['health']()
        if problem:
            self.h['pause']();s['message']=problem
            if s['phase'] not in ('waiting','recovering'):return self.pause(problem+' Autonomous training paused safely.')
            if self.clock()-s['phase_at']>180:return self.pause(problem+' Startup timed out; resume when ready.')
            return
        if s['phase'] in ('waiting','recovering'):
            if job['status'] in ('running','cancelling'):return
            if s.get('restore_pending'):return
            if not self.h.get('prepare',lambda:True)():
                s['message']='Preparing dedicated training and held-out simulation arenas.';return
            s['cycle']+=1;s['session_cycles']+=1;s['seed']=s['cycle']*100003+7919
            self.h['protect']();s['restore_pending']=True;self.save()
            # Recovery restores an interrupted candidate before creating this new baseline.
            s['restore_pending']=False;self.evaluate('baseline');return
        if self.clock()-s['phase_at']>600:return self.pause('This phase exceeded ten minutes. Review bot connections and resume.')
        if s['phase'] in ('baseline','evaluating'):
            rows=self.h['results'](s['run'])
            if rows['episodes']<self.h.get('expected_episodes',lambda:15)():return
            score=rows['successes']/rows['episodes']
            if s['phase']=='baseline':
                if score>=STAGES[s['stage']].get('threshold',s['threshold']):
                    self.h['pause']();s['restore_pending']=False;s['streak']+=1
                    result={'cycle':s['cycle'],'stage':s['stage'],'skill':STAGES[s['stage']].get('skill','navigation'),'agent_count':AGENT_COUNT,'episodes':rows['episodes'],'baseline':score,'score':score,'accepted':True,'kind':'saved_model_validation','seed':s['seed'],'time':self.clock()}
                    s['history'].append(result);s['history']=s['history'][-100:];self.h['event'](result)
                    self.finish_cycle()
                    if s['enabled'] and s['phase']=='waiting':
                        s['message']='Saved model passed fresh trials. '+('Confirming on a new seed before promotion.' if s['streak'] else 'Stage passed twice; preparing the next stage.')
                        self.save()
                    return
                s['streak']=0
                s['baseline']=score;s['collected_start']=self.h['count']();s['collected']=0
                self.h['mode']('teacher',f"auto-{s['cycle']}-teacher");self.phase('collecting','Collecting fresh examples for '+STAGES[s['stage']]['name']+'.');return
            accepted=score>=s['baseline'];self.h['pause']()
            if accepted:self.h['protect']()
            else:self.h['restore']()
            s['restore_pending']=False
            s['streak']=s['streak']+1 if accepted and score>=STAGES[s['stage']].get('threshold',s['threshold']) else 0
            s['history'].append({'cycle':s['cycle'],'stage':s['stage'],'skill':STAGES[s['stage']].get('skill','navigation'),'agent_count':AGENT_COUNT,'episodes':rows['episodes'],'baseline':s['baseline'],'score':score,'accepted':accepted,'time':self.clock()});s['history']=s['history'][-100:]
            self.h['event'](s['history'][-1])
            self.finish_cycle();return
        if s['phase']=='collecting':
            s['collected']=self.h['count']()-s['collected_start']
            if s['collected']>=STAGES[s['stage']].get('examples_per_cycle',s['examples_per_cycle']):
                self.h['pause']();self.h['train']();s['restore_pending']=True;self.phase('training','Training a candidate model. Bots wait while it learns.')
        elif s['phase']=='training':
            if job['status']=='completed':
                # Keep the champion on disk until candidate evaluation accepts it.
                s['restore_pending']=True;self.evaluate('evaluating')
            elif job['status'] in ('failed','cancelled'):return self.pause('Training did not complete. Previous model will be restored.')
