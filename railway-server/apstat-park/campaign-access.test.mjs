import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { earnCampaignKey, recordCalculatorPacket } from './campaign-access-fixture.mjs';

// Teacher decision 2026-10-06: one key rule for everyone. A teacher who was not on the team holds no key
// and cannot enter just because some student holds one. (Teacher pushing is covered in teacher-player.test.mjs.)
test('calculator completion awards the locked team campaign access; a teacher off the team holds no key', t => {
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
    // The teacher stands in the room (not pushing), so is not on the team.
    service.handle(teacher, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      pose: { x: TEAM_BLOCK.start - 200, y: 676 }, pushing: false });
    earnCampaignKey(service, [a, b], packets, advance);
    assert.equal(partialCompletion, true);
    assert.deepEqual(packets.get(a).lobby.campaignKeyHolders, ['a', 'b']);
    for (const ws of [a, b]) assert.equal(join(ws), null);
    for (const ws of [teacher, outsider, late]) assert.equal(join(ws).type, 'campaign_error');
    const state = packets.get(a).state;
    service.handle(a, { type: 'calculator_restart', epoch: state.epoch, revision: state.revision });
    service.detached(a); registry.detach(a, clock);
    const reconnected = {}; registry.join(reconnected, 'B', 'a', 'student', clock);
    assert.equal(join(reconnected), null, 'earned key survives scene changes and reconnects in this room session');
    assert.equal(service.handle(reconnected, { type: 'campaign_join', protocol: 7 }).type, 'campaign_error',
      'old physics clients cannot join the corrected simulation');
    // Teacher 2026-10-07: protocol 13 = head-stack jump hand-off (12 head-box rule, 11 Rect anchor,
    // 10 boxes hold switches, 9 the sky respawn). An older desk is told to reload.
    assert.equal(CAMPAIGN_PROTOCOL, 13);
    for (const protocol of [8, 9, 10, 11, 12]) {
      assert.deepEqual(service.handle(reconnected, { type: 'campaign_join', protocol }),
        { type: 'campaign_error', message: 'Reload the desk to enter the updated campaign.' });
    }
  } finally { service.close(); }
});
