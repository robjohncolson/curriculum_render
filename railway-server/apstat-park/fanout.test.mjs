import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

test('whole-class motion fanout excludes sender and teacher and stays bounded', t => {
  let clock = 0, downBytes = 0, upBytes = 0;
  const registry = createClassroomRegistry(), teacher = { name: 'teacher' };
  const players = Array.from({ length: 24 }, (_, i) => ({ name: `student${i}`, received: 0 }));
  const service = createParkService({ wallNow: () => 0, registry, now: () => clock, send: (ws, event) => {
    if (event.kind !== 'motion') return;
    assert.notEqual(ws, teacher);
    assert.notEqual(ws.name, event.member);
    ws.received++;
    downBytes += Buffer.byteLength(JSON.stringify(event));
  } });
  registry.join(teacher, 'room', teacher.name, 'teacher', 0);
  for (const player of players) registry.join(player, 'room', player.name, 'student', 0);
  const created = service.handle(players[0], { type: 'park_join', protocol: 3, clientId: 'client_student0' });
  assert.equal(created.type, 'park_result');
  for (const player of players) {
    const joined = service.handle(player, { type: 'park_join', protocol: 3, clientId: `client_${player.name}` });
    assert.equal(joined.type, 'park_result');
    player.streamId = joined.streamId;
  }
  for (let frame = 0; frame < 120; frame++) {
    clock = frame * 500;
    for (const player of players) {
      const packet = { type: 'park_motion', epoch: created.epoch, streamId: player.streamId, level: created.level.id, sequence: frame + 1,
        pose: { x: 60 + frame % 100 * 5, y: 146, vx: 220, vy: 0 } };
      upBytes += Buffer.byteLength(JSON.stringify(packet));
      assert.equal(service.handle(player, packet), null);
    }
  }
  for (const player of players) assert.equal(player.received, 23 * 120);
  assert.ok(upBytes / 24 < 26000);
  assert.ok(downBytes / 24 < 650000);
  t.diagnostic(JSON.stringify({ seconds: 60, players: 24, upstreamBytes: upBytes, fanoutBytes: downBytes,
    averageDownstreamBytesPerPlayerPerSecond: downBytes / 24 / 60,
    excludes: 'WebSocket framing, classroom heartbeats, status probes, startup and durable interactions' }));
  service.close();
});
