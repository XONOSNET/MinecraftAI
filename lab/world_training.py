"""Reserved, resettable natural-world hut trials with native chat controls."""
import copy
import json
import math
import re
import time
import uuid
from .world_survival import SurvivalLessons, MISSION_LESSONS, ADVANCED
from pathlib import Path
from .protection import HOSTILES
from .first_night import profile as night_profile, LESSONS as NIGHT_LESSONS, clean_memory, readiness, LEVELS
from .world_fauna import fauna_commands, fauna_extend_commands, replenish_commands, walked_pastures, house_plots
from .camp_layout import commands as camp_commands
from .sleep_quorum import SleepQuorum

LESSONS=['Enclose a hut','Craft and place a chest','Craft a wooden pickaxe','Craft a wooden axe','Craft a wooden shovel','Store eight planks and equip the axe']
HOUSE=json.loads((Path(__file__).resolve().parent.parent/'config/house.json').read_text(encoding='utf-8'))
RESOURCE_CONFIG=json.loads((Path(__file__).resolve().parent.parent/'config/world-resources.json').read_text(encoding='utf-8'))
STONE_LESSONS=LESSONS+['Mine stone with the wooden pickaxe','Craft a stone pickaxe','Craft a stone axe','Craft and place a furnace','Smelt a log into charcoal','Mount indoor and outdoor wall torches']

SCENARIOS=[dict(id=i,name=name,description=description,spread=spread) for i,(name,description,spread) in enumerate([
 ('Natural settlement','A shared natural spawn and independent hut plots.',9),
 ('Spread-out homestead','Build plots farther from the common spawn.',14),
 ('Long resource search','A wider search area between harvesting and construction.',18),
 ('Natural site expedition','A different natural terrain site with fresh resource distribution.',12),
 ('Remote shelters','Longer journeys back to widely separated plots.',22),
 ('Mixed terrain settlement','A further natural site; locate safe ground before committing to a hut.',16),
 ('Unseen natural site 7','The same shelter objective in another previously untested landscape.',12),
 ('Unseen natural site 8','Repeat the task with a new distribution of exposed terrain and trees.',14),
 ('Unseen natural site 9','Find safe approaches to resources and a build plot in another region.',16),
 ('Unseen natural site 10','Test gathering and returning across a separate natural landscape.',18),
 ('Unseen natural site 11','A further terrain generalization trial with the same measurable hut goal.',20),
 ('Unseen natural site 12','A final separate natural site for comparing teacher and policy navigation.',22)])]


class WorldTraining(SurvivalLessons):
    def __init__(self,path,command,logpath,clock=time.time,staging=None,persist=None,copy_batch_size=2,sleep_pack_path=None):
        self.path=Path(path);self.command=command;self.logpath=Path(logpath);self.clock=clock
        self.staging=staging;self.persist=persist
        self.sleep_quorum=SleepQuorum(command,sleep_pack_path)
        # At most two small clones per acknowledgement, never a whole chunk burst.
        if type(copy_batch_size) is not int or not 1<=copy_batch_size<=2:raise ValueError('Terrain copy batch must contain one or two slices.')
        self.copy_batch_size=copy_batch_size
        self.saved=json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'templates':{},'history':[]}
        self.session=None;self.jobs=[];self.job=None;self.preloaded=None;self.offset=0;self.serial=0;self.ui_at=0;self.ui_offset=self.logpath.stat().st_size if self.logpath.exists() else 0

    def save(self):
        if self.persist:
            # Finished history entries are immutable copies, published by finish().
            # Freeze the list and changing metadata without copying all old terrain memories.
            snapshot={k:(list(v) if k=='history' else copy.deepcopy(v)) for k,v in self.saved.items()}
            self.persist(self.path,snapshot);return
        self.path.parent.mkdir(parents=True,exist_ok=True)
        temp=self.path.with_suffix('.tmp');temp.write_text(json.dumps(self.saved,indent=2),encoding='utf-8');temp.replace(self.path)

    def start(self,data,names):
        if self.session and self.session['active']:raise ValueError('Stop the current world trial before starting another.')
        if not names or any(not re.fullmatch(r'LabAI[0-9]',name) for name in names):raise ValueError('Choose configured lab bots.')
        scenario=data.get('scenario',0);size=data.get('size',128)
        if type(scenario) is not int or not 0<=scenario<len(SCENARIOS):raise ValueError('Unknown natural-world scenario.')
        if type(size) is not int or size not in (128,256):raise ValueError('Choose 128 or 256 blocks.')
        prepared=data.get('prepared',True)
        if type(prepared) is not bool:raise ValueError('Prepared camp must be enabled or disabled.')
        driver=data.get('driver','teacher')
        if driver not in ('teacher','student'):raise ValueError('Choose teacher assistance or policy navigation.')
        loop=data.get('loop',True)
        if type(loop) is not bool:raise ValueError('Repeat trials must be enabled or disabled.')
        mission=data.get('mission','settlement')
        if mission not in ('hut','settlement','stone_age','first_night',*ADVANCED):raise ValueError('Choose a supported world lesson sequence.')
        night=night_profile(data.get('night_level',0)) if mission=='first_night' else None
        assessment=data.get('assessment',False)
        if type(assessment) is not bool:raise ValueError('Assessment must be enabled or disabled.')
        if night:
            if size!=128:raise ValueError('First Night uses a 128 × 128 core plus its natural-resource expedition ring; choose size 128.')
            prepared=night['prepared']
            if assessment and (scenario<9 or driver!='student'):raise ValueError('First Night assessment requires a held-out site (10–12) and student control.')
            if not assessment and scenario>=9:raise ValueError('Sites 10–12 are reserved for First Night assessment; choose a training site from 1–9.')
        if mission in ('stone_age',*ADVANCED) and not prepared:raise ValueError('Stone-age lessons require a prepared camp and its verified resource stations.')
        layout=data.get('layout',0)
        if type(layout) is not int or not 0<=layout<=3:raise ValueError('Unknown resource layout.')
        x=16384+scenario*4096+(2048 if size==256 else 0);z=16384
        key=f'{scenario}-{size}';restore=key in self.saved['templates']
        anchor=self.saved['templates'].get(key,{}).get('camp_anchor')
        if not anchor:
            previous=next((r for r in reversed(self.saved['history']) if r.get('template')==key and r.get('prepared') and r.get('camp')),None)
            if previous:anchor=[math.floor(v) for v in previous['camp']['spawn']]
        margin=RESOURCE_CONFIG['expedition_margin'] if night and night['id']>0 else 0
        old_margin=self.saved['templates'].get(key,{}).get('resource_margin',0)
        fast=bool(restore and prepared and anchor and not night)
        # Include every camp chunk plus a complete one-chunk ring around it.
        area=[x-margin,x+size+margin,z-margin,z+size+margin];ys=[-64,192]
        if fast:
            cx,cy,cz=anchor
            area=[max(x,(cx-HOUSE['camp_radius'])//16*16-16),min(x+size,(cx+HOUSE['camp_radius'])//16*16+32),max(z,(cz-HOUSE['camp_radius'])//16*16-16),min(z+size,(cz+HOUSE['camp_radius'])//16*16+32)]
            if mission in ADVANCED:
                # Keep the camp's surrounding ring while extending to the mine.
                area=[min(area[0],max(x,(cx-32)//16*16)),max(area[1],min(x+size,(cx+32)//16*16+16)),min(area[2],max(z,(cz-54)//16*16)),max(area[3],min(z+size,(cz+54)//16*16+16))]
            low=max(-64,min(128,cy-8));ys=[low,low+64]
        self.session=dict(active=True,phase='restoring' if restore else 'snapshotting',run='world-'+str(time.time_ns()),
            scenario=scenario,name=SCENARIOS[scenario]['name'],size=size,bounds=list(area),driver=driver,
            bots=list(names),prepared=prepared,loop=loop,results={},started_at=self.clock(),round=self.saved.get('round',max((r.get('round',0) for r in self.saved['history']),default=0))+1,
            progress=0,message='Restoring the saved natural terrain.' if restore else 'Saving pristine natural terrain before the first trial.',template=key)
        self.session['bounds']=[x-margin,x+size+margin,z-margin,z+size+margin]
        self.session.update(core_bounds=[x,x+size,z,z+size],resource_margin=margin,previous_resource_margin=old_margin,reset_area=area,copy_y=ys,fast_reset=fast,camp_anchor=anchor if prepared else None)
        self.session.update(time_budget_seconds=3600 if night else 2400 if mission in ADVANCED else 1200,mission=mission,layout=layout,lessons=NIGHT_LESSONS if night else MISSION_LESSONS.get(mission,STONE_LESSONS if mission=='stone_age' else LESSONS if mission=='settlement' else LESSONS[:1]))
        if night:
            self.session.update(first_night=night,night_level=night['id'],assessment=assessment,
                                memory_snapshot=copy.deepcopy(data.get('memory_snapshot',self.saved.get('first_night_memory',{}))))
        if margin:self.session['resource_policy']=dict(width=size+2*margin,core_width=size,margin=margin,preserve_groves=True,wood_planning_logs_per_bot=48,wood_planning_logs=48*len(names),description='Natural resources only; homes and access lanes are cleared, groves preserved. The whole expedition area resets between trials.')
        self.cleanup_survival()
        if fast:self.session['message']='Restoring the camp and surrounding chunks; deep underground terrain is preserved.'
        self.jobs=[];self.job=None;self.preloaded=None
        # Incremental two-chunk work avoids permanent force loads and the global limit.
        for xx in range(area[0],area[1],32 if fast else 16):
            for zz in range(area[2],area[3],16):
                # Existing pristine core stays intact. Snapshot only previously
                # unused ring tiles, then restore them from that same saved tile.
                was_saved=restore and x-old_margin<=xx<x+size+old_margin and z-old_margin<=zz<z+size+old_margin
                if margin and restore and not was_saved:self.jobs.append((xx,xx+1024,zz,16))
                source=xx+1024 if restore else xx;dest=xx if restore else xx+1024
                self.jobs.append((source,dest,zz,min(32 if fast else 16,area[1]-xx)))
        self.total=len(self.jobs);return self.snapshot()

    def park(self,names):
        if self.staging:self.staging.park(names)
        else:
            for name in names:self.command(f'tp {name} 0 181 0')

    def next_batch(self,connected):
        s=self.session
        if not s or not s.get('loop') or s['phase']!='finished' or self.clock()<s['restart_at']:return None
        if not set(s['bots']).issubset(connected):
            s['message']='Waiting for all trial bots to reconnect before restoring terrain.';return None
        result={key:s[key] for key in ('scenario','size','driver','prepared','loop','mission','layout')}
        if s.get('first_night'):result.update(night_level=s['night_level'],assessment=s['assessment'])
        return result

    def finish(self):
        s=self.session
        self.sleep_quorum.restore()
        successful=sorted(((name,r) for name,r in s['results'].items() if r.get('state')=='complete'),key=lambda pair:pair[1].get('seconds',float('inf')))
        for rank,(name,result) in enumerate(successful,1):result['completion_rank']=rank
        s.update(active=False,phase='finished',restart_at=self.clock()+10,message='Batch finished. Restoring terrain for the next batch in 10 seconds.' if s.get('loop') else 'Trial finished. Review each bot’s result; reset starts from the saved natural terrain.')
        self.saved['round']=s['round']
        self.saved['history'].append(copy.deepcopy(s));self.saved['history']=self.saved['history'][-30:];self.save()

    def _read(self,offset):
        if not self.logpath.exists():return '',offset
        with self.logpath.open('rb') as stream:
            stream.seek(min(offset,self.logpath.stat().st_size));data=stream.read(262144);return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',data.decode('utf-8',errors='replace')).replace('\r','\n'),stream.tell()

    @staticmethod
    def tile_chunks(job):
        return {(x//16,z//16) for start in (job['source'],job['dest'])
                for x in range(start,start+job['width'],16)
                for z in range(job['z'],job['z']+16,16)}

    def tile_job(self,tile):
        source,dest,z,width=tile
        job=dict(source=source,dest=dest,z=z,width=width,phase='loading',at=self.clock())
        return job

    def force_tile(self,job,action):
        for xx in (job['source'],job['dest']):
            self.command(f"forceload {action} {xx} {job['z']} {xx+job['width']-1} {job['z']+15}")

    def preload_next(self):
        if self.preloaded or not self.jobs:return
        next_job=self.tile_job(self.jobs[0])
        # A first-time ring snapshot can share tiles with the following restore.
        # Keep those sequential so removing one job's tickets cannot unload another.
        if self.tile_chunks(self.job)&self.tile_chunks(next_job):return
        # Record ownership before commands so stop() can clean up partial failures.
        self.preloaded=next_job
        self.force_tile(next_job,'add')

    def copy_slice(self,job):
        session=self.session
        y=job.get('next_y',session['copy_y'][0])
        # Bound each operation to 4096 blocks and the entire in-flight window
        # to 8192. Share one ordered fence, verifying every individual success.
        commands=[]
        for _ in range(self.copy_batch_size):
            if y>=session['copy_y'][1]:break
            height=min(4096//(job['width']*16),session['copy_y'][1]-y)
            commands.append(f"clone {job['source']} {y} {job['z']} {job['source']+job['width']-1} {y+height-1} {job['z']+15} {job['dest']} {y} {job['z']} replace force")
            y+=height
        self.offset=self.logpath.stat().st_size if self.logpath.exists() else 0
        self.serial+=1
        job.update(phase='waiting',at=self.clock(),serial=self.serial,log='',next_y=y,batch_count=len(commands))
        for command in commands:self.command(command)
        self.command(f'scoreboard players set #world_ack lab_world {self.serial}')
        stats=session.setdefault('copy_stats',dict(block_limit=4096,inflight_block_limit=8192,batch_size=self.copy_batch_size,sent=0,acknowledged=0,batches=0,max_ack_seconds=0))
        stats['sent']+=len(commands);stats['batches']+=1

    def clear_tile_items(self,job):
        # Entity selectors see loaded chunks only. Keep both tiles force-loaded
        # until cleanup finishes, including underground and above the copy band.
        for x in (job['source'],job['dest']):
            self.command(f"kill @e[type=minecraft:item,x={x},y=-64,z={job['z']},dx={job['width']-1},dy=383,dz=15]")

    def reset_hostiles(self,bounds):
        s=self.session
        if not s or not s.get('first_night',{}).get('hostiles') or s['phase'] not in ('snapshotting','restoring'):return
        x0,x1,z0,z1=bounds
        for mob in ('phantom',*HOSTILES):
            self.command(f'kill @e[type=minecraft:{mob},tag=!lab_combat,x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1}]')

    def hold_preparation(self,run):
        s=self.session
        if not s or s['run']!=run or not s['active'] or s['phase'] not in ('snapshotting','restoring'):return False
        if not s.get('memory_hold'):
            s['memory_hold']=dict(at=self.clock(),message=s['message'])
            s['message']=f"Waiting for system memory below 84%; terrain preparation held at {s['progress']}%. The same save will resume."
        return True

    def resume_preparation(self,run):
        s=self.session
        if not s or s['run']!=run or not s['active'] or not s.get('memory_hold'):return False
        held=s.pop('memory_hold');elapsed=self.clock()-held['at']
        # A clone already sent can finish during the hold. Keep its log cursor
        # and acknowledgement, but exclude the hold from command deadlines.
        for job in (self.job,self.preloaded):
            if job:job['at']+=elapsed
        for key in ('fauna_at','fauna_wait'):
            if key in s:s[key]+=elapsed
        s['preparation_wait_seconds']=s.get('preparation_wait_seconds',0)+elapsed
        s['message']=held['message']
        return True

    def tick(self):
        s=self.session
        self.sleep_quorum.tick(s,self.clock())
        if not s or s.get('memory_hold'):return
        if s['phase'] not in ('snapshotting','restoring') and not s.get('first_night',{}).get('hostiles') and self.clock()-s.get('sweep_at',0)>1:
            x0,x1,z0,z1=s['bounds']
            for mob in ('phantom',*HOSTILES):
                self.command(f'kill @e[type=minecraft:{mob},tag=!lab_combat,x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1}]')
            s['sweep_at']=self.clock()
        if not s['active']:return
        if s['phase']=='running' and s.get('first_night') and not s['first_night'].get('stations') and not s.get('assessment'):
            interval=RESOURCE_CONFIG.get('livestock_replenish_seconds',120)
            refill=s.setdefault('fauna_replenishment',dict(waves=0,next_at=s.get('trial_at',self.clock())+30,interval_seconds=interval,caps=RESOURCE_CONFIG.get('livestock_caps',{}),sheep_births_per_wave=RESOURCE_CONFIG.get('sheep_births_per_wave',2)))
            if refill.get('pending_counts'):
                text,refill['log_offset']=self._read(refill['log_offset'])
                refill['count_log']=(refill.get('count_log','')+text)[-16384:]
                births=re.search(r'#fauna_wave_sheep has (\d+) ',refill['count_log'])
                population=re.search(r'#fauna_sheep has (\d+) ',refill['count_log'])
                if births and population:
                    refill.update(last_sheep_spawned=int(births[1]),loaded_sheep=int(population[1]),
                                  total_sheep_spawned=refill.get('total_sheep_spawned',0)+int(births[1]),
                                  counts_verified_at=self.clock(),pending_counts=False,count_log='')
                elif self.clock()-refill['last_at']>15:
                    refill.update(pending_counts=False,count_error='Sheep spawn count acknowledgement timed out')
            if self.clock()>=refill['next_at']:
                pastures=walked_pastures(s)
                refill.update(log_offset=self.logpath.stat().st_size if self.logpath.exists() else 0,pending_counts=True,count_log='',count_error=None)
                for command in replenish_commands(s['bounds'],house_plots(s),refill['waves'],refill['caps'],pastures,RESOURCE_CONFIG.get('sheep_births_per_wave',2)):self.command(command)
                refill.update(waves=refill['waves']+1,next_at=self.clock()+interval,last_at=self.clock())
                refill.update(sheep_placement='walked grass candidates' if pastures else 'regional grass candidates',walked_pastures=len(pastures))
        if s['phase'] in ('snapshotting','restoring'):
            if not self.job:
                expected=self.tile_job(self.jobs[0]) if self.jobs else None
                if self.preloaded and (not expected or self.tile_chunks(expected)!=self.tile_chunks(self.preloaded)):
                    self.force_tile(self.preloaded,'remove');self.preloaded=None
                if not self.jobs:
                    if s.get('first_night') and not self.prepare_fauna():return
                    if s.get('first_night') and 'start_time_of_day' not in s:
                        # Paired policies must not face dawn versus immediate
                        # night solely because the preceding attempt ran longer.
                        s['start_time_of_day']=0
                        self.command('time set 0')
                    if s.get('first_night',{}).get('hostiles'):
                        if 'hostiles_reset_at' not in s:
                            self.reset_hostiles(s['bounds']);s['hostiles_reset_at']=self.clock();return
                        # Allow killed entities and their drops to settle before
                        # the existing final item sweep and bot deployment.
                        if self.clock()-s['hostiles_reset_at']<.25:return
                    template=self.saved['templates'].setdefault(s['template'],{})
                    template.update(bounds=s['bounds'],resource_margin=s.get('resource_margin',0),saved_at=self.clock());self.save()
                    s.update(phase='running',message=(('Survival progression: '+s['mission']+'. ') if s['mission'] in ADVANCED else '')+('Stone-age lessons running: settlement, mining, stone tools, furnace, charcoal and lighting.' if s['mission']=='stone_age' else 'Settlement lessons running: hut, chest, tools and stored supplies.' if s['mission']=='settlement' else 'Survival lessons running: '+s['mission']+'.' if s['mission'] in ADVANCED else 'Hut trial running.')+' Movement and harvesting follow the selected driver. Recipes and building use scripted helpers.',progress=100,trial_at=self.clock(),reset_seconds=round(self.clock()-s['started_at'],1))
                    if s.get('first_night'):s['message']='First Night · '+s['first_night']['name']+'. '+s['first_night']['description']+' Recipes, construction and route planning remain assisted.'
                    x0,x1,z0,z1=s['bounds']
                    self.command(f'kill @e[type=minecraft:item,x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1}]')
                    for name in s['bots']:
                        self.command(f'gamemode survival {name}')
                        self.command(f'clear {name}')
                        self.command(f'effect clear {name}')
                        self.command(f'effect give {name} minecraft:instant_health 1 5 true')
                        self.command(f'effect give {name} minecraft:resistance 30 4 true')
                        self.command(f'effect give {name} minecraft:fire_resistance 30 0 true')
                        self.command(f'effect give {name} minecraft:slow_falling 30 0 true')
                        self.command(f'effect give {name} minecraft:saturation 1 5 true')
                        self.command(f'tp {name} {(x0+x1)/2} 196 {(z0+z1)/2}')
                    return
                tile=self.jobs.pop(0)
                warmed=self.preloaded is not None
                self.job=self.preloaded or self.tile_job(tile);self.preloaded=None
                if not warmed:self.force_tile(self.job,'add')
                self.preload_next()
                if not warmed:return
            j=self.job
            if j['phase']=='loading' and self.clock()-j['at']>=.8:
                # Cloning blocks does not reset entities. Clear old hostiles
                # from the destination while this tile is still loaded; leave
                # the snapshot source and all running-trial spawning alone.
                if s['phase']=='restoring':self.reset_hostiles([j['dest'],j['dest']+j['width'],j['z'],j['z']+16])
                self.clear_tile_items(j)
                self.copy_slice(j);return
            if j['phase']=='waiting':
                text,self.offset=self._read(self.offset);j['log']+=text
                if re.search(r'#world_ack to '+str(j['serial'])+r'(?!\d)',j['log']):
                    # Exactly one bounded batch is in flight. An acknowledgement alone
                    # cannot stand in for successful block copying.
                    if j['log'].count('Successfully cloned')!=j['batch_count']:
                        self.stop('Terrain copy failed; trial stopped before deploying bots. Inspect the Minecraft console.');return
                    stats=s['copy_stats'];stats['acknowledged']+=j['batch_count']
                    stats['max_ack_seconds']=round(max(stats['max_ack_seconds'],self.clock()-j['at']),3)
                    completed=self.total-len(self.jobs)-1
                    fraction=(j['next_y']-s['copy_y'][0])/(s['copy_y'][1]-s['copy_y'][0])
                    s['progress']=round(100*(completed+fraction)/self.total,1)
                    elapsed=max(.001,self.clock()-s['started_at']-s.get('preparation_wait_seconds',0))
                    remaining=max(0,round(elapsed*(100-s['progress'])/s['progress'])) if s['progress'] else None
                    stats.update(elapsed_seconds=round(elapsed,1),estimated_seconds_left=remaining,slices_per_second=round(stats['acknowledged']/elapsed,2))
                    label='Restoring saved natural terrain' if s['phase']=='restoring' else 'Saving pristine natural terrain'
                    eta=f' · estimated {remaining//60}m {remaining%60:02d}s left' if remaining is not None and s['progress']>=2 else ''
                    s['message']=f"{label} · {s['progress']}% · {stats['acknowledged']} slices verified{eta}"
                    if j['next_y']<s['copy_y'][1]:
                        # The fence has drained the prior commands. Send the next
                        # bounded window now, without an extra Python tick of idle.
                        self.copy_slice(j);return
                    x0,x1,z0,z1=s['bounds'];xx=min(j['source'],j['dest']);zz=j['z']
                    end=xx+j['width']-1
                    if xx==x0:self.command(f'fill {xx} -64 {zz} {xx} 191 {zz+15} minecraft:glass')
                    if end+1==x1:self.command(f'fill {end} -64 {zz} {end} 191 {zz+15} minecraft:glass')
                    if zz==z0:self.command(f'fill {xx} -64 {zz} {end} 191 {zz} minecraft:glass')
                    if zz+16==z1:self.command(f'fill {xx} -64 {zz+15} {end} 191 {zz+15} minecraft:glass')
                    j.update(phase='cleaning',at=self.clock())
                elif self.clock()-j['at']>20:self.stop('Terrain copy acknowledgement timed out.');return
            elif j['phase']=='cleaning' and self.clock()-j['at']>=.25:
                # Container replacement and broken-block drops can arrive after
                # the clone acknowledgement. Sweep before releasing the chunks.
                self.clear_tile_items(j)
                for xx in (j['source'],j['dest']):self.command(f"forceload remove {xx} {j['z']} {xx+j['width']-1} {j['z']+15}")
                self.job=None;s['progress']=round(100*(self.total-len(self.jobs))/self.total,1)
        elif s['phase']=='running':
            budget=s.get('time_budget_seconds',1200)
            if self.clock()-s['trial_at']>budget:
                for name in s['bots']:
                    if s['results'].get(name,{}).get('state') not in ('complete','stopped'):
                        result=copy.deepcopy(s['results'].get(name,{}))
                        result.update(run=s['run'],state='stopped',phase='stopped',failure_category='deadline',message=f'Trial time budget reached ({budget} s). Returned to the lab; eligible next batch.',seconds=self.clock()-s['trial_at'])
                        self.report(name,result)

    def assignment(self,name,loaded_memory_run=None):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or name not in s['bots']:return None
        if s['results'].get(name,{}).get('state') in ('complete','stopped'):return None
        world=dict(bounds=s['bounds'],index=s['bots'].index(name),count=len(s['bots']),spread=SCENARIOS[s['scenario']]['spread'],driver=s['driver'],prepared=s['prepared'],camp_anchor=s.get('camp_anchor'),mission=s['mission'],lessons=s['lessons'],time_budget_seconds=s['time_budget_seconds'])
        if s.get('resource_policy'):world['resource_policy']=copy.deepcopy(s['resource_policy'])
        if s.get('first_night'):
            world.update(first_night=s['first_night'],assessment=s['assessment'])
            if loaded_memory_run!=s['run']:world['memory']={} if s['assessment'] else s['memory_snapshot'].get(s['template'],{}).get(name,{})
        return dict(mode='teacher' if s['driver']=='teacher' else 'evaluate',run=s['run'],world=world)

    def prepare_fauna(self):
        s=self.session
        if s.get('fauna_ready'):return True
        if 'fauna_queue' not in s:
            x0,x1,z0,z1=s['bounds'];self.command(f'forceload add {x0} {z0} {x1-1} {z1-1}')
            snapshot=not self.saved['templates'].get(s['template'],{}).get('fauna_snapshot')
            template=self.saved['templates'].get(s['template'],{})
            split=template.get('fauna_split_ring',False) or not snapshot and s.get('resource_margin',0)>template.get('fauna_margin',0)
            extra=fauna_extend_commands(s['bounds'],s['core_bounds'],s['template']) if split else []
            ring=[c for c in fauna_commands(s['bounds'],s['template']+'-ring16',False) if not c.startswith('kill ')] if split else []
            s.update(fauna_queue=extra+fauna_commands(s['bounds'],s['template'],snapshot)+ring,fauna_split_ring=split,fauna_snapshot=snapshot,fauna_at=self.clock(),message='Restoring natural livestock as well as terrain, so student comparisons start with the same resources.')
            return False
        if self.clock()-s['fauna_at']<2:return False
        if s['fauna_queue']:
            for command in s['fauna_queue'][:8]:self.command(command)
            del s['fauna_queue'][:8];return False
        if not s.get('fauna_ack'):
            self.offset=self.logpath.stat().st_size if self.logpath.exists() else 0
            self.serial+=1;s.update(fauna_ack=self.serial,fauna_wait=self.clock(),fauna_log='')
            path='sites.s'+s['template'].replace('-','_')
            self.command(f'execute if data storage lab:first_night {path} run scoreboard players set #world_ack lab_world {self.serial}');return False
        text,self.offset=self._read(self.offset);s['fauna_log']+=text
        if f'to {s["fauna_ack"]}' in s['fauna_log'] and '#world_ack' in s['fauna_log']:
            x0,x1,z0,z1=s['bounds'];self.command(f'forceload remove {x0} {z0} {x1-1} {z1-1}')
            self.saved['templates'].setdefault(s['template'],{}).update(fauna_snapshot=True,fauna_margin=s.get('resource_margin',0),fauna_split_ring=s.get('fauna_split_ring',False));self.save();s['fauna_ready']=True
            s.pop('fauna_queue',None);return True
        if self.clock()-s['fauna_wait']>20:self.stop('Natural animal reset acknowledgement failed; stopped before deployment.')
        return False

    def camp(self,name,position):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or name not in s['bots'] or not s['prepared']:raise ValueError('No prepared camp assignment.')
        if s.get('camp'):return copy.deepcopy(s['camp'])
        if not isinstance(position,list) or len(position)!=3 or any(type(v) not in (int,float) or not math.isfinite(v) for v in position):raise ValueError('Invalid camp position.')
        x,y,z=[math.floor(v) for v in position];x0,x1,z0,z1=s['bounds'];radius=HOUSE['camp_radius'];spacing=HOUSE['plot_spacing'];height=HOUSE['starter_log_height']
        if s.get('camp_anchor'):[x,y,z]=s['camp_anchor']
        if not x0+radius+1<x<x1-radius-1 or not z0+radius+1<z<z1-radius-1 or not 0<y<180:raise ValueError('Camp must fit safely inside the reserved terrain.')
        natural=bool(s.get('first_night') and not s['first_night']['trees'])
        if natural:
            planned=[dict(x=x+(i%4)*spacing-spacing*3//2,y=y,z=z+(i//4)*spacing-spacing//2) for i in range(len(s['bots']))]
            for command in camp_commands(x,y,z,planned):self.command(command)
        else:
            self.command(f'fill {x-radius} {y-1} {z-radius} {x+radius} {y-1} {z+radius} minecraft:grass_block')
            self.command(f'fill {x-radius} {y} {z-radius} {x+radius} {y+9} {z+radius} minecraft:air')
        plots=[];groves=[]
        for index in range(len(s['bots'])):
            px=x+(index%4)*spacing-spacing*3//2;pz=z+(index//4)*spacing-spacing//2;direction=-1 if index<4 else 1
            plots.append(dict(x=px,y=y,z=pz,tableY=y));trees=[]
            for dx in (() if s.get('first_night') and not s['first_night']['trees'] else (-1,1) if s['layout'] in (1,3) else (-2,2)):
                for distance in ((5,8,11,13) if s['layout']==1 else (5,7,10,13) if s['layout']==2 else (5,8,10,13)):
                    tx=px+dx;tz=pz+direction*distance;trees.append([tx,y,tz])
                    self.command(f'fill {tx} {y} {tz} {tx} {y+height-1} {tz} minecraft:oak_log')
                    self.command(f'fill {tx-1} {y+height} {tz-1} {tx+1} {y+height+1} {tz+1} minecraft:oak_leaves[persistent=true]')
            groves.append(trees)
        s['camp']=dict(spawn=[x+.5,y+.1,z+.5],plots=plots,groves=groves,preserve_groves=natural)
        s['camp_anchor']=[x,y,z]
        if s.get('first_night',{}).get('stations'):
            for index,plot in enumerate(plots):
                direction=-1 if index<4 else 1
                # Explicit lesson support on level zero only; later levels never spawn food.
                near,far=sorted((plot['z']+direction*16,plot['z']+direction*21))
                self.command(f'fill {plot["x"]-3} {y-1} {near} {plot["x"]+3} {y-1} {far} minecraft:grass_block')
                self.command(f'fill {plot["x"]-3} {y} {near} {plot["x"]+3} {y+3} {far} minecraft:air')
                label=json.dumps(json.dumps({'text':'FirstNight'+s['bots'][index]}))
                for offset in (-1.5,-.5,.5,1.5):
                    self.command(f'summon minecraft:cow {plot["x"]+offset+.5} {y} {plot["z"]+direction*17+.5} {{Tags:["lab_world_survival"],PersistenceRequired:1b,NoAI:1b,CustomName:{label}}}')
                for offset in (-1,0,1):
                    self.command(f'summon minecraft:sheep {plot["x"]+offset+.5} {y} {plot["z"]+direction*19+.5} {{Tags:["lab_world_survival"],PersistenceRequired:1b,NoAI:1b,CustomName:{label},Color:0b}}')
        self.saved['templates'].setdefault(s['template'],{})['camp_anchor']=[x,y,z];self.save()
        return copy.deepcopy(s['camp'])

    def livestock(self,data):
        s=self.session;name=data.get('agent');kind=data.get('resource')
        if not s or not s['active'] or s['phase']!='running' or data.get('run')!=s['run'] or name not in s['bots']:
            raise ValueError('No matching active livestock lesson.')
        if s.get('mission')!='first_night' or not s.get('first_night',{}).get('stations') or s.get('night_level')!=0 or s.get('assessment') or not s.get('camp'):
            raise ValueError('Replacement livestock is only available in supported First Night lessons.')
        if data.get('action')=='release':
            species=data.get('species')
            if species not in ('cow','sheep','pig','chicken','rabbit'):raise ValueError('Choose a passive lesson animal.')
            try:animal=str(uuid.UUID(str(data.get('entity_uuid'))))
            except ValueError:raise ValueError('Choose a valid animal UUID.')
            released=s.setdefault('released_livestock',{}).setdefault(name,[])
            if animal in released:return dict(released=True)
            if len(released)>=32:raise ValueError('Lesson animal release limit reached.')
            x0,x1,z0,z1=s['bounds'];released.append(animal)
            selector=f'@e[type=minecraft:{species},tag=lab_world_survival,name=FirstNight{name},x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1}]'
            parts=','.join(str(int.from_bytes(uuid.UUID(animal).bytes[i:i+4],byteorder='big',signed=True)) for i in range(0,16,4))
            self.command(f'execute as {selector} if entity @s[nbt={{UUID:[I;{parts}]}}] run data merge entity @s {{NoAI:0b}}')
            return dict(released=True)
        if kind not in ('food','wool'):raise ValueError('Choose food or wool livestock.')
        index=s['bots'].index(name);plot=s['camp']['plots'][index];direction=-1 if index<4 else 1
        species='sheep' if kind=='wool' else 'cow';position=[plot['x']+.5,plot['y'],plot['z']+direction*(19 if kind=='wool' else 17)+.5]
        record=s.setdefault('livestock_refills',{}).setdefault(name,{}).setdefault(kind,dict(attempts=0,last_at=-1e9))
        result=dict(position=position,remaining=max(0,4-record['attempts']),exhausted=record['attempts']>=4,cooldown_seconds=0)
        if result['exhausted']:return result
        wait=30-(self.clock()-record['last_at'])
        if wait>0:return dict(result,cooldown_seconds=math.ceil(wait))
        record.update(attempts=record['attempts']+1,last_at=self.clock())
        label=json.dumps(json.dumps({'text':'FirstNight'+name}));x0,x1,z0,z1=s['bounds']
        selector=f'@e[type=minecraft:{species},tag=lab_world_survival,name=FirstNight{name},x={x0},y=-64,z={z0},dx={x1-x0-1},dy=383,dz={z1-z0-1},limit=1]'
        color=',Color:0b' if species=='sheep' else ''
        # The server checks existence at execution time, so queued requests
        # cannot create duplicates. Never give items or alter natural levels.
        self.command(f'execute unless entity {selector} run summon minecraft:{species} {position[0]} {position[1]} {position[2]} {{Tags:["lab_world_survival"],PersistenceRequired:1b,NoAI:1b,CustomName:{label}{color}}}')
        return dict(result,remaining=4-record['attempts'],requested=True)

    def lesson_resources(self,name):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or name not in s['bots'] or not s.get('camp'):raise ValueError('No active prepared camp lesson.')
        if s.get('first_night') and not s['first_night']['trees']:return []
        supplied=s.setdefault('lesson_resources',{})
        if name in supplied:return copy.deepcopy(supplied[name])
        index=s['bots'].index(name);plot=s['camp']['plots'][index];direction=-1 if index<4 else 1;trees=[]
        # A separate outer row leaves doors and approaches clear. Each bot gets
        # two real trees, once per batch; no inventory items are injected.
        for dx in (-2,2):
            x=plot['x']+dx;y=plot['y'];z=plot['z']+direction*13;trees.append([x,y,z])
            self.command(f'fill {x} {y} {z} {x} {y+3} {z} minecraft:oak_log')
            self.command(f'fill {x-1} {y+4} {z-1} {x+1} {y+5} {z+1} minecraft:oak_leaves[persistent=true]')
        supplied[name]=trees;return copy.deepcopy(trees)

    def quarry(self,name):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or s.get('mission') not in ('stone_age','first_night',*ADVANCED) or name not in s['bots'] or not s.get('camp'):raise ValueError('No active prepared stone-age lesson.')
        if s.get('first_night') and not s['first_night']['stations']:raise ValueError('Natural-resource First Night trials cannot create resource stations.')
        quarries=s.setdefault('quarries',{})
        if name in quarries:return copy.deepcopy(quarries[name])
        index=s['bots'].index(name);plot=s['camp']['plots'][index];direction=-1 if index<4 else 1
        x=math.floor(s['camp']['spawn'][0])+(index%4)*12-18;y=plot['y'];z=plot['z']+direction*24;x0,x1,z0,z1=s['bounds']
        if not x0+6<x<x1-6 or not z0+5<z<z1-5:raise ValueError('This camp lacks a safe quarry margin.')
        # Separate aprons catch ejected drops without clearing a neighbour's
        # resources. Access corridors join the main camp at a safe height.
        near,far=sorted((plot['z']+direction*15,z-direction*4))
        self.command(f'fill {x-1} {y-1} {near} {x+1} {y-1} {far} minecraft:grass_block')
        self.command(f'fill {x-1} {y} {near} {x+1} {y+2} {far} minecraft:air')
        self.command(f'fill {x-5} {y-1} {z-4} {x+5} {y-1} {z+4} minecraft:grass_block')
        self.command(f'fill {x-5} {y} {z-4} {x+5} {y+5} {z+4} minecraft:air')
        self.command(f'fill {x-2} {y} {z} {x+1} {y+3} {z} minecraft:stone')
        fx=x+3;fz=z-direction*2
        self.command(f'fill {fx} {y} {fz} {fx} {y+3} {fz} minecraft:oak_log')
        result=dict(blocks=[[xx,yy,z] for xx in range(x-2,x+2) for yy in range(y,y+4)],approach=[x+.5,y+.1,z-direction*1.5],fuel=[[fx,yy,fz] for yy in range(y,y+4)])
        quarries[name]=result;return copy.deepcopy(result)

    def spawn(self,name,position):
        s=self.session
        if not s or not s['active'] or s['phase']!='running' or name not in s['bots']:raise ValueError('No active world assignment.')
        if not isinstance(position,list) or len(position)!=3 or any(type(v) not in (float,int) or not math.isfinite(v) for v in position):raise ValueError('Invalid spawn.')
        x0,x1,z0,z1=s['bounds'];x,y,z=position
        if not x0+2<x<x1-2 or not z0+2<z<z1-2 or not -60<y<185:raise ValueError('Spawn must be inside the reserved trial and below the snapshot ceiling.')
        self.command(f'tp {name} {x} {y} {z}')
        self.command(f'gamemode survival {name}')
        self.command(f'effect clear {name} minecraft:slow_falling')
        self.command(f'effect give {name} minecraft:resistance 3 4 true')

    def report(self,name,data):
        s=self.session
        if not s or not s['active'] or data.get('run')!=s['run'] or name not in s['bots']:return
        if s['results'].get(name,{}).get('state') in ('complete','stopped'):return
        if data.get('state') in ('complete','stopped') and s.get('mission') in ADVANCED:self.command(f'kill @e[tag=lab_world_{name}]')
        if data.get('state')=='stopped' and s['results'].get(name,{}).get('state')!='stopped':
            self.command(f'effect give {name} minecraft:fire_resistance 20 0 true');self.park([name])
        allowed=('navigation','harvest_target','state','phase','message','logs','blocks','target_blocks','distance','travelled','health','plot','seconds','timings','milestones','lesson','lesson_total','idle_seconds','stall_seconds_left','home','survival','wilderness','failure_category')
        previous=s['results'].get(name,{})
        s['results'][name]={k:copy.deepcopy(data[k]) for k in allowed if k in data}
        s['results'][name].update(peak_logs=max(previous.get('peak_logs',0),data.get('logs',0)),peak_blocks=max(previous.get('peak_blocks',0),data.get('blocks',0)))
        if s.get('first_night') and isinstance(data.get('wilderness'),dict):
            memory=clean_memory(data['wilderness'].get('memory'),s['bounds'])
            if not s.get('assessment'):self.saved.setdefault('first_night_memory',{}).setdefault(s['template'],{})[name]=memory
            if data.get('state') in ('complete','stopped'):self.save()
        if len(s['results'])==len(s['bots']) and all(r.get('state') in ('complete','stopped') for r in s['results'].values()):
            self.finish()

    def stop(self,reason='World trial paused by you.'):
        self.sleep_quorum.restore()
        if self.session and 'fauna_queue' in self.session:
            x0,x1,z0,z1=self.session['bounds']
            try:self.command(f'forceload remove {x0} {z0} {x1-1} {z1-1}')
            except RuntimeError:pass
        for j in (self.job,self.preloaded):
            if not j:continue
            for xx in (j['source'],j['dest']):
                try:self.command(f"forceload remove {xx} {j['z']} {xx+j['width']-1} {j['z']+15}")
                except RuntimeError:pass
        self.jobs=[];self.job=None;self.preloaded=None
        self.cleanup_survival()
        if self.session:
            self.session.pop('memory_hold',None)
            if self.session['active']:
                for name in self.session['bots']:
                    try:self.park([name])
                    except RuntimeError:pass
            self.session.update(active=False,loop=False,phase='paused',message=reason)

    def snapshot(self):return dict(session=copy.deepcopy(self.session),scenarios=SCENARIOS,history=copy.deepcopy(self.saved['history'][-10:]),first_night_levels=LEVELS,readiness=readiness(self.saved['history']))

    def menu(self,player):
        parts=[{'text':'AI Laboratory\n','color':'gold','bold':True}]
        for label,choice in [('First Night: graduated wilderness learning',12),('Automatic world learning',8),('Iron tools lessons',9),('Beds, food and armor lessons',10),('Home defense lessons',11),('Basics training',1),('Real world: repeat teacher settlement lessons',2),('Real world: repeat policy navigation + settlement teacher',3),('Stop current mode',4),('Train gathering from examples',5),('Train navigation from examples',6)]:
            parts.extend([{'text':'['+label+']\n','color':'aqua','clickEvent':{'action':'run_command','value':f'/trigger lab_world set {choice}'}}])
        parts.append({'text':'Camera while following: Ctrl = view; W/S = distance; A/D = height.\n','color':'gray'})
        for label,value in [('Next view',1),('Farther',2),('Closer',3),('Lower',4),('Higher',5)]:
            parts.append({'text':'['+label+'] ','color':'green','clickEvent':{'action':'run_command','value':f'/trigger lab_camera set {value}'}})
        parts.append({'text':'\n'})
        parts.append({'text':'World trials use a reserved natural area, restored between trials. Hut construction is teacher assisted. Dashboard: 127.0.0.1:8000','color':'gray'})
        self.command(f'tellraw {player} '+json.dumps(parts))

    def ui(self,online,operators):
        if self.clock()-self.ui_at<1:return []
        self.ui_at=self.clock();text,self.ui_offset=self._read(self.ui_offset);requests=[]
        for player,value in re.findall(r'^\[\d{2}:\d{2}:\d{2} INFO\]: \[([A-Za-z0-9_]{1,16}): Triggered \[lab_world\] \(set value to (\d+)\)\]\s*$',text,re.MULTILINE):
            if player in online and player in operators:requests.append((player,int(value)))
        for player in online:
            if player in operators:self.command(f'scoreboard players enable {player} lab_world')
        return requests
