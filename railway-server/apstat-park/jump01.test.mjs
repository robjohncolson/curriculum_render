import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { createParkLevel, PARK_LEVEL_COUNT } from './levels.mjs';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

// Level 6: PICO PARK 1-1 at half scale. Poses are the top-left of the 16x23 body.
const LEVEL = 6;
const still = point => ({ x: point.x, y: point.y, vx: 0, vy: 0 });
const inRange = (range, n) => n >= range.min && n <= range.max;
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

test('level 6 is protocol 5, solo-capable, and levels 0-5 keep their schema', () => {
  assert.equal(PARK_LEVEL_COUNT, 7);
  const level = createParkLevel(LEVEL);
  assert.equal(level.id, 'pico-1-1-v5');
  assert.deepEqual([level.width, level.height, level.tiles.size, level.minPlayers, level.minProtocol, level.protocol, level.physics],
    [1488, 240, 24, 1, 5, 5, 'pico']);
  assert.equal(level.spawnSlots.length, 8);
  assert.deepEqual(level.spawnSlots.map(p => p.x + 8), [50, 75, 100, 125, 150, 175, 200, 225]);
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

test('party-conditional stairs for parties of 1, 4, 5, 6, 7 and 8', () => {
  const level = createParkLevel(LEVEL);
  const blocks = party => solidsFor(level, party).filter(p => p.kind === 'block').map(p => [p.x, p.y, p.w]);
  const A = [648, 192, 120], B = [672, 168, 96];
  for (const [party, expected] of [[1, [A, B]], [4, [A, B]], [5, [A]], [6, [A]], [7, []], [8, []]]) assert.deepEqual(blocks(party), expected, 'party ' + party);
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
  assert.equal(s.progress.lifts.lift.to, lift(s).top, 'threshold is 1 when alone');
  advance(4000);
  assert.equal(liftY(s), lift(s).top);
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
  // Two riders (one stacked on the other) raise the lift for any party of 2+.
  act('p0', 'hold', onLift(s), { target: 'lift', active: true });
  assert.equal(s.progress.lifts.lift.to, lift(s).home);
  act('p1', 'hold', onLift(s, 12, 1), { target: 'lift', active: true });
  assert.equal(s.progress.lifts.lift.to, lift(s).top);
  advance(4000);
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

test('lift threshold is min(2, party) and stacked riders count', () => {
  const { s, act, advance } = setup(['a', 'b', 'c']);
  assert.equal(act('a', 'hold', onLift(s), { target: 'lift', active: true }).status, 'accepted');
  assert.equal(s.progress.lifts.lift.to, lift(s).home);
  // Off to the side of the lift by more than the stack drift is not a rider.
  assert.equal(act('b', 'hold', { x: lift(s).x - 60, y: liftY(s) - 46 }, { target: 'lift', active: true }).status, 'rejected');
  assert.equal(act('b', 'hold', { x: lift(s).x + 4, y: liftY(s) - 2 * 23 }, { target: 'lift', active: true }).status, 'accepted');
  assert.equal(s.progress.lifts.lift.to, lift(s).top, 'rider on top of a rider counts');
  advance(1000);
  const mid = liftY(s);
  assert.ok(mid < lift(s).rest && mid > lift(s).top);
  assert.ok(Math.abs(lift(s).rest - mid - 30) < 1e-9, '0.5 px/frame = 30 px/s');
  // Stacked rider standing on a carrier on the moving lift.
  assert.equal(act('c', 'hold', { x: lift(s).x + 20, y: liftY(s) - 2 * 23 }, { target: 'lift', active: true }).status, 'accepted');
  act('b', 'hold', onLift(s), { target: 'lift', active: false });
  act('c', 'hold', onLift(s), { target: 'lift', active: false });
  assert.equal(s.progress.lifts.lift.to, lift(s).home, 'one rider of a party of 3 descends');
  // b and c arrive: the party is now a, so one rider suffices again.
  act('b', 'key', s.level.key); act('b', 'unlock', s.level.goal);
  act('b', 'arrive', s.level.goal); act('c', 'arrive', s.level.goal);
  assert.equal(s.progress.lifts.lift.to, lift(s).top);
  assert.ok(s.progress.gates.includes('bridge'), 'alone again: bridge aid');
  const legacy = createParkLevel(2).weightedLifts[0];
  assert.equal(legacy.partyScaled, undefined);
});

test('lift rest and home heights are level data', () => {
  const level = createParkLevel(LEVEL), item = level.weightedLifts[0];
  assert.deepEqual([item.rest, item.home, item.top, item.speed], [201.5, 201.5, 105.5, 30]);
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

test('motion: 450 ms after the last accepted update is accepted, 300 ms is not', () => {
  const { s, keys, advance } = setup(['a', 'b']);
  const packet = sequence => ({ epoch: s.epoch, level: s.level.id, sequence, pose: still(s.level.spawn) });
  assert.ok(s.motion(keys.a, packet(1)));
  advance(300);
  assert.equal(s.motion(keys.a, packet(2)), null);
  advance(150);
  assert.ok(s.motion(keys.a, packet(3)));
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
  // Raised lift: a hop left from its edge touches the key (art centre 1176,96; 16x28).
  const raised = geometry(1, { bridge: 'open', liftSurface: item.top }).solids;
  const key = { x: 1168, y: 82, w: 16, h: 28 };
  const grabs = [];
  for (let held = 0; held <= 13; held++) for (let left = 0; left <= 40; left++) {
    let touched = false, relayNear = false;
    const grabber = body(item.x - W + 2, item.top);
    const end = hop(grabber, raised, f => ({ dir: f < left ? -1 : 1, hold: f < held }), { onFrame: b => {
      const hit = overlapsX(b, key) && b.y + H > key.y && b.y < key.y + key.h;
      touched ||= hit;
      relayNear ||= hit && Math.hypot(b.x - level.key.x, b.y - level.key.y) <= level.reach;
    } });
    if (touched) grabs.push({ held, left, relayNear, landed: end.feet });
  }
  assert.ok(grabs.length && grabs.every(g => g.relayNear), 'key reachable, and every touch is within the relay reach');
  // As in the original, the holder drops to the floor with the key, waits for the lift to
  // come home (threshold 1 when alone) and boards it again (full jump, checked above).
  assert.ok(grabs.every(g => g.landed === 216 || g.landed === item.top));
  // Lift top (105.5) -> goal ledge (96).
  r = hop(body(item.x + item.w - W, item.top), raised, right);
  assert.equal(r.feet, 96); assert.ok(r.x >= 1320 - W);
  assert.ok(Math.hypot(1432 - level.goal.x, (96 - H) - level.goal.y) <= level.reach);
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
    // Catch respawns land on solid ground.
    for (const zone of level.catchZones) {
      const fall = Object.assign(body(0, 0), { x: zone.to.x, y: zone.to.y, ground: false });
      assert.ok(hop(fall, solids, () => ({}), { jump: false }).ground);
    }
  }
});
