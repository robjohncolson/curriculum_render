import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

test('tabs presenting the same cached identity receive independent command streams', () => {
  const registry = createClassroomRegistry(), teacher = {}, firstTab = {}, secondTab = {};
  registry.join(teacher, 'a', 'teacher', 'teacher', 0);
  registry.join(firstTab, 'a', 'alice', 'student', 0);
  registry.join(secondTab, 'a', 'alice', 'student', 0);
  const service = createParkService({ wallNow: () => 0, registry, send() {} });
  const join = { type: 'park_join', clientId: 'copied_client' };
  const first = service.handle(firstTab, join);
  const second = service.handle(secondTab, join);
  assert.equal(first.clientId, join.clientId);
  assert.notEqual(second.clientId, first.clientId);
  assert.notEqual(second.streamId, first.streamId);
  const station = first.level.switches[0];
  const packet = { type: 'park_command', epoch: first.epoch, level: first.level.id, sequence: 1,
    kind: 'switch', target: station.id, pose: { x: station.x, y: station.y, vx: 0, vy: 0 } };
  assert.equal(service.handle(firstTab, { ...packet, streamId: first.streamId }).status, 'accepted');
  // The second tab's first action must execute, rather than collide with sequence 1.
  assert.equal(service.handle(secondTab, { ...packet, streamId: second.streamId,
    target: first.level.switches[1].id, pose: { ...first.level.switches[1], vx: 0, vy: 0 } }).status, 'accepted');
  const resumed = service.handle(secondTab, { ...join, clientId: second.clientId });
  assert.equal(resumed.streamId, second.streamId);
  assert.deepEqual(resumed.progress.switches, [station.id, first.level.switches[1].id]);
  service.close();
});
