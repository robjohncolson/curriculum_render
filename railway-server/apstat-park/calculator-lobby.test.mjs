import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { TEAM_BLOCK, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { ROUTE, SUMMARY } from './calculator-mission.mjs';

test('five pushers lock a five-person game; walk-ins and extra tabs cannot change it', () => {
  let now = 0;
  const registry = createClassroomRegistry(), lobbies = new Map(), states = new Map();
  const service = createCalculatorService({ registry, now: () => now, available: () => [DEFAULT_LEVEL], send(ws, packet) {
    (packet.type === 'calculator_state' ? states : lobbies).set(ws, packet);
  } });
  const players = Array.from({ length: 5 }, () => ({})), spectator = {}, duplicate = {};
  const lobby = (ws, x, pushing = false, ready = false) => service.handle(ws,
    { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, epoch: lobbies.get(ws)?.epoch,
      pose: { x, y: 676 }, pushing, ready, teamSize: 99 });
  try {
    for (const [i, ws] of players.entries()) registry.join(ws, 'B', 'player' + i, 'student', now);
    registry.join(spectator, 'B', 'spectator', 'student', now);
    registry.join(duplicate, 'B', 'player0', 'student', now);
    lobby(spectator, 1100);
    service.handle(spectator, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
    now = 20000; lobby(spectator, 1100); service.tick();
    assert.equal(states.size, 0, 'a walk-in cannot create a deadline even after 20 seconds');
    for (const ws of players) lobby(ws, TEAM_BLOCK.start - 20, true);
    lobby(duplicate, TEAM_BLOCK.start - 20, true);
    service.tick();
    assert.equal(lobbies.get(players[0]).pushers.length, 5);
    let x = lobbies.get(players[0]).blockX;
    for (let n = 0; n < 120 && x < TEAM_BLOCK.dock; n++) {
      for (const ws of players) lobby(ws, x - 20, true);
      lobby(spectator, 1100);
      now += 100; service.tick(); x = lobbies.get(players[0]).blockX;
    }
    assert.equal(x, TEAM_BLOCK.dock);
    assert.equal(lobbies.get(players[0]).roster.length, 5);
    assert.equal(states.size, 0, 'docking waits for everyone to see the keypad');
    for (const ws of players.slice(0, 4)) lobby(ws, x - 20, false, true);
    service.tick(); assert.equal(states.size, 0);
    lobby(players[4], x - 20, false, true); service.tick();
    for (const ws of players) {
      assert.equal(states.get(ws).teamSize, 5);
      assert.equal(states.get(ws).startedAt, now);
    }
    service.handle(spectator, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
    service.handle(spectator, { type: 'calculator_press', key: 'STAT', epoch: states.get(players[0]).epoch, revision: 0 });
    assert.equal(states.has(spectator), false);
    service.detached(players[4]);
    assert.equal(states.get(players[0]).teamSize, 5);
    assert.equal(states.get(players[0]).members.filter(member => member.online).length, 4);
    for (const ws of players.slice(0, 4)) for (const key of [...ROUTE, ...SUMMARY.map(String)]) {
      const state = states.get(ws);
      service.handle(ws, { type: 'calculator_press', key, epoch: state.epoch, revision: state.revision });
    }
    assert.equal(states.get(players[0]).readyCount, 4);
    assert.equal(states.get(players[0]).complete, false, 'four completions cannot finish a five-player round');
    service.handle(players[4], { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
    for (const key of [...ROUTE, ...SUMMARY.map(String)]) {
      const state = states.get(players[4]);
      service.handle(players[4], { type: 'calculator_press', key, epoch: state.epoch, revision: state.revision });
    }
    assert.equal(states.get(players[0]).complete, true);
    const state = states.get(players[0]);
    service.handle(players[0], { type: 'calculator_restart', epoch: state.epoch, revision: state.revision });
    assert.equal(lobbies.get(players[0]).phase, 'gathering');
    assert.equal(lobbies.get(players[0]).blockX, TEAM_BLOCK.start);
    assert.deepEqual(lobbies.get(players[0]).roster, []);
  } finally { service.close(); }
});
