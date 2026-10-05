import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { createCalculatorService } from './calculator-service.mjs';
import { createParkRegistry, eligibleParkLevels, SHARED_PARK } from './shared-classroom.mjs';
import { DEFAULT_LEVEL, eligibleLevels } from './calculator-curriculum.mjs';
import { TEAM_BLOCK, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { ROUTE, SUMMARY } from './calculator-mission.mjs';

test('B and E share campaign inputs, calculator lobby, and teacher view; other classes stay separate', async () => {
  const registry = createClassroomRegistry(), sent = new Map();
  const service = createParkService({ registry, send: (ws, packet) => sent.set(ws, packet) });
  const b = {}, e = {}, x = {}, teacher = {};
  try {
    for (const [ws, section, username, role] of [[b, 'PeriodB', 'bee', 'student'], [e, 'PeriodE', 'eve', 'student'],
      [x, 'PeriodX', 'ex', 'student'], [teacher, 'PeriodB', 'teacher', 'teacher']]) registry.join(ws, section, username, role, 0);
    for (const ws of [b, e, x]) service.handle(ws, { type: 'campaign_join', protocol: 6, section: 'PeriodB' });
    await new Promise(resolve => setTimeout(resolve, 1600));
    const view = service.handle(teacher, { type: 'park_watch' });
    assert.deepEqual(view.campaign.state.roster, ['bee', 'eve']);
    assert.equal(view.gameLabel, 'B + E shared park');
    assert.equal(view.section, 'PeriodB');
    const epoch = view.campaign.state.epoch;
    service.handle(b, { type: 'campaign_input', epoch, bits: 2 });
    service.handle(e, { type: 'campaign_input', epoch, bits: 1 });
    await new Promise(resolve => setTimeout(resolve, 40));
    service.handle(e, { type: 'campaign_resume', epoch, from: 0 });
    assert.ok(sent.get(e).events.some(event => event.inputs[0] === 2 && event.inputs[1] === 1));
    assert.deepEqual(service.handle(x, { type: 'park_lobby' }).campaign.online, ['ex']);
    registry.join(teacher, 'PeriodE', 'teacher', 'teacher', 1);
    assert.equal(service.handle(teacher, { type: 'park_watch' }).campaign.state.epoch, epoch);
    for (const ws of [b, e]) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: 65, y: 676 } });
    assert.equal(sent.get(b).epoch, sent.get(e).epoch);
    assert.deepEqual(sent.get(e).members.map(member => member.name), ['bee', 'eve']);
    assert.equal(registry._wsEntry(b).section, 'PeriodB');
    assert.equal(registry._wsEntry(e).section, 'PeriodE');
    assert.deepEqual(registry.stateFor('PeriodB', 'student', 'bee').members.filter(member => member.role === 'student').map(member => member.username), ['bee']);
    assert.deepEqual(registry.stateFor('PeriodE', 'student', 'eve').members.filter(member => member.role === 'student').map(member => member.username), ['eve']);
    registry.join(teacher, 'PeriodB', 'teacher', 'teacher', 2);
    registry.armGate(teacher, 'test', 2);
    assert.equal(registry.stateFor('PeriodB').gate.armed, true);
    assert.ok(!registry.stateFor('PeriodE').gate?.armed);
    const forged = {}; registry.join(forged, SHARED_PARK, 'forged', 'student', 0);
    assert.equal(service.handle(forged, { type: 'campaign_join', protocol: 6 }).type, 'campaign_error');
  } finally { service.close(); }
});

test('a mixed calculator team locks both students and requires both completions', () => {
  let time = 0;
  const registry = createClassroomRegistry(), lobby = new Map(), states = new Map();
  const b = {}, e = {};
  const service = createCalculatorService({ registry: createParkRegistry(registry), now: () => time,
    available: () => [DEFAULT_LEVEL], send(ws, packet) {
      (packet.type === 'calculator_state' ? states : lobby).set(ws, packet);
    } });
  function approach(ws, x, pushing = true, ready = false) {
    service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      epoch: lobby.get(ws)?.epoch, pose: { x, y: 676 }, pushing, ready });
  }
  try {
    registry.join(b, 'PeriodB', 'bee', 'student', 0);
    registry.join(e, 'PeriodE', 'eve', 'student', 0);
    let x = TEAM_BLOCK.start;
    for (let i = 0; i < 120 && x < TEAM_BLOCK.dock; i++) {
      approach(b, x - 20); approach(e, x - 20); time += 100; service.tick(); x = lobby.get(b).blockX;
    }
    assert.equal(x, TEAM_BLOCK.dock);
    assert.deepEqual(lobby.get(b).roster, ['bee', 'eve']);
    approach(b, x - 20, false, true); approach(e, x - 20, false, true); service.tick();
    for (const ws of [b, e]) assert.equal(states.get(ws).teamSize, 2);
    for (const ws of [b, e]) {
      for (const key of [...ROUTE, ...SUMMARY.map(String)]) {
        const state = states.get(ws);
        service.handle(ws, { type: 'calculator_press', epoch: state.epoch, revision: state.revision, key });
      }
      assert.equal(states.get(b).complete, ws === e);
    }
  } finally { service.close(); }
});

test('shared skills are the intersection of taught skills and gameplay exposes no classroom answers', () => {
  for (const date of ['2026-09-01', '2026-09-15', '2026-10-05', '2027-05-01']) {
    const e = new Set(eligibleLevels('PeriodE', date).map(level => level.id));
    assert.deepEqual(eligibleParkLevels(SHARED_PARK, date).map(level => level.id),
      eligibleLevels('PeriodB', date).filter(level => e.has(level.id)).map(level => level.id));
  }
  const adapter = createParkRegistry({ stateFor: () => ({ members: [{ username: 'bee', role: 'student',
    online: true, hue: 90, pos: null, vote: 'private answer', realName: 'Private Name', grade: 95 }] }) });
  assert.deepEqual(Object.keys(adapter.stateFor(SHARED_PARK).members[0]).sort(), ['hue', 'online', 'pos', 'role', 'username']);
});
