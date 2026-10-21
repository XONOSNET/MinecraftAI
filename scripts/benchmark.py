import time,json,os,psutil,urllib.request
from pathlib import Path
p=Path('data/transitions.f32');start=p.stat().st_size;t=time.time();cpu=[];ram=[];latencies=[];scan=[]
for _ in range(10):
 cpu.append(psutil.cpu_percent(interval=1));ram.append(psutil.virtual_memory().percent)
 with urllib.request.urlopen('http://127.0.0.1:8000/status') as r:s=json.load(r)
 latencies.extend(a['inference_ms'] for a in s['agents'].values());scan.extend(a['perception_ms'] for a in s['agents'].values())
result={'seconds':time.time()-t,'decisions':(p.stat().st_size-start)//288,'mean_cpu_percent':sum(cpu)/len(cpu),'peak_ram_percent':max(ram),'mean_inference_ms':sum(latencies)/len(latencies),'mean_perception_ms':sum(scan)/len(scan),'agents':len(s['agents'])};result['population_decisions_per_second']=result['decisions']/result['seconds']
processes={}
for key in ('server','service','bots'):
 try:
  proc=psutil.Process(int(Path('data/'+key+'.pid').read_text()));processes[key]={'rss_mib':sum(q.memory_info().rss for q in [proc]+proc.children(recursive=True) if q.is_running())/1048576}
 except (OSError,psutil.Error):pass
result['process_tree_rss_mib']=processes
Path('docs/benchmark.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
