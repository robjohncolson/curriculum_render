// Protocol 12 (APSTAT_PARK_TRAINER_ABSORB_SPEC §3): the solo room. One student, one round, the
// same clock, press judgement and clears as a team round; no block, no roster, no key yet (§6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService, DEATH_MS } from './calculator-service.mjs';
import { ROUND_MS, missionFor } from './calculator-mission.mjs';
import { DEFAULT_LEVEL, levelById, challengeFor, CALCULATOR_LEVELS } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { createCalculatorClears } from './calculator-clears.mjs';
import { createCampaignWallet } from './campaign-wallet.mjs';

function setup({ varyData = false, available = () => [DEFAULT_LEVEL] } = {}) {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map(), errors = [];
  const wallet = createCampaignWallet({ now: () => time, log: () => {} });
  const clears = createCalculatorClears({ now: () => time, log: () => {} });
  const service = createCalculatorService({ registry, now: () => time, available, varyData, wallet, clears, log: () => {},
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  function joinSolo(ws, name, extra = {}) {
    registry.join(ws, 'B', name, 'student', time);
    const reply = service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', ...extra });
    if (reply) errors.push(reply);
    return reply;
  }
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  const press = (ws, keys) => { for (const key of keys) send(ws, 'calculator_press', { key }); };
  const pose = ws => send(ws, 'calculator_pose', { pose: { x: 70, y: 676 }, ready: false });
  const solve = (ws) => {
    const level = missionFor(packets.get(ws));
    press(ws, [...level.route, ...challengeFor(level).answers.map(String)]);
  };
  return { service, registry, wallet, clears, joinSolo, send, press, pose, solve, errors,
    state: ws => packets.get(ws), lobby: ws => lobbies.get(ws), clock: value => { time = value; }, time: () => time };
}

test('a solo join starts a round on the pinned skill at once: roster of one, no block, state carries mode', () => {
  const f = setup();
  const ws = {};
  try {
    assert.equal(f.joinSolo(ws, 'alice', { skill: 'one-var-stats' }), null);
    const state = f.state(ws), lobby = f.lobby(ws);
    assert.equal(state.mode, 'solo');
    assert.equal(state.pinnedSkill, 'one-var-stats');
    assert.equal(levelById(state.missionId).skillId, 'one-var-stats', 'one of the skill\'s catalogue problems');
    assert.equal(state.teamSize, 1);
    assert.equal(state.readyCount, 0);
    assert.equal(state.step, 0);
    assert.equal(state.startedAt, 0, 'the clock starts at the join');
    assert.deepEqual(state.members.map(member => member.name), ['alice']);
    assert.equal(lobby.mode, 'solo');
    assert.equal(lobby.phase, 'active');
    assert.deepEqual(lobby.roster, ['alice']);
    assert.equal(lobby.blockX, TEAM_BLOCK.dock);
    assert.ok(Array.isArray(lobby.campaignOpen), 'the park door state still reaches a solo student');
  } finally { f.service.close(); }
});

test('solving the route alone completes the round, records one clear, and pays no key yet (§6 is Phase 4)', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    const level = missionFor(f.state(ws));
    f.press(ws, level.route);
    assert.equal(f.state(ws).step, level.route.length);
    assert.equal(f.state(ws).solved, false);
    f.press(ws, challengeFor(level).answers.map(String));
    const done = f.state(ws);
    assert.equal(done.solved, true);
    assert.equal(done.complete, true, 'a roster of one completes on its own solve');
    assert.equal(done.readyCount, 1);
    assert.equal(done.clears, 1, 'the completing packet already counts this clear');
    assert.equal(done.rung, 1);
    assert.equal(f.clears.clearsOf('B', 'alice', 'one-var-stats'), 1);
    assert.deepEqual(f.wallet.view('B').keys, {}, 'no key for a solo clear until Phase 4');
    f.service.tick();
    assert.equal(f.clears.clearsOf('B', 'alice', 'one-var-stats'), 1, 'the tick does not count it twice');
  } finally { f.service.close(); }
});

test('the next-skill door starts a fresh round on the same pinned skill without a rejoin', () => {
  const f = setup({ varyData: true });
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    f.solve(ws);
    assert.equal(f.state(ws).complete, true);
    const epoch = f.state(ws).epoch, previous = f.state(ws).missionId;
    f.send(ws, 'calculator_restart');
    const next = f.state(ws);
    assert.notEqual(next.epoch, epoch);
    assert.equal(next.pinnedSkill, 'one-var-stats');
    assert.equal(levelById(next.missionId).skillId, 'one-var-stats');
    assert.equal(next.step, 0);
    assert.equal(next.complete, false);
    assert.equal(next.teamSize, 1, 'the student is seated in the new round straight away');
    assert.notEqual(next.missionId, previous, 'the skill\'s next catalogue problem, never the same one twice');
    assert.equal(next.clears, 1, 'the clear from the first round follows the student');
  } finally { f.service.close(); }
});

test('the door cannot skip an unfinished round; a timeout restarts the solo calculator work', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    f.press(ws, ['STAT']);
    const epoch = f.state(ws).epoch;
    f.send(ws, 'calculator_restart');
    assert.equal(f.state(ws).epoch, epoch, 'the door waits for a clear');
    f.clock(ROUND_MS); f.pose(ws); f.service.tick();
    assert.equal(f.state(ws).failure.name, 'alice');
    f.clock(ROUND_MS + DEATH_MS); f.pose(ws); f.service.tick();
    assert.notEqual(f.state(ws).epoch, epoch);
    assert.equal(f.state(ws).step, 0);
    assert.equal(f.state(ws).resetReason.type, 'timeout');
    assert.equal(f.clears.clearsOf('B', 'alice', 'one-var-stats'), 0);
  } finally { f.service.close(); }
});

test('no skill: the section rotation picks; an unknown skill is ignored, not an error', () => {
  const f = setup({ available: () => [levelById('histogram'), levelById('scatterplot')] });
  const a = {}, b = {};
  try {
    assert.equal(f.joinSolo(a, 'alice'), null);
    assert.equal(f.state(a).pinnedSkill, null);
    assert.ok(['histogram', 'scatterplot'].includes(f.state(a).missionId));
    assert.equal(f.joinSolo(b, 'bob', { skill: 'not-a-skill' }), null);
    assert.equal(f.state(b).pinnedSkill, null);
    assert.ok(['histogram', 'scatterplot'].includes(f.state(b).missionId));
    assert.deepEqual(f.errors, []);
  } finally { f.service.close(); }
});

test('a bonus skill is reachable by deep link even when the rotation never offers it (teacher decision 4)', () => {
  const f = setup({ available: () => [DEFAULT_LEVEL] });
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', { skill: 'geometpdf' });
    assert.equal(f.state(ws).pinnedSkill, 'geometpdf');
    assert.equal(levelById(f.state(ws).missionId).skillId, 'geometpdf');
    assert.ok(CALCULATOR_LEVELS.some(level => level.skillId === 'geometpdf'));
  } finally { f.service.close(); }
});

test('rejoining keeps the round and its deadline; a different pinned skill starts over', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    f.clock(4000); f.press(ws, ['STAT', 'RIGHT']);
    const epoch = f.state(ws).epoch;
    f.service.detached(ws);
    f.clock(6000);
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    assert.equal(f.state(ws).epoch, epoch);
    assert.equal(f.state(ws).step, 2);
    assert.equal(f.state(ws).startedAt, 4000, 'a rejoin never renews the clock');
    f.joinSolo(ws, 'alice');
    assert.equal(f.state(ws).epoch, epoch, 'no skill resumes the round in progress');
    f.joinSolo(ws, 'alice', { skill: 'normalcdf' });
    assert.notEqual(f.state(ws).epoch, epoch);
    assert.equal(f.state(ws).pinnedSkill, 'normalcdf');
    assert.equal(f.state(ws).step, 0);
  } finally { f.service.close(); }
});

test('solo rooms are private: two students never share one, and the team room is untouched', () => {
  const f = setup();
  const a = {}, b = {}, c = {};
  try {
    f.joinSolo(a, 'alice', { skill: 'one-var-stats' });
    f.joinSolo(b, 'bob', { skill: 'one-var-stats' });
    const route = missionFor(f.state(a)).route;
    f.press(a, route);
    assert.equal(f.state(a).step, route.length);
    assert.equal(f.state(b).step, 0);
    assert.notEqual(f.state(a).epoch, f.state(b).epoch);
    assert.deepEqual(f.state(a).members.map(member => member.name), ['alice']);
    // A classmate at the team block sees a gathering team room, not anyone's solo round.
    f.registry.join(c, 'B', 'cara', 'student', f.time());
    f.service.handle(c, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
    assert.equal(f.lobby(c).mode, 'team');
    assert.equal(f.lobby(c).phase, 'gathering');
    assert.deepEqual(f.lobby(c).roster, []);
    const watched = f.service.watch('B');
    assert.deepEqual(watched.solo.map(solo => solo.name).sort(), ['alice', 'bob']);
    assert.equal(watched.solo.find(solo => solo.name === 'alice').state.step, route.length);
  } finally { f.service.close(); }
});

test('walking to the team block leaves the solo room; an empty solo room is dropped after 30 s', () => {
  const f = setup();
  const ws = {}, c = {};
  try {
    // watch() reports the section only while its team room is live (the spectator's contract).
    f.registry.join(c, 'B', 'cara', 'student', f.time());
    f.service.handle(c, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: 100, y: 676 }, pushing: false });
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    f.press(ws, ['STAT']);
    assert.equal(f.service.watch('B').solo.length, 1);
    f.service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
    assert.equal(f.lobby(ws).mode, 'team');
    assert.equal(f.service.watch('B').solo.length, 0, 'the solo member does not linger');
    f.clock(29000); f.service.tick();
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    assert.equal(f.state(ws).step, 1, 'a quick return finds the round where it was');
    f.service.detached(ws);
    f.clock(29000 + 31000); f.service.tick();
    f.joinSolo(ws, 'alice', { skill: 'one-var-stats' });
    assert.equal(f.state(ws).step, 0, 'after 30 s empty the room is gone and a new round starts');
  } finally { f.service.close(); }
});

test('an older client is told to reload', () => {
  const f = setup();
  const ws = {};
  try {
    f.registry.join(ws, 'B', 'alice', 'student', 0);
    const reply = f.service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL - 1, mode: 'solo', skill: 'one-var-stats' });
    assert.equal(reply.type, 'calculator_error');
    assert.match(reply.message, /Reload/);
  } finally { f.service.close(); }
});
