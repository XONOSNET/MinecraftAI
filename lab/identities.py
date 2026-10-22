"""Stable agent serials and deduplicated life events; death tracking starts at installation."""
import time
class Identities:
    def __init__(self,db,count):
        self.db=db
        db.execute("CREATE INDEX IF NOT EXISTS lab_agent_trials ON episodes(agent,success)")
        db.executescript('CREATE TABLE IF NOT EXISTS agent_identity(agent TEXT PRIMARY KEY,serial TEXT UNIQUE,tracked_since REAL);CREATE TABLE IF NOT EXISTS agent_life(id TEXT PRIMARY KEY,agent TEXT,event TEXT,time REAL);')
        for i in range(count):db.execute('INSERT OR IGNORE INTO agent_identity VALUES(?,?,?)',(f'LabAI{i}',f'A{i+1:04d}',time.time()))
        db.commit()
    def get(self,name):
        row=self.db.execute('SELECT serial,tracked_since FROM agent_identity WHERE agent=?',(name,)).fetchone()
        if not row:raise ValueError('Unknown agent')
        deaths,spawns=self.db.execute("SELECT coalesce(sum(event='death'),0),coalesce(sum(event='spawn'),0) FROM agent_life WHERE agent=?",(name,)).fetchone()
        trials,wins=self.db.execute('SELECT count(*),coalesce(sum(success),0) FROM episodes WHERE agent=?',(name,)).fetchone()
        return dict(trials=trials,successful_trials=wins,serial=row[0],tracked_since=row[1],deaths=deaths,spawns=spawns)
    def record(self,name,event,identifier):
        self.get(name)
        if event not in ('death','spawn') or not isinstance(identifier,str) or not 1<=len(identifier)<=64:raise ValueError('Invalid life event')
        self.db.execute('INSERT OR IGNORE INTO agent_life VALUES(?,?,?,?)',(identifier,name,event,time.time()));self.db.commit();return self.get(name)
