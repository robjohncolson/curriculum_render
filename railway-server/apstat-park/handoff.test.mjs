import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';
const at = item => ({ x: item.x, y: item.y, vx: 0, vy: 0 });

for (const count of [1, 2, 8]) test(`parcel handoff supports ${count} players and survives missed events`, () => {
  const members = Array.from({ length: count }, (_, i) => `player${i}`);
  const session = new ParkSession({ epoch: 'handoff', members });
  const streams = members.map(name => session.open(name, `client_${name}`));
  const sequences = members.map(() => 0);
  session.setRunning(true); session.nextLevel(); session.nextLevel();
  const replica = new ParkReplica(); replica.resume(session.resume(streams[0]));
  const act = (i, kind, item, location = item) => session.command(streams[i], {
    epoch: session.epoch, level: session.level.id, sequence: ++sequences[i], kind, target: item.id, pose: at(location),
  });
  for (let i = 0; i < count; i++) {
    const parcel = session.level.samples[i];
    const destination = session.level.switches.find(station => station.id === parcel.destination);
    assert.equal(destination.owner, members[(i + 1) % count]);
    assert.equal(act(i, 'deliver', parcel, destination).status, 'rejected');
    assert.equal(act(i, 'sample', parcel).status, 'accepted');
    if (i === 0) assert.equal(act(i, 'switch', session.level.switches[i]).status, 'rejected');
    const delivered = act(i, 'deliver', parcel, destination);
    assert.equal(delivered.status, 'accepted');
    assert.equal(delivered.events[0].collection, 'deliveries');
    const retry = session.command(streams[i], { epoch: session.epoch, sequence: sequences[i] });
    assert.equal(retry.status, 'duplicate'); assert.deepEqual(retry.events, []);
    assert.equal(session.progress.bridgeOpen, false);
  }
  for (let i = 0; i < count; i++) assert.equal(act(i, 'switch', session.level.switches[i]).status, 'accepted');
  assert.equal(session.progress.bridgeOpen, true);
  assert.equal(session.progress.deliveries.length, count);
  // The observer missed every handoff event, then requests the retained history.
  replica.resume(session.resume(streams[0], replica.revision));
  assert.deepEqual(replica.state.progress, session.progress);
  for (let i = 0; i < count; i++) assert.equal(act(i, 'arrive', { id: 'exit', ...session.level.goal }).status, 'accepted');
  assert.equal(session.progress.arrived.length, count);
});
