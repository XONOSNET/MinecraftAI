"""Read-only sampling of dashboard response and reported bot/camera latency."""
import argparse
import http.client
import json
import statistics
import time
from pathlib import Path


def summary(values):
    values=sorted(values)
    if not values:return None
    return dict(samples=len(values),median_ms=round(statistics.median(values),2),p95_ms=round(values[int((len(values)-1)*.95)],2),max_ms=round(values[-1],2))


def measure(seconds,output,wait_running=False):
    conn=http.client.HTTPConnection('127.0.0.1',8000,timeout=5)
    def read():
        at=time.perf_counter();conn.request('GET','/status?compact=true');response=conn.getresponse();data=response.read()
        if response.status!=200:raise RuntimeError('Status returned '+str(response.status))
        return json.loads(data),(time.perf_counter()-at)*1000
    if wait_running:
        deadline=time.monotonic()+600
        while True:
            state,_=read()
            if (state['world_training'].get('session') or {}).get('phase')=='running':break
            if time.monotonic()>deadline:raise TimeoutError('World did not enter its running phase')
            time.sleep(1)
    rows=[];rpc={}
    for _ in range(seconds):
        at=time.monotonic();state,elapsed=read();world=state['world_training']['session'];performance=state.get('performance',{})
        for name,result in world.get('results',{}).items():
            nav=result.get('navigation') or {}
            if isinstance(nav.get('rpc_ms'),(float,int)):rpc[(name,nav.get('sampled_at'))]=nav['rpc_ms']
        rows.append(dict(ms=elapsed,run=world['run'],phase=world['phase'],learning_phase=world.get('learning_phase'),performance=performance,
                         fresh_bots=sum(a.get('connected',False) and time.time()-a.get('last_seen',0)<8 for a in state['agents'].values())))
        time.sleep(max(0,1-(time.monotonic()-at)))
    conn.close()
    report=dict(summary=dict(status=summary([r['ms'] for r in rows]),bot_rpc=summary(list(rpc.values())),
                             camera_worker=summary([r['performance']['camera_worker']['gap_ms'] for r in rows if r.get('performance',{}).get('camera_worker',{}).get('last_at') is not None]),
                             persistence_errors=[r['performance']['persistence']['error'] for r in rows if r.get('performance',{}).get('persistence',{}).get('error')]),samples=rows)
    Path(output).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report['summary']))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--seconds',type=int,default=30);parser.add_argument('--output',default='logs/latency-measurement.json');parser.add_argument('--wait-running',action='store_true');args=parser.parse_args()
    if not 1<=args.seconds<=300:parser.error('seconds must be between 1 and 300')
    measure(args.seconds,args.output,args.wait_running)
