// ABSORB_2_SPEC §1: branch rounds after a wrong pick (solo only). A wrong pick plays the picked
// skill once (no recognition step, no key, no clear, recall quality 2 only while fresh), then the
// original problem comes back with that tile gone. Team rounds keep the old behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService, BRANCH_QUALITY } from './calculator-service.mjs';
import { createCalculatorClears } from './calculator-clears.mjs';
import { createCalculatorSrs } from './calculator-srs-state.mjs';
import { ROUND_MS, missionFor } from './calculator-mission.mjs';
import { DEFAULT_LEVEL, levelById, challengeFor } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';

const WALL_DAY = '2026-10-16';

function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function setup({ varyData = false } = {}) {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map();
  const clears = createCalculatorClears({ now: () => time, log: () => {} });
  const srs = createCalculatorSrs({ now: () => time, log: () => {} });
  const service = createCalculatorService({ registry, now: () => time, wallNow: () => Date.parse(WALL_DAY + 'T16:00:00Z'),
    available: () => [DEFAULT_LEVEL], random: seeded(7), varyData, clears, srs, log: () => {},
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  function joinSolo(ws, name, skill) {
    registry.join(ws, 'B', name, 'student', time);
    return service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill });
  }
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  const pick = (ws, skill) => send(ws, 'calculator_pick', { skill });
  const solve = ws => {
    const level = missionFor(packets.get(ws));
    for (const key of [...level.route, ...challengeFor(level).answers.map(String)]) send(ws, 'calculator_press', { key });
  };
  // Moves the clock in 1 s steps with a pose each step (the relay drops a member unseen for 5 s).
  function advance(ws, ms) {
    const end = time + ms;
    while (time < end) {
      time = Math.min(end, time + 1000);
      send(ws, 'calculator_pose', { pose: { x: 70, y: 676 }, ready: false });
      service.tick();
    }
  }
  // A two-student team round with the teacher's recognition toggle on.
  function startTeam(sockets, teacher) {
    for (const [ws, name] of sockets) registry.join(ws, 'B', name, 'student', time);
    registry.join(teacher, 'B', 'mr_c', 'teacher', time);
    service.handle(teacher, { type: 'calculator_recognition', on: true });
    for (const [ws] of sockets) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
    while (lobbies.get(sockets[0][0]).phase === 'gathering') {
      for (const [ws] of sockets) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
        pose: { x: lobbies.get(sockets[0][0]).blockX - 20, y: 676 }, pushing: true });
      time += 100; service.tick();
    }
    for (const [ws] of sockets) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      epoch: lobbies.get(ws).epoch, pose: { x: TEAM_BLOCK.dock - 20, y: 676 }, ready: true });
    service.tick();
    for (const [ws] of sockets) service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
  }
  return { service, clears, srs, joinSolo, send, pick, solve, advance, startTeam,
    state: ws => packets.get(ws), lobby: ws => lobbies.get(ws) };
}

const skillOf = state => levelById(state.missionId).skillId;

test('solo wrong pick: a branch round on the picked skill, no recognition step, its own epoch', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    const original = f.state(ws);
    f.pick(ws, 't-test-stats');
    const branch = f.state(ws);
    assert.notEqual(branch.epoch, original.epoch, 'a new epoch');
    assert.deepEqual(branch.resetReason, { type: 'branch', skillId: 't-test-stats' });
    assert.equal(branch.missionId, 't-test-stats', 'the skill\'s first catalogue problem');
    assert.equal(branch.recognition, null, 'no recognition step in a branch');
    assert.equal(branch.step, 0);
    assert.equal(branch.rung, 0, 'a skill never cleared plays with full hints');
    assert.deepEqual(branch.branch, { skillId: 't-test-stats', picked: 't-test-stats',
      message: 'This asks about a proportion, not a mean.', returnTitle: levelById(original.missionId).title, depth: 1 });
    f.advance(ws, ROUND_MS + 1);
    assert.ok(f.state(ws).failure, 'the branch runs the step clock');
  } finally { f.service.close(); }
});

test('branch complete: no key, no clear, quality 2 while fresh; the original comes back minus the wrong tile', () => {
  const f = setup({ varyData: true });
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    const original = f.state(ws);
    f.pick(ws, 't-test-stats');
    f.solve(ws);
    const back = f.state(ws);
    assert.deepEqual(back.resetReason, { type: 'branch-return' });
    assert.notEqual(back.epoch, original.epoch);
    assert.equal(back.complete, false);
    assert.equal(back.branch, null);
    assert.equal(back.missionId, original.missionId, 'the same problem');
    assert.deepEqual(back.problem, original.problem, 'the same data');
    assert.equal(back.recognition.stem, original.recognition.stem);
    assert.deepEqual(back.recognition.options, original.recognition.options.filter(id => id !== 't-test-stats'));
    assert.equal(back.recognition.picked, null);
    assert.equal(back.recognition.skill, null, 'still hidden until the pick');
    assert.equal(back.recognition.branches, 1);
    assert.equal(f.lobby(ws).campaignKeys.alice, undefined, 'no key for a branch');
    assert.equal(f.clears.clearsOf('B', 'alice', 't-test-stats'), 0, 'no clear for a branch');
    const record = f.srs.recordOf('B', 'alice', 't-test-stats');
    assert.equal(record.lastQuality, BRANCH_QUALITY);
    assert.equal(record.repetitions, 0);
    assert.equal(f.srs.recordOf('B', 'alice', 'one-propztest'), null, 'the original skill waits for its own clear');
    // The right pick plays the original route as today, and that clear pays.
    f.pick(ws, 'one-propztest');
    f.solve(ws);
    assert.equal(f.state(ws).complete, true);
    assert.equal(f.state(ws).review.quality, 4, '5 - 1 branch');
    assert.equal(f.lobby(ws).campaignKeys.alice, 1);
    assert.equal(f.clears.clearsOf('B', 'alice', 'one-propztest'), 1);
  } finally { f.service.close(); }
});

test('a branch never lowers a real schedule: nothing is recorded when the skill has repetitions', () => {
  const f = setup();
  const ws = {};
  try {
    f.srs.record('B', 'alice', 't-test-stats', 5, WALL_DAY);
    const before = f.srs.recordOf('B', 'alice', 't-test-stats');
    f.joinSolo(ws, 'alice', 'one-propztest');
    f.pick(ws, 't-test-stats');
    f.solve(ws);
    assert.equal(f.state(ws).resetReason.type, 'branch-return');
    assert.deepEqual(f.srs.recordOf('B', 'alice', 't-test-stats'), before);
  } finally { f.service.close(); }
});

test('two branches: branches 2, the options shrink by two, quality 3 at zero wrong keys', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    f.pick(ws, 't-test-stats');
    f.solve(ws);
    f.pick(ws, 'two-propztest');
    assert.equal(skillOf(f.state(ws)), 'two-propztest');
    f.solve(ws);
    const back = f.state(ws);
    assert.equal(back.recognition.branches, 2);
    assert.deepEqual([...back.recognition.options].sort(), ['one-propzint', 'one-propztest']);
    f.pick(ws, 'one-propztest');
    f.solve(ws);
    assert.equal(f.state(ws).review.quality, 3);
  } finally { f.service.close(); }
});

test('a time-up inside a branch restarts the branch; the original still comes back after it', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    f.pick(ws, 't-test-stats');
    f.advance(ws, ROUND_MS + 1);
    assert.ok(f.state(ws).failure);
    f.advance(ws, 1000);
    const restarted = f.state(ws);
    assert.equal(restarted.failure, null);
    assert.equal(restarted.resetReason.type, 'timeout');
    assert.equal(skillOf(restarted), 't-test-stats', 'still the branch');
    assert.equal(restarted.branch.skillId, 't-test-stats');
    f.solve(ws);
    assert.equal(f.state(ws).resetReason.type, 'branch-return');
    assert.equal(skillOf(f.state(ws)), 'one-propztest');
  } finally { f.service.close(); }
});

test('a door reset (a new pinned skill) drops the branch stack', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    f.pick(ws, 't-test-stats');
    f.joinSolo(ws, 'alice', 'normalcdf');
    const next = f.state(ws);
    assert.equal(next.resetReason.type, 'door');
    assert.equal(next.branch, null);
    assert.equal(skillOf(next), 'normalcdf');
    if (next.recognition) f.pick(ws, 'normalcdf');
    f.solve(ws);
    assert.equal(f.state(ws).complete, true, 'a normal clear, not a branch return');
  } finally { f.service.close(); }
});

test('team wrong pick: unchanged (one sentence, the route starts on the right skill, -1 once)', () => {
  const f = setup();
  const a = {}, b = {}, teacher = {};
  try {
    f.startTeam([[a, 'alice'], [b, 'bob']], teacher);
    const round = f.state(a);
    assert.ok(round.recognition, 'the teacher toggle is on');
    const wrong = round.recognition.options.find(id => id !== skillOf(round));
    f.pick(a, wrong);
    const picked = f.state(a);
    assert.equal(picked.epoch, round.epoch, 'no branch: same round');
    assert.equal(picked.branch, null);
    assert.equal(picked.recognition.correct, false);
    assert.ok(picked.recognition.message);
    f.pick(b, skillOf(round));
    f.solve(a); f.solve(b);
    assert.equal(f.state(a).complete, true);
    assert.equal(f.state(a).review.quality, 4);
    assert.equal(f.state(b).review.quality, 5);
  } finally { f.service.close(); }
});

test('passive branch credit waits for the store: nothing is recorded while the section is still loading (Codex review 2026-10-18)', () => {
  let resolveLoad;
  const store = { load: () => new Promise(resolve => { resolveLoad = resolve; }), save: async () => {} };
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map();
  const clears = createCalculatorClears({ now: () => time, log: () => {} });
  const srs = createCalculatorSrs({ store, now: () => time, log: () => {} });
  const service = createCalculatorService({ registry, now: () => time, wallNow: () => Date.parse(WALL_DAY + 'T16:00:00Z'),
    available: () => [DEFAULT_LEVEL], random: seeded(7), varyData: false, clears, srs, log: () => {},
    send: (ws, packet) => { if (packet.type !== 'calculator_lobby_state') packets.set(ws, packet); } });
  const ws = {};
  const send = (type, extra = {}) => { const s = packets.get(ws); return service.handle(ws, { type, epoch: s.epoch, revision: s.revision, ...extra }); };
  try {
    registry.join(ws, 'B', 'alice', 'student', time);
    service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill: 'one-propztest' });
    assert.equal(srs.loaded('B'), false);
    send('calculator_pick', { skill: 't-test-stats' });
    const level = missionFor(packets.get(ws));
    for (const key of [...level.route, ...challengeFor(level).answers.map(String)]) send('calculator_press', { key });
    assert.equal(packets.get(ws).resetReason.type, 'branch-return');
    assert.equal(srs.recordOf('B', 'alice', 't-test-stats'), null, 'no passive credit before the load answered');
  } finally { if (resolveLoad) resolveLoad([]); service.close(); }
});
