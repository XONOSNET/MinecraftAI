"""Measure API responsiveness while dashboard polls compete with bot requests.
The /step probe uses a deliberately stale run and never records or changes actions.
"""
import concurrent.futures,json,statistics,time,urllib.request
from pathlib import Path

def measure(samples=12):
    token=Path('data/api-token').read_text().strip()
    def status_polls():
        rows=[]
        for _ in range(5):
            at=time.perf_counter()
            body=urllib.request.urlopen('http://127.0.0.1:8000/status',timeout=45).read()
            rows.append(dict(ms=round((time.perf_counter()-at)*1000,1),bytes=len(body)))
        return rows
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        polling=pool.submit(status_polls);latency=[]
        for _ in range(samples):
            req=urllib.request.Request('http://127.0.0.1:8000/step',data=b'{"run":"latency-probe-stale"}',headers={'X-Lab-Token':token,'Content-Type':'application/json'},method='POST')
            at=time.perf_counter()
            result=json.load(urllib.request.urlopen(req,timeout=45))
            assert result['action']==4
            latency.append(round((time.perf_counter()-at)*1000,1));time.sleep(.05)
        return dict(stale_step_ms=latency,median_step_ms=statistics.median(latency),max_step_ms=max(latency),dashboard=polling.result())

if __name__=='__main__':print(json.dumps(measure()))
