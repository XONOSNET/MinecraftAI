"""One bounded controller rollout after a specified comparison finishes.

Never interrupts an active attempt. Exits if learning is intentionally disabled.
Uses existing authenticated pause/resume controls and the normal bot launcher.
"""
import json
import hashlib
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:8000'
REPORT=ROOT/'logs/controller-rollout.json'


def ready(status,candidate_run):
    learning=status.get('world_learning',{})
    round_id=int(candidate_run.split(':',1)[1]) if candidate_run.startswith('round:') else None
    completed=any(h.get('round',-1)>=round_id if round_id is not None else h.get('candidate',{}).get('run')==candidate_run for h in learning.get('history',[]))
    session=status.get('world_training',{}).get('session') or {}
    return (completed and learning.get('enabled') and not learning.get('restore_pending')
            and learning.get('phase')=='baseline' and session.get('phase') in ('restoring','snapshotting'))


def status():
    with urllib.request.urlopen(BASE+'/status?compact=true',timeout=15) as response:return json.load(response)


def post(path,data):
    token=(ROOT/'data/api-token').read_text().strip()
    req=urllib.request.Request(BASE+path,data=json.dumps(data).encode(),headers={'X-Lab-Token':token,'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)


def report(phase,**details):
    REPORT.write_text(json.dumps(dict(phase=phase,at=time.time(),**details),indent=2),encoding='utf-8')


def source_digest():
    digest=hashlib.sha256()
    for path in sorted([*(ROOT/'controller').rglob('*.js'),*(ROOT/'config').rglob('*.json')]):
        digest.update(str(path.relative_to(ROOT)).encode());digest.update(path.read_bytes())
    return digest.hexdigest()


def main(candidate_run):
    shell=shutil.which('pwsh.exe') or shutil.which('pwsh')
    if not shell:raise RuntimeError('PowerShell 7 is required for the configured bot launcher; no rollout attempted.')
    expected_source=source_digest()
    report('waiting_for_completed_comparison',candidate_run=candidate_run,source_digest=expected_source)
    deadline=time.monotonic()+14400
    while time.monotonic()<deadline:
        current=status()
        if not current.get('world_learning',{}).get('enabled') or (ROOT/'data/lab-stopped').exists():
            report('cancelled',reason='Learning was disabled or the lab was intentionally stopped.');return
        if ready(current,candidate_run):break
        time.sleep(2)
    else:raise RuntimeError('No safe completed-comparison boundary within four hours; no restart attempted.')
    if source_digest()!=expected_source:
        report('cancelled',reason='Controller/configuration sources changed while waiting; no obsolete rollout attempted.');return
    options=current['world_learning']['options']
    post('/world-learning/stop',{})
    for _ in range(60):
        current=status();learning=current['world_learning']
        if learning['phase']=='paused' and not learning.get('restore_pending'):break
        time.sleep(1)
    else:raise RuntimeError('Pause/model restoration did not finish; controller was not restarted.')
    old_entities={n:a.get('entity_id') for n,a in current.get('agents',{}).items()}
    report('restarting_controller',candidate_run=candidate_run,options=options)
    # This fixed command validates process identity and uses the normal exclusive launcher.
    old_server_pid=current.get('server',{}).get('pid')
    subprocess.run([shell,'-NoProfile','-NonInteractive','-File',str(ROOT/'scripts/Restart-Bots.ps1')],cwd=ROOT,check=True,timeout=60,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    for _ in range(90):
        current=status()
        agents=current.get('agents',{})
        if sum(a.get('connected',False) and time.time()-a.get('last_seen',0)<8 and a.get('entity_id')!=old_entities.get(n) for n,a in agents.items() if n.startswith('LabAI'))==8:break
        time.sleep(1)
    else:raise RuntimeError('Controller restart did not produce eight connected bots; learning remains paused.')
    if (ROOT/'data/lab-stopped').exists():
        report('cancelled',reason='Lab intentionally stopped during rollout.');return
    if current.get('server',{}).get('pid')!=old_server_pid:raise RuntimeError('Minecraft process changed during controller rollout; inspect before resuming.')
    result=post('/world-learning/start',options)
    report('resumed',candidate_run=candidate_run,options=options,enabled=result.get('enabled'),message='Controller update loaded; starting a fresh comparison.')


if __name__=='__main__':
    try:main(sys.argv[1])
    except Exception as error:
        report('error',error=str(error));raise
