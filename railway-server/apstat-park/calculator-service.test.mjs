import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { ROUTE, SUMMARY, ROUND_MS } from './calculator-mission.mjs';

function setup() {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map();
  const service = createCalculatorService({ registry, now: () => time,
    send: (ws, packet) => packets.set(ws, packet) });
  const a = {}, b = {};
  function join(ws, name) {
    registry.join(ws, 'B', name, 'student', time);
    return service.handle(ws, { type: 'calculator_join', protocol: 2 });
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
    f.press(f.a, ['14']);
    assert.equal(f.state(f.a).step, 7, 'wrong minimum is rejected');
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
    f.clock(ROUND_MS); f.heartbeat(); f.service.tick();
    assert.equal(f.state(f.b).timeoutCount, 1);
    assert.deepEqual(f.state(f.b).keys, []);
    assert.equal(f.state(f.a).timeoutCount, 0);
    assert.equal(f.state(f.a).step, 3);
    f.service.detached(f.a); f.join(f.a, 'alice');
    assert.equal(f.state(f.a).step, 3);
    assert.deepEqual(f.state(f.a).keys, ['STAT', 'RIGHT', 'ENTER']);
    assert.equal(f.state(f.b).step, 0);
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
