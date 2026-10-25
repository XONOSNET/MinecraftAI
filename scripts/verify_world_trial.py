import json,time,urllib.request
from pathlib import Path
started=time.time();last=0
while time.time()-started<1200:
    state=json.load(urllib.request.urlopen('http://127.0.0.1:8000/status',timeout=10));world=state['world_training']['session']
    if time.time()-last>20:
        print(json.dumps({'phase':world['phase'],'progress':world['progress'],'bots':{n:[r.get('phase'),r.get('logs'),r.get('blocks'),r.get('message')] for n,r in world['results'].items()}}),flush=True);last=time.time()
    Path('docs/world-hut-native.json').write_text(json.dumps(world,indent=2),encoding='utf-8')
    if not world['active']:break
    time.sleep(2)
