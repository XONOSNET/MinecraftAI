"""Run explicit local skill references/tests without interrupting autonomous training."""
import argparse
import sys
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parents[1]))
from lab.curriculum import STAGES
import hashlib
import json
import time
from pathlib import Path
from experiment import call,status


def navigation_signature():
    import torch
    state=torch.load('checkpoints/latest.pt',weights_only=True)['model']
    digest=hashlib.sha256()
    for name,tensor in sorted(state.items()):digest.update(name.encode());digest.update(tensor.numpy().tobytes())
    return digest.hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stages',type=int,nargs='+',default=list(range(4,len(STAGES))))
    parser.add_argument('--driver',choices=['teacher','student'],default='teacher')
    parser.add_argument('--train',action='store_true',help='Train the selected independent head from existing demonstrations before each student test.')
    parser.add_argument('--output',default='docs/curricula-verification.json')
    args=parser.parse_args()
    current=status()
    if current['curriculum']['enabled']:raise SystemExit('Pause autonomous training before running explicit verification.')
    if any(stage<4 or stage>=len(current['curriculum']['stages']) for stage in args.stages):raise SystemExit('Choose implemented broader stages (4 through 31).')
    if args.train and args.driver!='student':raise SystemExit('--train requires --driver student')
    results=json.loads(Path(args.output).read_text(encoding='utf-8')) if Path(args.output).exists() else []
    for stage in args.stages:
        training=None;before=navigation_signature()
        if args.train:
            call('/curricula/practice/'+str(stage));training=call('/control/train')
        assignment=call('/curricula/practice/'+str(stage),{'driver':args.driver})
        deadline=time.time()+240
        while time.time()<deadline:
            state=status();row=next((r for r in state['episodes'] if r['run']==assignment['run']),None)
            if row and row['episodes']>=state['evaluation']['expected_episodes']:break
            time.sleep(1)
        else:raise RuntimeError('Timed out: '+assignment['stage']['name'])
        unchanged=navigation_signature()==before
        result={'stage':stage,'name':assignment['stage']['name'],'driver':args.driver,'result':row,
                'training':training,'navigation_weights_unchanged':unchanged}
        results=[r for r in results if (r['stage'],r['driver'])!=(stage,args.driver)]
        results.append(result);print(json.dumps(result),flush=True)
        Path(args.output).write_text(json.dumps(results,indent=2),encoding='utf-8')
        if not unchanged:raise RuntimeError('Navigation weights changed during isolated skill verification')
    call('/control/paused')
    return 0 if all(r['result']['successes']/r['result']['episodes']>=.8 for r in results) else 1

if __name__=='__main__':raise SystemExit(main())
