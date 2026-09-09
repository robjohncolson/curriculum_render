import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

const minute = 60_000;
function setup() {
  let at = 0;
  const registry = createClassroomRegistry(), sent = [], teacher = {}, student = {};
  registry.join(teacher, 'a', 'teacher', 'teacher', 0);
  registry.join(student, 'a', 'student', 'student', 0);
  const service = createParkService({ registry, now: () => at, send: (ws, message) => sent.push({ ws, message }) });
  const start = () => service.handle(teacher, { type: 'park_start', groupId: 'one', members: ['student'] });
  const join = () => service.handle(student, { type: 'park_join', clientId: 'browser_a' });
  return { service, teacher, student, sent, start, join, time: value => { at = value; } };
}

test('leaving frees presence but preserves progress and duplicate receipts for reconnect', () => {
  const f = setup(); f.start(); const state = f.join();
  f.service.handle(f.teacher, { type: 'park_run', groupId: 'one', running: true });
  const station = state.level.switches[0];
  const packet = { type: 'park_command', epoch: state.epoch, streamId: state.streamId, level: state.level.id, sequence: 1,
    kind: 'switch', target: station.id, pose: { x: station.x, y: station.y, vx: 0, vy: 0 } };
  assert.equal(f.service.handle(f.student, packet).status, 'accepted');
  f.service.handle(f.student, { type: 'park_leave', epoch: state.epoch });
  assert.deepEqual(f.sent.at(-1).message.online, []);
  f.time(29 * minute);
  const resumed = f.join();
  assert.equal(resumed.epoch, state.epoch);
  assert.equal(resumed.sequence, 1);
  assert.deepEqual(resumed.progress.switches, [station.id]);
  assert.equal(f.service.handle(f.student, packet).status, 'duplicate');
  // A delayed leave from an older epoch cannot detach this binding.
  f.service.handle(f.student, { type: 'park_leave', epoch: 'old' });
  assert.deepEqual(f.join().online, ['student']);
  f.service.close();
});

test('abandoned groups expire before allocation; a new epoch rejects old commands', () => {
  const f = setup(); const old = f.start(); f.join();
  f.time(30 * minute);
  assert.equal(f.service.handle(f.student, { type: 'park_status' }).code, 'PARK_NOT_ASSIGNED');
  const replacement = f.start();
  assert.equal(replacement.type, 'park_result');
  assert.notEqual(replacement.epoch, old.epoch);
  f.join();
  assert.equal(f.service.handle(f.student, { type: 'park_command', epoch: old.epoch, sequence: 1 }).type, 'park_error');
  f.service.close();
});

test('existing idle revision probes keep a classroom group alive without broadcasts', () => {
  const f = setup(); const initial = f.start(); f.join();
  const count = f.sent.length;
  for (let t = minute; t <= 120 * minute; t += minute) {
    f.time(t);
    assert.equal(f.service.handle(f.student, { type: 'park_status' }).epoch, initial.epoch);
  }
  assert.equal(f.sent.length, count);
  assert.equal(f.join().epoch, initial.epoch);
  f.service.close();
});
