import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { PARK_LEVEL_COUNT } from './levels.mjs';

function setup(t) {
  const registry = createClassroomRegistry();
  const service = createParkService({ registry, wallNow: () => 0, send() {} });
  t.after(() => service.close());
  const alice = {}, bob = {}, carol = {}, dave = {}, outsider = {};
  for (const [ws, section, username] of [[alice, 'B', 'alice'], [bob, 'B', 'bob'],
    [carol, 'B', 'carol'], [dave, 'B', 'dave'], [outsider, 'E', 'outsider']]) {
    registry.join(ws, section, username, 'student', 0);
  }
  const join = (ws, levelIndex) => service.handle(ws, { type: 'park_join', protocol: 4, clientId: 'browser_x', levelIndex });
  const populate = () => {
    // Join in reverse order to verify that the lobby sorts usernames.
    assert.equal(join(bob, 3).type, 'park_result');
    assert.equal(join(alice, 3).type, 'park_result');
    assert.equal(join(carol, 0).type, 'park_result');
  };
  return { registry, service, alice, bob, dave, outsider, join, populate };
}

test('lobby lists sorted occupancy for every level without a room binding', t => {
  const { service, dave, populate } = setup(t);
  populate();
  const request = { type: 'park_lobby', requestId: 'lobby_1' };
  assert.equal(service.accepts(request), true);
  const result = service.handle(dave, request);
  assert.equal(result.type, 'park_result');
  assert.equal(result.requestId, request.requestId);
  assert.equal(result.levels.length, PARK_LEVEL_COUNT);
  assert.deepEqual(result.levels, Array.from({ length: PARK_LEVEL_COUNT }, (_, levelIndex) => ({
    levelIndex, online: levelIndex === 3 ? ['alice', 'bob'] : levelIndex === 0 ? ['carol'] : [],
  })));
});

test('lobby only lists rooms in the classroom identity section', t => {
  const { service, outsider, populate } = setup(t);
  populate();
  const result = service.handle(outsider, { type: 'park_lobby', requestId: 'isolated', section: 'B' });
  assert.equal(result.type, 'park_result');
  assert.deepEqual(result.levels, Array.from({ length: PARK_LEVEL_COUNT }, (_, levelIndex) => ({ levelIndex, online: [] })));
});

test('lobby requires a joined classroom identity', t => {
  const { service } = setup(t);
  const result = service.handle({}, { type: 'park_lobby', requestId: 'unjoined' });
  assert.equal(result.type, 'park_error');
  assert.equal(result.requestId, 'unjoined');
  assert.equal(result.message, 'Join the classroom first');
});

test('lobby leaves rooms unallocated and accepts an unbound student', t => {
  const { service, alice, dave, join } = setup(t);
  const result = service.handle(dave, { type: 'park_lobby', requestId: 'empty' });
  assert.equal(result.type, 'park_result');
  assert.notEqual(result.code, 'PARK_STREAM_CHANGED');
  assert.deepEqual(result.levels, Array.from({ length: PARK_LEVEL_COUNT }, (_, levelIndex) => ({ levelIndex, online: [] })));
  const joined = join(alice, 2);
  assert.equal(joined.type, 'park_result');
  assert.equal(joined.running, false);
  assert.deepEqual(joined.members, ['alice']);
});

test('lobby no longer lists detached students', t => {
  const { service, bob, dave, populate } = setup(t);
  populate();
  service.detached(bob);
  const result = service.handle(dave, { type: 'park_lobby' });
  assert.deepEqual(result.levels[3].online, ['alice']);
});

test('lobby prunes bindings whose classroom section changed', t => {
  const { registry, service, bob, dave, populate } = setup(t);
  populate();
  registry.join(bob, 'E', 'bob', 'student', 0);
  const result = service.handle(dave, { type: 'park_lobby' });
  assert.deepEqual(result.levels[3].online, ['alice']);
});
