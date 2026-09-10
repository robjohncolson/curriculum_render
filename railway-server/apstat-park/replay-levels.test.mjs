import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
const pose = item => ({x:item.x,y:item.y,vx:0,vy:0});
for (const levelIndex of [0,1,2]) for (const count of [1,2,8,24]) test(`level ${levelIndex}, ${count} players: complete, reconnect, replay`,()=>{
 const members=Array.from({length:count},(_,i)=>'student'+i);
 const s=new ParkSession({epoch:'replay',levelIndex,members});
 const keys=members.map(m=>s.open(m,'browser_one')), seq=members.map(()=>0);
 const act=(i,kind,item,level=s.level.id)=>s.command(keys[i],{epoch:s.epoch,level,sequence:++seq[i],kind,target:item.id,pose:pose(item)});
 s.setOnline(members);
 assert.equal(s.progress.requiredSwitches,Math.min(count,s.level.switches.length));
 assert.equal(s.progress.soloAssist,count===1);
 act(0,'key',s.level.key);
 if(levelIndex>0)assert.equal(act(0,'unlock',s.level.goal).status,'rejected');
 for(let i=0;i<s.progress.requiredSwitches;i++)assert.equal(act(i%count,'switch',s.level.switches[i]).status,'accepted');
 assert.equal(s.progress.bridgeOpen,true);assert.equal(act(0,'unlock',s.level.goal).status,'accepted');
 for(let i=0;i<count;i++)assert.equal(act(i,'arrive',s.level.goal).status,'accepted');
 assert.equal(s.progress.complete,true);
 const replica=new ParkReplica();replica.resume(s.resume(keys[0]));const oldId=s.level.id;
 s.setOnline([]);replica.resume(s.resume(keys[0],replica.revision));
 assert.equal(replica.state.progress.complete,true);assert.equal(s.level.id,oldId);
 for(const e of s.enter(members[0]))assert.equal(replica.event(e),true);
 assert.notEqual(s.level.id,oldId);assert.deepEqual(replica.state.progress,s.progress);
 assert.deepEqual(s.progress.arrived,[]);assert.equal(s.progress.keyHolder,null);assert.equal(s.progress.doorOpen,false);assert.equal(s.poses.size,0);
 assert.equal(act(0,'key',s.level.key,oldId).status,'rejected');
 assert.equal(act(0,'key',s.level.key).status,'accepted');
});
test('disconnect eases requirements; reconnect does not relock progress',()=>{
 const s=new ParkSession({epoch:'adapt',levelIndex:2,members:['a','b','c']});const key=s.open('a','browser_one');s.setOnline(['a','b','c']);
 s.command(key,{epoch:s.epoch,level:s.level.id,sequence:1,kind:'switch',target:s.level.switches[0].id,pose:pose(s.level.switches[0])});
 assert.equal(s.progress.bridgeOpen,false);const r=new ParkReplica();r.resume(s.resume(key));
 for(const e of s.setOnline(['a']))assert.equal(r.event(e),true);
 assert.equal(s.progress.requiredSwitches,1);assert.equal(s.progress.bridgeOpen,true);assert.equal(s.progress.soloAssist,true);
 s.setOnline(['a','b','c']);r.resume(s.resume(key,r.revision));assert.equal(s.progress.requiredSwitches,1);assert.deepEqual(r.state.progress,s.progress);
});
test('returning to help clears that arrival while preserving the active puzzle',()=>{
 const s=new ParkSession({epoch:'help',members:['a','b']});s.setOnline(['a','b']);const key=s.open('a','browser_one');
 for(const [i,kind,item] of [[1,'key',s.level.key],[2,'unlock',s.level.goal],[3,'arrive',s.level.goal]])s.command(key,{epoch:s.epoch,level:s.level.id,sequence:i,kind,pose:pose(item)});
 const r=new ParkReplica();r.resume(s.resume(key));const id=s.level.id;
 for(const e of s.enter('a'))assert.equal(r.event(e),true);
 assert.deepEqual(r.state.progress.arrived,[]);assert.equal(s.level.id,id);assert.equal(s.progress.doorOpen,true);
});
test('rooms isolate levels and periods; selecting a puzzle detaches the old room',()=>{
 const registry=createClassroomRegistry(),sent=[],service=createParkService({registry,send:(ws,message)=>sent.push({ws,message})});
 const a={},b={},c={},d={};for(const [ws,name,section] of [[a,'a','B'],[b,'b','B'],[c,'c','B'],[d,'d','E']])registry.join(ws,section,name,'student',0);
 const join=(ws,levelIndex)=>service.handle(ws,{type:'park_join',protocol:3,levelIndex,clientId:'browser_one'});
 const first=join(a,0),friend=join(b,0),other=join(c,1),period=join(d,0);
 assert.equal(first.epoch,friend.epoch);assert.notEqual(first.epoch,other.epoch);assert.notEqual(first.epoch,period.epoch);
 assert.equal(join(a,3).type,'park_error');assert.equal(service.handle(a,{type:'park_status'}).epoch,first.epoch);
 const switched=join(a,1);assert.equal(switched.epoch,other.epoch);assert.ok(sent.some(r=>r.ws===b&&r.message.kind==='presence'&&!r.message.online.includes('a')));
 sent.length=0;const station=switched.level.switches[0];service.handle(a,{type:'park_command',epoch:switched.epoch,streamId:switched.streamId,level:switched.level.id,sequence:1,kind:'switch',target:station.id,pose:pose(station)});
 assert.ok(sent.some(r=>r.ws===c&&r.message.kind==='contribution'));assert.ok(!sent.some(r=>r.ws===b||r.ws===d));service.close();
});

test('service distinguishes explicit replay from transport resume and leaves during handshake',()=>{
 const registry=createClassroomRegistry(),a={},b={};registry.join(a,'B','a','student',0);registry.join(b,'B','b','student',0);
 const service=createParkService({registry,send(){}});
 const join={type:'park_join',protocol:3,clientId:'browser_one',levelIndex:0};
 const first=service.handle(a,join);let sequence=0;
 for(const [kind,item] of [['key',first.level.key],['unlock',first.level.goal],['arrive',first.level.goal]])
  assert.equal(service.handle(a,{type:'park_command',epoch:first.epoch,streamId:first.streamId,level:first.level.id,sequence:++sequence,kind,pose:pose(item)}).status,'accepted');
 service.detached(a);
 const resumed=service.handle(a,{...join,type:'park_resume',epoch:first.epoch});
 assert.equal(resumed.progress.complete,true);assert.equal(resumed.level.id,first.level.id);
 service.handle(a,{type:'park_leave',epoch:first.epoch});
 const replay=service.handle(a,join);assert.notEqual(replay.level.id,first.level.id);assert.deepEqual(replay.progress.arrived,[]);
 service.handle(b,join);
 service.handle(a,{type:'park_leave'}); // reply may not yet have reached this browser
 const online=service.handle(b,{...join,type:'park_resume'}).online;assert.deepEqual(online,['b']);service.close();
});
