"""Persistent identities for actual policy weights, independent of backup saves."""
import hashlib
import json
import time
from pathlib import Path


class ModelEvolution:
    def __init__(self, db):
        self.db = db
        db.executescript('''
            CREATE TABLE IF NOT EXISTS policy_versions(
                id INTEGER PRIMARY KEY AUTOINCREMENT, skill TEXT NOT NULL,
                fingerprint TEXT NOT NULL, metadata TEXT NOT NULL,
                UNIQUE(skill,fingerprint));
            CREATE TABLE IF NOT EXISTS policy_current(skill TEXT PRIMARY KEY, version INTEGER);
            CREATE TABLE IF NOT EXISTS policy_pending(skill TEXT PRIMARY KEY, version INTEGER);
        ''')

    def record(self, skill, weights, path=None, source='imported', training=None):
        digest = hashlib.sha256()
        for key, tensor in sorted(weights.items()):
            tensor = tensor.detach().cpu().contiguous()
            digest.update(json.dumps([key, str(tensor.dtype), list(tensor.shape)]).encode())
            digest.update(tensor.numpy().tobytes())
        fingerprint = digest.hexdigest()
        old = self.db.execute('SELECT version FROM policy_current WHERE skill=?', (skill,)).fetchone()
        row = self.db.execute('SELECT id FROM policy_versions WHERE skill=? AND fingerprint=?', (skill, fingerprint)).fetchone()
        if row:
            identifier = row[0]
        else:
            first = ['Amber', 'Birch', 'Copper', 'Dawn', 'Ember', 'Flint', 'Moss', 'Quartz', 'River', 'Willow', 'Cedar', 'Silver', 'Fern', 'Oak', 'Stone', 'Azure']
            second = ['Scout', 'Rover', 'Pathfinder', 'Wanderer', 'Pioneer', 'Ranger', 'Voyager', 'Seeker', 'Walker', 'Explorer', 'Climber', 'Navigator', 'Trailblazer', 'Strider', 'Wayfarer', 'Nomad']
            metadata = {
                'name': first[int(fingerprint[:2], 16) % len(first)] + ' ' + second[int(fingerprint[2:4], 16) % len(second)],
                'revision': self.db.execute('SELECT count(*) FROM policy_versions WHERE skill=?', (skill,)).fetchone()[0] + 1,
                'parent': old[0] if old else None, 'created_at': time.time(), 'source': source,
                'state': 'candidate' if source == 'candidate' else 'unvalidated' if source == 'trained' else 'existing baseline',
                'parameters': sum(t.numel() for t in weights.values()),
                'weight_bytes': sum(t.numel() * t.element_size() for t in weights.values()),
                'architecture': [weights['net.0.weight'].shape[1], weights['net.0.weight'].shape[0], weights['net.2.weight'].shape[0]],
                'training': training,
            }
            cursor = self.db.execute('INSERT INTO policy_versions(skill,fingerprint,metadata) VALUES(?,?,?)', (skill, fingerprint, json.dumps(metadata)))
            identifier = cursor.lastrowid
        if path and Path(path).exists():
            self._update(identifier, checkpoint_bytes=Path(path).stat().st_size)
        self.db.execute('INSERT OR REPLACE INTO policy_current VALUES(?,?)', (skill, identifier))
        if source == 'candidate':
            self.db.execute('INSERT OR REPLACE INTO policy_pending VALUES(?,?)', (skill, identifier))
        self.db.commit()
        return identifier

    def _update(self, identifier, **changes):
        row = self.db.execute('SELECT metadata FROM policy_versions WHERE id=?', (identifier,)).fetchone()
        metadata = json.loads(row[0]); metadata.update(changes)
        self.db.execute('UPDATE policy_versions SET metadata=? WHERE id=?', (json.dumps(metadata), identifier))

    def review(self, result):
        skill = result.get('skill', 'navigation')
        pending = result.get('kind') != 'saved_model_validation'
        table = 'policy_pending' if pending else 'policy_current'
        row = self.db.execute(f'SELECT version FROM {table} WHERE skill=?', (skill,)).fetchone()
        if row:
            changes = {'evaluation': result}
            if pending:
                changes['state'] = 'accepted' if result['accepted'] else 'rejected'
            self._update(row[0], **changes)
        if pending:
            self.db.execute('DELETE FROM policy_pending WHERE skill=?', (skill,))
        self.db.commit()

    def snapshot(self, skill):
        active = dict(self.db.execute('SELECT skill,version FROM policy_current'))
        rows = self.db.execute('''SELECT id,skill,fingerprint,metadata FROM policy_versions
            WHERE id IN (SELECT id FROM policy_versions ORDER BY id DESC LIMIT 60)
               OR id IN (SELECT version FROM policy_current)
            ORDER BY id DESC''').fetchall()
        versions = []
        for identifier, track, fingerprint, metadata in rows:
            versions.append(dict(json.loads(metadata), id=identifier, model_id=f'MODEL-{identifier:06d}', skill=track,
                                 fingerprint=fingerprint[:12], active=active.get(track) == identifier))
        current = [v for v in versions if v['active']]
        return {'current': next((v for v in current if v['skill'] == skill), None), 'skills': current,
                'history': versions[:60], 'version_count': self.db.execute('SELECT count(*) FROM policy_versions').fetchone()[0],
                'total_parameters': sum(v['parameters'] for v in current),
                'total_weight_bytes': sum(v['weight_bytes'] for v in current)}
