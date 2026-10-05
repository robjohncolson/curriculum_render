import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';

function setup(t) {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map();
  const service = createParkService({ registry, now: () => time,
    calculatorOptions: { available: () => [] },
    send: (ws, packet) => { if (!packets.has(ws)) packets.set(ws, []); packets.get(ws).push(packet); } });
  t.after(() => service.close());
  function lobby(ws, rtc = true) {
    service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, rtc, pose: { x: 65, y: 676 } });
    return packets.get(ws).filter(packet => packet.type === 'calculator_lobby_state').at(-1);
  }
  function join(name, section = 'B', role = 'student', rtc = true) {
    const ws = { bufferedAmount: 0 };
    registry.join(ws, section, name, role, time);
    lobby(ws, rtc);
    return ws;
  }
  function relay(ws, snapshot, from, to, extra = {}) {
    service.handle(ws, { type: 'calculator_rtc_signal', epoch: snapshot.epoch, from, to,
      signal: { type: 'offer', sdp: 'test-sdp' }, ...extra });
  }
  const signals = ws => (packets.get(ws) || []).filter(packet => packet.type === 'calculator_rtc_signal');
  return { join, lobby, relay, signals, service, registry, clock: value => { time = value; } };
}

test('B/E and teacher X can signal; other classes, student X, and non-pilot clients cannot', t => {
  const f = setup(t);
  const a = f.join('alice'), b = f.join('bob', 'E'), teacher = f.join('teacher', 'X', 'teacher');
  const c = f.join('carol', 'C'), x = f.join('x-student', 'X'), legacy = f.join('legacy', 'B', 'student', false);
  const snapshot = f.lobby(a), [pa, pb, pt] = snapshot.rtcPeers;
  assert.deepEqual(snapshot.rtcPeers.map(peer => peer.name), ['alice', 'bob', 'teacher']);
  f.relay(a, snapshot, pa.id, pb.id);
  f.relay(teacher, snapshot, pt.id, pa.id);
  assert.equal(f.signals(b).length, 1);
  assert.equal(f.signals(a).length, 1);
  for (const ws of [c, x, legacy]) f.relay(ws, snapshot, pa.id, pb.id);
  assert.equal(f.signals(b).length, 1);
  assert.equal(f.lobby(legacy, false).members.length, 4, 'legacy clients retain ordinary server presence');
  assert.deepEqual(f.lobby(a).roster, [], 'signaling never creates a team');
});

test('signaling rejects spoofed senders, stale epochs, oversized data, and flood traffic', t => {
  const f = setup(t), a = f.join('alice'), b = f.join('bob');
  const snapshot = f.lobby(a), [pa, pb] = snapshot.rtcPeers;
  f.relay(a, snapshot, pb.id, pb.id);
  f.relay(a, snapshot, pa.id, pb.id, { epoch: 'old-round' });
  f.relay(a, snapshot, pa.id, pb.id, { signal: { type: 'offer', sdp: 'x'.repeat(17000) } });
  f.relay(a, snapshot, pa.id, pb.id, { signal: { type: 'calculator_press', key: 'ENTER' } });
  assert.equal(f.signals(b).length, 0);
  for (let i = 0; i < 100; i++) f.relay(a, snapshot, pa.id, pb.id);
  assert.ok(f.signals(b).length > 0 && f.signals(b).length <= 30);
  assert.deepEqual(Object.keys(f.signals(b)[0].signal).sort(), ['sdp', 'type']);
});

test('four-peer cap, opt-out, expiry, disconnect, and identity changes revoke signaling', t => {
  const f = setup(t);
  const sockets = Array.from({ length: 5 }, (_, i) => f.join('student-' + i));
  const snapshot = f.lobby(sockets[0]);
  assert.equal(snapshot.rtcPeers.length, 4);
  assert.ok(!snapshot.rtcPeers.some(peer => peer.name === 'student-4'));
  const [a, b] = snapshot.rtcPeers;
  f.lobby(sockets[1], false);
  f.relay(sockets[0], snapshot, a.id, b.id);
  assert.equal(f.signals(sockets[1]).length, 0);
  assert.ok(f.lobby(sockets[0]).rtcPeers.some(peer => peer.name === 'student-4'));
  f.registry.join(sockets[2], 'C', 'student-2', 'student', 0);
  assert.ok(!f.lobby(sockets[0]).rtcPeers.some(peer => peer.name === 'student-2'));
  f.service.detached(sockets[3]);
  assert.ok(!f.lobby(sockets[0]).rtcPeers.some(peer => peer.name === 'student-3'));
  f.clock(5001);
  assert.deepEqual(f.lobby(sockets[0]).rtcPeers.map(peer => peer.name), ['student-0']);
});
