import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { earnCampaignKey, recordCalculatorPacket } from './campaign-access-fixture.mjs';

// Teacher 2026-10-07: keys are a spendable count and no longer gate the door (1-1 is always startable).
// A completed calculator round pays +1 key to every roster member; a teacher off the team earns none.
// (Teacher pushing is covered in teacher-player.test.mjs.)
test('calculator completion pays the locked team one key each; everyone may enter at 1-1; a teacher off the team earns none', t => {
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
        assert.deepEqual(packets.get(a).lobby.campaignKeys, {});
      }
    } });
  const join = ws => service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL, hasKey: true });
  try {
    for (const [ws, section, name, role] of [[a, 'B', 'a', 'student'], [b, 'E', 'b', 'student'],
      [teacher, 'X', 'teacher', 'teacher'], [outsider, 'C', 'other', 'student'], [late, 'B', 'late', 'student']]) {
      registry.join(ws, section, name, role, 0);
      assert.equal(join(ws), null, name + ' enters at 1-1 without a key');
      service.handle(ws, { type: 'campaign_leave' });
    }
    // The teacher stands in the room (not pushing), so is not on the team.
    service.handle(teacher, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      pose: { x: TEAM_BLOCK.start - 200, y: 676 }, pushing: false });
    earnCampaignKey(service, [a, b], packets, advance);
    assert.equal(partialCompletion, true);
    assert.deepEqual(packets.get(a).lobby.campaignKeyHolders, ['a', 'b']);
    assert.deepEqual(packets.get(a).lobby.campaignKeys, { a: 1, b: 1 }, 'one key each, paid once per round');
    advance(500);
    assert.deepEqual(packets.get(a).lobby.campaignKeys, { a: 1, b: 1 }, 'later ticks of the same round pay nothing more');
    for (const ws of [a, b, teacher, late]) assert.equal(join(ws), null, 'the door is open to everyone');
    const state = packets.get(a).state;
    service.handle(a, { type: 'calculator_restart', epoch: state.epoch, revision: state.revision });
    service.detached(a); registry.detach(a, clock);
    const reconnected = {}; registry.join(reconnected, 'B', 'a', 'student', clock);
    assert.equal(join(reconnected), null, 'reconnecting re-enters the campaign');
    assert.equal(packets.get(b).lobby.campaignKeys.a, 1, 'the earned key survives scene changes and reconnects');
    assert.equal(service.handle(reconnected, { type: 'campaign_join', protocol: 7 }).type, 'campaign_error',
      'old physics clients cannot join the corrected simulation');
    // Fidelity audit 2026-10-08: protocol 28 = batch 11 native breakout (27 batch 10 native walk / push speed, 26 batch 9 stacking / lift landing, 25 batch 8 world-5 mechanics, 24 batch 7 mechanics, 23 batch 6 mechanics, 22 batch 5 hazards, 21 MoveWall / lift step rollback, 20 batch 3 boxes and movers, 19 batch 2 geometry, 18 native 32 x 46 player body, 17 native WeightedLift, 16 native MoveWall + UpDownLift body, 15 descending lift stops on a cat,
    // 14 stack riding, 13 head-stack jump hand-off, 12 head-box rule, 11 Rect anchor, 10 boxes hold switches,
    // 9 the sky respawn). An older desk is told to reload.
    assert.equal(CAMPAIGN_PROTOCOL, 28);
    for (const protocol of [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]) {
      assert.deepEqual(service.handle(reconnected, { type: 'campaign_join', protocol }),
        { type: 'campaign_error', message: 'Reload the desk to enter the updated campaign.' });
    }
  } finally { service.close(); }
});
