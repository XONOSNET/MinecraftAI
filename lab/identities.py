"""Stable agent serials and deduplicated life events; death tracking starts at installation."""
import time
import secrets
class Identities:
    def __init__(self,db,count):
        self.db=db
        db.execute("CREATE INDEX IF NOT EXISTS lab_agent_trials ON episodes(agent,success)")
        db.executescript('CREATE TABLE IF NOT EXISTS agent_identity(agent TEXT PRIMARY KEY,serial TEXT UNIQUE,tracked_since REAL);CREATE TABLE IF NOT EXISTS agent_life(id TEXT PRIMARY KEY,agent TEXT,event TEXT,time REAL);')
        if 'display_name' not in {row[1] for row in db.execute('PRAGMA table_info(agent_identity)')}:
            db.execute('ALTER TABLE agent_identity ADD COLUMN display_name TEXT')
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS agent_generated_name ON agent_identity(display_name)')
        for i in range(count):db.execute('INSERT OR IGNORE INTO agent_identity(agent,serial,tracked_since) VALUES(?,?,?)',(f'LabAI{i}',f'A{i+1:04d}',time.time()))
        first=('Amber','Ash','Birch','Cedar','Cobalt','Copper','Dawn','Dusk','Echo','Ember','Fern','Flint','Frost','Hazel','Jade','Juniper','Lunar','Maple','Moss','Nova','Oak','Onyx','Opal','Pine','Quartz','Reed','River','Sage','Silver','Solar','Willow','Zephyr')
        last=('Badger','Bear','Finch','Fox','Hare','Hawk','Heron','Ibis','Jay','Kite','Lark','Lynx','Marten','Moth','Newt','Otter','Owl','Panda','Pike','Puma','Raven','Robin','Rook','Seal','Stag','Swift','Tern','Toad','Trout','Wolf','Wren','Yak')
        used={row[0] for row in db.execute('SELECT display_name FROM agent_identity WHERE display_name IS NOT NULL')}
        for (agent,) in db.execute('SELECT agent FROM agent_identity WHERE display_name IS NULL').fetchall():
            available=[a+b for a in first for b in last if a+b not in used]
            if not available:raise RuntimeError('Generated bot name pool exhausted')
            name=secrets.choice(available);used.add(name)
            db.execute('UPDATE agent_identity SET display_name=? WHERE agent=?',(name,agent))
        db.commit()
    def get(self,name):
        row=self.db.execute('SELECT serial,tracked_since,display_name FROM agent_identity WHERE agent=?',(name,)).fetchone()
        if not row:raise ValueError('Unknown agent')
        deaths,spawns=self.db.execute("SELECT coalesce(sum(event='death'),0),coalesce(sum(event='spawn'),0) FROM agent_life WHERE agent=?",(name,)).fetchone()
        trials,wins=self.db.execute('SELECT count(*),coalesce(sum(success),0) FROM episodes WHERE agent=?',(name,)).fetchone()
        return dict(trials=trials,successful_trials=wins,display_name=row[2],serial=row[0],tracked_since=row[1],deaths=deaths,spawns=spawns)
    def record(self,name,event,identifier):
        self.get(name)
        if event not in ('death','spawn') or not isinstance(identifier,str) or not 1<=len(identifier)<=64:raise ValueError('Invalid life event')
        self.db.execute('INSERT OR IGNORE INTO agent_life VALUES(?,?,?,?)',(identifier,name,event,time.time()));self.db.commit();return self.get(name)
