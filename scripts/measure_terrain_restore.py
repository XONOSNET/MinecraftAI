"""Read-only timing of one real terrain preparation and Minecraft responsiveness."""
import argparse
import json
import statistics
import time
import urllib.request
from pathlib import Path
from lab.minecraft_status import query_status


def measure(output,timeout=600):
    deadline=time.monotonic()+timeout;rows=[];target=None
    while time.monotonic()<deadline:
        at=time.perf_counter()
        status=json.load(urllib.request.urlopen('http://127.0.0.1:8000/status?compact=true',timeout=10))
        http_ms=(time.perf_counter()-at)*1000
        session=status['world_training'].get('session') or {}
        if target is None:target=session.get('run')
        if not target or session.get('run')!=target:raise RuntimeError('Measured terrain run changed')
        row=dict(at=time.time(),phase=session.get('phase'),progress=session.get('progress'),status_ms=round(http_ms,2),
                 copy_stats=session.get('copy_stats'),ram_percent=status.get('ram_percent'),server_ready=status['server'].get('ready'),
                 bots_online=status['server'].get('bots_online'),memory_hold=bool(session.get('memory_hold')))
        at=time.perf_counter()
        try:
            query_status('192.168.1.24',25565,timeout=2)
            row['minecraft_ms']=round((time.perf_counter()-at)*1000,2)
        except (OSError,ValueError) as error:row['minecraft_error']=str(error)
        rows.append(row)
        report=dict(run=target,session=session,samples=rows)
        Path(output).write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps({k:row[k] for k in ('phase','progress','minecraft_ms') if k in row}),flush=True)
        if session.get('phase')=='running':
            values=[r['minecraft_ms'] for r in rows if 'minecraft_ms' in r]
            report['summary']=dict(reset_seconds=session.get('reset_seconds'),copy_stats=session.get('copy_stats'),
                minecraft_probes=len(rows),minecraft_failures=sum('minecraft_error' in r for r in rows),
                minecraft_median_ms=round(statistics.median(values),2) if values else None,minecraft_max_ms=max(values,default=None),
                bots_online=status['server'].get('bots_online'),server_ready=status['server'].get('ready'))
            Path(output).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report['summary']),flush=True);return
        if session.get('phase') not in ('snapshotting','restoring'):raise RuntimeError('Terrain preparation stopped: '+str(session.get('message')))
        time.sleep(3)
    raise TimeoutError('Terrain did not finish within the measurement window')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='logs/terrain-window-after.json');args=parser.parse_args()
    measure(args.output)
