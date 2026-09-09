import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';

function setup(){
 let at=0;
 const registry=createClassroomRegistry(),student={},sent=[];
 registry.join(student,'B','student','student',0);
 const service=createParkService({registry,now:()=>at,wallNow:()=>0,send:(ws,message)=>sent.push(message)});
 const join=()=>service.handle(student,{type:'park_join',clientId:'browser_one'});
 return {service,student,sent,join,time:value=>{at=value;}};
}
test('leaving retains milestones and receipts; delayed leave cannot detach a new epoch',()=>{
 const f=setup(),first=f.join(),station=first.level.switches[0];
 const packet={type:'park_command',epoch:first.epoch,streamId:first.streamId,level:first.level.id,sequence:1,kind:'switch',target:station.id,pose:{...station,vx:0,vy:0}};
 assert.equal(f.service.handle(f.student,packet).status,'accepted');
 f.service.handle(f.student,{type:'park_leave',epoch:first.epoch});
 f.time(90*60000);
 const resumed=f.join();
 assert.equal(resumed.epoch,first.epoch); assert.equal(resumed.sequence,1);
 assert.deepEqual(resumed.progress.switches,[station.id]);
 assert.equal(f.service.handle(f.student,packet).status,'duplicate');
 f.service.handle(f.student,{type:'park_leave',epoch:'old'});
 assert.deepEqual(f.join().online,['student']); f.service.close();
});
test('abandoned rooms expire after two hours and students recreate them without a teacher',()=>{
 const f=setup(),first=f.join();
 f.service.detached(f.student); f.time(120*60000);
 const next=f.join(); assert.notEqual(next.epoch,first.epoch);
 assert.equal(f.service.handle(f.student,{type:'park_command',epoch:first.epoch,streamId:next.streamId,sequence:1}).type,'park_error');
 f.service.close();
});
test('stationary revision probes keep the room alive without repeated broadcasts',()=>{
 const f=setup(),first=f.join(),count=f.sent.length;
 for(let time=60000;time<=180*60000;time+=60000){ f.time(time); assert.equal(f.service.handle(f.student,{type:'park_status'}).epoch,first.epoch); }
 assert.equal(f.sent.length,count); f.service.close();
});
