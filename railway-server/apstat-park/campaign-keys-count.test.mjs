// Teacher 2026-10-07 (PICO_DESK_SPEC.md "Campaign keys as a spendable count"): keys are a counter,
// spending one opens the next stage for the whole room, and a party may start a stage only when it
// is 1-1, or open AND every present member has cleared every stage before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCampaignService, CAMPAIGN_CLEAR_MS, CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { createCampaignWallet, stageLabel } from './campaign-wallet.mjs';
import { createParkService } from './service.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { earnCampaignKey, recordCalculatorPacket } from './campaign-access-fixture.mjs';

const S = 'PeriodB';

test('stage labels follow the 12 worlds x 4 stages order', () => {
  assert.equal(stageLabel(0), '1-1');
  assert.equal(stageLabel(1), '1-2');
  assert.equal(stageLabel(4), '2-1');
  assert.equal(stageLabel(47), '12-4');
});

test('an award adds one key per roster member, every time', () => {
  const wallet = createCampaignWallet();
  wallet.award(S, ['a', 'b']);
  wallet.award(S, ['a']);
  assert.deepEqual(wallet.view(S).keys, { a: 2, b: 1 });
  assert.equal(wallet.keysOf(S, 'a'), 2);
  assert.equal(wallet.keysOf(S, 'nobody'), 0);
});

test('opening spends one key and opens only the next stage for the room', () => {
  const wallet = createCampaignWallet();
  wallet.award(S, ['a', 'a2']);
  wallet.award(S, ['a']);
  assert.throws(() => wallet.open(S, 'a', 2), /Only the next stage \(1-2\)/, 'never further ahead');
  assert.throws(() => wallet.open(S, 'nokey', 1), /need a key/);
  assert.throws(() => wallet.open(S, 'a', 0), /already open/);
  assert.throws(() => wallet.open(S, 'a', 48), /Choose a stage/);
  assert.throws(() => wallet.open(S, 'a', '1'), /Choose a stage/);
  wallet.open(S, 'a', 1);
  assert.deepEqual(wallet.view(S).open, [0, 1]);
  assert.deepEqual(wallet.view(S).keys, { a: 1, a2: 1 }, 'exactly one key spent');
  assert.throws(() => wallet.open(S, 'a2', 1), /already open/, 'opening is permanent; a second key is not taken');
  assert.equal(wallet.keysOf(S, 'a2'), 1);
  wallet.open(S, 'a2', 2);
  assert.deepEqual(wallet.view(S).keys, { a: 1 }, 'a zero count is not listed');
  assert.deepEqual(wallet.view(S).open, [0, 1, 2]);
  assert.deepEqual(wallet.view('PeriodE').open, [0], 'open stages are per park room');
});

test('startable: 1-1 always; otherwise open AND every present member cleared the stages before it', () => {
  const wallet = createCampaignWallet();
  wallet.award(S, ['a']);
  assert.equal(wallet.startable(S, ['new'], 0), true, '1-1 always');
  assert.equal(wallet.startable(S, ['a'], 1), false, 'not open');
  assert.match(wallet.blocked(S, ['a'], 1), /1-2 is not open yet/);
  wallet.open(S, 'a', 1);
  assert.equal(wallet.startable(S, ['a'], 1), false, 'open, but a has not cleared 1-1');
  wallet.recordClear(S, ['a', 'b'], 0);
  assert.equal(wallet.startable(S, ['a', 'b'], 1), true, 'spec example: everyone cleared 1-1, 1-2 opened');
  assert.equal(wallet.startable(S, ['a', 'b', 'c'], 1), false, 'one member missing a clear blocks the group');
  assert.match(wallet.blocked(S, ['a', 'b', 'c'], 1), /Still needed: c \(1-1\)/);
  assert.equal(wallet.startable(S, ['a', 'b', 'c'], 0), true, 'the group can always start at 1-1');
  assert.deepEqual(wallet.startableList(S, ['a', 'b']), [0, 1]);
  assert.deepEqual(wallet.startableList(S, ['a', 'b', 'c']), [0]);
  assert.equal(wallet.startable(S, ['a', 'b'], 2), false, 'nobody starts 1-3 before it is open');
  assert.equal(wallet.blocked(S, ['a', 'b'], 1), null);
  assert.deepEqual(wallet.view(S).cleared, { a: [0], b: [0] });
});

// Campaign service with a wallet, on a manual clock.
function fixture(names = ['p0', 'p1'], wallet = createCampaignWallet()) {
  let time = 0;
  const registry = createClassroomRegistry(), messages = new Map(), all = new Map();
  const service = createCampaignService({ registry, wallet, now: () => time, send(ws, packet) {
    messages.set(ws, packet);
    if (!all.has(ws)) all.set(ws, []);
    all.get(ws).push(packet);
  } });
  const players = names.map(name => { const ws = { name }; registry.join(ws, S, name, 'student', 0); return ws; });
  const join = (ws, extra = {}) => service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL, ...extra });
  const state = ws => {
    const last = [...(all.get(ws) || [])].reverse().find(packet => packet.type === 'campaign_state');
    service.handle(ws, { type: 'campaign_resume', epoch: last.epoch, from: 0 });
    return messages.get(ws);
  };
  const advance = ms => { time += ms; service.tick(); };
  function clearStage(team) {
    advance(50);
    const { epoch, to } = state(team[0]);
    for (const ws of team) service.handle(ws, { type: 'campaign_clear', epoch, frame: to });
  }
  return { service, wallet, players, join, state, advance, clearStage, messages, all };
}

test('campaign_join {stage} is checked by the relay; a mixed party is blocked by one missing clear', () => {
  const f = fixture(['p0', 'p1', 'p2']);
  const [p0, p1, p2] = f.players;
  try {
    f.wallet.award(S, ['p0']);
    assert.match(f.join(p0, { stage: 1 }).message, /1-2 is not open yet/);
    assert.match(f.join(p0, { stage: 99 }).message, /Choose a stage/);
    assert.equal(f.service.handle(p0, { type: 'campaign_open_stage', stage: 1 }).type, 'campaign_progress');
    assert.match(f.join(p0, { stage: 1 }).message, /Still needed: p0 \(1-1\)/, 'opening does not skip your own clear');
    f.wallet.recordClear(S, ['p0', 'p1'], 0);
    assert.equal(f.join(p0, { stage: 1 }), null);
    assert.equal(f.state(p0).stageIndex, 1);
    assert.equal(f.join(p1, { stage: 1 }), null, 'p1 has cleared 1-1 too');
    const refused = f.join(p2, { stage: 1 });
    assert.equal(refused.type, 'campaign_error');
    assert.match(refused.message, /Still needed: .*p2 \(1-1\)/);
    assert.equal(f.join(p2, { stage: 0 }), null, '1-1 is always startable: p2 gets a team of their own');
    assert.notEqual(f.state(p2).team, f.state(p0).team);
    assert.equal(f.state(p2).stageIndex, 0);
    f.advance(1500);
    assert.deepEqual(f.state(p0).roster, ['p0', 'p1']);
  } finally { f.service.close(); }
});

test('a team that clears into a locked stage goes to the stage select; a key opens it and play resumes', () => {
  const f = fixture(['p0', 'p1']);
  const [p0, p1] = f.players;
  try {
    f.wallet.award(S, ['p1']);
    f.join(p0, { stage: 0 }); f.join(p1, { stage: 0 }); f.advance(1500);
    assert.deepEqual(f.state(p0).roster, ['p0', 'p1']);
    f.clearStage([p0, p1]);
    assert.deepEqual(f.wallet.view(S).cleared, { p0: [0], p1: [0] }, 'the clear is recorded for every roster member');
    f.advance(CAMPAIGN_CLEAR_MS);
    const selecting = f.state(p0);
    assert.equal(selecting.phase, 'select');
    assert.equal(selecting.stageIndex, 0);
    assert.match(selecting.reason, /1-2 is locked/);
    assert.deepEqual(selecting.progress.startable, [0]);
    f.advance(5000);
    assert.equal(f.state(p0).phase, 'select', 'nothing is simulated at the stage select');
    assert.match(f.join(p0, { stage: 1 }).message, /not open yet/);
    const opened = f.service.handle(p1, { type: 'campaign_open_stage', stage: 1 });
    assert.deepEqual(opened.startable, [0, 1]);
    assert.deepEqual(opened.keys, {});
    assert.equal(f.messages.get(p0).type, 'campaign_progress', 'the team hears the stage open');
    assert.equal(f.join(p0, { stage: 1 }), null, 'any member chooses for the team');
    const playing = f.state(p1);
    assert.equal(playing.phase, 'playing');
    assert.equal(playing.stageIndex, 1);
    assert.deepEqual(playing.roster, ['p0', 'p1']);
  } finally { f.service.close(); }
});

test('an open next stage is entered straight after the clear, as before', () => {
  const f = fixture(['p0']);
  const [p0] = f.players;
  try {
    f.wallet.award(S, ['p0']);
    f.service.handle(p0, { type: 'campaign_open_stage', stage: 1 });
    f.join(p0); f.advance(1500);
    f.clearStage([p0]);
    f.advance(CAMPAIGN_CLEAR_MS);
    assert.equal(f.state(p0).phase, 'playing');
    assert.equal(f.state(p0).stageIndex, 1);
  } finally { f.service.close(); }
});

test('a newcomer must pick the stage their team is playing, or gets a team of their own', () => {
  const f = fixture(['p0', 'p1']);
  const [p0, p1] = f.players;
  try {
    f.wallet.award(S, ['p0']);
    f.service.handle(p0, { type: 'campaign_open_stage', stage: 1 });
    f.wallet.recordClear(S, ['p0', 'p1'], 0);
    f.join(p0, { stage: 1 }); f.advance(1500);
    const peek = f.service.handle(p1, { type: 'campaign_select' });
    assert.deepEqual(peek.team, { stageIndex: 1, phase: 'playing', roster: ['p0'] });
    assert.deepEqual(peek.party, ['p0', 'p1']);
    assert.deepEqual(peek.startable, [0, 1]);
    assert.equal(f.join(p1, { stage: 0 }), null);
    assert.notEqual(f.state(p1).team, f.state(p0).team, 'a different stage is a different team');
    f.service.handle(p1, { type: 'campaign_leave' });
    assert.equal(f.join(p1, { stage: 1 }), null);
    assert.equal(f.state(p1).team, f.state(p0).team);
    assert.deepEqual(f.state(p1).waiting, ['p1'], 'joins the playing team as a late arrival');
  } finally { f.service.close(); }
});

test('a bound player cannot switch a playing team to another stage', () => {
  const f = fixture(['p0', 'p1']);
  const [p0, p1] = f.players;
  try {
    f.join(p0); f.join(p1); f.advance(1500);
    const error = f.join(p0, { stage: 1 });
    assert.equal(error.type, 'campaign_error');
    assert.match(error.message, /Your team is playing 1-1/);
  } finally { f.service.close(); }
});

// The fields older desks read: never removed or reshaped.
const OLD_STATE_FIELDS = ['type', 'protocol', 'team', 'epoch', 'stageIndex', 'lap', 'seed', 'roster', 'helpers', 'waiting',
  'phase', 'reason', 'from', 'to', 'events', 'more'];
const OLD_LOBBY_FIELDS = ['type', 'protocol', 'epoch', 'campaignKeyHolders', 'missionId', 'eligibleCount', 'phase', 'blockX',
  'pushers', 'roster', 'members', 'rtcPeers'];

test('message shapes are additive: old campaign_state and lobby fields are unchanged', t => {
  const f = fixture(['p0']);
  try {
    f.join(f.players[0]); f.advance(1500);
    const state = f.state(f.players[0]);
    assert.deepEqual(Object.keys(state).slice(0, OLD_STATE_FIELDS.length), OLD_STATE_FIELDS);
    assert.deepEqual(Object.keys(state).slice(OLD_STATE_FIELDS.length), ['progress']);
    assert.deepEqual(Object.keys(state.progress), ['keys', 'cleared', 'open', 'party', 'startable']);
    assert.ok(Array.isArray(state.helpers) && Array.isArray(state.waiting) && Array.isArray(state.events));
  } finally { f.service.close(); }

  t.mock.timers.enable({ apis: ['setInterval'] });
  let clock = 0;
  const advance = ms => { clock += ms; t.mock.timers.tick(ms); };
  const registry = createClassroomRegistry(), packets = new Map();
  const service = createParkService({ registry, now: () => clock, calculatorOptions: { available: () => [DEFAULT_LEVEL], log: () => {} },
    send(ws, packet) { recordCalculatorPacket(packets, ws, packet); } });
  const a = {}, b = {};
  try {
    registry.join(a, 'B', 'a', 'student', 0);
    registry.join(b, 'E', 'b', 'student', 0);
    service.handle(a, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: TEAM_BLOCK.start - 200, y: 676 } });
    const before = packets.get(a).lobby;
    assert.deepEqual(Object.keys(before).filter(key => OLD_LOBBY_FIELDS.includes(key)), OLD_LOBBY_FIELDS);
    assert.deepEqual(Object.keys(before).filter(key => !OLD_LOBBY_FIELDS.includes(key)), ['campaignKeys', 'campaignCleared', 'campaignOpen']);
    assert.deepEqual([before.campaignKeyHolders, before.campaignKeys, before.campaignCleared, before.campaignOpen], [[], {}, {}, [0]]);
    earnCampaignKey(service, [a, b], packets, advance);
    advance(100);
    const after = packets.get(a).lobby;
    assert.deepEqual(after.campaignKeyHolders, ['a', 'b'], 'still a list of names: the players holding a key');
    assert.deepEqual(after.campaignKeys, { a: 1, b: 1 });
  } finally { service.close(); }
});

test('two completed rounds pay two keys; the park room is shared by B and E', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let clock = 0;
  const advance = ms => { clock += ms; t.mock.timers.tick(ms); };
  const registry = createClassroomRegistry(), packets = new Map();
  const service = createParkService({ registry, now: () => clock, calculatorOptions: { available: () => [DEFAULT_LEVEL], log: () => {} },
    send(ws, packet) { recordCalculatorPacket(packets, ws, packet); } });
  const a = {}, b = {};
  try {
    registry.join(a, 'B', 'a', 'student', 0);
    registry.join(b, 'E', 'b', 'student', 0);
    earnCampaignKey(service, [a, b], packets, advance);
    const state = packets.get(a).state;
    service.handle(a, { type: 'calculator_restart', epoch: state.epoch, revision: state.revision });
    advance(100);
    earnCampaignKey(service, [a, b], packets, advance);
    advance(100);
    assert.deepEqual(packets.get(b).lobby.campaignKeys, { a: 2, b: 2 });
    const opened = service.handle(b, { type: 'campaign_open_stage', stage: 1 });
    assert.deepEqual(opened.keys, { a: 2, b: 1 });
    advance(100);
    assert.deepEqual(packets.get(a).lobby.campaignOpen, [0, 1], 'Period B sees the stage Period E opened');
    assert.deepEqual(packets.get(a).lobby.campaignKeys, { a: 2, b: 1 });
  } finally { service.close(); }
});
