import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';

test('a lost final motion anchor and lost stop event recover through reliable replay', () => {
  let clock = 0;
  const session = new ParkSession({ epoch: 'rest', members: ['alice', 'bob'], now: () => clock });
  const alice = session.open('alice', 'client_alice'), bob = session.open('bob', 'client_bob');
  const observer = new ParkReplica({ now: () => clock });
  observer.resume(session.resume(bob));
  const moving = { epoch: session.epoch, level: session.level.id, sequence: 1, pose: { x: 260, y: 146, vx: 120, vy: 0 } };
  observer.peerMotion({ member: 'alice', ...session.motion(alice, moving) });
  clock = 499;
  const rest = { x: 279, y: 146, vx: 0, vy: 0 };
  assert.equal(session.motion(alice, { ...moving, sequence: 2, pose: rest }), null, 'jitter can suppress the final motion');
  const packet = { ...moving, sequence: 1, kind: 'settle', target: 'rest', pose: rest };
  const accepted = session.command(alice, packet);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.events[0].kind, 'settled');
  // Lose both event and receipt, then retry the same reliable command.
  assert.equal(session.command(alice, packet).status, 'duplicate');
  observer.resume(session.resume(bob, observer.revision));
  clock += 600;
  assert.deepEqual(observer.remoteMotion.sample('alice'), rest);
  assert.deepEqual(session.resume(bob).poses.alice, rest);
  assert.equal(session.history.filter(e => e.kind === 'settled').length, 1);
});
