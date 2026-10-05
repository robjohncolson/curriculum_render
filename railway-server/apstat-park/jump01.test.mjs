import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { createParkLevel, PARK_LEVEL_COUNT } from './levels.mjs';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

// Level 6: PICO PARK 1-1 at half scale. Poses are the top-left of the 16x23 body.
const LEVEL = 6;
const still = point => ({ x: point.x, y: point.y, vx: 0, vy: 0 });
// A party condition is one {min,max} range or an array of them, evaluated on the ACTIVE party.
const inRange = (range, n) => [].concat(range).some(r => n >= r.min && n <= r.max);
const solidsFor = (level, party) => level.platforms.filter(p => !p.party || inRange(p.party, party));

function setup(members, { online = members } = {}) {
  let time = 0;
  const s = new ParkSession({ epoch: 'jump01', levelIndex: LEVEL, members, now: () => time });
  const keys = Object.fromEntries(members.map(m => [m, s.open(m, 'browser_' + m)]));
  const seq = {};
  const act = (member, kind, pose, details = {}) => s.command(keys[member], { epoch: s.epoch, level: s.level.id,
    sequence: (seq[member] = (seq[member] || 0) + 1), kind, target: details.target, pose: still(pose), ...details });
  s.setOnline(online);
  return { s, keys, act, advance: ms => { time += ms; return s.expireHolds(); }, clock: () => time };
}
const lift = s => s.level.weightedLifts[0];
const liftY = s => s.valueAt(s.progress.lifts[lift(s).id]);
const onLift = (s, dx = 10, stack = 0) => ({ x: lift(s).x + dx, y: liftY(s) - s.level.body.h * (stack + 1) });
// Top surface / descent rate for an active party of n (capped at perParty.cap), from the level data.
const topFor = (item, n) => { const r = item.perParty, k = Math.max(1, Math.min(r.cap, n)); return item.rest - (r.travelBase + r.travelPer * k); };
const descentFor = (item, n) => { const r = item.perParty, k = Math.max(1, Math.min(r.cap, n)); return r.descentBase + r.descentPer * k; };

test('level 6 is protocol 5, solo-capable, and levels 0-5 keep their schema', () => {
  assert.equal(PARK_LEVEL_COUNT, 7);
  const level = createParkLevel(LEVEL);
  assert.equal(level.id, 'pico-1-1-v5');
  assert.deepEqual([level.width, level.height, level.tiles.size, level.minPlayers, level.minProtocol, level.protocol, level.physics],
    [1488, 240, 24, 1, 5, 5, 'pico']);
  assert.equal(level.spawnSlots.length, 8);
  assert.deepEqual(level.spawnSlots.map(p => p.x + 8), [56, 81, 106, 131, 156, 181, 206, 231]);
  // Frontend exit radius is 22 px (pose distance): slot 0 must spawn outside it.
  assert.ok(Math.hypot(level.spawn.x - level.exit.x, level.spawn.y - level.exit.y) > 22);
  assert.ok(level.exit.x >= 24, 'exit stays clear of the wall');
  assert.ok(level.spawnSlots.every(p => p.y + 23 === 216));
  for (let i = 0; i < 6; i++) {
    const old = createParkLevel(i);
    assert.deepEqual([old.minPlayers, old.minProtocol, old.protocol, old.physics], [2, 4, 4, 'legacy']);
  }
});

test('compiled tile map: walls, floor, pits and goal ledge', () => {
  const tiles = createParkLevel(LEVEL).platforms.filter(p => p.kind === 'tile');
  assert.deepEqual(tiles.map(({ x, y, w, h }) => [x, y, w, h]), [
    [0, 0, 24, 240], [24, 216, 408, 24], [456, 216, 312, 24], [888, 216, 432, 24], [1320, 96, 144, 144], [1464, 0, 24, 240]]);
  const floorAt = x => tiles.some(t => t.y <= 216 && x >= t.x && x < t.x + t.w);
  for (const x of [432, 440, 455, 768, 800, 887]) assert.equal(floorAt(x), false, 'pit at ' + x);
  for (const x of [431, 456, 767, 888, 1319]) assert.equal(floorAt(x), true, 'floor at ' + x);
});

test('party-conditional stairs for active parties 1-64', () => {
  const level = createParkLevel(LEVEL);
  const blocks = party => solidsFor(level, party).filter(p => p.kind === 'block').map(p => [p.x, p.y, p.w]);
  const A = [648, 192, 120], B = [672, 168, 96];
  for (const [party, expected] of [[1, [A, B]], [4, [A, B]], [5, [A]], [6, [A]], [7, [A]], [8, [A]], [9, [A, B]], [30, [A, B]], [64, [A, B]]]) assert.deepEqual(blocks(party), expected, 'party ' + party);
  // JSON-safe (no Infinity) so clients receive the same ranges.
  assert.deepEqual(JSON.parse(JSON.stringify(level.platforms)), level.platforms);
});

test('catch zones cover both pits and land on the near side', () => {
  const level = createParkLevel(LEVEL);
  const [one, two] = level.catchZones;
  assert.ok(one.x <= 432 && one.x + one.w >= 456 && two.x <= 768 && two.x + two.w >= 888);
  for (const zone of level.catchZones) assert.ok(zone.y >= 216 && zone.y <= level.height, 'below the floor, reachable by a valid pose');
  assert.deepEqual(level.catchZones.map(z => [z.to.x + 8, z.to.y + 23]), [[360, -24], [696, -24]]);
  assert.equal(level.catchStack, 25);
  // The lowest stacked respawn (7 earlier fallers) is still a valid pose.
  const s = new ParkSession({ epoch: 'catch', levelIndex: LEVEL, members: ['a'] });
  for (const zone of level.catchZones) assert.ok(s.validPose({ x: zone.to.x, y: zone.to.y - 7 * level.catchStack, vx: 0, vy: 585 }));
  for (const point of [...level.catchZones.map(z => z.to), ...level.spawnSlots]) assert.ok(level.checkpoints.some(c => c.x === point.x && c.y === point.y));
});

test('solo milestone run: one student opens the level alone and completes it', () => {
  const { s, act, advance } = setup(['solo']);
  assert.equal(s.running, true);
  assert.ok(s.progress.gates.includes('bridge'), 'party of one: bridge fully extended');
  assert.equal(act('solo', 'hold', onLift(s), { target: 'lift', active: true }).status, 'accepted');
  assert.equal(s.progress.lifts.lift.to, topFor(lift(s), 1), 'threshold is 1 when alone');
  advance(4000);
  assert.equal(liftY(s), 107.5);
  assert.equal(act('solo', 'key', s.level.key).status, 'accepted');
  assert.equal(act('solo', 'hold', onLift(s), { target: 'lift', active: false }).status, 'accepted');
  assert.equal(act('solo', 'unlock', s.level.goal).status, 'accepted');
  const arrived = act('solo', 'arrive', s.level.goal);
  assert.equal(arrived.status, 'accepted');
  assert.equal(s.progress.complete, true);
});

function teamRun(count) {
  const names = Array.from({ length: count }, (_, i) => 'p' + i);
  const { s, act, advance } = setup(names);
  assert.equal(s.progress.gates.includes('bridge'), false);
  const pad = s.level.switches[0];
  assert.equal(act('p1', 'switch', pad, { target: pad.id }).status, 'accepted');
  assert.ok(s.progress.gates.includes('bridge'));
  // min(8, party) riders, stacked two high, raise the lift.
  const needed = Math.min(8, count);
  for (let i = 0; i < needed; i++) {
    assert.equal(act(names[i], 'hold', onLift(s, 4 + 10 * (i >> 1), i & 1), { target: 'lift', active: true }).status, 'accepted');
    assert.equal(s.progress.lifts.lift.to, i + 1 < needed ? lift(s).home : topFor(lift(s), count), 'after ' + (i + 1) + ' riders');
  }
  advance(5000);
  assert.equal(liftY(s), topFor(lift(s), count));
  assert.equal(act('p1', 'key', s.level.key).status, 'accepted');
  assert.equal(act('p1', 'unlock', s.level.goal).status, 'accepted');
  for (const name of names) {
    assert.equal(s.progress.complete, false);
    assert.equal(act(name, 'arrive', s.level.goal).status, 'accepted');
  }
  assert.equal(s.progress.complete, true);
  return s;
}
test('two-player run to completion', () => { teamRun(2); });
test('eight-player run to completion', () => { teamRun(8); });
test('thirty students need eight riders', () => { teamRun(30); });

test('switch is a latch: pressed once, extends from a relay timestamp, never releases', () => {
  const { s, act, advance, clock } = setup(['a', 'b']);
  const pad = s.level.switches[0];
  assert.equal(act('a', 'switch', s.level.spawn, { target: pad.id }).status, 'rejected', 'must stand on it');
  advance(1234);
  const pressed = act('a', 'hold', pad, { target: pad.id, active: true });
  assert.equal(pressed.status, 'accepted');
  const event = pressed.events.find(e => e.kind === 'mechanisms');
  assert.deepEqual(event.latches, { bridge: 1234 });
  assert.equal(s.progress.latches.bridge, clock());
  assert.equal(act('a', 'hold', pad, { target: pad.id, active: false }).events.length, 0);
  assert.equal(act('b', 'switch', pad, { target: pad.id }).events.length, 0, 'second press is a no-op');
  s.setOnline(['b']); advance(60000); s.setOnline(['a', 'b']);
  assert.equal(s.progress.latches.bridge, 1234);
  assert.ok(s.progress.gates.includes('bridge'));
  const gate = s.level.gates[0];
  assert.equal((gate.extend.from - gate.extend.to) / gate.extend.speed * 1000, 110 / 60 * 1000);
  // Legacy levels never carry latch state.
  assert.equal('latches' in new ParkSession({ epoch: 'x', levelIndex: 0 }).progress, false);
});

test('lift: riders = min(8, active party), travel and descent scale with it, stacked riders count', () => {
  const item = createParkLevel(LEVEL).weightedLifts[0];
  // 184 + 4n travel, 1.2 - 0.1n px/frame descent (original) -> halved.
  assert.deepEqual([1, 2, 4, 8, 30].map(n => topFor(item, n)), [107.5, 105.5, 101.5, 93.5, 93.5]);
  assert.deepEqual([1, 2, 4, 8].map(n => descentFor(item, n)), [33, 30, 24, 12]);
  const { s, act, advance } = setup(['a', 'b', 'c']);
  assert.equal(act('a', 'hold', onLift(s), { target: 'lift', active: true }).status, 'accepted');
  assert.equal(act('b', 'hold', onLift(s, 20, 1), { target: 'lift', active: true }).status, 'accepted');
  assert.equal(s.progress.lifts.lift.to, lift(s).home, 'two of three is not enough');
  // Off to the side of the lift by more than the stack drift is not a rider.
  assert.equal(act('c', 'hold', { x: lift(s).x - 60, y: liftY(s) - 46 }, { target: 'lift', active: true }).status, 'rejected');
  assert.equal(act('c', 'hold', onLift(s, 30, 2), { target: 'lift', active: true }).status, 'accepted');
  assert.equal(s.progress.lifts.lift.to, topFor(lift(s), 3), 'three-high stack counts');
  advance(1000);
  assert.ok(Math.abs(lift(s).rest - liftY(s) - 30) < 1e-9, 'rise 1 px/frame original = 30 px/s');
  act('c', 'hold', onLift(s), { target: 'lift', active: false });
  const from = liftY(s);
  assert.equal(s.progress.lifts.lift.to, lift(s).home);
  assert.equal(s.progress.lifts.lift.rate, descentFor(lift(s), 3));
  advance(1000);
  assert.ok(Math.abs(liftY(s) - from - descentFor(lift(s), 3)) < 1e-9);
  // c arrives: party 2, the two riders suffice again; the target and speed follow the new n.
  act('c', 'key', s.level.key); act('c', 'unlock', s.level.goal); act('c', 'arrive', s.level.goal);
  assert.equal(s.progress.lifts.lift.to, topFor(lift(s), 2));
  assert.equal(s.progress.lifts.lift.rate, 30);
});

test('idle members do not count toward the lift threshold', () => {
  const { s, keys, act, advance } = setup(['a', 'b']);
  act('a', 'hold', onLift(s), { target: 'lift', active: true });
  assert.equal(s.progress.lifts.lift.to, lift(s).home);
  // a keeps playing (motion is input); b does nothing.
  for (let t = 0, m = 0; t < 120000; t += 2000) {
    act('a', 'hold', onLift(s), { target: 'lift', active: true });
    s.motion(keys.a, { epoch: s.epoch, level: s.level.id, sequence: ++m, pose: { ...still(onLift(s)), vx: 1 } });
    advance(2000);
  }
  assert.deepEqual(s.progress.idle, ['b']);
  assert.equal(s.progress.lifts.lift.to, topFor(lift(s), 1), 'b went AFK: one rider lifts');
  act('b', 'settle', s.level.spawn);   // b comes back
  advance(250);
  assert.deepEqual(s.progress.idle, []);
  assert.equal(s.progress.lifts.lift.to, lift(s).home, 'b is back: two riders needed again');
});

test('a player beneath stops the descending lift at their head; it resumes 4 frames after', () => {
  const { s, act, advance, clock } = setup(['a', 'b', 'c']);
  act('a', 'hold', onLift(s), { target: 'lift', active: true });
  act('b', 'hold', onLift(s, 20, 1), { target: 'lift', active: true });
  act('c', 'hold', onLift(s, 40, 2), { target: 'lift', active: true });
  advance(5000);
  const top = topFor(lift(s), 3), head = 193;   // c walks under the raised lift on the floor
  assert.equal(liftY(s), top);
  assert.equal(act('c', 'hold', { x: 1200, y: head }, { target: 'lift-under', active: true }).status, 'rejected', 'not beneath');
  assert.equal(act('c', 'hold', { x: 1240, y: head }, { target: 'lift-under', active: true }).status, 'accepted');
  act('a', 'hold', onLift(s), { target: 'lift', active: false });
  assert.equal(s.progress.lifts.lift.to, head - lift(s).h, 'descends only to the head');
  assert.equal(s.progress.lifts.lift.blocked, true);
  advance(10000);
  assert.equal(liftY(s), head - lift(s).h);
  for (let i = 0; i < 5; i++) { act('c', 'hold', { x: 1240, y: head }, { target: 'lift-under', active: true }); advance(2000); }
  assert.equal(liftY(s), head - lift(s).h, 'waits indefinitely while the lease is renewed');
  // A head that is not a body on the floor or on a stack is refused.
  assert.equal(act('b', 'hold', { x: 1260, y: head - 4 }, { target: 'lift-under', active: true }).status, 'rejected');
  act('c', 'hold', { x: 1240, y: head }, { target: 'lift-under', active: false });
  const state = s.progress.lifts.lift;
  assert.equal(state.blocked, undefined);
  assert.equal(state.at, clock() + 67);
  advance(60); assert.equal(liftY(s), head - lift(s).h, 'still waiting 4 frames');
  advance(2000); assert.ok(liftY(s) > head - lift(s).h);
  // Lease expiry (client gone without a release) also frees it.
  const t = setup(['a']);
  assert.equal(t.act('a', 'hold', { x: 1240, y: 193 }, { target: 'lift-under', active: true }).status, 'rejected', 'nobody fits under the resting lift');
  t.act('a', 'hold', onLift(t.s), { target: 'lift', active: true }); t.advance(5000);
  t.act('a', 'hold', onLift(t.s), { target: 'lift', active: false });
  assert.equal(t.act('a', 'hold', { x: 1240, y: 60 }, { target: 'lift-under', active: true }).status, 'rejected', 'head above the lift');
  assert.equal(t.act('a', 'hold', { x: 1240, y: 193 }, { target: 'lift-under', active: true }).status, 'accepted');
  assert.ok(t.s.progress.holds['lift-under']);
  t.advance(6001);
  assert.equal(t.s.progress.holds['lift-under'], undefined);
});

test('review 4: lift-under cannot ratchet the lift upward', () => {
  const { s, act, advance } = setup(['a', 'b']);
  act('a', 'hold', onLift(s), { target: 'lift', active: true });
  act('b', 'hold', onLift(s, 30), { target: 'lift', active: true });
  advance(5000);
  const top = topFor(lift(s), 2);
  act('a', 'hold', onLift(s), { target: 'lift', active: false });
  advance(1000);
  const start = liftY(s);
  // Hostile renewals from ever higher (stack-plausible) heads, as in the review repro.
  for (let i = 0; i < 10; i++) {
    const y = liftY(s), head = [...Array(8).keys()].map(k => 193 - 23 * k).filter(h => h >= y - 2).at(-1);
    if (head != null) act('b', 'hold', { x: 1240, y: head }, { target: 'lift-under', active: true });
    act('b', 'hold', { x: 1240, y: Math.max(-240, y - 2) }, { target: 'lift-under', active: true });
    advance(1000);
    assert.ok(liftY(s) >= top, 'never above the top');
  }
  assert.ok(liftY(s) >= start - 2, 'at most 2 px above where it was: ' + start + ' -> ' + liftY(s));
  // An honest late report (lift already 3 px into the head) moves it back by at most 2 px.
  const t = setup(['a', 'b', 'c']);
  t.act('a', 'hold', onLift(t.s), { target: 'lift', active: true });
  t.act('b', 'hold', onLift(t.s, 30), { target: 'lift', active: true });
  t.act('c', 'hold', onLift(t.s, 50), { target: 'lift', active: true });
  t.advance(5000);
  t.act('a', 'hold', onLift(t.s), { target: 'lift', active: false });
  for (let i = 0; i < 400 && liftY(t.s) < 193 - lift(t.s).h + 3; i++) t.advance(10);
  const late = liftY(t.s);
  assert.equal(t.act('c', 'hold', { x: 1240, y: 193 }, { target: 'lift-under', active: true }).status, 'accepted');
  assert.ok(Math.abs(liftY(t.s) - (late - 2)) < 1e-9, 'moved back exactly 2 px, not to the head');
  assert.equal(t.s.progress.lifts.lift.blocked, true);
});

test('review 5: a claimed stack rider needs carriers holding the lift (ledge exploit)', () => {
  const { s, act } = setup(['a', 'b', 'c']);
  for (const x of [1320, 1360, 1398, 1305]) assert.equal(act('a', 'hold', { x, y: 73 }, { target: 'lift', active: true }).status, 'rejected', 'ledge x ' + x);
  assert.equal(act('a', 'hold', onLift(s, 10, 1), { target: 'lift', active: true }).status, 'rejected', 'no carrier yet');
  assert.equal(act('b', 'hold', onLift(s), { target: 'lift', active: true }).status, 'accepted');
  assert.equal(act('a', 'hold', onLift(s, 10, 1), { target: 'lift', active: true }).status, 'accepted', 'one carrier, 1-high');
  assert.equal(act('c', 'hold', onLift(s, 10, 3), { target: 'lift', active: true }).status, 'rejected', '3-high needs 3 carriers');
  assert.equal(act('c', 'hold', onLift(s, 10, 2), { target: 'lift', active: true }).status, 'accepted');
});

test('review 1: an idle key holder drops the key so the others can finish', () => {
  const { s, act, advance } = setup(['a', 'b']);
  act('a', 'hold', onLift(s), { target: 'lift', active: true });
  act('b', 'hold', onLift(s, 30), { target: 'lift', active: true });
  advance(5000);
  assert.equal(act('a', 'key', s.level.key).status, 'accepted');
  let events = [];
  for (let t = 0; t < 130000; t += 2000) { act('b', 'settle', { x: 1330 + (t / 2000 % 2), y: 73 }); events.push(...advance(2000)); }
  assert.deepEqual(s.progress.idle, ['a']);
  assert.equal(s.progress.keyHolder, null);
  assert.ok(events.some(e => e.kind === 'key' && e.holder === null));
  assert.equal(act('b', 'key', s.level.key).status, 'accepted');
  assert.equal(act('b', 'unlock', s.level.goal).status, 'accepted');
  assert.equal(act('b', 'arrive', s.level.goal).status, 'accepted');
  assert.equal(s.progress.complete, true);
});

test('review 2: idle members do not count toward the steps or the party-of-one bridge', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const { s, act, advance } = setup(names);
  assert.equal(s.progress.gates.includes('bridge'), false);
  for (let t = 0; t < 121000; t += 2000) { act('a', 'settle', { x: 100 + (t / 2000 % 2), y: 193 }); act('b', 'settle', { x: 130 + (t / 2000 % 2), y: 193 }); advance(2000); }
  assert.equal(s.activeParty().length, 2);
  const level = s.level;
  assert.equal(solidsFor(level, s.activeParty().length).filter(p => p.kind === 'block').length, 2, 'both steps for the two active students');
  for (let t = 0; t < 121000; t += 2000) { act('a', 'settle', { x: 100 + (t / 2000 % 2), y: 193 }); advance(2000); }
  assert.deepEqual(s.activeParty(), ['a']);
  assert.ok(s.progress.gates.includes('bridge'), 'the lone active student gets the bridge aid');
});

test('review 6: a returning idle member reopens a completed room; joiners do not reset an ongoing attempt', () => {
  const names = Array.from({ length: 5 }, (_, i) => 'p' + i);
  const { s, act, advance } = setup(names);
  for (let t = 0; t < 121000; t += 2000) { act('p0', 'settle', { x: 960 + (t / 2000 % 2), y: 193 }); advance(2000); }
  act('p0', 'hold', onLift(s), { target: 'lift', active: true }); advance(5000);
  act('p0', 'key', s.level.key); act('p0', 'unlock', s.level.goal); act('p0', 'arrive', s.level.goal);
  assert.equal(s.progress.complete, true);
  const id = s.level.id;
  // A joiner arriving at the door while idle students are still in the room joins the attempt.
  s.addMember('late');
  assert.deepEqual(s.enter('late'), []);
  assert.deepEqual(s.enter('p0'), [], 'an arrived member keeps their arrival');
  assert.equal(s.level.id, id); assert.deepEqual(s.progress.arrived, ['p0']);
  // p3 was standing still mid-level; any input brings them back and reopens the room.
  act('p3', 'settle', { x: 700, y: 169 });
  const events = advance(250);
  assert.ok(events.some(e => e.kind === 'idle') && events.some(e => e.kind === 'complete' && e.complete === false));
  assert.equal(s.progress.complete, false);
  assert.deepEqual(s.progress.arrived, ['p0']);
  // When nobody online is still playing, a completed room resets on entry as before.
  const solo = setup(['x']);
  solo.act('x', 'key', solo.s.level.key); solo.act('x', 'unlock', solo.s.level.goal); solo.act('x', 'arrive', solo.s.level.goal);
  assert.equal(solo.s.progress.complete, true);
  assert.equal(solo.s.enter('x')[0].kind, 'level');
});

test('review 7: a room emptied by an identity purge still resets after 3 minutes', () => {
  let time = 0;
  const registry = createClassroomRegistry(), ws = {}, other = {};
  registry.join(ws, 'B', 'alice', 'student', 0);
  const service = createParkService({ registry, now: () => time, send() {} });
  const first = service.handle(ws, { type: 'park_join', protocol: 5, levelIndex: LEVEL, clientId: 'browser_one' });
  // alice's socket moves to another period without a park_leave: the old binding is purged.
  registry.join(ws, 'C', 'alice', 'student', 0);
  registry.join(other, 'B', 'bob', 'student', 0);
  service.handle(other, { type: 'park_lobby' });   // presence sweep purges the stale binding
  time += 181000;
  registry.join(ws, 'B', 'alice', 'student', 0);
  const again = service.handle(ws, { type: 'park_join', protocol: 5, levelIndex: LEVEL, clientId: 'browser_one' });
  assert.notEqual(again.level.id, first.level.id);
  service.close();
});

test('lease renewals are not input: an AFK student under the lift goes idle and the lift resumes', () => {
  // The frontend review's afk.mjs: b stops playing under the descending lift, b's client keeps
  // renewing lift-under every 2 s, a plays on.
  const { s, keys, act, advance } = setup(['a', 'b']);
  s.progress.lifts.lift = { from: 105.5, to: 201.5, at: 0, duration: 3200, rate: 30 };
  let m = 0;
  for (let t = 1000; t <= 125000; t += 1000) {
    if (t % 2000 === 0) act('b', 'hold', { x: 1250, y: 193 }, { target: 'lift-under', active: true });
    s.motion(keys.a, { epoch: s.epoch, level: s.level.id, sequence: ++m, pose: { x: 1100 + (t / 1000) % 50, y: 193, vx: 90, vy: 0 } });
    advance(1000);
  }
  assert.deepEqual(s.progress.idle, ['b']);
  assert.equal(s.progress.holds['lift-under'], undefined, 'idle member lease dropped');
  assert.ok(liftY(s) > 193 - lift(s).h, 'lift resumed its descent');
  // Further renewals from the AFK client are ignored: no lease, still idle.
  assert.equal(act('b', 'hold', { x: 1250, y: 193 }, { target: 'lift-under', active: true }).status, 'accepted');
  assert.equal(s.progress.holds['lift-under'], undefined);
  advance(250); assert.deepEqual(s.progress.idle, ['b']);
  // a can now ride alone (party 1 active) up to the top.
  advance(10000);
  act('a', 'hold', onLift(s), { target: 'lift', active: true });
  assert.equal(s.progress.lifts.lift.to, topFor(lift(s), 1));
  // Real input brings b back; a fresh lease then counts again.
  s.motion(keys.b, { epoch: s.epoch, level: s.level.id, sequence: 1, pose: { x: 1000, y: 193, vx: 90, vy: 0 } });
  advance(250); assert.deepEqual(s.progress.idle, []);
});

test('lease renewals are not input: an AFK rider on the lift and on the switch go idle', () => {
  const { s, keys, act, advance } = setup(['a', 'b', 'c']);
  act('a', 'hold', onLift(s), { target: 'lift', active: true });
  act('b', 'hold', onLift(s, 30), { target: 'lift', active: true });
  const pad = s.level.switches[0];
  act('c', 'switch', pad, { target: pad.id });   // latches the bridge
  let m = 0;
  for (let t = 0; t < 122000; t += 2000) {
    act('a', 'hold', onLift(s), { target: 'lift', active: true });    // renewal only: AFK rider
    act('b', 'hold', onLift(s, 30), { target: 'lift', active: true });
    s.motion(keys.b, { epoch: s.epoch, level: s.level.id, sequence: ++m, pose: { ...still(onLift(s, 30)), vx: m % 2 } });
    act('c', 'switch', pad, { target: pad.id });                         // no-op presses on a latched switch
    advance(2000);
  }
  assert.deepEqual(s.progress.idle, ['a', 'c']);
  assert.deepEqual(s.progress.holds.lift, ['b'], "a's rider lease lapsed");
  assert.equal(s.progress.lifts.lift.to, topFor(lift(s), 1), 'b (the only active student) rides alone');
  // Starting a new lease or releasing one is input.
  const fresh = setup(['a', 'b']);
  fresh.advance(100000);
  fresh.act('a', 'hold', onLift(fresh.s), { target: 'lift', active: true });
  fresh.advance(25000);
  assert.deepEqual(fresh.s.progress.idle, ['b'], 'a started a lease at 100 s: not idle at 125 s');
  fresh.act('a', 'hold', onLift(fresh.s), { target: 'lift', active: true });   // lease had lapsed: new lease
  fresh.advance(5000);
  fresh.act('a', 'hold', onLift(fresh.s), { target: 'lift', active: false });  // release of a live lease at 130 s
  fresh.advance(117000);
  assert.deepEqual(fresh.s.progress.idle, ['b'], 'the release at 130 s was input too');
});

test('lone remaining player after the others arrive can still finish', () => {
  const { s, act, advance } = setup(['a', 'b', 'c', 'd']);
  act('a', 'key', s.level.key); act('a', 'unlock', s.level.goal);
  for (const name of ['a', 'b', 'c']) act(name, 'arrive', s.level.goal);
  assert.deepEqual(s.party(), ['d']);
  assert.ok(s.progress.gates.includes('bridge'), 'bridge aid');
  act('d', 'hold', onLift(s), { target: 'lift', active: true });
  assert.equal(s.progress.lifts.lift.to, topFor(lift(s), 1));
  advance(5000);
  assert.equal(act('d', 'arrive', s.level.goal).status, 'accepted');
  assert.equal(s.progress.complete, true);
});

test('published trigger boxes are never stricter than the relay bounds', () => {
  const level = createParkLevel(LEVEL);
  const corners = (cxs, feets) => cxs.flatMap(cx => feets.map(feet => ({ x: cx - 8, y: feet - 23 })));
  const { key, goal } = level, sw = level.switches[0];
  const cases = [
    [key, corners([key.pickup.cx - key.pickup.halfWidth, key.pickup.cx + key.pickup.halfWidth], [key.pickup.feetMin, key.pickup.feetMax])],
    [sw, corners([sw.trigger.cx - sw.trigger.halfWidth, sw.trigger.cx + sw.trigger.halfWidth], [sw.trigger.feetMin, sw.trigger.feetMax])],
    [goal, corners([goal.enter.cxMin, goal.enter.cxMax, goal.unlockKeyX + key.trail], [96])],
  ];
  for (const [anchor, poses] of cases) for (const pose of poses) assert.ok(Math.hypot(pose.x - anchor.x, pose.y - anchor.y) <= level.reach, JSON.stringify(pose));
  assert.equal(level.gates[0].extend.delayMs, 33);
  // And through the relay itself: the far corners of each box are accepted.
  const { act } = setup(['a']);
  assert.equal(act('a', 'switch', cases[1][1][3], { target: 'bridge' }).status, 'accepted');
  assert.equal(act('a', 'key', cases[0][1][0]).status, 'accepted');
  assert.equal(act('a', 'unlock', cases[2][1][2]).status, 'accepted');
  assert.equal(act('a', 'arrive', cases[2][1][1]).status, 'accepted');
});

test('lift heights and rates are level data', () => {
  const level = createParkLevel(LEVEL), item = level.weightedLifts[0];
  assert.deepEqual([item.x, item.w, item.h, item.rest, item.home, item.speed, item.blockId, item.resumeMs], [1222, 92, 9.5, 201.5, 201.5, 30, 'lift-under', 67]);
  assert.equal(216 - item.rest, 14.5);
  const s = new ParkSession({ epoch: 'home', levelIndex: LEVEL, members: ['a'], now: () => 0 });
  s.level.weightedLifts[0].home = 168;  // a correction needs no code change
  s.setOnline(['a']);
  assert.equal(s.progress.lifts.lift.from, 201.5);
  assert.equal(s.progress.lifts.lift.to, 168);
});

test('validPose allows stacks and respawns above the screen down to -height', () => {
  const s = new ParkSession({ epoch: 'pose', levelIndex: LEVEL, members: ['a'] });
  const ok = (x, y, vx = 0, vy = 0) => s.validPose({ x, y, vx, vy });
  assert.equal(ok(0, -240), true);
  assert.equal(ok(0, -240.1), false);
  assert.equal(ok(1488, 240), true);
  assert.equal(ok(1488.1, 0), false);
  assert.equal(ok(10, 10, 90, 585), true);
});

// Arrival times (ms) -> which motions the relay accepts, for one member on a fresh session.
function acceptedAt(arrivals, levelIndex = LEVEL) {
  let time = 0;
  const s = new ParkSession({ epoch: 'motion', levelIndex, members: ['a', 'b'], now: () => time });
  const key = s.open('a', 'browser_a');
  s.setOnline(['a', 'b']);
  const accepted = [];
  arrivals.forEach((at, i) => {
    time = at;
    if (s.motion(key, { epoch: s.epoch, level: s.level.id, sequence: i + 1, pose: still(s.level.spawn) })) accepted.push(at);
  });
  return accepted;
}
const maxInWindow = (times, width) => Math.max(0, ...times.map(start => times.filter(t => t >= start && t < start + width).length));

test('motion: token bucket (2 per 500 ms refill, burst 2, 100 ms gap) caps any 10 s window at 21', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const senders = {
    'every frame': Array.from({ length: 1800 }, (_, i) => i * 1000 / 60),
    'every 100 ms': Array.from({ length: 300 }, (_, i) => i * 100),
    'every 250 ms': Array.from({ length: 120 }, (_, i) => i * 250),
    'bursts after silence': Array.from({ length: 30 }, (_, i) => [0, 1, 2, 3, 100, 101, 200, 300].map(d => i * 1000 + d)).flat(),
    'random flood': Array.from({ length: 600 }, () => rnd() * 30000).sort((a, b) => a - b),
  };
  for (const [name, arrivals] of Object.entries(senders)) {
    for (const levelIndex of [0, LEVEL]) {
      const accepted = acceptedAt(arrivals, levelIndex);
      assert.ok(maxInWindow(accepted, 10000) <= 21, `${name}: ${maxInWindow(accepted, 10000)} in 10 s`);
      for (let i = 1; i < accepted.length; i++) assert.ok(accepted[i] - accepted[i - 1] >= 100, name + ': gap');
    }
  }
  // The worst case reaches exactly 21: a full bucket (2) plus 19 refills.
  assert.equal(maxInWindow(acceptedAt(senders['every frame']), 10000), 21);
});

test('motion: a 500 ms sender with +-200 ms jitter loses none; late then on-time both pass', () => {
  for (let trial = 1; trial <= 50; trial++) {
    let seed = trial;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const arrivals = Array.from({ length: 240 }, (_, i) => 1000 + i * 500 + (rnd() * 400 - 200)).sort((a, b) => a - b);
    assert.deepEqual(acceptedAt(arrivals), arrivals, 'trial ' + trial);
  }
  // Worst alternation: +200 then -200 (gaps of 100 and 900 ms).
  const zigzag = Array.from({ length: 100 }, (_, i) => 1000 + i * 500 + (i % 2 ? -200 : 200)).sort((a, b) => a - b);
  assert.deepEqual(acceptedAt(zigzag), zigzag);
  assert.deepEqual(acceptedAt([0, 900, 1000]), [0, 900, 1000], 'a late packet then an on-time one');
  assert.deepEqual(acceptedAt([0, 50, 100]), [0, 100], 'closer than 100 ms is dropped');
});

test('an idle student does not block completion; arriving clears idleness', () => {
  const { s, act, advance } = setup(['a', 'b']);
  act('a', 'key', s.level.key); act('a', 'unlock', s.level.goal); act('a', 'arrive', s.level.goal);
  assert.equal(s.progress.complete, false);
  const events = advance(120000);
  assert.ok(events.some(e => e.kind === 'idle' && e.idle.includes('b')));
  assert.equal(s.progress.complete, true);
  // Legacy rule unchanged: no idle tracking on level 0.
  assert.equal('idle' in new ParkSession({ epoch: 'x', levelIndex: 0 }).progress, false);
});

test('abandoned level-6 room resets after 3 minutes empty; quick returns resume', () => {
  let time = 0;
  const registry = createClassroomRegistry(), ws = {};
  registry.join(ws, 'B', 'alice', 'student', 0);
  const service = createParkService({ registry, now: () => time, send() {} });
  const join = (type = 'park_join') => service.handle(ws, { type, protocol: 5, levelIndex: LEVEL, clientId: 'browser_one' });
  const first = join();
  assert.equal(first.running, true, 'one student is enough');
  const settle = { type: 'park_command', epoch: first.epoch, streamId: first.streamId, level: first.level.id, sequence: 1,
    kind: 'settle', target: 'rest', pose: still(first.level.spawnSlots[3]) };
  assert.equal(service.handle(ws, settle).status, 'accepted');
  service.detached(ws); time += 179000;
  const quick = join('park_resume');
  assert.equal(quick.level.id, first.level.id);
  assert.deepEqual(quick.poses.alice, still(first.level.spawnSlots[3]));
  service.handle(ws, { type: 'park_leave', epoch: first.epoch }); time += 60000;
  assert.equal(join().level.id, first.level.id, 'a voluntary leave alone does not reset');
  service.detached(ws); time += 180000;
  const fresh = join('park_resume');
  assert.notEqual(fresh.level.id, first.level.id);
  assert.deepEqual(fresh.poses, {});
  service.close();
});

test('protocol gating: level 6 needs protocol 5; protocol 4 keeps levels 0-5', () => {
  const registry = createClassroomRegistry(), old = {}, current = {};
  registry.join(old, 'B', 'old', 'student', 0); registry.join(current, 'B', 'new', 'student', 0);
  const service = createParkService({ registry, send() {} });
  for (const type of ['park_join', 'park_resume']) {
    const denied = service.handle(old, { type, protocol: 4, levelIndex: LEVEL, clientId: 'browser_old' });
    assert.equal(denied.code, 'PARK_UPDATE_REQUIRED');
    assert.match(denied.message, /Reload/);
  }
  const legacy = service.handle(old, { type: 'park_join', protocol: 4, levelIndex: 0, clientId: 'browser_old' });
  assert.equal(legacy.type, 'park_result'); assert.equal(legacy.level.protocol, 4); assert.equal(legacy.running, false);
  assert.equal(service.handle(current, { type: 'park_join', protocol: 5, levelIndex: LEVEL, clientId: 'browser_new' }).level.id, 'pico-1-1-v5');
  assert.equal(service.handle(current, { type: 'park_join', protocol: 5, levelIndex: 0, clientId: 'browser_new' }).type, 'park_result');
  for (const protocol of [3, '5', undefined, 4.5]) assert.equal(service.handle(current, { type: 'park_join', protocol, levelIndex: 0, clientId: 'browser_new' }).code, 'PARK_UPDATE_REQUIRED');
  assert.equal(service.handle(current, { type: 'park_join', protocol: 5, levelIndex: 7, clientId: 'browser_new' }).message, 'Unknown park level');
  assert.equal(service.handle(old, { type: 'park_lobby' }).levels.length, 7);
  service.close();
});

// ---- Reachability with the measured half-scale physics (60 Hz fixed step) ----
// Walk 1.5, launch -2.55 (no horizontal move on the launch frame), gravity 0.325 with position
// integrated before velocity, held boost -0.51(1-k/14) for k=1..13, terminal 9.75. Body 16x23.
const W = 16, H = 23;
function body(x, feet) { return { x, y: feet - H, vy: 0, ground: true, k: 0 }; }
function overlapsX(b, r) { return b.x + W > r.x && b.x < r.x + r.w; }
function supported(b, solids) { return solids.some(r => overlapsX(b, r) && Math.abs(b.y + H - r.y) < 1e-6); }
function step(b, solids, { dir = 0, jump = false, hold = false } = {}) {
  if (jump && b.ground) { b.vy = -2.55; b.k = 0; b.ground = false; b.jumping = true; return; }
  b.x += dir * 1.5;
  if (dir) for (const r of solids) if (overlapsX(b, r) && b.y + H > r.y + 1e-6 && b.y < r.y + r.h) b.x = dir > 0 ? r.x - W : r.x + r.w;
  if (b.ground && supported(b, solids)) return;
  b.ground = false;
  const feet = b.y + H;
  b.y += b.vy; b.k++;
  for (const r of solids) {
    if (!overlapsX(b, r)) continue;
    if (b.vy >= 0 && feet <= r.y + 1e-6 && b.y + H >= r.y) { b.y = r.y - H; b.vy = 0; b.ground = true; b.jumping = false; return; }
    if (b.vy < 0 && b.y < r.y + r.h && b.y - b.vy >= r.y + r.h) { b.y = r.y + r.h; b.vy = 0; }
  }
  b.vy = Math.min(9.75, b.vy + 0.325 + (hold && b.jumping && b.k <= 13 ? -0.51 * (1 - b.k / 14) : 0));
}
// Jump (or walk off) with a steering policy until landing; returns the landing feet and x.
function hop(b, solids, policy, { jump = true, frames = 400, onFrame = () => {} } = {}) {
  if (jump) step(b, solids, { jump: true });
  let airborne = !b.ground;
  for (let f = 0; f < frames; f++) {
    step(b, solids, { hold: true, ...policy(f, b) });
    onFrame(b);
    airborne ||= !b.ground;
    if (airborne && b.ground || b.y + H > 240) break;
  }
  return { feet: b.y + H, x: b.x, ground: b.ground };
}
function geometry(party, { bridge = 'rest', liftSurface = 201.5 } = {}) {
  const level = createParkLevel(LEVEL), item = level.weightedLifts[0];
  const solids = solidsFor(level, party);
  if (bridge === 'open' || party === 1) solids.push(level.gates[0].terrain[0]);
  solids.push({ x: item.x, y: liftSurface, w: item.w, h: item.h });
  return { level, solids };
}

test('calibration: the sim reproduces the measured jump', () => {
  const { solids } = geometry(8);
  let top = 216; const b = body(100, 216);
  hop(b, solids, () => ({}), { onFrame: x => { top = Math.min(top, x.y + H); } });
  assert.ok(Math.abs(216 - top - 39.285) < 0.01, String(216 - top));
});

test('solo route is physically possible at half scale', () => {
  const { level, solids } = geometry(1, { bridge: 'open' });
  const right = () => ({ dir: 1 });
  // Pit 1 (432-456) from its lip.
  assert.deepEqual(pick(hop(body(416, 216), solids, right)), { feet: 216, beyond: true }, 'pit 1');
  function pick(r) { return { feet: r.feet, beyond: r.x > 440 }; }
  // Floor -> step A (top 192) -> step B (top 168).
  let r = hop(body(620, 216), solids, right, { frames: 400 });
  assert.equal(r.feet, 192);
  r = hop(body(650, 192), solids, right);
  assert.equal(r.feet, 168);
  // Walk off step B onto the fully extended bridge over pit 2.
  const walker = body(740, 168);
  r = hop(walker, solids, right, { jump: false, frames: 200 });
  assert.equal(r.feet, 216); assert.ok(r.x > 768 && r.x < 888, 'on the bridge, not in the pit');
  // Board the resting lift (14.5 up: a tap is not enough, a full jump is).
  const item = level.weightedLifts[0];
  const tap = body(1190, 216); step(tap, solids, { jump: true });
  r = hop(tap, solids, f => ({ dir: 1, hold: false }), { jump: false });
  assert.notEqual(r.feet, item.rest, 'tap jump does not board');
  r = hop(body(1190, 216), solids, right);
  assert.equal(r.feet, item.rest);
  for (const n of [1, 2, 8]) {
    const top = topFor(item, n), raised = geometry(n, { bridge: 'open', liftSurface: top }).solids;
    // Raised lift: a hop left from its edge enters the measured key pickup box.
    const box = level.key.pickup, grabs = [];
    for (let held = 0; held <= 13; held++) for (let left = 0; left <= 40; left++) {
      let touched = false, relayNear = false;
      const end = hop(body(item.x - W + 2, top), raised, f => ({ dir: f < left ? -1 : 1, hold: f < held }), { onFrame: b => {
        const hit = Math.abs(b.x + W / 2 - box.cx) <= box.halfWidth && b.y + H >= box.feetMin && b.y + H <= box.feetMax;
        touched ||= hit;
        relayNear ||= hit && Math.hypot(b.x - level.key.x, b.y - level.key.y) <= level.reach;
      } });
      if (touched) grabs.push({ relayNear, landed: end.feet });
    }
    assert.ok(grabs.length && grabs.every(g => g.relayNear), 'key reachable from the lift, p=' + n);
    // As in the original, the holder drops to the floor with the key and rides up again.
    assert.ok(grabs.every(g => g.landed === 216 || g.landed === top));
    // Lift top -> goal ledge: held jump at p=1 (11.5 below), tap at p=2 (9.5 below), walk at p=8 (2.5 above).
    const start = () => body(item.x + item.w - W, top);
    r = n === 8 ? hop(start(), raised, right, { jump: false }) : hop(start(), raised, right);
    assert.equal(r.feet, 96, 'ledge at p=' + n); assert.ok(r.x >= 1320 - W);
    const tap = hop(start(), raised, () => ({ dir: 1, hold: false }));
    if (n === 2) assert.equal(tap.feet, 96, 'tap suffices at p=2');
    if (n === 1) assert.notEqual(tap.feet, 96, 'tap is 0.2 px short at p=1');
  }
  // The door's entry range is on the ledge.
  assert.ok(level.goal.enter.cxMin > 1320 && level.goal.enter.cxMax <= 1464 - W / 2);
});

test('two-player crossing: rider jumps off the falling carrier onto the resting bridge', () => {
  const { level, solids } = geometry(2);
  assert.equal(solids.some(s => s.x === 746), false, 'bridge at rest');
  const carrier = body(752, 168), rider = { ...body(752, 168 - H) };
  let r = null, carrierFell = 0;
  for (let f = 0; f < 200 && !r; f++) {
    const on = Math.abs(rider.y + H - carrier.y) < 1e-6 && Math.abs(rider.x - carrier.x) <= 17;
    step(carrier, solids, { dir: 1 });
    if (!carrier.ground) carrierFell = carrier.y + H - 168;
    if (on) {
      rider.x += 1.5; rider.y = carrier.y - H;                     // carried vertically, walks along
      if (carrierFell >= 12) r = hop(Object.assign(rider, { ground: true }), solids, () => ({ dir: 1 }));
    }
  }
  assert.ok(r, 'rider jumped');
  assert.equal(r.feet, 216); assert.ok(r.x + W > 856, 'landed on the resting bridge (or beyond)');
  // The carrier falls into pit 2 and is caught, then respawns over step B (party <= 4).
  for (let f = 0; f < 200 && carrier.y + H <= 240; f++) step(carrier, solids, {});
  const zone = level.catchZones[1];
  assert.ok(carrier.y + H > zone.y && carrier.x + W > zone.x && carrier.x < zone.x + zone.w);
  const respawn = Object.assign(body(0, 0), { x: zone.to.x, y: zone.to.y, ground: false });
  assert.equal(hop(respawn, solids, () => ({}), { jump: false }).feet, 168);
  // After the latch the carrier walks off step B onto the extended bridge.
  const open = geometry(2, { bridge: 'open' }).solids;
  r = hop(body(740, 168), open, () => ({ dir: 1 }), { jump: false });
  assert.equal(r.feet, 216); assert.ok(r.x > 768);
});

test('no dead ends: every resting surface has a way back to the route', () => {
  for (const party of [1, 2, 5, 8]) {
    const { level, solids } = geometry(party);
    // Far side: with the bridge at rest walking left drops into pit 2 (caught); alone, the
    // extended bridge simply leads back.
    const back = body(900, 216);
    hop(back, solids, () => ({ dir: -1 }), { jump: false, frames: 400 });
    if (party === 1) assert.ok(back.x <= 768 && back.y + H <= 216, 'walked back over pit 2 to the steps');
    else assert.ok(back.y + H > 240, 'fell into pit 2 (party ' + party + ')');
    // Goal ledge: walk off its left edge down to the lift or the floor.
    const down = body(1330, 96);
    const r = hop(down, solids, () => ({ dir: -1 }), { jump: false, frames: 400 });
    assert.ok(r.ground && r.feet > 96);
    // Under the raised lift: nothing blocks walking out sideways, and the gap at rest
    // (5 px) is too small to be caught under it.
    const item = level.weightedLifts[0];
    assert.ok(216 - (item.rest + item.h) < H);
    const under = body(1260, 216);
    hop(under, geometry(party, { liftSurface: topFor(item, party) }).solids, () => ({ dir: -1 }), { jump: false, frames: 60 });
    assert.ok(under.x + W <= item.x, "walked out from under the lift (the ledge wall blocks the right side)");
    // Off the ledge side with the lift at any height: lands on the lift or the floor, or (lift
    // above the ledge) can hop onto it.
    for (const surface of [item.rest, 150, 120, topFor(item, party)]) {
      const off = body(1330, 96);
      const end = hop(off, geometry(party, { liftSurface: surface }).solids, () => ({ dir: -1 }), { jump: surface < 96, frames: 400 });
      assert.ok(end.ground && end.feet >= Math.min(surface, 96), 'ledge -> lift/floor with lift at ' + surface);
    }
    // Catch respawns land on solid ground.
    for (const zone of level.catchZones) {
      const fall = Object.assign(body(0, 0), { x: zone.to.x, y: zone.to.y, ground: false });
      assert.ok(hop(fall, solids, () => ({}), { jump: false }).ground);
    }
  }
});

// Falling-stack crossing of pit 2: a k-high stack stands on the highest surface left of the pit,
// walks right in step, the bottom walks off (x 768) and falls carrying the rest vertically, and
// the top rider jumps (full, steering right) once the stack has fallen `th` px. Returns the
// frames (after leaving the edge) at which the jump lands on the resting bridge or beyond.
function crossingFrames(solids, k, feet0) {
  const frames = new Set();
  for (let th = 0; th <= 80; th += 0.5) {
    const bottom = body(740, feet0);
    let fell = 0, frame = 0;
    for (let f = 0; f < 300 && bottom.y + H <= 240; f++) {
      step(bottom, solids, { dir: 1 });
      if (!bottom.ground) { fell = bottom.y + H - feet0; frame++; }
      if (fell < th) continue;
      const top = Object.assign(body(bottom.x, bottom.y + H - (k - 1) * H), { ground: true });
      step(top, solids, { jump: true });
      for (let g = 0; g < 400 && top.y + H <= 240; g++) { step(top, solids, { dir: 1, hold: true }); if (top.ground) break; }
      if (top.ground && top.y + H === 216 && top.x + W > 856) frames.add(frame);
      break;
    }
  }
  return [...frames].sort((a, b) => a - b);
}

test('pit 2 is crossable by a pair for every active party 1-64', () => {
  const results = {}, windows = {};
  for (let party = 1; party <= 64; party++) {
    const { level, solids } = geometry(party);
    if (party === 1) {
      const r = hop(body(740, 168), solids, () => ({ dir: 1 }), { jump: false });
      assert.ok(r.feet === 216 && r.x > 768, 'alone: walk onto the extended bridge');
      continue;
    }
    const steps = solidsFor(level, party).filter(p => p.kind === 'block');
    const feet0 = steps.length ? Math.min(...steps.map(p => p.y)) : 216;
    const key = feet0 + '';
    results[key] ??= [2, 3].map(k => crossingFrames(solids, k, feet0));
    windows[party] = results[key][0];
    assert.ok(windows[party].length, `party ${party}: a pair cannot cross from feet ${feet0}`);
  }
  // Pair jump windows (frames after the carrier leaves the edge). Step B (2-4, 9+): 19 frames;
  // step A only (5-8): 11 frames. Pinned so a physics or geometry change that narrows them fails.
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  for (const party of [2, 3, 4, 9, 30, 64]) assert.deepEqual(windows[party], range(4, 22), 'party ' + party);
  for (const party of [5, 6, 7, 8]) assert.deepEqual(windows[party], range(8, 18), 'party ' + party);
  // Why step A stays for 7-8 (the original's <= 6 rule): with no step a pair cannot cross at all,
  // and a 3-high stack only in a 6-frame (~100 ms) window.
  const { level } = geometry(7), bare = level.platforms.filter(p => !p.party);
  bare.push({ x: level.weightedLifts[0].x, y: 201.5, w: level.weightedLifts[0].w, h: level.weightedLifts[0].h });
  assert.deepEqual(crossingFrames(bare, 2, 216), []);
  assert.deepEqual(crossingFrames(bare, 3, 216), range(8, 13));
});
