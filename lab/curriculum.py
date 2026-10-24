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
from .trial_queue import TrialQueue

LEGACY_STAGES=[{'name':'Short routes','min_distance':3,'max_distance':7,'yaw':.6},
        {'name':'Longer routes','min_distance':7,'max_distance':14,'yaw':1.5},
        {'name':'Full turns','min_distance':10,'max_distance':22,'yaw':3.141593},
        {'name':'Long routes and full turns','min_distance':20,'max_distance':30,'yaw':3.141593}]
LEGACY_STAGES.extend(EXTRA_STAGES)
from .catalogue import ordered_stages
STAGES_V8=ordered_stages(LEGACY_STAGES[:120],integrate=False)
STAGES_V9=ordered_stages(LEGACY_STAGES[:120])
STAGES=ordered_stages(LEGACY_STAGES)

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
                    'continuous':True,'round':0,'examples_per_cycle':1500,'threshold':.9,'restore_pending':False}
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
        if self.state.get('catalog_version',1)<5 and self.state['phase']=='completed' and self.state['stage']==39:
            self.state.update(stage=40,phase='paused',streak=0,message='Twenty advanced courses are ready to resume.')
        if self.state.get('catalog_version',1)<6 and self.state['phase']=='completed' and self.state['stage']==59:
            self.state.update(stage=60,phase='paused',streak=0,message='Ten new challenge stages are ready to resume.')
        if self.path.exists() and self.state.get('catalog_version',1)<7:
            lookup={stage['name']:i for i,stage in enumerate(STAGES)}
            for row in self.state['history']:
                old=row['stage']
                if 0<=old<len(LEGACY_STAGES):
                    row.update(legacy_stage=old+1,stage=lookup[LEGACY_STAGES[old]['name']])
                    row['stage_id']=STAGES[row['stage']]['id']
            scales=self.state.get('learning_rate_scales',{})
            self.state['learning_rate_scales']={str(lookup[LEGACY_STAGES[int(k)]['name']]):v for k,v in scales.items() if 0<=int(k)<len(LEGACY_STAGES)}
            self.state.pop('recovery_target',None)
            self.state.update(enabled=False,phase='paused',stage=0,streak=0,message='Courses reordered by prerequisites and difficulty. Models and history preserved. Resume to validate the new order from the beginning.')
        if self.state.get('catalog_version',1)<8 and self.state['phase']=='completed' and self.state['stage']==69:
            self.state.update(stage=0,enabled=False,phase='paused',streak=0,message='Fifty expedition stages are ready. Resume the expanded review when ready.')
        if self.path.exists() and self.state.get('catalog_version',1) in (7,8):
            lookup={stage['name']:i for i,stage in enumerate(STAGES)}
            old_stage=self.state['stage']
            for row in self.state['history']:
                old=row['stage']
                if 0<=old<len(STAGES_V8):
                    row.setdefault('previous_stage',old+1);row['stage']=lookup[STAGES_V8[old]['name']];row['stage_id']=STAGES[row['stage']]['id']
            self.state['learning_rate_scales']={str(lookup[STAGES_V8[int(k)]['name']]):v for k,v in self.state.get('learning_rate_scales',{}).items() if 0<=int(k)<len(STAGES_V8)}
            self.state.pop('recovery_target',None)
            self.state.update(stage=lookup[STAGES_V8[old_stage]['name']] if 0<=old_stage<len(STAGES_V8) else 0,enabled=False,phase='paused',streak=0,message='Swimming, climbing, caves and catwalks integrated into the difficulty order. Models retained; resume when ready.')
        if self.path.exists() and self.state.get('catalog_version')==9:
            lookup={stage['name']:i for i,stage in enumerate(STAGES)}
            def remap(index):return lookup[STAGES_V9[index]['name']] if 0<=index<len(STAGES_V9) else 0
            self.state['stage']=remap(self.state['stage'])
            for row in self.state['history']:
                row['stage']=remap(row['stage']);row['stage_id']=STAGES[row['stage']]['id']
            self.state['learning_rate_scales']={str(remap(int(k))):v for k,v in self.state.get('learning_rate_scales',{}).items()}
            if 'recovery_target' in self.state:self.state['recovery_target']=remap(self.state['recovery_target'])
            self.state['streak']=0
        if self.state.get('catalog_version',1)==10 and self.state['phase']=='completed':
            self.state.update(stage=140,phase='paused',streak=0,message='Ten combat stages are ready. Resume to learn equipment and monster fighting.')
        self.state.update(catalog_version=11,agent_count=AGENT_COUNT)
        self.trials=TrialQueue(self,STAGES)
    def save(self):
        self.path.parent.mkdir(exist_ok=True,parents=True)
        tmp=self.path.with_suffix('.tmp');tmp.write_text(json.dumps(self.state,indent=2),encoding='utf-8');tmp.replace(self.path)
    def snapshot(self):
        s=copy.deepcopy(self.state);s['stages']=STAGES;s['stage_name']=STAGES[s['stage']]['name'];s['skill']=STAGES[s['stage']].get('skill','navigation');s['active_examples']=STAGES[s['stage']].get('examples_per_cycle',s['examples_per_cycle']);s['active_threshold']=STAGES[s['stage']].get('threshold',s['threshold']);s['trials']=self.trials.snapshot();return s
    def start(self):
        s=self.state
        if s['enabled']:return self.snapshot()
        if s['phase']=='completed' and not s['trial_queue']:raise ValueError('All implemented curricula are complete. Review the results before adding further skills.')
        self.h['pause']()
        s.update(enabled=True,phase='waiting',session_cycles=0,started_at=self.clock(),phase_at=self.clock(),message='Waiting for Minecraft and all configured bots.');self.save();return self.snapshot()
    def pause(self,reason='Autonomous training paused by you.'):
        s=self.state;s.update(enabled=False,phase='paused',message=reason)
        self.h['pause']();self.h['cancel']();self.save();return self.snapshot()
    def hold(self,reason):
        self.h['pause']();self.h['cancel']()
        self.state.update(health_clear_since=None,hold_reason=reason)
        self.phase('health_wait',reason+' Waiting safely; automatic training will resume after recovery.')
        return self.snapshot()
    def phase(self,name,message):
        self.state.update(phase=name,phase_at=self.clock(),message=message);self.save()
    def evaluate(self,phase):
        s=self.state;s['run']=f"auto-{s['cycle']}-{phase}-{time.time_ns()}";self.h['mode']('evaluate',s['run']);self.phase(phase,'Testing '+('the saved model before training.' if phase=='baseline' else 'the candidate on the same held-out routes.'))
    def finish_cycle(self):
        s=self.state;s['runtime_retries']=0
        if s['streak']>=2:
            if s['stage']==len(STAGES)-1 and s.get('continuous',True):
                s.update(stage=0,streak=0,round=s.get('round',0)+1,session_cycles=0,started_at=self.clock())
                self.phase('waiting','Curriculum passed. Starting automatic fresh-seed skill review.');return
            if s['stage']==len(STAGES)-1:
                s.update(enabled=False,phase='completed',message='All implemented skill stages passed their promotion gates twice. Curriculum complete; bots paused.');self.save();return
            s['stage']+=1;s['streak']=0
            if s.get('recovery_target')==s['stage']:s.pop('recovery_target')
        recent=[r for r in s['history'][-3:] if r['stage']==s['stage']]
        if len(recent)==3 and (all(not r['accepted'] for r in recent) or (all(r['score']<STAGES[s['stage']].get('threshold',s['threshold']) for r in recent) and max(r['score'] for r in recent)-min(r['score'] for r in recent)<.07)):
            if not s.get('continuous',True):return self.pause('No useful model progress for three cycles. Best model kept. Review results before resuming.')
            target=s['stage'];scales=s.setdefault('learning_rate_scales',{});scales[str(target)]=max(.125,scales.get(str(target),1)*.5)
            skill=STAGES[target].get('skill','navigation');first=next(i for i,stage in enumerate(STAGES) if stage.get('skill','navigation')==skill)
            previous=max((i for i in range(target) if STAGES[i].get('skill','navigation')==skill),default=first)
            s.update(recovery_target=s.get('recovery_target',target),stage=previous,streak=0)
            self.phase('waiting',f'Automatic refresher before stage {target+1}; best model kept and retraining rate reduced.');return
        if s['session_cycles']>=s['max_cycles']:
            if not s.get('continuous',True):return self.pause('Cycle limit reached. Best model and curriculum saved; resume when ready.')
            s.update(session_cycles=0,started_at=self.clock())
        self.phase('waiting','Cycle complete. Preparing the next routes.');return
    def tick(self):
        s=self.state;job=self.h['job']()
        if s['restore_pending'] and (not s['enabled'] or s['phase'] in ('recovering','health_wait')) and job['status'] not in ('running','cancelling'):
            self.h['restore']();s['restore_pending']=False;self.save()
        if not s['enabled']:return
        if self.clock()-s['started_at']>s['max_hours']*3600:
            if not s.get('continuous',True):return self.pause('Session time limit reached. Progress saved; resume when ready.')
            s.update(session_cycles=0,started_at=self.clock());self.save()
        if s['phase']=='health_wait':
            problem=self.h.get('recovery_health',self.h['health'])()
            if problem:
                if 'disk space' in problem:return self.pause(problem+' Free disk space before resuming.')
                if s.get('health_clear_since') is not None:s['health_clear_since']=None;self.save()
                s['message']=problem+' Waiting safely; automatic recovery remains enabled.'
                return
            if s.get('health_clear_since') is None:s['health_clear_since']=self.clock();self.save()
            elapsed=self.clock()-s['health_clear_since']
            s['message']=f'Resources and connections recovered. Resuming in {max(0,30-int(elapsed))} seconds.'
            if elapsed<30 or job['status'] in ('running','cancelling'):return
            self.phase('recovering','Recovered automatically. Preparing a fresh test from the saved model.');return
        problem=self.h['health']()
        if problem and (problem.startswith('System memory') or problem.startswith('Waiting for')):
            return self.hold(problem)
        if problem:
            self.h['pause']();s['message']=problem
            if s['phase'] not in ('waiting','recovering'):return self.pause(problem+' Autonomous training paused safely.')
            if self.clock()-s['phase_at']>180:return self.pause(problem+' Startup timed out; resume when ready.')
            return
        if self.trials.tick():return
        if s['phase'] in ('waiting','recovering'):
            if job['status'] in ('running','cancelling'):return
            if s.get('restore_pending'):return
            if not self.h.get('prepare',lambda:True)():
                s['message']='Preparing dedicated training and held-out simulation arenas.';return
            s['cycle']+=1;s['session_cycles']+=1;s['seed']=s['cycle']*100003+7919
            self.h['protect']();s['restore_pending']=True;self.save()
            # Recovery restores an interrupted candidate before creating this new baseline.
            s['restore_pending']=False;self.evaluate('baseline');return
        if self.clock()-s['phase_at']>600:
            retries=s.get('runtime_retries',0)+1;s['runtime_retries']=retries
            if retries>3:return self.pause('Repeated phase timeouts. Saved model retained; inspect the activity log before resuming.')
            return self.hold(f'Phase timeout; automatic recovery attempt {retries}/3.')
        if s['phase'] in ('baseline','evaluating'):
            rows=self.h['results'](s['run'])
            if rows['episodes']<self.h.get('expected_episodes',lambda:15)():return
            score=rows['successes']/rows['episodes']
            if s['phase']=='baseline':
                if score>=STAGES[s['stage']].get('threshold',s['threshold']):
                    self.h['pause']();s['restore_pending']=False;s['streak']+=1
                    result={'cycle':s['cycle'],'stage':s['stage'],'stage_id':STAGES[s['stage']]['id'],'skill':STAGES[s['stage']].get('skill','navigation'),'agent_count':AGENT_COUNT,'episodes':rows['episodes'],'baseline':score,'score':score,'accepted':True,'kind':'saved_model_validation','seed':s['seed'],'time':self.clock()}
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
            s['history'].append({'cycle':s['cycle'],'stage':s['stage'],'stage_id':STAGES[s['stage']]['id'],'skill':STAGES[s['stage']].get('skill','navigation'),'agent_count':AGENT_COUNT,'episodes':rows['episodes'],'baseline':s['baseline'],'score':score,'accepted':accepted,'time':self.clock()});s['history']=s['history'][-100:]
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
