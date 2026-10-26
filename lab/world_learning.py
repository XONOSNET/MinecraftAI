"""Persistent world collect/train/compare scheduler; hooks execute under the lab lock."""
import copy
import json
import statistics
import time
from pathlib import Path


def measured_trial(session):
    results=session.get('results',{});names=session.get('bots',[]);n=max(1,len(names))
    completed=sum(results.get(name,{}).get('state')=='complete' for name in names)
    unsafe=sum(results.get(name,{}).get('health',20)<10 for name in names)
    progress=[];seconds=[]
    for name in names:
        r=results.get(name,{});total=max(1,r.get('lesson_total',len(session.get('lessons',[])) or 1))
        # Small harvest/placement credit lets early navigation improvements be
        # measured before a policy can complete a whole settlement sequence.
        partial=min(1,r.get('peak_logs',r.get('logs',0))/16)*.05+min(1,r.get('peak_blocks',r.get('blocks',0))/55)*.05
        progress.append(min(1,(len(r.get('milestones',[]))+partial)/total))
        if r.get('state')=='complete' and isinstance(r.get('seconds'),(float,int)):seconds.append(r['seconds'])
    return dict(bots=len(names),roster=sorted(names),completed=completed,unsafe=unsafe,progress=sum(progress)/n,
                median_seconds=statistics.median(seconds) if seconds else None,run=session.get('run'),behavior_revision=session.get('behavior_snapshot',{}).get('revision'))


def select_world(baseline,candidate):
    if baseline.get('behavior_revision')!=candidate.get('behavior_revision'):return False,'Behavior settings changed; comparison discarded.'
    if baseline['bots']!=candidate['bots'] or baseline.get('roster')!=candidate.get('roster'):return False,'Bot roster changed; comparison discarded.'
    if candidate['unsafe']>baseline['unsafe']:return False,'More low-health failures; restored protected specialists.'
    if candidate['completed']<baseline['completed']:return False,'Fewer completed sequences; restored protected specialists.'
    if candidate['completed']>baseline['completed']:return True,'More complete student sequences.'
    if candidate['progress']<baseline['progress']-.005:return False,'Student lesson progress regressed.'
    if candidate['progress']>baseline['progress']+.005:return True,'Student lesson progress improved at the same completion rate.'
    if candidate['completed']==candidate['bots'] and candidate['bots']:
        before=baseline.get('median_seconds');after=candidate.get('median_seconds')
        if before and after and after>before*1.15:return False,'Equal complete success, but median completion became over 15% slower.'
        return True,'All students completed the sequence without a measured regression.'
    return False,'No measurable improvement yet; kept protected specialists and retained the new examples.'


class WorldLearning:
    def __init__(self,path,hooks,clock=time.time):
        self.path=Path(path);self.h=hooks;self.clock=clock
        self.state=json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else dict(enabled=False,phase='paused',round=0,history=[],restore_pending=False)
        self.state.setdefault('restore_pending',False)
        if self.state.get('enabled'):self.phase('recovering','Recovering saved learning state before beginning a fresh comparison.')

    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True);tmp=self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps(self.state,indent=2),encoding='utf-8');tmp.replace(self.path)

    def snapshot(self):return copy.deepcopy(self.state)

    def phase(self,value,message):
        self.state.update(phase=value,message=message,phase_at=self.clock())
        world=self.h['world']()
        if world and world.get('run')==self.state.get('run'):
            world.update(learning_cycle=self.state.get('round',0),learning_phase=value)
        self.save()

    def start(self,options):
        if self.state.get('enabled') or self.state.get('restore_pending') or self.state.get('phase')=='stopping':raise ValueError('World learning is already active or requires protected-model restoration.')
        self.h['stop_world']()
        self.state.update(enabled=True,options=copy.deepcopy(options),streak=0,trained=[],queue=[],pending_action=None)
        self.phase('waiting','Automatic world learning selected. Waiting for all bots and Minecraft.')
        return self.snapshot()

    def stop(self,next_action=None):
        self.state.update(enabled=False,pending_action=next_action);self.h['stop_world']();self.h['cancel']()
        self.phase('stopping','Stopping learning; finishing any save and restoring unvalidated specialists before switching modes.')
        return self.snapshot()

    def suspend(self,cause='server'):
        if self.state.get('enabled'):
            self.state['recovery_cause']=cause
            self.phase('recovering','Waiting for system memory to fall below 84%; protected models will be restored before learning resumes.' if cause=='memory' else 'Minecraft is restarting. Protected models will be restored before learning resumes.')

    def begin(self,driver,phase,layout):
        options=dict(self.state['options'],driver=driver,loop=False,layout=layout)
        if self.state.get('behavior_snapshot'):options['behavior_snapshot']=copy.deepcopy(self.state['behavior_snapshot'])
        session=self.h['begin'](options)['session'];self.state['run']=session['run']
        self.phase(phase,{'baseline':'Testing the saved specialists without teacher movement or harvesting control.',
                         'demonstrating':'Teacher practice: collecting fresh navigation and harvesting examples on a separate resource layout.',
                         'evaluating':'Testing the trained specialists on the same evaluation layout as the saved models.'}[phase])

    def tick(self):
        s=self.state;job=self.h['job']()
        if s.get('phase')=='stopping':
            if job['status'] in ('running','cancelling'):return
            if s.get('restore_pending'):self.h['restore']();s['restore_pending']=False
            action=s.pop('pending_action',None);self.phase('paused','World learning paused. Protected specialists are active.')
            if action:self.h['switch'](action)
            return
        if not s.get('enabled'):return
        if not self.h['ready']():return
        if s['phase']=='recovering':
            if job['status'] in ('running','cancelling'):return
            if s.get('restore_pending'):self.h['restore']();s['restore_pending']=False
            self.phase('waiting','Recovery complete. Beginning a fresh saved-model evaluation.');return
        if s['phase']=='waiting':
            if 'behavior' in self.h:s['behavior_snapshot']=copy.deepcopy(self.h['behavior']())
            s['round']=s.get('round',0)+1;s['trained']=[];s['training_results']=[];s['eval_layout']=1+(s['round']-1)%3
            self.begin('student','baseline',s['eval_layout']);return
        if s['phase'] in ('baseline','demonstrating','evaluating'):
            world=self.h['world']()
            if not world or world.get('run')!=s.get('run'):raise RuntimeError('World learning lost its assigned trial.')
            if world['active']:return
            if world['phase']!='finished':raise RuntimeError('World trial preparation or execution stopped: '+world.get('message','unknown error'))
            if s['phase']=='baseline':
                s['baseline']=measured_trial(world);s['before_counts']=self.h['counts']()
                self.begin('teacher','demonstrating',0);return
            if s['phase']=='demonstrating':
                counts=self.h['counts']();before=s.get('before_counts',{})
                s['new_examples']={skill:counts.get(skill,0)-before.get(skill,0) for skill in ('expedition','gathering','shelter','combat')}
                s['queue']=[skill for skill,n in s['new_examples'].items() if n>=30]
                if not s['queue']:
                    self.phase('cooldown','Teacher run saved fewer than 30 new examples per specialist. Collecting another cycle without changing the models.');return
                self.h['protect']();s['restore_pending']=True;self.save();self.train_next();return
            candidate=measured_trial(world);accepted,reason=select_world(s['baseline'],candidate)
            if any(not r.get('replay_guard_passed',True) for r in s.get('training_results',[])):
                accepted=False;reason='Earlier replay action agreement regressed by over 8 percentage points; restored protected specialists.'
            result=dict(round=s['round'],baseline=s['baseline'],candidate=candidate,accepted=accepted,reason=reason,
                        skills=s['trained'],mission=s['options']['mission'],scenario=s['options']['scenario'],new_examples=s.get('new_examples',{}),time=self.clock())
            result['training_results']=s.get('training_results',[])
            self.h['review'](result)
            if not accepted:self.h['restore']()
            s['restore_pending']=False;s['history'].append(result);s['history']=s['history'][-40:]
            champion=candidate if accepted else s['baseline'];s['streak']=s.get('streak',0)+1 if champion['completed']/max(1,champion['bots'])>=.75 else 0
            if s.get('streak',0)>=2 and s['options'].get('auto_progress',True):
                tiers=['settlement','stone_age','iron_age','homestead','home_defense']
                if s['options']['mission'] in tiers[:-1]:s['options']['mission']=tiers[tiers.index(s['options']['mission'])+1]
                else:s['options']['scenario']=(s['options']['scenario']+1)%12
                s['streak']=0;reason+=' Next cycle advances the curriculum.'
            self.phase('cooldown',reason+' New teacher examples remain available either way.');return
        if s['phase']=='training':
            if job['status'] in ('running','cancelling'):return
            if job.get('id')!=s.get('job'):raise RuntimeError('Training job changed during the world comparison.')
            if job['status']!='completed':raise RuntimeError(job.get('error','World specialist training did not complete.'))
            s['trained'].append(s['training_skill']);s.setdefault('training_results',[]).append(job.get('result',{}));self.train_next();return
        if s['phase']=='cooldown' and self.clock()-s['phase_at']>=10:
            self.phase('waiting','Preparing the next collect/train/student comparison cycle.')

    def train_next(self):
        s=self.state
        if not s['queue']:self.begin('student','evaluating',s['eval_layout']);return
        skill=s['queue'].pop(0);s['training_skill']=skill
        result=self.h['train'](skill);s['job']=result['job']['id']
        self.phase('training',f'Training {skill} from fresh world demonstrations and retained earlier examples. Bots wait during CPU training.')

    def fail(self,error):
        if self.state.get('phase')=='stopping':
            self.state.update(enabled=False,error=str(error));self.phase('error','Protected-model restoration failed; learning is stopped: '+str(error));return
        self.state.update(enabled=False,error=str(error));self.h['stop_world']();self.h['cancel']()
        self.phase('stopping','World learning stopped after an error. Restoring protected specialists: '+str(error))
