import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';
const pose = item => ({ x: item.x, y: item.y, vx: 0, vy: 0 });

for (const count of [2, 8, 24]) test('key handoff and cooperative completion with '+count+' students', () => {
  const members = Array.from({length:count},(_,i)=>'student'+i);
  const session = new ParkSession({epoch:'opening', members});
  const streams = members.map(name=>session.open(name,'client_'+name)), sequences = members.map(()=>0);
  session.setOnline(members);
  const replica = new ParkReplica(); replica.resume(session.resume(streams[0]));
  const act = (i,kind,item) => session.command(streams[i], {epoch:session.epoch, level:session.level.id,
    sequence:++sequences[i],kind,target:item.id,pose:pose(item)});
  assert.equal(act(0,'arrive',session.level.goal).status,'rejected');
  assert.equal(act(0,'switch',session.level.switches[0]).status,'accepted');
  assert.equal(act(0,'key',session.level.key).status,'accepted');
  assert.equal(act(1,'key',session.level.key).status,'rejected');
  assert.equal(act(1,'unlock',session.level.goal).status,'rejected');
  session.setOnline(members.slice(1));
  assert.equal(session.progress.keyHolder,null);
  if (count === 2) { assert.equal(act(1,'key',session.level.key).status,'rejected'); session.setOnline(members); }
  assert.equal(act(1,'key',session.level.key).status,'accepted');
  assert.equal(act(1,'unlock',session.level.goal).status,'accepted');
  session.setOnline(members);
  for (let i=0;i<count;i++) {
    assert.equal(session.progress.complete,false);
    assert.equal(act(i,'arrive',session.level.goal).status,'accepted');
  }
  assert.equal(session.progress.complete,true);
  replica.resume(session.resume(streams[0],replica.revision));
  assert.deepEqual(replica.state.progress,session.progress);
  session.addMember('late'); session.setOnline([...members,'late']);
  assert.equal(session.progress.complete,true, 'completion remains recorded until an explicit new attempt');
  session.enter('late');
  assert.equal(session.progress.complete,false);
  assert.equal(session.progress.doorOpen,false);
});
