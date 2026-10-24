"""Explicit trial batches injected between learning cycles, preserving curriculum progress."""
import copy
import time
import uuid


class TrialQueue:
    def __init__(self, curriculum, stages):
        self.c=curriculum;self.stages=stages
        self.by_id={stage['id']:index for index,stage in enumerate(stages)}
        s=self.c.state;s.setdefault('trial_queue',[]);s.setdefault('trial_history',[])

    def snapshot(self):
        s=self.c.state
        return copy.deepcopy({'queue':s['trial_queue'],'active':s.get('queued_active'),
            'history':s['trial_history'][-20:],'resume':s.get('queued_resume')})

    def enqueue(self, stage_id, driver):
        if not isinstance(stage_id,str) or stage_id not in self.by_id:raise ValueError('Unknown trial ID')
        if driver not in ('student','teacher'):raise ValueError('Choose a neural test or teacher demonstration')
        s=self.c.state
        if len(s['trial_queue'])>=50:raise ValueError('Queue holds up to 50 batches')
        item={'id':uuid.uuid4().hex,'stage_id':stage_id,'stage':self.by_id[stage_id],
              'name':self.stages[self.by_id[stage_id]]['name'],'driver':driver,'queued_at':self.c.clock()}
        s['trial_queue'].append(item);self.c.save();return item

    def remove(self, identifier):
        queue=self.c.state['trial_queue']
        if not any(item['id']==identifier for item in queue):raise ValueError('That pending batch is no longer in the queue')
        self.c.state['trial_queue']=[item for item in queue if item['id']!=identifier];self.c.save()

    def reorder(self, identifiers):
        queue=self.c.state['trial_queue']
        if not isinstance(identifiers,list) or not all(isinstance(value,str) for value in identifiers) or len(identifiers)!=len(queue) or set(identifiers)!={item['id'] for item in queue}:raise ValueError('Include every pending batch exactly once')
        by_id={item['id']:item for item in queue};self.c.state['trial_queue']=[by_id[i] for i in identifiers];self.c.save()

    def clear(self):
        self.c.state['trial_queue']=[];self.c.save()

    def tick(self):
        c=self.c;s=c.state;active=s.get('queued_active')
        if not active:
            if s['phase']!='waiting' or not s['trial_queue'] or s.get('restore_pending'):return False
            if c.h['job']()['status'] in ('running','cancelling'):return False
            if not c.h.get('prepare',lambda:True)():return False
            active=s['trial_queue'].pop(0)
            s['queued_resume']={'stage':s['stage'],'streak':s['streak']}
            s['queued_active']=active
        # Restart an interrupted batch on fresh routes after pause/recovery/restart.
        if s['phase'] not in ('queued_test','queued_teacher'):
            if not c.h.get('prepare',lambda:True)():return True
            if active['stage_id'] not in self.by_id:
                self.finish(None,'removed from catalogue');return True
            s.update(stage=self.by_id[active['stage_id']],streak=0,seed=time.time_ns()%2147483647)
            s['run']='queued-'+active['id']+'-'+str(time.time_ns())
            c.h['mode']('teacher' if active['driver']=='teacher' else 'evaluate',s['run'])
            c.phase('queued_teacher' if active['driver']=='teacher' else 'queued_test',
                ('Queued teacher demonstration: ' if active['driver']=='teacher' else 'Queued neural test: ')+active['name']+'. Curriculum resumes afterwards.')
            return True
        rows=c.h['results'](s['run']);expected=c.h.get('expected_episodes',lambda:15)()
        if rows['episodes']>=expected:self.finish(rows,'completed')
        elif c.clock()-s['phase_at']>600:self.finish(rows,'timed out')
        return True

    def finish(self, rows, status):
        c=self.c;s=c.state;item=s.pop('queued_active');resume=s.pop('queued_resume')
        c.h['pause']()
        result={**item,'status':status,'finished_at':c.clock(),'run':s.get('run'),
                'episodes':(rows or {}).get('episodes',0),'successes':(rows or {}).get('successes',0)}
        s['trial_history'].append(result);s['trial_history']=s['trial_history'][-50:]
        s.update(stage=resume['stage'],streak=resume['streak'])
        c.h.get('queue_event',lambda row:None)(result)
        c.phase('waiting','Queued batch '+status+'. Returning to the saved autonomous curriculum.')
