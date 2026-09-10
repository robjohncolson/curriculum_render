import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';

test('presence survives missed events, idle time and overlapping reconnect sockets', () => {
  const registry = createClassroomRegistry(), sent = [];
  const service = createParkService({ wallNow: () => 0, registry, send: (ws, message) => sent.push({ ws, message }) });
  const teacher = {}, alice = {}, bob = {}, replacement = {};
  for (const [ws, name, role] of [[teacher, 'teacher', 'teacher'], [alice, 'alice', 'student'], [bob, 'bob', 'student']]) {
    registry.join(ws, 'a', name, role, 0);
  }
  const join = { type: 'park_join', protocol: 3, clientId: 'browser_a' };
  const first = service.handle(alice, join);
  const replica = new ParkReplica(); replica.resume(first);
  assert.deepEqual(replica.state.online, ['alice']);
  service.handle(bob, { type: 'park_join', protocol: 3, clientId: 'browser_b' });
  for (const row of sent.filter(row => row.ws === alice && row.message.revision > first.revision)) assert.equal(replica.event(row.message), true);
  assert.deepEqual(replica.state.online, ['alice', 'bob']);
  const count = sent.length;
  // Status probes and stationary rejoins do not broadcast repeated presence.
  for (let i = 0; i < 50; i++) {
    service.handle(bob, { type: 'park_status' });
    service.handle(alice, { ...join, type: 'park_resume', protocol: 3, epoch: first.epoch, since: replica.revision });
  }
  assert.equal(sent.length, count);
  registry.join(replacement, 'a', 'alice', 'student', 100);
  service.handle(replacement, join);
  service.detached(alice);
  registry.detach(alice, 101);
  assert.equal(sent.length, count, 'overlapping sockets keep member online');
  service.detached(bob); registry.detach(bob, 102);
  // Deliberately miss the disconnect broadcast; the revision range recovers it.
  const recovered = service.handle(replacement, { ...join, type: 'park_resume', protocol: 3, epoch: first.epoch, since: replica.revision });
  replica.resume(recovered);
  assert.deepEqual(replica.state.online, ['alice']);
  const summary = service.handle(replacement, join);
  assert.deepEqual(summary.online, ['alice']);
  registry.join(bob, 'a', 'bob', 'student', 200);
  service.handle(bob, { type: 'park_join', protocol: 3, clientId: 'browser_b' });
  replica.resume(service.handle(replacement, { ...join, type: 'park_resume', protocol: 3, epoch: first.epoch, since: replica.revision }));
  assert.deepEqual(replica.state.online, ['alice', 'bob']);
  service.close();
});
