import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';

test('hourly rotation preserves active attempts, waits for finish, and excludes disconnected players',()=>{
 let clock=0,wall=0;
 const session=new ParkSession({epoch:'rotation',members:['alice','bob'],now:()=>clock,wallNow:()=>wall});
 const key=session.open('alice','browser_a');session.setOnline(['alice','bob']);
 const replica=new ParkReplica();replica.resume(session.resume(key));
 const oldLevel=session.level.id;wall=3600000;
 assert.deepEqual(session.rotateIfReady(),[]); assert.equal(session.level.id,oldLevel);
 let sequence=0;
 const act=(kind,item)=>session.command(key,{epoch:session.epoch,level:session.level.id,sequence:++sequence,kind,target:item.id,pose:{...item,vx:0,vy:0}});
 for(const station of session.level.switches) assert.equal(act('switch',station).status,'accepted');
 assert.equal(act('arrive',{id:'exit',...session.level.goal}).status,'accepted');
 clock=10000;
 assert.deepEqual(session.rotateIfReady(),[],'bob is still completing the attempt');
 session.setOnline(['alice']);
 assert.equal(session.rotateIfReady()[0].kind,'level');
 assert.equal(session.level.index,1);assert.notEqual(session.level.id,oldLevel);
 replica.resume(session.resume(key,replica.revision));
 assert.equal(replica.state.level.id,session.level.id);assert.deepEqual(replica.state.progress.switches,[]);
 assert.equal(session.command(key,{epoch:session.epoch,level:oldLevel,sequence:++sequence,kind:'switch',target:'switch-0',pose:{x:220,y:520,vx:0,vy:0}}).reason,'Level changed');
});
test('late arrivals share saved progress; empty rooms take the current featured hour',()=>{
 let wall=0;const session=new ParkSession({epoch:'late',members:['alice'],wallNow:()=>wall});
 const key=session.open('alice','browser_a'),station=session.level.switches[0];
 session.command(key,{epoch:session.epoch,level:session.level.id,sequence:1,kind:'switch',target:station.id,pose:{...station,vx:0,vy:0}});
 session.addMember('bob');const b=session.open('bob','browser_b');
 assert.deepEqual(session.resume(b).progress.switches,[station.id]);assert.equal(session.level.switches.length,4);
 wall=7*3600000;session.rotateIfReady({empty:true});assert.equal(session.level.index,1);assert.equal(session.level.rotationAt,8*3600000);
});
