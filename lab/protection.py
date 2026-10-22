"""Local practice-area protection; surrounding survival rules are unchanged."""
from .config import LANE_END

CENTERS=(0,80,160,240,320,480)
HOSTILES=('creeper','zombie','skeleton','spider','witch','enderman','slime','husk','stray','drowned','pillager')

def roof_commands():
    # Above the highest camera setting and beyond the six-block shelter sensor.
    return [f'fill {c-24} 224 -24 {c+24} 224 {LANE_END+8} minecraft:sea_lantern' for c in CENTERS]

def sweep_commands(phantoms_only=False):
    types=('phantom',) if phantoms_only else HOSTILES
    return [f'kill @e[type=minecraft:{mob},x={c-28},y=175,z=-28,dx=56,dy=85,dz={LANE_END+40}]' for c in CENTERS for mob in types]

class PracticeProtection:
    def __init__(self,command):
        self.command=command;self.pid=None;self.started=0;self.roof_ready=False;self.last_sweep=-100
    def tick(self,pid,now):
        if pid!=self.pid:
            self.pid=pid;self.started=now;self.roof_ready=False
            for c in CENTERS:self.command(f'forceload add {c-24} -24 {c+24} {LANE_END+8}')
        if not self.roof_ready and now-self.started>=4:
            for cmd in roof_commands():self.command(cmd)
            self.roof_ready=True
        for cmd in sweep_commands(True):self.command(cmd)
        if now-self.last_sweep>=10:
            for cmd in sweep_commands():self.command(cmd)
            self.last_sweep=now
    def snapshot(self):
        return {'enabled':True,'roof_ready':self.roof_ready,'scope':'Owned elevated practice arenas only','message':'Practice arenas protected from phantoms and hostile interference, including while paused.'}
