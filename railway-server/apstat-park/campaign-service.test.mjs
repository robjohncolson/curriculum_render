import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCampaignService, CAMPAIGN_CLEAR_MS } from './campaign-service.mjs';

function fixture(count = 2) {
  let time = 0;
  const registry = createClassroomRegistry(), messages = new Map(), players = Array.from({ length: count }, () => ({}));
  const service = createCampaignService({ registry, now: () => time, send(ws, packet) { messages.set(ws, packet); } });
  players.forEach((ws, i) => registry.join(ws, 'PeriodB', 'p' + i, 'student', time));
  const join = ws => service.handle(ws, { type: 'campaign_join', protocol: 1 });
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
    assert.equal(f.service.handle({}, { type: 'campaign_join', protocol: 1 }).type, 'campaign_error');
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
