import sys,json,sqlite3
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
con=sqlite3.connect('data/lab.sqlite')
rows=con.execute('SELECT run,count(*),sum(success),avg(steps) FROM episodes GROUP BY run').fetchall()
Path('docs/results.json').write_text(json.dumps([dict(zip(['run','episodes','successes','mean_steps'],r)) for r in rows],indent=2))
valid=[r for r in rows if r[0].startswith('release-') and 'teacher' not in r[0]]
fig,ax=plt.subplots(figsize=(9,4));ax.bar([r[0] for r in valid],[r[2]/r[1] for r in valid],color=['#5b9f83']*len(valid));ax.set_ylim(0,1);ax.set_ylabel('Episode success rate');ax.set_title('Live Minecraft flat-course navigation (small samples)');plt.xticks(rotation=25,ha='right');fig.tight_layout();fig.savefig('docs/learning-results.png',dpi=160)
print(json.dumps(rows))
