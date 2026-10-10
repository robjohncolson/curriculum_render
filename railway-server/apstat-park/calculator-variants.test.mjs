// Interpretation variants A-F at the authoritative boundary: full rounds through the real
// relay, specific feedback with retry under the existing timer, and exactly one +1 key
// per roster member (a participating teacher included) despite duplicates, reconnects,
// stale packets and replays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService, DEATH_MS } from './calculator-service.mjs';
import { BOXPLOT_MS } from './calculator-mission.mjs';
import { CALCULATOR_PROBLEMS, challengeFor } from './calculator-curriculum.mjs';
import { TEAM_BLOCK, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';

const level = id => CALCULATOR_PROBLEMS.find(problem => problem.id === id);
const answers = problem => challengeFor(problem).answers.map(String);

// One full team (a student and a participating teacher) on the given variant.
function setup(problem) {
  let time = -12000;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map(), history = [];
  const service = createCalculatorService({ registry, now: () => time, available: () => [problem],
    send: (ws, packet) => { (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet); history.push(packet); } });
  const alice = {}, teach = {};
  const roles = new Map([[alice, ['alice', 'student']], [teach, ['teach', 'teacher']]]);
  function join(ws) {
    const [name, role] = roles.get(ws);
    registry.join(ws, 'B', name, role, time);
    return service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
  }
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  const press = (ws, keys) => { for (const key of keys) send(ws, 'calculator_press', { key }); };
  join(alice); join(teach);
  for (const ws of [alice, teach]) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
    pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
  while (lobbies.get(alice).phase === 'gathering') {
    for (const ws of [alice, teach]) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      pose: { x: lobbies.get(alice).blockX - 20, y: 676 }, pushing: true });
    time += 100; service.tick();
  }
  time = 0;
  for (const ws of [alice, teach]) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
    epoch: lobbies.get(ws).epoch, pose: { x: TEAM_BLOCK.dock - 20, y: 676 }, ready: true });
  service.tick();
  for (const ws of [alice, teach]) join(ws);
  return { alice, teach, service, join, send, press, history,
    state: ws => packets.get(ws), lobby: ws => lobbies.get(ws),
    keys: () => lobbies.get(alice).campaignKeys, clock: value => { time = value; },
    heartbeat() { for (const ws of [alice, teach]) send(ws, 'calculator_pose', { pose: { x: 70, y: 676 }, ready: false }); } };
}

// One variant of every activity type A-F.
for (const id of ['one-var-stats@sample-sd', 'one-var-stats@freq', 'one-var-stats@zero-row', 'one-var-stats@no-observations',
  'modified-boxplot@outlier', 'histogram@bins', 'binompdf@exactly-3', 'binomcdf@never-heads']) {
  test(id + ': a full team round pays +1 key to each roster member, the teacher included, once', () => {
    const problem = level(id), f = setup(problem);
    try {
      assert.equal(f.state(f.alice).missionId, id);
      f.press(f.alice, [...problem.route, ...answers(problem)]);
      assert.equal(f.state(f.alice).solved, true);
      assert.equal(f.state(f.alice).complete, false, 'one solver is not the team');
      assert.deepEqual(f.keys(), {}, 'no key before the authoritative team completion');
      f.press(f.teach, [...problem.route, ...answers(problem)]);
      assert.equal(f.state(f.alice).complete, true);
      assert.deepEqual(f.keys(), { alice: 1, teach: 1 });
      // Duplicate final press, a replayed whole answer, ticks and reconnects never pay again.
      const done = f.state(f.teach);
      f.service.handle(f.teach, { type: 'calculator_press', epoch: done.epoch, revision: done.revision - 1, key: answers(problem).at(-1) });
      f.press(f.alice, answers(problem));
      for (let i = 0; i < 5; i++) f.service.tick();
      f.service.detached(f.alice); f.join(f.alice);
      f.service.detached(f.teach); f.join(f.teach);
      assert.equal(f.state(f.alice).complete, true, 'reconnect keeps the completed round');
      for (let i = 0; i < 5; i++) f.service.tick();
      assert.deepEqual(f.keys(), { alice: 1, teach: 1 });
    } finally { f.service.close(); }
  });
}

test('a wrong interpretation gets specific feedback and a retry under the same clock', () => {
  const problem = level('histogram@bins'), f = setup(problem);
  try {
    f.press(f.alice, problem.route);
    const deadline = f.state(f.alice).startedAt;
    f.clock(5000);
    // 3 placed in [1, 3): the classic boundary mistake.
    f.press(f.alice, ['[1,3)', '[9,11)', '0']);
    const state = f.state(f.alice);
    assert.equal(state.boxAttempts, 1);
    assert.equal(state.step, problem.route.length);
    assert.match(state.lastPlot.feedback, /3 is not less than 3/);
    assert.equal(state.startedAt, deadline, 'wrong answers never renew the timer');
    assert.equal(state.complete, false);
    f.clock(9000);
    f.press(f.alice, answers(problem));
    assert.equal(f.state(f.alice).solved, true);
    assert.deepEqual(f.keys(), {});
  } finally { f.service.close(); }
});

test('an exhausted answer round cannot be saved or reset by wrong or no-op presses', () => {
  const problem = level('binomcdf@never-heads'), f = setup(problem);
  try {
    for (const ws of [f.alice, f.teach]) f.press(ws, problem.route);
    f.press(f.teach, answers(problem));
    const checkpoint = f.state(f.alice).startedAt;
    f.clock(checkpoint + BOXPLOT_MS); f.heartbeat();
    f.press(f.alice, answers(problem));
    assert.equal(f.state(f.alice).failure.name, 'alice', 'the expired attempt fails; the late answer is ignored');
    assert.equal(f.state(f.alice).solved, false);
    f.press(f.alice, ['0', 'impossible']);
    assert.equal(f.state(f.alice).solved, false, 'no input during the death animation');
    f.clock(checkpoint + BOXPLOT_MS + DEATH_MS); f.heartbeat(); f.service.tick();
    for (const ws of [f.alice, f.teach]) {
      assert.equal(f.state(ws).step, problem.route.length, 'respawn at the earned checkpoint');
      assert.equal(f.state(ws).solved, false, 'the team redoes the answer together');
    }
    assert.deepEqual(f.keys(), {}, 'a failed round pays nothing');
    for (const ws of [f.alice, f.teach]) f.press(ws, answers(problem));
    assert.deepEqual(f.keys(), { alice: 1, teach: 1 });
  } finally { f.service.close(); }
});

test('a restart starts a new round; old-round packets replayed into it never count or pay', () => {
  const problem = level('one-var-stats@freq'), f = setup(problem);
  try {
    for (const ws of [f.alice, f.teach]) f.press(ws, [...problem.route, ...answers(problem)]);
    assert.deepEqual(f.keys(), { alice: 1, teach: 1 });
    const oldPresses = f.history.filter(packet => packet.type === 'calculator_state' && packet.complete).at(-1);
    f.send(f.alice, 'calculator_restart');
    assert.notEqual(f.lobby(f.alice).epoch, oldPresses.epoch);
    assert.equal(f.lobby(f.alice).phase, 'gathering');
    // Replay the previous round's whole answer with its old epoch and revisions.
    for (const ws of [f.alice, f.teach]) for (let revision = 0; revision < 20; revision++) for (const key of [...problem.route, ...answers(problem)]) {
      f.service.handle(ws, { type: 'calculator_press', epoch: oldPresses.epoch, revision, key });
    }
    for (let i = 0; i < 5; i++) f.service.tick();
    assert.deepEqual(f.keys(), { alice: 1, teach: 1 });
  } finally { f.service.close(); }
});
