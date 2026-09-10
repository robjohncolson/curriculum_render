import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

test('old cached clients cannot allocate or occupy the new scene rooms', () => {
  const registry = createClassroomRegistry();
  const service = createParkService({ registry, send() {} });
  // Exceed the room limit using old joins; none may consume a room slot.
  for (let i = 0; i < 40; i++) {
    const ws = {};
    registry.join(ws, 'old-' + i, 'student', 'student', 0);
    assert.equal(service.handle(ws, { type: 'park_resume', clientId: 'old_browser' }).code, 'PARK_UPDATE_REQUIRED');
  }
  const current = {};
  registry.join(current, 'current', 'student', 'student', 0);
  assert.equal(service.handle(current, { type: 'park_resume', protocol: 4, clientId: 'new_browser' }).type, 'park_result');
  service.close();
});

test('students enter automatically; classroom identity and period boundaries own the room', () => {
  const registry = createClassroomRegistry(), sent = [];
  const service = createParkService({ registry, wallNow: () => 0, send: (ws, message) => sent.push({ ws, message }) });
  const alice = {}, bob = {}, outsider = {}, teacher = {};
  for (const [socket, section, name, role] of [[alice,'B','alice','student'],[bob,'B','bob','student'],[outsider,'E','outsider','student'],[teacher,'B','teacher','teacher']]) registry.join(socket,section,name,role,0);
  const join = socket => service.handle(socket, {type: 'park_join', protocol: 4,clientId:'browser_one',section:'forged',member:'forged'});
  const a=join(alice), b=join(bob), o=join(outsider);
  assert.equal(a.running,false); assert.equal(b.running,true); assert.equal(a.epoch,b.epoch); assert.notEqual(a.epoch,o.epoch);
  assert.equal(a.member,'alice'); assert.deepEqual(b.members,['alice','bob']);
  const station=a.level.switches[0];
  const command={type:'park_command',epoch:a.epoch,streamId:a.streamId,level:a.level.id,sequence:1,kind:'switch',target:station.id,pose:{...station,vx:0,vy:0},member:'bob'};
  assert.equal(service.handle(alice,command).status,'accepted');
  assert.ok(sent.some(row=>row.ws===bob&&row.message.kind==='holds'&&row.message.holds.bridge.includes('alice')));
  assert.ok(!sent.some(row=>row.ws===outsider&&row.message.kind==='holds'));
  for(const type of ['park_start','park_run','park_next','park_stop']) assert.equal(service.handle(teacher,{type}).code,'PARK_SELF_DIRECTED');
  // Teachers use the same doorway as everyone else, with no management controls.
  assert.equal(join(teacher).running,true);
  service.detached(alice); registry.detach(alice,100);
  const replacement={}; registry.join(replacement,'B','alice','student',200);
  const resumed=service.handle(replacement,{type: 'park_resume', protocol: 4,clientId:'browser_one',epoch:a.epoch,since:a.revision});
  assert.equal(resumed.sequence,1); assert.ok(resumed.events.some(event=>event.kind==='holds'));
  assert.equal(service.handle(replacement,command).status,'duplicate');
  service.close();
});

test('unjoined sockets, invalid clients, stale bindings and section changes are handled', () => {
  const registry=createClassroomRegistry(), socket={};
  const service=createParkService({registry,wallNow:()=>0,send(){}});
  assert.equal(service.handle(socket,{type: 'park_join', protocol: 4,clientId:'browser_one'}).type,'park_error');
  registry.join(socket,'B','alice','student',0);
  assert.equal(service.handle(socket,{type: 'park_join', protocol: 4,clientId:'bad'}).type,'park_error');
  const first=service.handle(socket,{type: 'park_join', protocol: 4,clientId:'browser_one'});
  service.detached(socket);
  assert.equal(service.handle(socket,{type:'park_status'}).code,'PARK_STREAM_CHANGED');
  registry.join(socket,'E','alice','student',100);
  const next=service.handle(socket,{type: 'park_join', protocol: 4,clientId:'browser_one'});
  assert.notEqual(next.epoch,first.epoch);
  service.close();
});

test('an outage across the hour preserves an attempt; an explicit last exit also preserves the first level', () => {
  let wall = 0;
  const registry = createClassroomRegistry(), socket = {};
  registry.join(socket, 'B', 'alice', 'student', 0);
  const service = createParkService({ registry, wallNow: () => wall, send() {} });
  const join = () => service.handle(socket, { type: 'park_join', protocol: 4, clientId: 'browser_one' });
  const first = join(), station = first.level.spawn;
  service.handle(socket, { type: 'park_command', epoch: first.epoch, streamId: first.streamId,
    level: first.level.id, sequence: 1, kind: 'settle', target: 'rest', pose: { ...station, vx: 0, vy: 0 } });
  service.detached(socket);
  wall = 3600000;
  const resumed = join();
  assert.equal(resumed.level.id, first.level.id);
  assert.deepEqual(resumed.poses.alice, {...station,vx:0,vy:0});
  service.handle(socket, { type: 'park_leave', epoch: first.epoch });
  assert.equal(join().level.id, first.level.id);
  service.close();
});
