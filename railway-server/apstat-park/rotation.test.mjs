import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
test('the opening level and saved bridge survive hour boundaries and empty rooms', () => {
  let wall=0;
  const session = new ParkSession({epoch:'stable',members:['alice'],wallNow:()=>wall});
  const key=session.open('alice','browser_a'), station=session.level.switches[0];
  session.command(key,{epoch:session.epoch,level:session.level.id,sequence:1,kind:'switch',target:station.id,pose:{...station,vx:0,vy:0}});
  const original=session.level.id;
  for (const hour of [1,7,24]) {
    wall=hour*3600000;
    assert.deepEqual(session.rotateIfReady({empty:true}),[]);
    assert.equal(session.level.id,original);
    assert.equal(session.progress.bridgeOpen,true);
  }
  session.addMember('bob'); const bob=session.open('bob','browser_b');
  assert.equal(session.resume(bob).progress.bridgeOpen,true);
});
