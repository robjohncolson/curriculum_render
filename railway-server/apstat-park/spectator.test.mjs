import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

test('watching is read-only, teacher-only, and scoped to the joined class', async () => {
  const registry = createClassroomRegistry(), sent = [];
  const service = createParkService({ registry, send: (ws, packet) => sent.push({ ws, packet }) });
  const teacher = {}, alice = {}, other = {};
  try {
    assert.equal(service.handle(teacher, { type: 'park_watch' }).type, 'park_error');
    registry.join(teacher, 'B', 'teacher', 'teacher', 0);
    let view = service.handle(teacher, { type: 'park_watch' });
    assert.deepEqual(view.campaign.teams, []);
    assert.equal(view.calculator, null);
    registry.join(alice, 'B', 'alice', 'student', 0);
    registry.join(other, 'C', 'other', 'student', 0);
    assert.equal(service.handle(alice, { type: 'park_watch' }).type, 'park_error');
    service.handle(alice, { type: 'campaign_join', protocol: 6 });
    service.handle(other, { type: 'campaign_join', protocol: 6 });
    await new Promise(resolve => setTimeout(resolve, 1600));
    const before = service.handle(teacher, { type: 'park_watch' }).campaign.state;
    for (let i = 0; i < 10; i++) {
      view = service.handle(teacher, { type: 'park_watch', section: 'C', team: 'forged' });
      assert.deepEqual(view.campaign.state.roster, ['alice']);
      assert.equal(view.campaign.state.epoch, before.epoch);
      assert.deepEqual(view.students.map(member => member.username), ['alice']);
    }
    assert.deepEqual(service.handle(alice, { type: 'park_lobby' }).campaign.online, ['alice']);
    assert.equal(sent.filter(row => row.ws === teacher).length, 0);
    registry.join(teacher, 'C', 'teacher', 'teacher', 1);
    view = service.handle(teacher, { type: 'park_watch', team: before.team, epoch: before.epoch, from: 999 });
    assert.deepEqual(view.campaign.state.roster, ['other']);
    assert.equal(view.campaign.state.from, 0);
    assert.notEqual(view.campaign.state.epoch, before.epoch);
  } finally { service.close(); }
});

test('watching a calculator lobby never adds a teacher or starts an attempt', () => {
  const registry = createClassroomRegistry(), sent = [];
  const service = createParkService({ registry, send: (ws, packet) => sent.push({ ws, packet }) });
  const teacher = {}, alice = {};
  try {
    registry.join(teacher, 'B', 'teacher', 'teacher', 0);
    registry.join(alice, 'B', 'alice', 'student', 0);
    service.handle(alice, { type: 'calculator_lobby', protocol: 8, pose: { x: 65, y: 676 } });
    const view = service.handle(teacher, { type: 'park_watch' });
    assert.ok(view.calculator);
    assert.deepEqual(view.calculator.members, []);
    assert.deepEqual(view.calculator.lobby.roster, []);
    assert.deepEqual(view.calculator.lobby.members.map(member => member.name), ['alice']);
  } finally { service.close(); }
});
