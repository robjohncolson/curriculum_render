import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';

test('a saturated offline outbox drains through lost receipts without flooding movement', () => {
  let at = 0;
  const session = new ParkSession({ wallNow: () => 0, epoch: 'pressure-test', members: ['alice', 'bob'], now: () => at });
  session.setOnline(['alice','bob']);
  const key = session.open('alice', 'browser_a');
  const replica = new ParkReplica({ now: () => at });
  replica.resume(session.resume(key));
  const station = session.level.switches[0];
  const pose = { x: station.x, y: station.y, vx: 0, vy: 0 };
  // Stale or invalid actions must not strand the later useful contribution.
  for (let i = 0; i < 15; i++) assert.equal(replica.queue('switch', `missing-${i}`, pose).status, 'queued');
  assert.equal(replica.queue('switch', station.id, pose).status, 'queued');
  assert.equal(replica.queue('arrive', 'exit', pose).status, 'full');
  for (let i = 0; i < 3600; i++) {
    replica.motion({ ...pose, x: i % 900 });
    at += 17;
    assert.deepEqual(replica.outgoing({ connected: false }), []);
  }
  assert.equal(replica.outbox.length, 16);
  assert.deepEqual(replica.outgoing({ connected: true, bufferedAmount: 4097 }), []);
  replica.resume(session.resume(key, replica.revision));
  const seen = new Set();
  let motionCount = 0, commandCount = 0;
  for (let tick = 0; tick < 40 && replica.outbox.length; tick++) {
    at += 1600;
    for (const packet of replica.outgoing({ connected: true })) {
      if (packet.type === 'park_motion') {
        motionCount++;
        assert.equal(packet.pose.x, 3599 % 900);
        continue;
      }
      commandCount++;
      const receipt = session.command(key, packet);
      // Drop every first receipt and every durable broadcast. Recovery must
      // use duplicate acknowledgments and the existing revision resume path.
      if (!seen.has(packet.sequence)) { seen.add(packet.sequence); continue; }
      replica.acknowledge({ epoch: session.epoch, ...receipt });
      if (replica.needsResume) replica.resume(session.resume(key, replica.revision));
    }
  }
  assert.equal(replica.outbox.length, 0);
  assert.equal(commandCount, 32);
  assert.equal(motionCount, 1);
  assert.deepEqual(replica.state.progress, session.progress);
  assert.deepEqual(session.progress.switches, [station.id]);
  assert.equal(session.history.filter(event => event.kind === 'holds').length, 1);
});
