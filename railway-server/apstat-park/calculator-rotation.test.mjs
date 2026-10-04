import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService, DEATH_MS } from './calculator-service.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { levelById, eligibleLevels, challengeFor } from './calculator-curriculum.mjs';

function fixture(date = '2026-10-04T16:00:00Z', section = 'PeriodB') {
  let time = 0, wall = Date.parse(date);
  const registry = createClassroomRegistry(), players = [{}, {}], lobbies = new Map(), states = new Map();
  const service = createCalculatorService({ registry, now: () => time, wallNow: () => wall, random: () => .99,
    send(ws, message) { (message.type === 'calculator_state' ? states : lobbies).set(ws, message); } });
  players.forEach((ws, i) => registry.join(ws, section, 'player' + i, 'student', time));
  const lobby = (ws, x, pushing = false, ready = false) => service.handle(ws, { type: 'calculator_lobby',
    protocol: CALCULATOR_PROTOCOL, epoch: lobbies.get(ws)?.epoch, pose: { x, y: 676 }, pushing, ready });
  function dock() {
    for (const ws of players) lobby(ws, 380, true);
    for (let i = 0; i < 115; i++) {
      for (const ws of players) lobby(ws, lobbies.get(ws).blockX - 20, true);
      time += 100; service.tick();
    }
    for (const ws of players) lobby(ws, 1040, false, true);
    service.tick();
  }
  function press(ws, key) {
    const state = states.get(ws);
    return service.handle(ws, { type: 'calculator_press', epoch: state.epoch, revision: state.revision, key });
  }
  return { service, states, lobbies, players, dock, press, lobby,
    date(value) { wall = Date.parse(value); },
    advance(ms) {
      time += ms;
      for (const ws of players) lobby(ws, 1040, false, true);
      service.tick();
    },
  };
}

test('parked/teacher section uses the cumulative Period E worksheet and quiz pool', () => {
  const f = fixture('2026-10-04T16:00:00Z', 'PeriodX');
  try {
    f.lobby(f.players[0], 65);
    assert.equal(f.lobbies.get(f.players[0]).eligibleCount, 5);
    assert.equal(levelById(f.lobbies.get(f.players[0]).missionId).skillId, 'dotplot');
    f.dock();
    assert.equal(levelById(f.states.get(f.players[0]).missionId).skillId, 'dotplot');
  } finally { f.service.close(); }
});

test('server selects a shared taught skill, retains it through death, and rotates only at the door', () => {
  const f = fixture();
  try {
    const [a, b] = f.players;
    f.lobby(a, 65);
    f.lobby(b, 65);
    const preview = f.lobbies.get(a).missionId;
    assert(preview, 'real roster section gets a mission preview before block travel');
    assert.equal(f.lobbies.get(b).missionId, preview);
    assert.equal(f.states.size, 0, 'preview must not start a timer');
    f.dock();
    const first = f.states.get(a).missionId, level = levelById(first);
    assert.equal(first, preview);
    assert(eligibleLevels('B', '2026-10-04').some(candidate => candidate.id === level.skillId));
    assert.equal(f.states.get(b).missionId, first);
    for (const key of level.route) f.press(a, key);
    assert.equal(f.states.get(a).step, level.route.length);
    f.advance(15000); assert(f.states.get(a).failure);
    f.advance(DEATH_MS);
    assert.equal(f.states.get(a).missionId, first);
    assert.equal(f.states.get(a).step, level.route.length);
    assert.equal(f.states.get(b).step, 0);
    for (const key of level.route) f.press(b, key);
    for (const ws of [a, b]) for (const value of challengeFor(level).answers) f.press(ws, String(value));
    assert(f.states.get(a).complete);
    const state = f.states.get(a);
    f.service.handle(a, { type: 'calculator_restart', epoch: state.epoch, revision: state.revision });
    f.dock();
    assert.notEqual(f.states.get(a).missionId, first);
    assert.equal(f.states.get(a).missionId, f.states.get(b).missionId);
  } finally { f.service.close(); }
});

test('an empty calendar waits without a timer; the lesson date unlocks the assembled team', () => {
  const f = fixture('2026-09-14T16:00:00Z');
  try {
    f.dock();
    assert.equal(f.states.size, 0);
    assert.equal(f.lobbies.get(f.players[0]).eligibleCount, 0);
    f.date('2026-09-15T16:00:00Z'); f.advance(100);
    assert.equal(levelById(f.states.get(f.players[0]).missionId).skillId, 'dotplot');
    assert.equal(f.states.get(f.players[0]).failure, null);
  } finally { f.service.close(); }
});

test('the same date cannot unlock the later section early', () => {
  const f = fixture('2026-09-15T16:00:00Z', 'PeriodE');
  try { f.dock(); assert.equal(f.states.size, 0); }
  finally { f.service.close(); }
});
