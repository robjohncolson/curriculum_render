// Test fixture: earn access through the real block, calculator and answer handlers.
import assert from 'node:assert/strict';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { ROUTE, SUMMARY } from './calculator-mission.mjs';

export function earnCampaignKey(service, sockets, packets, advance) {
  const approach = (ws, x, pushing, ready = false) => {
    const lobby = packets.get(ws)?.lobby;
    service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      epoch: lobby?.epoch, pose: { x, y: 676 }, pushing, ready });
  };
  for (let i = 0; i < 120; i++) {
    sockets.forEach((ws, index) => approach(ws, (packets.get(ws)?.lobby?.blockX ?? TEAM_BLOCK.start) - 20 - index * 20, true));
    advance(100);
    if (packets.get(sockets[0]).lobby.phase !== 'gathering') break;
  }
  for (const ws of sockets) approach(ws, TEAM_BLOCK.dock - 20, false, true);
  advance(100);
  for (const ws of sockets) {
    for (const key of [...ROUTE, ...SUMMARY.map(String)]) {
      const state = packets.get(ws).state;
      assert.ok(state, 'assembled team receives its calculator state');
      service.handle(ws, { type: 'calculator_press', epoch: state.epoch, revision: state.revision, key });
    }
  }
  assert.ok(packets.get(sockets[0]).state.complete, 'the real activity awards access');
}

export function recordCalculatorPacket(packets, ws, packet) {
  const current = packets.get(ws) || {};
  if (packet.type === 'calculator_lobby_state') current.lobby = packet;
  if (packet.type === 'calculator_state') current.state = packet;
  packets.set(ws, current);
}
