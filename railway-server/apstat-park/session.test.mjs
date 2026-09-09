import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';

const poseAt = item => ({ x: item.x, y: item.y, vx: 0, vy: 0 });

test('lost rejection receipts recover by retry or reconnect without losing the reason', () => {
  for (const recovery of ['retry', 'resume']) {
    const { session, replica, key, advance } = setup();
    const wrongStation = session.level.switches[0];
    replica.queue('switch', wrongStation.id, poseAt(session.level.spawn));
    const packet = replica.outgoing({ connected: true })[0];
    const rejected = session.command(key, packet);
    assert.equal(rejected.status, 'rejected');
    // Drop the receipt. No durable event exists for this rejected action.
    if (recovery === 'retry') {
      advance(1600);
      const duplicate = session.command(key, replica.outgoing({ connected: true })[0]);
      assert.equal(duplicate.outcome, 'rejected');
      replica.acknowledge({ epoch: session.epoch, ...duplicate });
    } else replica.resume(session.resume(key, replica.revision));
    assert.equal(replica.lastRejection, rejected.reason);
    assert.equal(replica.outbox.length, 0);
    assert.deepEqual(session.progress.switches, []);
    const own = session.level.switches[0];
    replica.queue('switch', own.id, poseAt(own));
    assert.equal(replica.lastRejection, null);
    const next = session.command(key, replica.outgoing({ connected: true })[0]);
    assert.equal(next.status, 'accepted');
    assert.equal(next.sequence, 2);
  }
});

test('receipt retention is bounded, private to each stream and independently owned', () => {
  const { session, key } = setup();
  const other = session.open('bob', 'browser_other');
  const packet = { epoch: session.epoch, level: session.level.id, kind: 'unknown', pose: poseAt(session.level.spawn) };
  for (let sequence = 1; sequence <= 100; sequence++) session.command(key, { ...packet, sequence });
  const summary = session.resume(key);
  assert.equal(summary.receipts.length, 16);
  assert.equal(summary.receipts[0].sequence, 85);
  assert.deepEqual(session.resume(other).receipts, []);
  summary.receipts[15].reason = 'mutated';
  assert.equal(session.command(key, { ...packet, sequence: 100 }).reason, 'Unknown park action');
  assert.equal(session.command(key, { ...packet, sequence: 1 }).outcome, 'unknown');
});

function setup(members = ['alice', 'bob']) {
  let clock = 0;
  const now = () => clock;
  const session = new ParkSession({ epoch: 'test-epoch', members, now, wallNow: now });
  const key = session.open(members[0], 'browser_1');
  const replica = new ParkReplica({ now });
  replica.resume(session.resume(key));
  return { session, key, replica, advance: ms => { clock += ms; } };
}

test('lost acknowledgment, duplicate action, event gap and reconnect converge', () => {
  const { session, key, replica, advance } = setup();
  const station = session.level.switches[0];
  replica.queue('switch', station.id, poseAt(station));
  const packet = replica.outgoing({ connected: true })[0];
  const accepted = session.command(key, packet);
  assert.equal(accepted.events.length, 1);
  // Drop both event and acknowledgment. A retry must not apply the action twice.
  advance(1600);
  const retry = replica.outgoing({ connected: true })[0];
  assert.deepEqual(retry, packet);
  const duplicate = session.command(key, retry);
  assert.equal(duplicate.status, 'duplicate');
  replica.acknowledge({ epoch: session.epoch, ...duplicate });
  assert.equal(replica.needsResume, true);
  replica.resume(session.resume(key, replica.revision));
  assert.deepEqual(replica.state.progress, session.progress);
  assert.deepEqual(session.progress.switches, [station.id]);
  assert.equal(replica.outbox.length, 0);
  assert.equal(replica.event(accepted.events[0]), true);
  const other = session.open('bob', 'browser_2');
  const bobStation = session.level.key;
  const bob = session.command(other, { epoch: session.epoch, level: session.level.id, sequence: 1, kind: 'key', target: bobStation.id, pose: poseAt(bobStation) });
  const pause = session.setOnline(['alice'])[0];
  assert.equal(replica.event(pause), false);
  assert.equal(replica.needsResume, true);
  replica.resume(session.resume(key, replica.revision));
  assert.deepEqual(replica.state.online, ['alice']);
  assert.deepEqual(replica.state.progress, session.progress);
  assert.equal(bob.events[0].holder, 'bob');
});

test('one minute offline queues actions once and coalesces all motion', () => {
  const { session, replica, key, advance } = setup();
  const station = session.level.switches[0];
  for (let frame = 0; frame < 3600; frame++) {
    replica.motion({ x: frame % 900, y: 520, vx: 100, vy: 0 });
    replica.queue('switch', station.id, poseAt(station));
    assert.deepEqual(replica.outgoing({ connected: false }), []);
    advance(1000 / 60);
  }
  assert.equal(replica.outbox.length, 1);
  replica.resume(session.resume(key, replica.revision));
  const packets = replica.outgoing({ connected: true });
  assert.equal(packets.length, 2);
  assert.equal(packets.filter(p => p.type === 'park_motion').length, 1);
  const result = session.command(key, packets.find(p => p.type === 'park_command'));
  for (const event of result.events) replica.event(event);
  replica.acknowledge({ epoch: session.epoch, ...result });
  assert.deepEqual(replica.state.progress, session.progress);
  assert.equal(replica.outbox.length, 0);
});

test('traffic stays bounded and idle produces no gameplay messages', () => {
  const { replica, advance } = setup();
  let bytes = 0, messages = 0;
  for (let frame = 0; frame < 3600; frame++) {
    replica.motion({ x: frame % 900, y: 520, vx: 100, vy: 0 });
    for (const packet of replica.outgoing({ connected: true })) {
      bytes += Buffer.byteLength(JSON.stringify(packet)); messages++;
    }
    advance(1000 / 60);
  }
  assert.ok(messages <= 121, `${messages} messages/minute`);
  assert.ok(bytes < 24000, `${bytes} bytes/minute`);
  replica.motion({ x: 899, y: 520, vx: 0, vy: 0 });
  advance(600); replica.outgoing({ connected: true });
  for (let frame = 0; frame < 3600; frame++) {
    replica.motion({ x: 899, y: 520, vx: 0, vy: 0 });
    assert.deepEqual(replica.outgoing({ connected: true }), []);
    advance(1000 / 60);
  }
});

test('stale level action rejects without blocking next sequence', () => {
  const { session, replica, key, advance } = setup();
  const station = session.level.switches[0];
  replica.queue('switch', station.id, poseAt(station));
  const packet = replica.outgoing({ connected: true })[0];
  packet.level = 'retired-level';
  const rejected = session.command(key, packet);
  assert.equal(rejected.status, 'rejected');
  replica.acknowledge({ epoch: session.epoch, ...rejected });
  replica.resume(session.resume(key, replica.revision));
  const sample = session.level.key;
  replica.queue('key', sample.id, poseAt(sample));
  const next = replica.outgoing({ connected: true })[0];
  assert.equal(next.sequence, 2);
  assert.equal(session.command(key, next).status, 'accepted');
});

test('bounded history falls back to a compact summary, not world state', () => {
  const { session, key } = setup(Array.from({ length: 8 }, (_, i) => `student${i}`));
  for (let i = 0; i < 150; i++) session.setOnline(i % 2 === 0 ? session.members : []);
  const summary = session.resume(key, 0);
  assert.equal(summary.mode, 'summary');
  assert.ok(session.history.length <= 128);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 4000);
  assert.equal('memory' in summary, false);
  assert.equal('physics' in summary, false);
});

test('membership, proximity, sequences and rate limits are enforced', () => {
  const { session, key, advance } = setup();
  const station = session.level.switches[0];
  const command = { epoch: session.epoch, level: session.level.id, sequence: 1, kind: 'switch', target: station.id, pose: poseAt(session.level.spawn) };
  assert.equal(session.command(key, command).status, 'rejected');
  assert.equal(session.command(key, { ...command, sequence: 3 }).status, 'gap');
  assert.throws(() => session.open('mallory', 'browser_3'));
  assert.equal(session.command(key, { ...command, sequence: 2 }).status, 'rejected');
  const motion = { epoch: session.epoch, level: session.level.id, sequence: 1, pose: poseAt(station) };
  assert.ok(session.motion(key, motion));
  assert.equal(session.motion(key, { ...motion, sequence: 2 }), null);
  advance(500);
  assert.equal(session.motion(key, motion), null);
  assert.ok(session.motion(key, { ...motion, sequence: 2 }));
});
