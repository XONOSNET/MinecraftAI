const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {open, MAX_EVENTS} = require('../pilot/state.cjs');

const scope = {worldKey: 'minecraft:overworld:uuid-123', identity: 'HomeAI01'};
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-pilot-state-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('mc-pilot-state-'));
    fs.rmSync(directory, {recursive: true, force: true});
  });
  let at = 1000;
  const filename = path.join(directory, 'life.json');
  return {filename, options: {...scope, clock: () => at}, tick: () => at += 1000};
}

test('home, ownership, storage, unfinished work and resume conditions survive a fresh session as unverified claims', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.markSession('first');
  state.update({home: {position: [10, 70, 20], bed: {position: [11, 70, 20]}, owner: scope.identity},
    ownership: {bounds: [0, 20, 0, 30]}, storage: [{id: 'chest', position: [12, 70, 20], items: [{name: 'oak_log', count: 5}]}],
    construction: {stage: 'roof', placed: [[10, 72, 20]], verified: true},
    goal: {id: 'repair_roof', kind: 'home_repair', status: 'working'},
    resume: [{goal: 'gather_wood', condition: 'enclosure_and_safe_access'}],
    routes: [{id: 'home', path: [[10, 70, 20], [11, 70, 20]], verified: true}]}, 'progress');
  state.verifyClaim('home', {enclosed: true, access: 'checked'});
  state.verifyClaim('bed', {block: 'white_bed', respawnConfirmed: true});
  state.verifyClaim('storage', 'chest', {opened: true});
  assert.equal(state.snapshot().home.verified, true);
  const loaded = open(f.filename, f.options).snapshot();
  assert.deepEqual(loaded.home.position, [10, 70, 20]);
  assert.equal(loaded.goal.id, 'repair_roof');
  assert.deepEqual(loaded.resume, [{goal: 'gather_wood', condition: 'enclosure_and_safe_access'}]);
  for (const claim of [loaded.home, loaded.home.bed, loaded.storage[0], loaded.construction, loaded.routes[0]]) assert.equal(claim.verified, false);
  assert.equal(loaded.session.connected, false);
  assert.equal(loaded.recovery.needsRevalidation, true);
});

test('death preserves home and task while only the actual post-respawn inventory is observed', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.markSession('life');
  state.update({home: {position: [100, 65, 100]}, goal: {kind: 'gather_stone', status: 'working'},
    carried: {verified: true, trusted: true, items: [{name: 'diamond', count: 64}]}}, 'working');
  f.tick(); state.markDeath({x: 110, y: 64, z: 105}, 'zombie');
  state.markDeath([110, 64, 105], 'duplicate death packet');
  assert.equal(state.snapshot().metrics.deaths, 1);
  assert.equal(state.snapshot().goal.status, 'interrupted');
  assert.equal(state.snapshot().carried.trusted, false);
  f.tick(); state.markRespawn([0.5, 64, 0.5], []);
  const saved = state.snapshot();
  assert.deepEqual(saved.home.position, [100, 65, 100]);
  assert.deepEqual(saved.recovery.respawn.position, [.5, 64, .5]);
  assert.deepEqual(saved.recovery.respawn.inventory, []);
  assert.equal(saved.recovery.respawn.trusted, false);
  assert.equal(saved.metrics.respawns, 1);
  state.markDeath([1, 64, 1], 'another death');
  state.markRespawn([100, 65, 100], [{name: 'oak_log', count: 2, slot: 9, unexpected: 'not serialized'}]);
  assert.equal(state.snapshot().metrics.deaths, 2);
  assert.deepEqual(state.snapshot().lastObservation.inventory, [{name: 'oak_log', count: 2, slot: 9}]);
  assert.throws(() => state.markRespawn([1, 64, 1]), /Actual post-respawn inventory/);
});

test('disconnect and restart retain an interrupted recovery without trusting a saved bed or carried inventory', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.markSession('controller-one');
  state.update({home: {position: [12, 64, 15], bed: {position: [13, 64, 15], verified: true}},
    goal: {kind: 'repair_bed', status: 'working'}, resume: [{goal: 'replenish', condition: 'bed_verified'}]});
  state.markDeath([15, 64, 15]); state.markDisconnected('service restart');
  const resumed = open(f.filename, f.options);
  resumed.markSession('controller-two');
  assert.equal(resumed.snapshot().recovery.awaitingRespawn, true);
  assert.equal(resumed.snapshot().home.bed.verified, false);
  assert.equal(resumed.snapshot().goal.kind, 'repair_bed');
  resumed.markRespawn([0, 64, 0], []);
  assert.equal(resumed.snapshot().metrics.respawns, 1);
  assert.equal(resumed.snapshot().metrics.disconnects, 1);
  assert.equal(resumed.snapshot().metrics.sessions, 2);
});

test('driver payload objects record death and actual respawn without serializing stale caller inventory', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.markDeath({position: [1, 64, 1], reason: 'fall', inventory: [{name: 'oak_log', count: 64}]});
  state.markRespawn({position: [0, 65, 0], inventory: [{name: 'stick', count: 1}]});
  assert.equal(state.snapshot().recovery.death.reason, 'fall');
  assert.deepEqual(state.snapshot().lastObservation.inventory, [{name: 'stick', count: 1}]);
});

test('disconnect after actual respawn preserves required recovery until physically completed', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.markDeath([12, 64, 15]);state.markRespawn([0, 64, 0], []);
  assert.equal(state.snapshot().recovery.required,true);
  state.markDisconnected('restart before checked return home');
  const resumed=open(f.filename,f.options);resumed.markSession('reconnected');
  resumed.markRespawn([2,64,3],[{name:'stick',count:1}]);
  assert.equal(resumed.snapshot().recovery.required,true);
  assert.equal(resumed.snapshot().recovery.phase,'recovering');
  assert.equal(resumed.snapshot().recovery.respawn.fromDeath,false);
  assert.equal(resumed.snapshot().metrics.respawns,1);
  resumed.update({recovery:{required:false,phase:'resumed'}},'physical_recovery_verified');
  resumed.markDisconnected();resumed.markSession('after-completion');resumed.markRespawn([12,64,15],[]);
  assert.equal(resumed.snapshot().recovery.required,false);
  assert.equal(resumed.snapshot().recovery.phase,'resumed');
  assert.equal(resumed.snapshot().metrics.respawns,1);
});

test('state from another identity or real world UUID fails closed and is not overwritten', t => {
  const f = fixture(t); open(f.filename, f.options);
  const before = fs.readFileSync(f.filename);
  for (const other of [{...f.options, worldKey: 'minecraft:overworld:different-uuid'}, {...f.options, identity: 'OtherAI01'}]) {
    assert.throws(() => open(f.filename, other), error => error.code === 'SCOPE_MISMATCH');
    assert.deepEqual(fs.readFileSync(f.filename), before);
  }
});

test('a corrupted main record recovers the prior valid backup and requests live revalidation', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.update({home: {position: [1, 64, 1]}, goal: {kind: 'build_roof', status: 'working'}});
  state.update({construction: {stage: 'roof'}});
  fs.writeFileSync(f.filename, '{broken');
  const recovered = open(f.filename, f.options);
  assert.equal(recovered.recoveredFrom, f.filename + '.bak');
  assert.equal(recovered.snapshot().goal.kind, 'build_roof');
  assert.equal(recovered.snapshot().home.verified, false);
  recovered.markSession('recovered');
  assert.equal(JSON.parse(fs.readFileSync(f.filename)).data.session.id, 'recovered');
});

test('interruption after a synced pending write rolls forward without losing the unfinished task', t => {
  const f = fixture(t), state = open(f.filename, f.options), rename = fs.renameSync;
  try {
    fs.renameSync = function (source, destination) {
      if (destination === f.filename) throw Object.assign(new Error('simulated process interruption'), {code: 'EIO'});
      return rename.apply(this, arguments);
    };
    assert.throws(() => state.update({home: {position: [1, 64, 1]}, goal: {kind: 'replace_bed', status: 'working'}}, 'bed_missing'), /simulated/);
  } finally { fs.renameSync = rename; }
  assert.ok(fs.readdirSync(path.dirname(f.filename)).some(name => name.includes('.pending-')));
  const recovered = open(f.filename, f.options);
  assert.match(recovered.recoveredFrom, /\.pending-/);
  assert.equal(recovered.snapshot().goal.kind, 'replace_bed');
  recovered.markSession('after-interruption');
  assert.equal(open(f.filename, f.options).snapshot().goal.kind, 'replace_bed');
});

test('all corrupted copies fail closed rather than creating a new home life', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.update({goal: {kind: 'return_home'}});
  fs.writeFileSync(f.filename, 'broken'); fs.writeFileSync(f.filename + '.bak', 'broken');
  assert.throws(() => open(f.filename, f.options), error => error.code === 'CORRUPT_STATE');
});

test('a stale in-memory writer cannot overwrite newer home progress', t => {
  const f = fixture(t), first = open(f.filename, f.options), second = open(f.filename, f.options);
  first.update({construction: {stage: 'bed'}});
  assert.throws(() => second.update({construction: {stage: 'floor'}}), error => error.code === 'STALE_STATE');
  assert.equal(open(f.filename, f.options).snapshot().construction.stage, 'bed');
});

test('same-revision external edits are not overwritten and transactions cannot hide asynchronous work', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  assert.throws(() => state.transact(async draft => { draft.goal.kind = 'lost_async_work'; }), /synchronous/);
  const record = JSON.parse(fs.readFileSync(f.filename));
  record.data.goal.kind = 'external_preserved_goal';
  record.checksum = crypto.createHash('sha256').update(JSON.stringify(record.data)).digest('hex');
  fs.writeFileSync(f.filename, JSON.stringify(record));
  assert.throws(() => state.update({goal: {kind: 'overwrite_external_edit'}}), error => error.code === 'STALE_STATE');
  assert.equal(open(f.filename, f.options).snapshot().goal.kind, 'external_preserved_goal');
});

test('a dead process lease is recovered, but a live owner is never stolen', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  const child = spawnSync(process.execPath, ['-e', ''], {encoding: 'utf8'});
  assert.equal(child.status, 0);
  fs.writeFileSync(f.filename + '.lock', JSON.stringify({...scope, pid: child.pid, token: 'dead-owner'}));
  state.update({goal: {kind: 'repair_access'}});
  assert.equal(fs.existsSync(f.filename + '.lock'), false);
  fs.writeFileSync(f.filename + '.lock', JSON.stringify({...scope, pid: process.pid, token: 'live-owner'}));
  assert.throws(() => state.update({goal: {kind: 'steal_state'}}), error => error.code === 'STATE_BUSY');
  fs.unlinkSync(f.filename + '.lock');
  assert.equal(open(f.filename, f.options).snapshot().goal.kind, 'repair_access');
});

test('bounded events preserve recent recovery evidence and immutable scope', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  for (let i = 0; i < MAX_EVENTS + 4; i++) state.update({goal: {attempt: i}}, {kind: 'replan', attempt: i});
  assert.equal(state.snapshot().events.length, MAX_EVENTS);
  assert.equal(state.snapshot().events.at(-1).attempt, MAX_EVENTS + 3);
  assert.equal(state.snapshot().metrics.eventsDropped, 5);
  assert.throws(() => state.update({identity: 'OtherAI01'}), /immutable/);
  assert.throws(() => state.transact(draft => { draft.worldKey = 'wrong'; }), /immutable/);
  const detached = state.snapshot(); detached.goal.kind = 'changed outside transaction';
  assert.notEqual(state.snapshot().goal.kind, detached.goal.kind);
});

test('invalid coordinates, non-JSON values, unsafe keys and oversized memories are refused before saving', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  const revision = state.snapshot().revision;
  for (const patch of [{home: {position: [Infinity, 64, 0]}}, {home: {position: [0, 99999, 0]}},
    {goal: {callback: () => {}}}, JSON.parse('{"__proto__":{"polluted":true}}'),
    {routes: Array.from({length: 129}, (_, id) => ({id}))}]) assert.throws(() => state.update(patch));
  assert.equal(state.snapshot().revision, revision);
  assert.equal({}.polluted, undefined);
  assert.throws(() => state.verifyClaim('construction', {}), /evidence/);
});

test('tampering with a checksum does not turn remembered resources into valid state', t => {
  const f = fixture(t), state = open(f.filename, f.options);
  state.update({goal: {kind: 'resupply'}});
  const record = JSON.parse(fs.readFileSync(f.filename));
  record.data.home = {position: [123, 65, 456]};
  fs.writeFileSync(f.filename, JSON.stringify(record));
  const recovered = open(f.filename, f.options);
  assert.equal(recovered.recoveredFrom, f.filename + '.bak');
  assert.equal(recovered.snapshot().home, null);
  assert.notEqual(record.checksum, crypto.createHash('sha256').update(JSON.stringify(record.data)).digest('hex'));
});
