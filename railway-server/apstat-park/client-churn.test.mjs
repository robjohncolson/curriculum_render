import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';

test('closed tabs can be replaced repeatedly; reclaimed clients safely retry saved and pending actions', () => {
  const registry = createClassroomRegistry(), teacher = {}, student = {};
  registry.join(teacher, 'a', 'teacher', 'teacher', 0);
  registry.join(student, 'a', 'alice', 'student', 0);
  const service = createParkService({ registry, send() {} });
  service.handle(teacher, { type: 'park_start', groupId: 'one', members: ['alice'] });
  const join = id => service.handle(student, { type: 'park_join', clientId: id });
  const first = join('browser_original');
  service.handle(teacher, { type: 'park_run', groupId: 'one', running: true });
  const replica = new ParkReplica(); replica.resume(join('browser_original'));
  const station = first.level.switches[0];
  replica.queue('switch', station.id, { x: station.x, y: station.y, vx: 0, vy: 0 });
  const oldPacket = replica.outgoing({ connected: true })[0];
  const lostReceipt = service.handle(student, oldPacket);
  assert.equal(lostReceipt.status, 'accepted');
  replica.queue('arrive', 'exit', { x: 1200, y: 520, vx: 0, vy: 0 });
  for (let i = 0; i < 30; i++) {
    service.detached(student);
    assert.equal(join(`browser_new_${i}`).type, 'park_result');
  }
  service.detached(student);
  const returned = join('browser_original');
  assert.notEqual(returned.streamId, first.streamId);
  replica.resume(returned);
  assert.equal(service.handle(student, oldPacket).code, 'PARK_STREAM_CHANGED');
  replica.acknowledge(lostReceipt);
  assert.equal(replica.outbox.length, 2, 'old receipt cannot remove a new intent');
  for (let i = 0; i < 2; i++) {
    const packet = replica.outgoing({ connected: true })[0];
    const receipt = service.handle(student, packet);
    assert.equal(receipt.status, 'accepted');
    replica.acknowledge(receipt);
    replica.resume(join('browser_original'));
  }
  assert.equal(replica.outbox.length, 0);
  assert.deepEqual(replica.state.progress.switches, [station.id]);
  assert.deepEqual(replica.state.progress.arrived, ['alice']);
  service.close();
});

test('four active tabs retain their slots; leaving one permits a replacement', () => {
  const registry = createClassroomRegistry(), teacher = {}, sockets = Array.from({ length: 5 }, () => ({}));
  registry.join(teacher, 'a', 'teacher', 'teacher', 0);
  for (const socket of sockets) registry.join(socket, 'a', 'alice', 'student', 0);
  const service = createParkService({ registry, send() {} });
  service.handle(teacher, { type: 'park_start', groupId: 'one', members: ['alice'] });
  const join = i => service.handle(sockets[i], { type: 'park_join', clientId: `browser_${i}` });
  for (let i = 0; i < 4; i++) assert.equal(join(i).type, 'park_result');
  assert.match(join(4).message, /Close another park tab/);
  service.detached(sockets[0]);
  assert.equal(join(4).type, 'park_result');
  service.close();
});
