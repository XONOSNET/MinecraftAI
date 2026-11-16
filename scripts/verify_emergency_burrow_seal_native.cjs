// Reproduce trial 943 LabAI1's airborne seal check on disposable Paper.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const mineflayer = require('mineflayer');
const { Rcon } = require('rcon-client');
const { Vec3 } = require('vec3');

const source = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'controller');
const expectStop = process.argv.includes('--expect-headroom-stop');
const burrow = require(`${source}/emergency_burrow`);
const inventory = require(`${source}/inventory_sync`);
const { HutTeacher } = require(`${source}/hut_teacher`);
const { createMotor } = require(`${source}/locomotion`);
const { scan } = require(`${source}/perception`);
const tasks = require(`${source}/tasks`);
const report = { trial: 943, bot: 'LabAI1', expectStop, controller: require(`${source}/controller_revision`), updates: [] };

const host = '127.0.0.1';
const gamePort = 25571;
const rconPort = 25572;
const properties = readFileSync('logs/survival-paper-fixture/server.properties', 'utf8');
assert.match(properties, /^server-ip=127\.0\.0\.1\r?$/m);
assert.match(properties, /^server-port=25571\r?$/m);
assert.match(properties, /^rcon\.port=25572\r?$/m);
const password = properties.match(/^rcon\.password=(.+)\r?$/m)?.[1].trim();
assert.ok(password, 'isolated fixture RCON password');

const name = 'LabSealFixture';
const feet = new Vec3(144, 69, 144);
const lip = feet.offset(0, 0, 1);
const bottom = feet.offset(0, -2, 0);
const top = feet.offset(0, -1, 0);
const tree = feet.offset(2, 0, 0);
const lower = feet.offset(-5, -4, -5);
const upper = feet.offset(5, 4, 5);
const coords = q => q.toArray().join(' ');

async function replay(rcon) {
  const command = text => rcon.send(text);
  assert.match(await command('list'), /There are 0 of a max/);
  const bot = mineflayer.createBot({ host, port: gamePort, username: name, auth: 'offline', version: '1.21.4' });
  const dirt = () => bot.inventory.items().find(item => item.name === 'dirt')?.count || 0;
  const cell = q => bot.blockAt(q)?.name;
  const pose = () => ({
    position: bot.entity.position.toArray(),
    velocity: bot.entity.velocity.toArray(),
    grounded: bot.entity.onGround,
    health: bot.health,
    dirt: dirt(),
  });
  const verifyEmpty = () => {
    for (let x = lower.x; x <= upper.x; x++) {
      for (let y = lower.y; y <= upper.y; y++) {
        for (let z = lower.z; z <= upper.z; z++) {
          const q = new Vec3(x, y, z);
          assert.equal(cell(q), 'air', `disposable volume at ${q}`);
        }
      }
    }
  };
  const waitFor = async (condition, limit = 100) => {
    for (let i = 0; i < limit && !condition(); i++) await bot.waitForTicks(1);
    assert.ok(condition(), 'fixture condition did not become true');
  };
  const serverBlock = async (q, block) => {
    assert.match(await command(`execute if block ${coords(q)} minecraft:${block}`), /^Test passed/);
  };
  let owned = false;
  let motor;
  let recording = false;
  inventory.attach(bot);
  bot.on('physicsTick', () => motor?.tick());
  bot.on('blockUpdate', (before, after) => {
    if (!recording || before?.name === after?.name || ![feet, lip, top, bottom, tree].some(q => q.equals(after?.position))) return;
    report.updates.push({ position: after.position.toArray(), from: before?.name, to: after.name, grounded: bot.entity.onGround });
  });

  try {
    await once(bot, 'spawn');
    await command(`gamemode spectator ${name}`);
    await command(`tp ${name} ${coords(feet.offset(.5, 5, .5))}`);
    await bot.waitForChunksToLoad();
    await bot.waitForTicks(5);
    verifyEmpty();
    owned = true;
    await command(`fill ${coords(lower)} ${coords(feet.offset(5, -1, 5))} dirt`);
    await command(`fill ${coords(tree)} ${coords(tree.offset(0, 1, 0))} oak_log`);
    await command(`clear ${name}`);
    await command('difficulty normal');
    await command('time set midnight');
    await command(`tp ${name} ${coords(feet.offset(.5, 0, .5))}`);
    await command(`gamemode survival ${name}`);
    await waitFor(() => bot.time.timeOfDay >= 12000 && bot.entity.onGround);
    assert.equal(bot.game.gameMode, 'survival');
    assert.equal(bot.inventory.items().length, 0);

    motor = createMotor(bot, { move: true, turn: true, jump: true, sprint: true });
    const task = new HutTeacher();
    const state = {
      run: 'native-airborne-burrow-seal',
      world: { mission: 'first_night', bounds: [132, 156, 132, 156], first_night: { hostiles: true }, driver: 'teacher' },
    };
    const api = async (path, data) => {
      if (path === '/world/report') return {};
      if (path === '/step') return { action: data.teacher };
      assert.fail(`unexpected service request ${path}`);
    };
    const tick = () => task.tick(bot, motor, state, api, scan, tasks);
    await tick();
    const shelter = {
      feet: feet.toArray(), cap: feet.toArray(), lip: lip.toArray(), stage: 'approach',
      resume: 'gather', reason: 'Replay of trial 943 LabAI1', progressAt: Date.now(),
    };
    task.phase = 'night_burrow';
    task.plot = { x: 153, y: feet.y, z: 153 };
    task.grove = [tree.toArray()];
    task.wilderness.burrow = shelter;
    recording = true;
    const startDig = performance.now();
    while (cell(bottom) !== 'air' && task.phase !== 'stopped' && performance.now() - startDig < 15000) {
      await tick();
      await bot.waitForTicks(1);
    }
    assert.equal(task.phase, 'night_burrow', task.error);
    assert.equal(shelter.shellVerified, true);
    assert.equal(cell(lip), 'dirt');
    await waitFor(() => bot.entity.onGround && bot.entity.position.y === bottom.y && dirt() === 1);
    assert.ok(burrow.walls(bot, feet, shelter));
    await serverBlock(lip, 'dirt');
    await serverBlock(feet, 'air');

    // Replay the recorded seal stage using actual Paper knockback in the shaft.
    shelter.stage = 'seal';
    const progress = shelter.progressAt;
    // Match the recorded low upward velocity and rise with a weaker native hit.
    assert.match(await command(`attribute ${name} minecraft:knockback_resistance base set 0.25`), /set to 0\.25/);
    const damage = await command(`damage ${name} 1 minecraft:mob_attack at ${coords(bottom.offset(.3, 0, .51))}`);
    assert.match(damage, /Applied .*damage/);
    await waitFor(() => !bot.entity.onGround && bot.entity.position.y > bottom.y + .5, 25);
    report.perturbation = { ...pose(), rise: bot.entity.position.y - bottom.y };
    assert.ok(Math.abs(report.perturbation.rise - .5753) < .1, 'rise should approximate recorded footing');
    assert.ok(Math.abs(bot.entity.position.x - feet.x - .5) <= .3);
    assert.ok(Math.abs(bot.entity.position.z - feet.z - .5) <= .3);
    const startSeal = performance.now();
    await tick();
    report.firstSealTick = { ...pose(), phase: task.phase, stage: shelter.stage, message: task.error || task.message };
    assert.equal(shelter.progressAt, progress, 'airborne tick grants no progress');
    assert.equal(dirt(), 1);
    await serverBlock(feet, 'air');
    if (expectStop) {
      assert.equal(task.phase, 'stopped');
      assert.match(task.error, /Insufficient headroom for the emergency roof/);
      report.failure = shelter.failureContext;
      return;
    }

    assert.equal(task.phase, 'night_burrow', task.error);
    assert.equal(shelter.stage, 'seal');
    assert.match(task.message, /settling on dry footing/);
    while (shelter.stage !== 'hidden' && task.phase !== 'stopped' && performance.now() - startSeal < 15000) {
      await bot.waitForTicks(1);
      await tick();
    }
    assert.equal(task.phase, 'night_burrow', task.error);
    assert.equal(shelter.stage, 'hidden');
    assert.ok(burrow.sealed(bot, shelter));
    assert.ok(burrow.walls(bot, feet, shelter));
    assert.equal(bot.entity.onGround, true);
    await inventory.sync(bot);
    assert.equal(dirt(), 0);
    await serverBlock(feet, 'dirt');
    report.sealed = { ...pose(), ms: Math.round(performance.now() - startSeal) };
    await tick();
    assert.equal(shelter.stage, 'hidden');

    await command('time set day');
    await waitFor(() => bot.time.timeOfDay < 12000);
    const startExit = performance.now();
    while (task.wilderness.burrow && task.phase !== 'stopped' && performance.now() - startExit < 15000) {
      await tick();
      await bot.waitForTicks(1);
    }
    assert.equal(task.wilderness.burrow, null, task.error);
    assert.equal(task.phase, 'gather');
    assert.equal(bot.entity.onGround, true);
    assert.equal(bot.entity.position.y, feet.y);
    assert.deepEqual(task.milestones, []);
    for (const q of [bottom, top]) await serverBlock(q, 'dirt');
    for (const q of [lip, feet]) await serverBlock(q, 'air');
    report.exited = { ...pose(), phase: task.phase, ms: Math.round(performance.now() - startExit) };

    const startWork = performance.now();
    while (cell(tree) === 'oak_log' && task.phase === 'gather' && performance.now() - startWork < 15000) {
      await tick();
      await bot.waitForTicks(1);
    }
    assert.equal(task.phase, 'gather', task.error);
    assert.deepEqual(task.milestones, []);
    await serverBlock(tree, 'air');
    report.resumed = { phase: task.phase, harvested: tree.toArray(), milestones: task.milestones };
  } finally {
    motor?.pause();
    recording = false;
    try {
      if (owned) {
        await command(`gamemode spectator ${name}`);
        await command(`tp ${name} ${coords(feet.offset(.5, 5, .5))}`);
        await command(`clear ${name}`);
        await command(`attribute ${name} minecraft:knockback_resistance base set 0`);
        await command(`kill @e[type=item,x=${lower.x},y=${lower.y - 1},z=${lower.z},dx=10,dy=10,dz=10]`);
        await command(`fill ${coords(lower)} ${coords(upper)} air`);
        await command('difficulty peaceful');
        await command('time set day');
        await bot.waitForTicks(5);
        verifyEmpty();
        report.cleaned = true;
      }
    } finally {
      const disconnected = once(bot, 'end');
      bot.quit();
      await disconnected;
      let list;
      for (let i = 0; i < 20; i++) {
        list = await command('list');
        if (/There are 0 of a max/.test(list)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.match(list, /There are 0 of a max/);
      report.disconnected = true;
    }
  }
}

async function main() {
  const rcon = await Rcon.connect({ host, port: rconPort, password, timeout: 5000 });
  try {
    await replay(rcon);
  } finally {
    await rcon.end();
  }
}

main().catch(error => {
  report.error = error.stack;
  process.exitCode = 1;
}).finally(() => console.log(JSON.stringify(report, null, 2)));
