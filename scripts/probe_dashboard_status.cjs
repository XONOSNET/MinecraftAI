// Read-only timing sample of the fixture request and a small, unlocked dashboard route.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { performance } = require('node:perf_hooks');
const { setTimeout: wait } = require('node:timers/promises');
const { FIXTURE_HEALTH, normalizeFixtureHealth } = require('./combat_fixture_health.cjs');

const origin = 'http://127.0.0.1:8000';
const paths = ['/status?compact=true', '/brain/data'];
const narrowPath = '/fixture/health';
const requestTimeoutMs = 1500;

function statusFields(status) {
  const learning = status.world_learning;
  const session = status.world_training?.session;
  return { world_phase: session?.phase ?? null, world_run: session?.run ?? learning?.run,
    trial: session?.scenario, world_progress: session?.progress, world_started_at: session?.started_at,
    trial_at: session?.trial_at, learning_phase: learning?.phase,
    comparison_round: learning?.round, phase_at: learning?.phase_at,
    restore_pending: learning?.restore_pending, training_job: status.training_job?.status,
    persistence: status.performance?.persistence,
    server: { pid: status.server?.pid, ready: status.server?.ready, busy: status.server?.busy,
      bots_online: status.server?.bots_online }, ram_percent: status.ram_percent };
}

async function sample(path) {
  const started = performance.now();
  const at = new Date().toISOString();
  const signal = AbortSignal.timeout(requestTimeoutMs);
  let headersMs;
  try {
    const response = await fetch(origin + path, { signal });
    headersMs = performance.now() - started;
    const body = await response.json();
    const result = { at, path, status: response.status, headers_ms: headersMs,
      latency_ms: performance.now() - started, bytes: Number(response.headers.get('content-length')) || undefined };
    if (response.ok && path === paths[0]) Object.assign(result, statusFields(body));
    return result;
  } catch (error) {
    return { at, path, headers_ms: headersMs, latency_ms: performance.now() - started,
      error: signal.aborted ? signal.reason.name : error.name };
  }
}

function sampleNarrow() {
  const at = new Date().toISOString(), started = performance.now();
  const signal = AbortSignal.timeout(requestTimeoutMs);
  let headersMs;
  return new Promise(resolve => {
    const finish = fields => resolve({ at, path: narrowPath, headers_ms: headersMs,
      latency_ms: performance.now() - started, ...fields });
    const fail = error => finish({ error: signal.aborted ? signal.reason.name : error.name });
    const request = http.get({ hostname: '127.0.0.1', port: 8000, path: narrowPath, agent: false,
      headers: { Host: 'localhost:8000' }, signal }, response => {
      headersMs = performance.now() - started;
      response.on('error', fail);
      if (response.statusCode !== 200) {
        finish({ status: response.statusCode });
        response.destroy();
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes <= 4096) chunks.push(chunk);
        else { finish({ error: 'OversizedResponse' }); response.destroy(); }
      });
      response.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const normalized = normalizeFixtureHealth(body, body.server?.pid);
          const freshnessMs = Date.now() - body.sampled_at_ms;
          finish({ status: response.statusCode, bytes, protocol: body.protocol,
            sample_age_ms: Number.isFinite(freshnessMs) ? freshnessMs : undefined,
            contract_matches: body.protocol === FIXTURE_HEALTH, health_rejection: normalized.unavailable,
            ...statusFields(body) });
        } catch (error) { fail(error); }
      });
    });
    request.on('error', fail);
  });
}

async function main() {
  const [output, secondsText = '20', samplesText = '90', narrow] = process.argv.slice(2);
  const seconds = Number(secondsText), samples = Number(samplesText);
  assert.match(output ?? '', /^logs[/\\]dashboard-status-[\w-]+\.jsonl$/);
  assert.ok(Number.isInteger(seconds) && seconds >= 10 && Number.isInteger(samples) && samples >= 1 && samples <= 720);
  assert.ok(narrow === undefined || narrow === '--fixture-health');
  const handle = fs.openSync(output, 'wx');
  try {
    for (let index = 0; index < samples; index++) {
      const requests = paths.map(sample);
      if (narrow) requests.push(sampleNarrow());
      const results = await Promise.all(requests);
      fs.writeSync(handle, JSON.stringify({ index, results }) + '\n');
      if (index + 1 < samples) await wait(seconds * 1000);
    }
  } finally {
    fs.closeSync(handle);
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
