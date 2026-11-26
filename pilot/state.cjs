'use strict';

// Continuing-world memory contains claims, never an inventory/world oracle.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 1, MAX_BYTES = 1024 * 1024, MAX_EVENTS = 128;
const IMMUTABLE = ['schema', 'worldKey', 'identity', 'revision', 'createdAt', 'updatedAt'];
const COUNTERS = ['deaths', 'respawns', 'disconnects', 'sessions', 'recoveries', 'completedGoals', 'repeatedStalls', 'humanInterventions', 'eventsDropped'];
class StateError extends Error { constructor(message, code) { super(message); this.code = code; } }
const fail = (message, code = 'INVALID_STATE') => { throw new StateError(message, code); };
const copy = value => JSON.parse(JSON.stringify(value));
const digest = text => crypto.createHash('sha256').update(text).digest('hex');

function point(value) {
  const p = Array.isArray(value) ? value : value && [value.x, value.y, value.z];
  if (!p || p.length !== 3 || p.some(v => typeof v !== 'number' || !Number.isFinite(v)) ||
      Math.abs(p[0]) > 30000000 || Math.abs(p[2]) > 30000000 || Math.abs(p[1]) > 2048) fail('Invalid remembered position');
  return [...p];
}

function jsonValue(value, seen = new Set(), budget = {nodes: 0}, depth = 0) {
  if (++budget.nodes > 60000 || depth > 24) fail('Persistent state exceeds its structural limit');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > 8192) fail('Persistent string is too long'); return value; }
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Persistent numbers must be finite'); return value; }
  if (!value || typeof value !== 'object' || value instanceof Date || seen.has(value)) fail('Persistent state must be acyclic JSON data');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    if (value.length > 4096) fail('Persistent array is too large');
    result = value.map(v => jsonValue(v, seen, budget, depth + 1));
  } else {
    result = {};
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Unsafe persistent object key');
      if (item !== undefined) result[key] = jsonValue(item, seen, budget, depth + 1);
    }
    if (['x', 'y', 'z'].every(key => Object.hasOwn(result, key))) point(result);
    for (const key of ['position', 'anchor', 'spawn', 'deathPosition']) {
      if (Object.hasOwn(result, key) && result[key] !== null) point(result[key]);
    }
  }
  seen.delete(value);
  return result;
}

function validate(data, scope) {
  data = jsonValue(data);
  if (data.schema !== SCHEMA) fail('Unsupported persistent-state schema', 'SCHEMA_MISMATCH');
  if (data.worldKey !== scope.worldKey || data.identity !== scope.identity) fail('Persistent state belongs to another world or identity', 'SCOPE_MISMATCH');
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) fail('Invalid persistent-state revision');
  for (const key of ['createdAt', 'updatedAt']) if (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] < 0) fail('Invalid persistent timestamp');
  if (!Array.isArray(data.events) || !Array.isArray(data.storage) || !Array.isArray(data.resume) || !Array.isArray(data.routes)) fail('Persistent collections are invalid');
  if (data.storage.length > 64 || data.resume.length > 16 || data.routes.length > 128) fail('Persistent collection exceeds its bound');
  if (data.home !== null && (typeof data.home !== 'object' || Array.isArray(data.home))) fail('Home must be a claim object');
  for (const key of ['ownership', 'construction', 'goal', 'recovery', 'metrics', 'verification']) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) fail('Invalid persistent ' + key);
  }
  for (const key of COUNTERS) if (!Number.isSafeInteger(data.metrics[key]) || data.metrics[key] < 0) fail('Invalid persistent counter ' + key);
  if (data.recovery.required !== undefined && typeof data.recovery.required !== 'boolean') fail('Invalid persistent recovery requirement');
  if (data.events.length > MAX_EVENTS) {
    const removed = data.events.length - MAX_EVENTS;
    data.events = data.events.slice(-MAX_EVENTS);
    data.metrics.eventsDropped = (data.metrics.eventsDropped || 0) + removed;
  }
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) fail('Persistent state exceeds one MiB');
  return data;
}

function envelope(data) {
  return JSON.stringify({format: 'minecraft-persistent-pilot', checksum: digest(JSON.stringify(data)), data}) + '\n';
}

function readRecord(filename, scope) {
  if (fs.statSync(filename).size > MAX_BYTES + 1024) fail('Persistent record exceeds its byte limit');
  const record = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (record.format !== 'minecraft-persistent-pilot' || record.checksum !== digest(JSON.stringify(record.data))) fail('Persistent record checksum failed', 'CORRUPT_STATE');
  return validate(record.data, scope);
}

function candidates(filename, scope) {
  const directory = path.dirname(filename), base = path.basename(filename);
  const pending = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.startsWith(base + '.pending-'))
    .map(name => path.join(directory, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, 32) : [];
  const names = [filename, filename + '.bak', ...pending], found = [], invalid = [];
  for (const name of names) {
    if (!fs.existsSync(name)) continue;
    try { found.push({filename: name, data: readRecord(name, scope)}); }
    catch (error) {
      if (error.code === 'SCOPE_MISMATCH' || error.code === 'SCHEMA_MISMATCH') throw error;
      invalid.push(name);
    }
  }
  found.sort((a, b) => b.data.revision - a.data.revision || (a.filename === filename ? -1 : 1));
  if (!found.length && invalid.length) fail('No valid same-scope persistent record remains', 'CORRUPT_STATE');
  return {best: found[0] || null, found, invalid};
}

function fsyncDirectory(directory) {
  let fd;
  try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
  catch (error) { if (!['EPERM', 'EACCES', 'EINVAL', 'EISDIR'].includes(error.code)) throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function writeSynced(filename, text) {
  const fd = fs.openSync(filename, 'wx');
  try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function writeLease(filename, scope, operation) {
  const lock = filename + '.lock', token = crypto.randomBytes(16).toString('hex');
  const owner = JSON.stringify({...scope, pid: process.pid, token});
  const temp = filename + '.lease-' + process.pid + '-' + token;
  writeSynced(temp, owner);
  let held = false;
  try {
    for (let attempt = 0; attempt < 3 && !held; attempt++) {
      try { fs.linkSync(temp, lock); held = true; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const raw = fs.readFileSync(lock, 'utf8');
        let previous;
        try { previous = JSON.parse(raw); } catch { fail('Persistent writer lease is invalid', 'STATE_BUSY'); }
        if (previous.worldKey !== scope.worldKey || previous.identity !== scope.identity) fail('Writer lease belongs to another scope', 'SCOPE_MISMATCH');
        if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0 || typeof previous.token !== 'string') fail('Persistent writer lease is invalid', 'STATE_BUSY');
        if (alive(previous.pid)) fail('Another persistent-state writer is active', 'STATE_BUSY');
        // Never remove a lease that changed while checking its dead owner.
        if (fs.readFileSync(lock, 'utf8') !== raw) fail('Persistent writer lease changed', 'STATE_BUSY');
        fs.unlinkSync(lock);
      }
    }
    if (!held) fail('Could not acquire the persistent writer lease', 'STATE_BUSY');
    return operation();
  } finally {
    if (held && fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === owner) fs.unlinkSync(lock);
    fs.unlinkSync(temp);
  }
}

function invalidate(data) {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && (Object.hasOwn(value, 'verified') || Object.hasOwn(value, 'position'))) { value.verified = false; value.verifiedAt = null; }
    if (!Array.isArray(value) && Object.hasOwn(value, 'trusted')) value.trusted = false;
    for (const item of Object.values(value)) visit(item);
  };
  for (const key of ['home', 'ownership', 'storage', 'construction', 'routes', 'carried', 'inventory']) {
    visit(data[key]);
    if (data[key] && !Array.isArray(data[key])) { data[key].verified = false; data[key].verifiedAt = null; }
    if (Array.isArray(data[key])) for (const item of data[key]) if (item && typeof item === 'object' && !Array.isArray(item)) { item.verified = false; item.verifiedAt = null; }
  }
  data.verification = {home: false, ownership: false, storage: false, construction: false, routes: false, inventory: false};
  if (data.lastObservation) data.lastObservation.trusted = false;
  if (data.recovery.respawn) data.recovery.respawn.trusted = false;
  data.recovery.needsRevalidation = true;
}

function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) merge(target[key], value);
    else target[key] = value;
  }
  return target;
}

class PersistentState {
  constructor(filename, options) {
    if (!options || typeof options.worldKey !== 'string' || !options.worldKey.trim() || options.worldKey.length > 256 ||
        !/^[A-Za-z0-9_]{3,16}$/.test(options.identity || '')) fail('A world key and stable Minecraft identity are required');
    this.filename = path.resolve(filename);
    this.scope = {worldKey: options.worldKey, identity: options.identity};
    this.clock = options.clock || Date.now;
    fs.mkdirSync(path.dirname(this.filename), {recursive: true});
    const loaded = candidates(this.filename, this.scope).best;
    const now = this.now();
    this.data = loaded ? loaded.data : {
      schema: SCHEMA, ...this.scope, revision: 0, createdAt: now, updatedAt: now,
      session: null, home: null, ownership: {}, storage: [], routes: [],
      construction: {stage: 'unplanned'}, goal: {kind: 'establish_home', status: 'pending'}, resume: [],
      recovery: {phase: 'initial', required: false, needsRevalidation: true, awaitingRespawn: false, death: null, respawn: null},
      verification: {}, lastObservation: null,
      metrics: {deaths: 0, respawns: 0, disconnects: 0, sessions: 0, recoveries: 0, completedGoals: 0, repeatedStalls: 0, humanInterventions: 0, eventsDropped: 0}, events: []
    };
    this.recoveredFrom = loaded && loaded.filename !== this.filename ? loaded.filename : null;
    this._committed = copy(this.data);
    invalidate(this.data);
    if (this.data.session) this.data.session.connected = false;
    if (!loaded) this.transact(() => {}, {kind: 'state_created'});
  }
  now() { const value = this.clock(); if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('Invalid persistent-state clock'); return value; }
  snapshot() { return copy(this.data); }
  update(patch, event) {
    patch = jsonValue(patch);
    if (!patch || Array.isArray(patch) || typeof patch !== 'object' || IMMUTABLE.some(key => Object.hasOwn(patch, key))) fail('Persistent metadata is immutable');
    return this.transact(draft => merge(draft, patch), event);
  }
  transact(operation, event) {
    if (typeof operation !== 'function') fail('A state transaction needs a function');
    if (operation.constructor?.name === 'AsyncFunction') fail('Persistent transactions must be synchronous');
    const draft = copy(this.data);
    operation(draft);
    for (const key of IMMUTABLE) if (draft[key] !== this.data[key]) fail('Persistent metadata is immutable');
    const now = this.now();
    draft.updatedAt = now;
    draft.revision++;
    if (event) draft.events.push({...jsonValue(typeof event === 'string' ? {kind: event} : event), at: now, revision: draft.revision});
    const valid = validate(draft, this.scope);
    writeLease(this.filename, this.scope, () => {
      const disk = candidates(this.filename, this.scope).best;
      if (disk && (disk.data.revision !== this._committed.revision || digest(JSON.stringify(disk.data)) !== digest(JSON.stringify(this._committed))) ||
          !disk && this._committed.revision !== 0) fail('Persistent state changed; reopen before retrying', 'STALE_STATE');
      const token = process.pid + '-' + crypto.randomBytes(8).toString('hex');
      const pending = this.filename + '.pending-' + token;
      writeSynced(pending, envelope(valid));
      if (disk) {
        const backup = this.filename + '.backup-' + token;
        writeSynced(backup, envelope(disk.data));
        fs.renameSync(backup, this.filename + '.bak');
      }
      // A fully synced pending record remains recoverable if this rename fails.
      fs.renameSync(pending, this.filename);
      fsyncDirectory(path.dirname(this.filename));
      this.data = valid;
      this._committed = copy(valid);
      for (const old of candidates(this.filename, this.scope).found) {
        if (old.filename.startsWith(this.filename + '.pending-') && old.data.revision <= valid.revision) fs.unlinkSync(old.filename);
      }
    });
    return this.snapshot();
  }
  markSession(sessionId = crypto.randomUUID()) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 128) fail('Invalid pilot session id');
    return this.transact(data => {
      invalidate(data); data.session = {id: sessionId, startedAt: this.now(), connected: false}; data.metrics.sessions++;
    }, {kind: 'session_started', sessionId});
  }
  markDisconnected(reason = 'connection ended') {
    return this.transact(data => {
      invalidate(data); if (data.session) data.session.connected = false;
      data.metrics.disconnects++; data.recovery.connection = 'disconnected';
    }, {kind: 'disconnected', reason: String(reason).slice(0, 512)});
  }
  markDeath(position = null, reason = 'death') {
    if (position && !Array.isArray(position) && Object.hasOwn(position, 'position')) {
      reason = position.reason || reason;
      position = position.position;
    }
    if (position !== null) position = point(position);
    if (this.data.recovery.awaitingRespawn) return this.snapshot();
    return this.transact(data => {
      invalidate(data); data.metrics.deaths++;
      data.recovery = {...data.recovery, phase: 'awaiting_respawn', required: true, awaitingRespawn: true,
        death: {number: data.metrics.deaths, at: this.now(), position, reason: String(reason).slice(0, 512)}, respawn: null};
      if (data.goal) data.goal.status = 'interrupted';
      if (data.lastObservation) data.lastObservation.trusted = false;
    }, {kind: 'death', position, reason: String(reason).slice(0, 512)});
  }
  markRespawn(position, inventory) {
    if (position && !Array.isArray(position) && Object.hasOwn(position, 'position')) {
      inventory = position.inventory;
      position = position.position;
    }
    position = point(position);
    if (!Array.isArray(inventory) || inventory.length > 128) fail('Actual post-respawn inventory is required');
    const items = inventory.map(item => {
      if (!item || typeof item.name !== 'string' || !/^[a-z0-9_:.-]+$/.test(item.name) || !Number.isInteger(item.count) || item.count < 0 || item.count > 1000000) fail('Invalid observed inventory item');
      return {name: item.name, count: item.count, ...(Number.isInteger(item.slot) ? {slot: item.slot} : {})};
    });
    return this.transact(data => {
      const fromDeath = data.recovery.awaitingRespawn;
      // A reconnect is another inventory observation, not completion of the
      // interrupted recovery. Only the life engine's physical proof clears it.
      const required = !!fromDeath || data.recovery.required === true ||
        (data.recovery.required === undefined && data.recovery.phase === 'recovering' && data.recovery.respawn?.fromDeath === true);
      invalidate(data); if (fromDeath) data.metrics.respawns++;
      data.recovery = {...data.recovery, phase: required ? 'recovering' : data.recovery.phase === 'resumed' ? 'resumed' : 'observed',
        required, awaitingRespawn: false,
        respawn: {position, inventory: items, at: this.now(), fromDeath, trusted: false}};
      data.lastObservation = {kind: 'respawn', position, inventory: items, at: this.now(), trusted: false};
      if (data.session) data.session.connected = true;
    }, {kind: 'respawn_observed', position, itemStacks: items.length});
  }
  verifyClaim(kind, id, evidence) {
    if (evidence === undefined) { evidence = id; id = null; }
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || !Object.keys(evidence).length) fail('Physical verification evidence is required');
    if (!['home', 'ownership', 'storage', 'construction', 'route', 'bed'].includes(kind)) fail('Unknown physical claim type');
    return this.transact(data => {
      let target;
      if (kind === 'storage' || kind === 'route') target = data[kind === 'route' ? 'routes' : 'storage'].find(item => item.id === id);
      else if (kind === 'bed') target = data.home && data.home.bed;
      else target = data[kind];
      if (!target || typeof target !== 'object' || Array.isArray(target)) fail('Physical claim does not exist');
      target.verified = true; target.verifiedAt = this.now();
      target.verification = {sessionId: data.session?.id || null, at: this.now(), evidence: jsonValue(evidence)};
      data.verification[kind === 'route' ? 'routes' : kind] = true;
    }, {kind: 'claim_verified', claim: kind, id});
  }
}

module.exports = {open: (filename, options) => new PersistentState(filename, options), PersistentState, StateError, SCHEMA, MAX_EVENTS};
