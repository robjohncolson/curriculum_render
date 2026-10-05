import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { earnCampaignKey, recordCalculatorPacket } from './campaign-access-fixture.mjs';

test('calculator completion awards the locked team campaign access; teachers cannot push or grant access', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let clock = 0, partialCompletion = false;
  const advance = ms => { clock += ms; t.mock.timers.tick(ms); };
  const registry = createClassroomRegistry(), packets = new Map();
  const a = {}, b = {}, teacher = {}, outsider = {}, late = {};
  const service = createParkService({ registry, now: () => clock,
    calculatorOptions: { available: () => [DEFAULT_LEVEL] }, send(ws, packet) {
      recordCalculatorPacket(packets, ws, packet);
      if (ws === a && packet.type === 'calculator_state' && packet.solved && !packet.complete) {
        partialCompletion = true;
        assert.deepEqual(packets.get(a).lobby.campaignKeyHolders, []);
      }
    } });
  const join = ws => service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL, hasKey: true });
  try {
    for (const [ws, section, name, role] of [[a, 'B', 'a', 'student'], [b, 'E', 'b', 'student'],
      [teacher, 'X', 'teacher', 'teacher'], [outsider, 'C', 'other', 'student'], [late, 'B', 'late', 'student']]) {
      registry.join(ws, section, name, role, 0);
      assert.equal(join(ws).type, 'campaign_error');
    }
    for (let i = 0; i < 20; i++) {
      service.handle(teacher, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
        pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
      advance(100);
    }
    assert.equal(packets.get(teacher).lobby.blockX, TEAM_BLOCK.start);
    assert.deepEqual(packets.get(teacher).lobby.pushers, []);
    earnCampaignKey(service, [a, b], packets, advance);
    assert.equal(partialCompletion, true);
    assert.deepEqual(packets.get(a).lobby.campaignKeyHolders, ['a', 'b']);
    for (const ws of [a, b, teacher]) assert.equal(join(ws), null);
    for (const ws of [outsider, late]) assert.equal(join(ws).type, 'campaign_error');
    const state = packets.get(a).state;
    service.handle(a, { type: 'calculator_restart', epoch: state.epoch, revision: state.revision });
    service.detached(a); registry.detach(a, clock);
    const reconnected = {}; registry.join(reconnected, 'B', 'a', 'student', clock);
    assert.equal(join(reconnected), null, 'earned key survives scene changes and reconnects in this room session');
    assert.equal(service.handle(reconnected, { type: 'campaign_join', protocol: 7 }).type, 'campaign_error',
      'old physics clients cannot join the corrected simulation');
  } finally { service.close(); }
});
