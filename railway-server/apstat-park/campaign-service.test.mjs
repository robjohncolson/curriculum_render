import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCampaignService, CAMPAIGN_CLEAR_MS, CAMPAIGN_IDLE_MS, CAMPAIGN_PROTOCOL } from './campaign-service.mjs';

function fixture(count = 2) {
  let time = 0;
  const registry = createClassroomRegistry(), messages = new Map(), players = Array.from({ length: count }, () => ({}));
  const service = createCampaignService({ registry, now: () => time, send(ws, packet) { messages.set(ws, packet); } });
  players.forEach((ws, i) => registry.join(ws, 'PeriodB', 'p' + i, 'student', time));
  const join = ws => service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL });
  const state = () => { service.handle(players[0], { type: 'campaign_resume', epoch: messages.get(players[0]).epoch, from: 0 }); return messages.get(players[0]); };
  return { service, registry, players, messages, join, state,
    advance(ms) { time += ms; service.tick(); },
    send(ws, type, data = {}) { return service.handle(ws, { type, epoch: state().epoch, ...data }); },
  };
}

test('all 48 stages advance only after the entire team clears; stage 48 loops to 1', () => {
  const f = fixture();
  try {
    f.players.forEach(f.join); f.advance(1500);
    for (let stage = 0; stage < 48; stage++) {
      assert.equal(f.state().stageIndex, stage);
      f.advance(50);
      const frame = f.state().to;
      f.send(f.players[0], 'campaign_clear', { frame });
      assert.equal(f.state().phase, 'playing');
      f.send(f.players[1], 'campaign_clear', { frame });
      assert.equal(f.state().phase, 'clear');
      f.advance(CAMPAIGN_CLEAR_MS - 1); assert.equal(f.state().stageIndex, stage);
      f.advance(1);
    }
    assert.equal(f.state().stageIndex, 0); assert.equal(f.state().lap, 2);
  } finally { f.service.close(); }
});

test('input is assigned by joined identity; retries and reconnects cannot skip a stage', () => {
  const f = fixture();
  try {
    f.players.forEach(f.join); f.advance(1500);
    const before = f.state();
    f.send(f.players[0], 'campaign_input', { bits: 48 }); f.advance(50);
    const replay = f.state();
    assert.deepEqual(replay.events.slice(1).map(event => event.inputs), [[48, 0], [16, 0]]);
    assert.equal(f.service.handle({}, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL }).type, 'campaign_error');
    assert.equal(f.service.handle(f.players[0], { type: 'campaign_join', protocol: 1 }).type, 'campaign_error');
    assert.equal(f.service.handle(f.players[0], { type: 'campaign_join', protocol: 2 }).type, 'campaign_error');
    f.send(f.players[0], 'campaign_clear', { frame: 999999 }); assert.equal(f.state().phase, 'playing');
    f.service.detached(f.players[1]); f.advance(5000); f.join(f.players[1]);
    assert.equal(f.state().epoch, before.epoch);
    assert.equal(f.state().stageIndex, 0);
    for (let i = 0; i < 45; i++) f.advance(50);
    f.send(f.players[0], 'campaign_retry');
    assert.notEqual(f.state().epoch, before.epoch); assert.equal(f.state().stageIndex, 0);
  } finally { f.service.close(); }
});

test('late arrivals wait for retry; a missing teammate eventually frees the team', () => {
  const f = fixture(3);
  try {
    f.join(f.players[0]); f.advance(1500); f.join(f.players[1]);
    assert.deepEqual(f.state().roster, ['p0']); assert.deepEqual(f.state().waiting, ['p1']);
    for (let i = 0; i < 45; i++) f.advance(50);
    f.send(f.players[0], 'campaign_retry'); assert.deepEqual(f.state().roster, ['p0', 'p1']);
    f.service.detached(f.players[1]); f.advance(15000);
    assert.deepEqual(f.state().roster, ['p0']); assert.equal(f.state().stageIndex, 0);
  } finally { f.service.close(); }
});

test('relay preserves fractional ticks and splits classes into teams of eight', () => {
  const f = fixture(9);
  try {
    f.players.forEach(f.join); f.advance(1500);
    assert.equal(f.state().roster.length, 8);
    const second = f.messages.get(f.players[8]);
    assert.deepEqual(second.roster, ['p8']);
    assert.notEqual(second.team, f.state().team);
    // 51 ms timers must not lose one millisecond every tick.
    for (let i = 0; i < 100; i++) f.advance(51);
    assert.equal(f.state().to, 306);
    const epoch = second.epoch;
    f.service.handle(f.players[8], { type: 'campaign_input', epoch, bits: 2, buddy: 48 });
    f.advance(51);
    f.service.handle(f.players[8], { type: 'campaign_resume', epoch, from: 0 });
    assert.deepEqual(f.messages.get(f.players[8]).events.slice(-2).map(event => event.inputs), [[2, 48], [2, 16]]);
  } finally { f.service.close(); }
});


test('empty heartbeats cannot keep an idle teammate in the roster or rejoin automatically', () => {
  const f = fixture();
  try {
    f.players.forEach(f.join); f.advance(1500);
    const before = f.state();
    for (let i = 0; i < 60; i++) {
      f.send(f.players[0], 'campaign_input', { bits: 2 });
      f.send(f.players[1], 'campaign_input', { bits: 0, buddy: 0 });
      f.advance(1000);
    }
    assert.deepEqual(f.state().roster, ['p0']);
    assert.notEqual(f.state().epoch, before.epoch);
    assert.equal(f.state().stageIndex, before.stageIndex);
    assert.equal(f.messages.get(f.players[1]).type, 'campaign_idle');
    f.join(f.players[1]);
    assert.equal(f.messages.get(f.players[1]).type, 'campaign_idle');
    assert.deepEqual(f.service.occupants('PeriodB'), ['p0']);
    f.send(f.players[0], 'campaign_input', { bits: 2, buddy: 16 }); f.advance(50);
    assert.deepEqual(f.state().events.at(-1).inputs, [2, 16]);
    f.send(f.players[0], 'campaign_clear', { frame: f.state().to });
    assert.equal(f.state().phase, 'clear');
    f.advance(CAMPAIGN_CLEAR_MS); assert.equal(f.state().stageIndex, 1);
  } finally { f.service.close(); }
});

test('idle participant may explicitly rejoin but waits until the team retries', () => {
  const f = fixture();
  try {
    f.players.forEach(f.join); f.advance(1500);
    f.advance(CAMPAIGN_IDLE_MS - 2000);
    f.send(f.players[0], 'campaign_input', { bits: 2 }); f.advance(1000);
    assert.deepEqual(f.state().roster, ['p0']);
    f.service.handle(f.players[1], { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL, active: true });
    assert.deepEqual(f.state().waiting, ['p1']);
    assert.deepEqual(f.state().roster, ['p0']);
  } finally { f.service.close(); }
});

test('held game input keeps a teammate active, while all-idle rooms become waiting', () => {
  const f = fixture();
  try {
    f.players.forEach(f.join); f.advance(1500);
    f.advance(CAMPAIGN_IDLE_MS - 2000);
    for (const ws of f.players) f.send(ws, 'campaign_input', { bits: 16 });
    f.advance(1000); assert.equal(f.state().roster.length, 2);
    f.advance(CAMPAIGN_IDLE_MS);
    assert.deepEqual(f.service.occupants('PeriodB'), []);
    for (const ws of f.players) assert.equal(f.messages.get(ws).type, 'campaign_idle');
    f.service.handle(f.players[0], { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL, active: true });
    assert.equal(f.state().phase, 'waiting'); f.advance(50);
    assert.deepEqual(f.state().roster, ['p0']);
  } finally { f.service.close(); }
});

test('rapid press and release preserve a jump edge without leaving movement held', () => {
  const f = fixture(1);
  try {
    f.players.forEach(f.join); f.advance(1500);
    f.send(f.players[0], 'campaign_input', { bits: 50, buddy: 50 });
    f.send(f.players[0], 'campaign_input', { bits: 0, buddy: 0 });
    f.advance(50);
    assert.deepEqual(f.state().events.slice(1).map(event => event.inputs), [[32, 32], [0, 0]]);
  } finally { f.service.close(); }
});

test('the UP press edge (512) lasts one tick; an input timeout and the same held heartbeat never make a new press', () => {
  const f = fixture(1);
  try {
    f.players.forEach(f.join); f.advance(1500);
    // Key-down on UP: held 4 + press edge 512. The edge lasts one authoritative tick, the hold persists.
    f.send(f.players[0], 'campaign_input', { bits: 4 | 512, buddy: 0 });
    for (let i = 0; i < 35; i++) f.advance(50);   // silent for 1750 ms: the relay times the input out (held -> 0)
    f.send(f.players[0], 'campaign_input', { bits: 4, buddy: 0 });   // the same held-UP heartbeat resumes
    f.advance(50);
    const inputs = f.state().events.slice(1).map(event => event.inputs);
    assert.deepEqual(inputs, [[516, 0], [4, 0], [0, 0], [4, 0]], 'press once, hold, timeout, resumed hold without a press');
    assert.equal(inputs.filter(([bits]) => bits & 512).length, 1, 'exactly one UP press edge');
  } finally { f.service.close(); }
});

test('old-style packets (bits <= 63) still work; action bits 64/256 round-trip into the journal', () => {
  const f = fixture(1);
  try {
    f.players.forEach(f.join); f.advance(1500);
    // An old client: jump held + jump edge, nothing above bit 32.
    f.send(f.players[0], 'campaign_input', { bits: 50, buddy: 16 }); f.advance(50);
    assert.deepEqual(f.state().events.slice(1).map(event => event.inputs), [[50, 16], [18, 16]]);
    // Action held (64) + action press edge (256): the edge lasts one tick, the hold persists.
    f.send(f.players[0], 'campaign_input', { bits: 64 | 256 | 2, buddy: 64 | 256 }); f.advance(50);
    const events = f.state().events.map(event => event.inputs);
    assert.deepEqual(events.slice(-2), [[322, 320], [66, 64]]);
    // A press and release inside one tick keeps only the edge (like jump).
    f.send(f.players[0], 'campaign_input', { bits: 64 | 256, buddy: 0 });
    f.send(f.players[0], 'campaign_input', { bits: 0, buddy: 0 }); f.advance(50);
    assert.deepEqual(f.state().events.map(event => event.inputs).slice(-2), [[256, 0], [0, 0]]);
    // Out of range is rejected; the reserved helper bit 128 never reaches the journal.
    const before = f.state().events.length;
    f.send(f.players[0], 'campaign_input', { bits: 1024 | 2 }); f.advance(50);
    assert.equal(f.state().events.length, before, 'bits > 1023 are rejected');
    f.send(f.players[0], 'campaign_input', { bits: 128 | 2, buddy: 128 }); f.advance(50);
    const last = f.state().events.at(-1).inputs;
    assert.ok(f.state().events.length > before);
    assert.deepEqual(last, [2, 0]);
  } finally { f.service.close(); }
});

function trafficFixture(count = 1) {
  let time = 0, membershipReads = 0;
  const registry = createClassroomRegistry();
  const stateFor = registry.stateFor;
  registry.stateFor = (...args) => { membershipReads++; return stateFor(...args); };
  const packets = [], players = Array.from({ length: count }, () => ({}));
  const service = createCampaignService({ registry, now: () => time,
    send(ws, packet) { packets.push({ ws, packet }); } });
  players.forEach((ws, i) => {
    registry.join(ws, 'PeriodB', 'p' + i, 'student', time);
    service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL });
  });
  time = 1500; service.tick();
  const epoch = packets.filter(item => item.ws === players[0]).at(-1).packet.epoch;
  packets.length = 0; membershipReads = 0;
  return { service, registry, players, packets, epoch,
    get membershipReads() { return membershipReads; },
    advance(ms) { time += ms; service.tick(); },
    input(bits) { service.handle(players[0], { type: 'campaign_input', epoch, bits }); },
  };
}

test('every simulation frame is published without repeating background membership work', () => {
  const f = trafficFixture(32);
  try {
    // Four teams; 1 ms test clock makes the cadence independent of OS timer jitter.
    for (let i = 0; i < 1000; i++) f.advance(1);
    const frames = f.packets.filter(item => item.ws === f.players[0]).map(item => item.packet);
    assert.equal(frames.length, 60);
    assert.equal(f.packets.length, 60 * 32);
    let received = 0;
    for (const packet of frames) {
      assert.equal(packet.type, 'campaign_frames');
      assert.equal(packet.from, received);
      assert.equal(packet.to - packet.from, 1);
      assert.deepEqual(packet.events, []);
      received = packet.to;
    }
    assert.equal(received, 60);
    assert.equal(f.membershipReads, 32, 'background identity validation runs once per second per connection');
  } finally { f.service.close(); }
});

test('input changes and reconnect snapshots retain the same immediate timeline', () => {
  const f = trafficFixture();
  try {
    f.advance(17);
    assert.equal(f.packets.length, 1);
    f.input(50); f.input(0); // quick right+jump and release, before another frame
    f.advance(17);
    const press = f.packets.at(-1).packet;
    assert.equal(press.type, 'campaign_frames');
    assert.equal(press.from, 1); assert.equal(press.to, 2);
    assert.deepEqual(press.events, [{ frame: 2, inputs: [32, 0] }]);
    f.advance(17);
    const release = f.packets.at(-1).packet;
    assert.equal(release.from, 2); assert.equal(release.to, 3);
    assert.deepEqual(release.events, [{ frame: 3, inputs: [0, 0] }]);
    f.advance(17); f.advance(17); // these frames have already been published
    f.service.handle(f.players[0], { type: 'campaign_resume', epoch: f.epoch, from: 2 });
    const resume = f.packets.at(-1).packet;
    assert.equal(resume.type, 'campaign_state'); assert.equal(resume.to, 5);
    assert.deepEqual(resume.events, [...press.events, ...release.events]);
    f.advance(17);
    const next = f.packets.at(-1).packet;
    assert.equal(next.from, 5); assert.equal(next.to, 6);
  } finally { f.service.close(); }
});

test('background membership validation still removes a socket moved to another class', () => {
  const f = trafficFixture();
  try {
    f.registry.join(f.players[0], 'PeriodC', 'p0', 'student', 1500);
    for (let i = 0; i < 1000; i++) f.advance(1);
    assert.deepEqual(f.service.occupants('PeriodB'), []);
  } finally { f.service.close(); }
});
