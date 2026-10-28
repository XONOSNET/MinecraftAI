"""Graduated wilderness trials. Support levels are explicit, never inferred success."""
import copy
import math

LEVELS=[
    dict(id=0,name='Supported first night',prepared=True,trees=True,stations=True,hostiles=False,hold_seconds=180,
         description='Prepared plots, starter trees, stone station and lesson livestock. Learn the complete survival chain.'),
    dict(id=1,name='Natural resource expedition',prepared=True,trees=False,stations=False,hostiles=False,hold_seconds=180,
         description='Prepared home plots only. Discover natural wood, exposed stone and food; remember routes home.'),
    dict(id=2,name='Independent settlement',prepared=False,trees=False,stations=False,hostiles=False,hold_seconds=300,
         description='Survey natural build sites and resources. No planted resources or cleared camp; hostile protection remains.'),
    dict(id=3,name='Wilderness survival',prepared=False,trees=False,stations=False,hostiles=True,hold_seconds=1800,
         description='Natural terrain and ordinary hostile mobs. Complete the survival chain and remain alive for 30 minutes.')]
LESSONS=['Enclose a hut','Craft and place a chest','Craft a wooden pickaxe','Craft a wooden axe','Craft a wooden shovel','Store eight planks and equip the axe',
         'Find and mine accessible stone','Craft a stone pickaxe','Craft a stone axe','Craft and place a furnace','Smelt charcoal','Mount indoor and outdoor wall torches',
         'Find and collect food','Cook four meals','Return home with provisions','Collect three white wool','Craft a bed and register home','Complete a resource scouting round trip','Remain safely sheltered']

def profile(level):
    if type(level) is not int or not 0<=level<len(LEVELS):raise ValueError('Choose a First Night support level from 0 to 3.')
    return copy.deepcopy(LEVELS[level])

def clean_memory(value,bounds):
    """Bound reports, reject nonfinite/out-of-site coordinates and reset ephemeral failures."""
    if not isinstance(value,dict):return {}
    def point(p):
        return isinstance(p,list) and len(p)==3 and all(type(n) in (int,float) and math.isfinite(n) for n in p) and bounds[0]+1<p[0]<bounds[1]-2 and bounds[2]+1<p[2]<bounds[3]-2 and -60<p[1]<192
    resources=[]
    for r in (value.get('resources',[]) if isinstance(value.get('resources',[]),list) else [])[:96]:
        if isinstance(r,dict) and r.get('kind') in ('wood','stone','food','wool','home') and point(r.get('position')):
            resources.append(dict(kind=r['kind'],position=r['position']))
    roads=[p for p in (value.get('roads',[]) if isinstance(value.get('roads',[]),list) else [])[:512] if point(p)]
    # Edges refer to stable coordinate keys, not indices that filtering changes.
    keys={','.join(str(math.floor(n)) for n in p) for p in roads}
    edges=[e for e in (value.get('edges',[]) if isinstance(value.get('edges',[]),list) else [])[:1024] if isinstance(e,list) and len(e)==2 and all(isinstance(k,str) and k in keys for k in e)]
    return dict(resources=resources,roads=roads,edges=edges)

def readiness(history):
    trials=[s for s in history if s.get('mission')=='first_night' and s.get('driver')=='student' and s.get('assessment')]
    rows=[r for s in trials for r in s.get('results',{}).values()]
    by_level=[]
    for level in LEVELS:
        results=[r for s in trials if s.get('night_level')==level['id'] for r in s.get('results',{}).values()]
        by_level.append(dict(level=level['id'],name=level['name'],attempts=len(results),completed=sum(r.get('state')=='complete' for r in results)))
    return dict(batches=len(trials),attempts=len(rows),completed=sum(r.get('state')=='complete' for r in rows),by_level=by_level,
                deaths=sum(r.get('health',20)<=0 for r in rows),
                message='Reserved-site assessments, excluded from First Night demonstration runs. Older policies/replay may have prior site exposure. Crafting and motor helpers remain active.')
