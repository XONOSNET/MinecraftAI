import sys,json,sqlite3
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
con=sqlite3.connect('data/lab.sqlite')
rows=con.execute('''WITH ranked AS (SELECT *,row_number() OVER(PARTITION BY run,agent ORDER BY id) AS sequence FROM episodes)
SELECT run,count(*),sum(success),avg(steps) FROM ranked WHERE sequence<=3 OR run LIKE '%teacher%' GROUP BY run''').fetchall()
Path('docs/results.json').write_text(json.dumps([dict(zip(['run','episodes','successes','mean_steps'],r)) for r in rows],indent=2))
valid=[r for r in rows if r[0].startswith('release2-')]
order=['untrained','random','heuristic','trained','tiny','small','medium']
labels=['Untrained','Random','Heuristic','Tiny / 100 epochs','Tiny / 30 epochs','Small / 30 epochs','Medium / 30 epochs']
valid=sorted(valid,key=lambda r:order.index(r[0].removeprefix('release2-')))
fig,ax=plt.subplots(figsize=(9,4));values=[r[2]/r[1] for r in valid]
ax.bar(labels,values,color=['#819097','#819097','#8bb4a1','#337d65','#5b9f83','#5b9f83','#5b9f83'])
for i,r in enumerate(valid):ax.text(i,values[i]+.025,f'{r[2]}/{r[1]}',ha='center')
ax.set_ylim(0,1.13);ax.set_yticks([0,.25,.5,.75,1]);ax.set_ylabel('Episode success rate');ax.set_title('Held-out Minecraft flat-course navigation (15 episodes per policy)');plt.xticks(rotation=20,ha='right');fig.tight_layout();fig.savefig('docs/learning-results.png',dpi=160)
print(json.dumps(rows))
