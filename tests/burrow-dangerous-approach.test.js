const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const burrow = require('../controller/emergency_burrow');

function fixture() {
  const near = new Vec3(2, 64, 0);
  const far = new Vec3(-5, 64, 0);
  const earth = new Set([near, far].flatMap(q => [q.offset(0, -1, 0), q.offset(0, -2, 0)]).map(String));
  const zombie = { id: 2, name: 'zombie', position: new Vec3(5.6, 64, .5) };
  const bot = {
    username: 'BurrowApproachTest', health: 8, food: 20, time: { timeOfDay: 14500 }, players: {},
    entities: { zombie }, entity: { id: 1, position: new Vec3(.5, 64, .5), onGround: true },
    inventory: { items: () => [] }, world: { raycast: () => null },
    blockAt(q) {
      const position = q.floored();
      const name = earth.has(String(position)) ? 'dirt' : position.y < 64 ? 'stone' : 'air';
      return { name, position, boundingBox: name === 'air' ? 'empty' : 'block', getProperties: () => ({}) };
    },
  };
  const task = { phase: 'gather', milestones: [], wilderness: {}, navigator: { lastPlan: 0 }, path: [] };
  const state = { run: 'dangerous-approach-test', world: { bounds: [-32, 32, -32, 32], first_night: { id: 3, hostiles: true } } };
  return { bot, task, state, near, far, zombie };
}

test('urgent refuge selection skips earth that would already fail the close-hostile dig check', () => {
  const { bot, task, state, near, far } = fixture();
  assert.equal(burrow.site(task, bot, near, state.world), true, 'terrain alone is valid');
  assert.deepEqual(burrow.find(task, bot, state), far);
});

test('a visible pursuer closing on an unopened patch invalidates the approach before another movement command', async () => {
  const { bot, task, state, near, far, zombie } = fixture();
  zombie.position.x += 1;
  assert.deepEqual(burrow.find(task, bot, state), near, 'the approach is initially viable');
  task.phase = 'night_burrow';
  task.wilderness.burrow = { stage: 'approach', feet: near.toArray(), cap: near.toArray(), resume: 'gather', progressAt: Date.now() };
  const oldGoal = near.offset(.5, .1, .5).toArray();
  task.walk = async (_bot, _motor, goal) => assert.notDeepEqual(goal, oldGoal);
  zombie.position.x -= 1;

  assert.equal(await burrow.tick(task, bot, { pause() {} }, state), true);
  assert.equal(task.phase, 'night_seek_cover');
  assert.equal(task.wilderness.coverResume, 'gather');
  assert.equal(task.wilderness.burrow, null);
  assert.deepEqual(burrow.find(task, bot, state), far);
  assert.deepEqual(task.milestones, []);
});

test('an airborne checked landing retains its usual route guard before redirecting from the patch', async () => {
  const { bot, task, state, near } = fixture();
  task.phase = 'night_burrow';
  task.wilderness.burrow = { stage: 'approach', feet: near.toArray(), cap: near.toArray(), resume: 'gather', progressAt: Date.now() };
  bot.entity.onGround = false;
  const commands = [];
  task.walk = async (_bot, _motor, goal, _state, _api, _scan, _tasks, { avoidCell }) => {
    assert.equal(avoidCell([5, 64, 0]), true);
    commands.push(goal);
  };
  const motor = { committedJump: () => true, pause() {} };
  await burrow.tick(task, bot, motor, state);
  assert.deepEqual(commands, [near.offset(.5, .1, .5).toArray()]);
  bot.entity.onGround = true;
  await burrow.tick(task, bot, motor, state);
  assert.equal(task.phase, 'night_seek_cover');
  assert.equal(commands.length, 1);
});
