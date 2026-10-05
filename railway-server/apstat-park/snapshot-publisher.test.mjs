import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotPublisher } from './snapshot-publisher.mjs';
import { createCalculatorService } from './calculator-service.mjs';
import { createClassroomRegistry } from '../classroom.js';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';

test('unchanged snapshots suppress presence timestamps but retain clocks as recovery heartbeats', () => {
  let time = 0;
  const sent = [], ws = {}, publish = createSnapshotPublisher({ send: (_, packet) => sent.push(packet), now: () => time });
  for (time = 0; time < 10000; time += 100) publish(ws, { type: 'calculator_state', clock: time,
    revision: 0, members: [{ name: 'a', at: time, pose: { x: 65, y: 676 } }] });
  assert.equal(sent.length, 10);
  assert.equal(sent.at(-1).clock, 9000);
});

test('keys, membership, failure time, motion, epoch and backpressure all preserve delivery', () => {
  let time = 0;
  const sent = [], ws = {}, publish = createSnapshotPublisher({ send: (_, packet) => sent.push(packet), now: () => time });
  const base = { type: 'calculator_state', epoch: 'one', revision: 0, members: [] };
  const packets = [base, { ...base, revision: 1 }, { ...base, members: [{ name: 'a' }] },
    { ...base, failure: { at: 1 } }, { ...base, failure: { at: 2 } }, { ...base, epoch: 'two' }];
  for (const packet of packets) assert.equal(publish(ws, packet), true);
  ws.bufferedAmount = 40000;
  assert.equal(publish(ws, base), false);
  ws.bufferedAmount = 0;
  assert.equal(publish(ws, base), true);
  assert.equal(publish(ws, base), false);
  assert.equal(publish(ws, base, true), true);
  assert.equal(publish({}, base), true, 'new sockets always receive a snapshot');
});

test('30 idle students receive recovery snapshots without per-pose full roster echoes', () => {
  let time = 0, count = 0;
  const registry = createClassroomRegistry();
  const latest = new Map(), sockets = Array.from({ length: 30 }, () => ({}));
  const service = createCalculatorService({ registry, now: () => time, available: () => [DEFAULT_LEVEL],
    send(ws, packet) { if (packet.type === 'calculator_lobby_state') { latest.set(ws, packet); count++; } } });
  const lobby = (ws, i) => service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
    epoch: latest.get(ws)?.epoch, pose: { x: 65 + i, y: 676 }, pushing: false });
  try {
    sockets.forEach((ws, i) => { registry.join(ws, 'B', 'test-' + i, 'student', time); lobby(ws, i); });
    service.tick(); count = 0;
    for (time = 100; time <= 10000; time += 100) {
      sockets.forEach(lobby); // Also support old clients that still send 10 Hz.
      service.tick();
    }
    assert.equal(count, 300, '30 clients x 10 heartbeats, previously about 6000 roster packets');
    assert.equal(latest.get(sockets[0]).members.length, 30);
    time = 10100;
    service.handle(sockets[0], { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      epoch: latest.get(sockets[0]).epoch, pose: { x: 200, y: 676 } });
    service.tick();
    assert.equal(latest.get(sockets[29]).members.find(member => member.name === 'test-0').pose.x, 200);
    service.detached(sockets[0]);
    assert.equal(latest.get(sockets[29]).members.length, 29);
  } finally { service.close(); }
});
