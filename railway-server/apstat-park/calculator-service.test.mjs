import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService, DEATH_MS } from './calculator-service.mjs';
import { ROUTE, SUMMARY, ROUND_MS, BOXPLOT_MS } from './calculator-mission.mjs';

function setup() {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map();
  const service = createCalculatorService({ registry, now: () => time,
    send: (ws, packet) => packets.set(ws, packet) });
  const a = {}, b = {};
  function join(ws, name) {
    registry.join(ws, 'B', name, 'student', time);
    return service.handle(ws, { type: 'calculator_join', protocol: 4 });
  }
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  function press(ws, keys) { for (const key of keys) send(ws, 'calculator_press', { key }); }
  function heartbeat() {
    for (const ws of [a, b]) send(ws, 'calculator_pose', { pose: { x: 70, y: 676 }, ready: false });
  }
  join(a, 'alice'); join(b, 'bob');
  return { a, b, service, join, send, press, heartbeat,
    state: ws => packets.get(ws), clock: value => { time = value; } };
}

test('independent routes produce matching boxplots; the door waits for everyone', () => {
  const f = setup();
  try {
    f.press(f.a, ['STAT', 'ENTER', 'STAT', 'RIGHT', '1', 'ENTER', 'DOWN', 'ENTER', 'DOWN']);
    assert.equal(f.state(f.a).step, 7);
    assert.equal(f.state(f.b).step, 0);
    f.press(f.a, ['14', '7', '11', '4']);
    assert.equal(f.state(f.a).step, 11, 'no individual value is rejected');
    f.press(f.a, ['20']);
    assert.equal(f.state(f.a).step, 7, 'only the finished incorrect plot is cleared');
    f.press(f.a, SUMMARY.map(String));
    assert.equal(f.state(f.a).solved, true);
    assert.equal(f.state(f.a).complete, false);
    assert.equal(f.state(f.b).readyCount, 1);
    const epoch = f.state(f.a).epoch;
    f.send(f.a, 'calculator_restart');
    assert.equal(f.state(f.a).epoch, epoch, 'cannot reset unfinished teammates');
    f.press(f.b, [...ROUTE, ...SUMMARY.map(String)]);
    assert.equal(f.state(f.a).complete, true);
    assert.equal(f.state(f.b).complete, true);
    assert.notDeepEqual(f.state(f.a).keys, f.state(f.b).keys);
    f.send(f.b, 'calculator_restart');
    assert.notEqual(f.state(f.a).epoch, epoch);
    for (const ws of [f.a, f.b]) {
      assert.equal(f.state(ws).step, 0);
      assert.equal(f.state(ws).solved, false);
      assert.equal(f.state(ws).readyCount, 0);
    }
  } finally { f.service.close(); }
});

test('personal deadlines, reconnects, duplicate presses, and invalid input stay isolated', () => {
  const f = setup();
  try {
    f.press(f.b, ['MATH']);
    f.clock(10000); f.heartbeat();
    f.press(f.a, ['STAT', 'RIGHT']);
    const before = f.state(f.a);
    const message = { type: 'calculator_press', epoch: before.epoch, revision: before.revision, key: 'ENTER' };
    f.service.handle(f.a, message); f.service.handle(f.a, message);
    assert.deepEqual(f.state(f.a).keys, ['STAT', 'RIGHT', 'ENTER']);
    f.send(f.a, 'calculator_press', { key: '__proto__' });
    assert.equal(f.state(f.a).revision, 3);
    f.service.detached(f.a); f.join(f.a, 'alice');
    assert.equal(f.state(f.a).step, 3);
    assert.equal(f.state(f.a).startedAt, 10000, 'rejoin does not renew a deadline');
    f.clock(ROUND_MS); f.heartbeat(); f.service.tick();
    assert.equal(f.state(f.b).failure.name, 'bob');
    assert.equal(f.state(f.a).failure.name, 'bob');
    const failedEpoch = f.state(f.a).epoch;
    f.press(f.a, ['DOWN']);
    assert.equal(f.state(f.a).step, 3, 'all input freezes during death');
    f.clock(ROUND_MS + DEATH_MS); f.heartbeat(); f.service.tick();
    for (const ws of [f.a, f.b]) {
      assert.notEqual(f.state(ws).epoch, failedEpoch);
      assert.equal(f.state(ws).step, 0);
      assert.deepEqual(f.state(ws).keys, []);
      assert.equal(f.state(ws).bonus, 0);
      assert.equal(f.state(ws).failure, null);
      assert.equal(f.state(ws).resetReason.type, 'timeout');
    }
    f.service.handle(f.a, message);
    assert.equal(f.state(f.a).step, 0, 'an old attempt cannot replay after reset');
  } finally { f.service.close(); }
});

test('completion follows current participants and retains returning students\' work', () => {
  const f = setup();
  try {
    f.press(f.a, [...ROUTE, ...SUMMARY.map(String)]);
    f.service.detached(f.b);
    assert.equal(f.state(f.a).complete, true);
    f.join(f.b, 'bob');
    assert.equal(f.state(f.a).complete, false);
    assert.equal(f.state(f.a).solved, true);
    assert.equal(f.state(f.b).step, 0);
  } finally { f.service.close(); }
});

test('wrong keys and no-ops keep the deadline; only an engine-verified advance renews it', () => {
  const f = setup();
  try {
    f.clock(5000); f.press(f.a, ['MATH']);
    assert.equal(f.state(f.a).startedAt, 0);
    f.clock(9000); f.press(f.a, ['MATH', 'CLEAR']);
    assert.equal(f.state(f.a).startedAt, 0);
    f.clock(12000); f.press(f.a, ['STAT']);
    assert.equal(f.state(f.a).startedAt, 12000);
    f.clock(13000); f.press(f.a, ['STAT']);
    assert.equal(f.state(f.a).startedAt, 12000, 'reopening the same menu is not progress');
    f.clock(14000); f.press(f.a, ['RIGHT']);
    assert.equal(f.state(f.a).startedAt, 14000);
    f.clock(ROUND_MS); f.heartbeat();
    f.press(f.b, ['STAT']);
    assert.equal(f.state(f.b).failure.name, 'bob', 'a press at expiry cannot save the attempt');
    assert.equal(f.state(f.b).step, 0);
  } finally { f.service.close(); }
});

test('boxplot has one 30-second deadline across failed five-value attempts and rejoin', () => {
  const f = setup();
  try {
    for (const ws of [f.a, f.b]) f.press(ws, ROUTE);
    f.press(f.b, SUMMARY.map(String));
    assert.equal(ROUND_MS, 15000); assert.equal(BOXPLOT_MS, 30000);
    f.clock(16000); f.heartbeat(); f.service.tick();
    assert.equal(f.state(f.a).failure, null, 'boxplot is allowed more than 15 seconds');
    for (let i = 0; i < 4; i++) {
      f.clock(17000 + i * 1000); f.press(f.a, ['20']);
      assert.equal(f.state(f.a).step, 8 + i);
      assert.equal(f.state(f.a).boxAttempts, 0);
      assert.equal(f.state(f.a).startedAt, 0);
    }
    f.clock(22000); f.press(f.a, ['20']);
    assert.equal(f.state(f.a).boxAttempts, 1);
    assert.equal(f.state(f.a).step, 7);
    assert.deepEqual(f.state(f.a).boxValues, []);
    assert.deepEqual(f.state(f.a).lastPlot.values, [20,20,20,20,20]);
    assert.deepEqual(f.state(f.a).keys, ROUTE, 'calculator work is preserved');
    f.service.detached(f.a); f.join(f.a, 'alice');
    assert.equal(f.state(f.a).startedAt, 0);
    f.clock(29000); f.press(f.a, SUMMARY.map(String));
    assert.equal(f.state(f.a).complete, true);
    assert.equal(f.state(f.a).startedAt, 0);
  } finally { f.service.close(); }
});

test('boxplot expiry respawns the team at earned checkpoints with fresh plot timers', () => {
  const f = setup();
  try {
    for (const ws of [f.a, f.b]) f.press(ws, ROUTE);
    f.press(f.b, SUMMARY.map(String));
    f.clock(BOXPLOT_MS - 1); f.heartbeat(); f.press(f.a, ['20','4','7','11','14']);
    assert.equal(f.state(f.a).boxAttempts, 1);
    f.clock(BOXPLOT_MS); f.heartbeat(); f.press(f.a, ['4']);
    assert.equal(f.state(f.a).failure.name, 'alice');
    assert.deepEqual(f.state(f.a).boxValues, []);
    f.clock(BOXPLOT_MS + DEATH_MS); f.heartbeat(); f.service.tick();
    for (const ws of [f.a, f.b]) {
      assert.equal(f.state(ws).step, 7);
      assert.deepEqual(f.state(ws).keys, ROUTE);
      assert.deepEqual(f.state(ws).boxValues, []);
      assert.equal(f.state(ws).startedAt, BOXPLOT_MS + DEATH_MS);
      assert.equal(f.state(ws).solved, false);
    }
    for (const ws of [f.a, f.b]) f.press(ws, SUMMARY.map(String));
    assert.equal(f.state(f.a).complete, true);
    f.send(f.a, 'calculator_restart');
    for (const ws of [f.a, f.b]) {
      assert.equal(f.state(ws).step, 0, 'the reset door clears earned checkpoints');
      assert.deepEqual(f.state(ws).keys, []);
    }
  } finally { f.service.close(); }
});
