import test from 'node:test';
import assert from 'node:assert/strict';
import {ParkSession} from './session.mjs';
import {ParkReplica} from '../../../follow-alongs/apstat-park/replica.mjs';
import {createParkLevel} from './levels.mjs';
function setup(index=0){
 let time=0;const s=new ParkSession({epoch:'cooperation',levelIndex:index,members:['alice','bob'],now:()=>time});
 const a=s.open('alice','browser_alice'),b=s.open('bob','browser_bob'),seq=new Map();
 const act=(key,kind,item,details={})=>s.command(key,{epoch:s.epoch,level:s.level.id,sequence:(seq.set(key,(seq.get(key)||0)+1),seq.get(key)),kind,target:item.id,pose:{x:item.x,y:item.y,vx:0,vy:0},...details});
 return {s,a,b,act,advance:ms=>{time+=ms;return s.expireHolds();}};
}
for(let i=0;i<6;i++)test(`level ${i} requires two students and keeps attempt on disconnect`,()=>{
 const {s,a,act}=setup(i);s.setOnline(['alice']);assert.equal(s.running,false);
 assert.equal(act(a,'key',s.level.key).status,'rejected');assert.equal(act(a,'arrive',s.level.goal).status,'rejected');
 s.setOnline(['alice','bob']);assert.equal(s.running,true);const id=s.level.id;
 s.setOnline(['alice']);assert.equal(s.running,false);assert.equal(s.progress.complete,false);assert.equal(s.level.id,id);
 s.setOnline(['alice','bob']);assert.equal(s.running,true);assert.equal(s.level.id,id);
});
test('six choices include all four World 1 references',()=>{
 const levels=Array.from({length:6},(_,i)=>createParkLevel(i));
 assert.equal(new Set(levels.map(l=>l.id)).size,6);
 for(const reference of ['World 1-1','World 1-2','World 1-3','World 1-4'])assert.ok(levels.some(l=>l.reference===reference));
});
test('pressure release, stale lease and disconnect close the bridge; retries are idempotent',()=>{
 const {s,a,act,advance}=setup();s.setOnline(['alice','bob']);const pad=s.level.switches[0];
 assert.equal(act(a,'hold',pad,{active:true}).status,'accepted');assert.equal(s.progress.bridgeOpen,true);
 const replica=new ParkReplica();replica.resume(s.resume(a));
 let result=act(a,'hold',pad,{active:false});for(const e of result.events)assert.equal(replica.event(e),true);
 assert.equal(replica.state.progress.bridgeOpen,false);
 act(a,'hold',pad,{active:true});advance(5000);assert.equal(s.progress.bridgeOpen,true);
 act(a,'hold',pad,{active:true});advance(2000);assert.equal(s.progress.bridgeOpen,true);
 advance(4001);assert.equal(s.progress.bridgeOpen,false);assert.deepEqual(s.progress.holds,{});
 act(a,'hold',pad,{active:true});s.setOnline(['bob']);assert.equal(s.progress.bridgeOpen,false);
});
test('paired lift needs two distinct riders, then reverses on release',()=>{
 const {s,a,b,act,advance}=setup(2);s.setOnline(['alice','bob']);const item=s.level.weightedLifts[0],feet={id:item.id,x:item.x,y:item.bottom-24};
 act(a,'hold',feet,{active:true});assert.equal(s.progress.lifts[item.id].to,item.bottom);
 act(b,'hold',{...feet,x:feet.x+25},{active:true});assert.equal(s.progress.lifts[item.id].to,item.top);
 advance(1000);const current=s.valueAt(s.progress.lifts[item.id]);assert.ok(current<item.bottom&&current>item.top);
 act(b,'hold',feet,{active:false});assert.equal(s.progress.lifts[item.id].to,item.bottom);
 assert.equal(s.progress.lifts[item.id].from,current);
});
test('a block covering the key must move; pushing is contact-validated and event-driven',()=>{
 const {s,a,act,advance}=setup(3);s.setOnline(['alice','bob']);const box=s.level.boxes[0];
 assert.equal(act(a,'key',s.level.key).status,'rejected');
 assert.equal(act(a,'push',{id:box.id,...s.level.spawn},{direction:-1}).status,'rejected');
 const point=s.valueAt(s.progress.boxes[box.id]);const pushed=act(a,'push',{id:box.id,x:point.x+box.w,y:146},{direction:-1});
 assert.equal(pushed.status,'accepted');assert.equal(pushed.events[0].kind,'box');
 advance(2000);assert.equal(s.valueAt(s.progress.boxes[box.id]).x,box.nodes[0].x);
 assert.equal(act(a,'key',s.level.key).status,'accepted');
});
test('lower crate crosses only while the upper player holds the button, then unblocks the upper route',()=>{
 const {s,a,b,act,advance}=setup(4);s.setOnline(['alice','bob']);const box=s.level.boxes[0],pad=s.level.switches[0];
 let point=s.valueAt(s.progress.boxes[box.id]);
 assert.equal(act(b,'push',{id:box.id,x:point.x-20,y:146},{direction:1}).status,'rejected');
 for(let i=1;i<box.nodes.length;i++){
  act(a,'hold',pad,{active:true});point=s.valueAt(s.progress.boxes[box.id]);
  assert.equal(act(b,'push',{id:box.id,x:point.x-20,y:146},{direction:1}).status,'accepted');advance(2000);
 }
 assert.ok(s.progress.gates.includes('upper-a'));
 act(a,'hold',pad,{active:false});assert.ok(!s.progress.gates.includes('lower-bridge'));assert.ok(s.progress.gates.includes('upper-a'));
});

test('releasing a block stops it between pads; stopping cannot light a distant pad',()=>{
 const {s,a,b,act,advance}=setup(4);s.setOnline(['alice','bob']);const box=s.level.boxes[0],pad=s.level.switches[0];act(a,'hold',pad,{active:true});
 const point=s.valueAt(s.progress.boxes[box.id]);act(b,'push',{id:box.id,x:point.x-20,y:146},{direction:1});advance(300);
 const stopped=s.valueAt(s.progress.boxes[box.id]);assert.ok(stopped.x>point.x&&stopped.x<box.nodes[1].x);
 act(b,'push',{id:box.id,...s.level.spawn},{direction:0});advance(2500);
 assert.deepEqual(s.valueAt(s.progress.boxes[box.id]),stopped);assert.ok(!s.progress.gates.includes('upper-a'));
 act(a,'hold',pad,{active:true});assert.equal(act(b,'push',{id:box.id,x:stopped.x-20,y:146},{direction:1}).status,'accepted');
});
test('pausing freezes the scene clock and replay starts its animations from zero',()=>{
 const {s,advance}=setup(5);advance(5000);assert.equal(s.sceneClock(),0);
 s.setOnline(['alice','bob']);advance(1700);assert.equal(s.sceneClock(),1700);
 s.setOnline(['alice']);advance(20000);assert.equal(s.sceneClock(),1700);
 s.setOnline(['alice','bob']);advance(300);assert.equal(s.sceneClock(),2000);
 const key=s.open('alice','extra_browser'),r=new ParkReplica();r.resume(s.resume(key));
 for(const e of s.resetAttempt())r.event(e);assert.equal(s.sceneClock(),0);assert.ok(r.clock()<10);
});
test('multiple tabs for one identity do not add riders',()=>{
 const {s,a,act}=setup(2);s.setOnline(['alice','bob']);const other=s.open('alice','another_browser'),lift=s.level.weightedLifts[0],feet={id:lift.id,x:lift.x,y:lift.bottom-24};
 act(a,'hold',feet,{active:true});s.command(other,{epoch:s.epoch,level:s.level.id,sequence:1,kind:'hold',target:lift.id,active:true,pose:{...feet,vx:0,vy:0}});
 assert.deepEqual(s.progress.holds[lift.id],['alice']);assert.equal(s.progress.lifts[lift.id].to,lift.bottom);
});

for(const count of [2,3,4,8,24])test(`weighted shelter scales for ${count} students without overcrowding`,()=>{
 const {s,act}=setup(5),names=Array.from({length:count},(_,i)=>'student'+i);
 for(const name of names)s.addMember(name);s.setOnline(names);
 const lift=s.level.weightedLifts[0],required=Math.min(4,Math.ceil(count/2));
 for(let i=0;i<required;i++){
  const key=s.open(names[i],'browser_'+i);
  act(key,'hold',{id:lift.id,x:lift.x+i*25,y:lift.top-24},{active:true});
  assert.equal(s.progress.lifts[lift.id].to,i+1===required?lift.bottom:lift.top);
 }
});

for(const count of [2,8,24])test(`exit lift enforces the ${count}-student group's capacity`,()=>{
 const {s,act}=setup(5),names=Array.from({length:count},(_,i)=>'rider'+i);
 for(const name of names)s.addMember(name);s.setOnline(names);
 const lift=s.level.weightedLifts[1],capacity=Math.min(4,Math.ceil(count/2));
 for(let i=0;i<=capacity;i++){
  const key=s.open(names[i],'browser_'+i);
  act(key,'hold',{id:lift.id,x:lift.x,y:lift.bottom-24},{active:true});
  assert.equal(s.progress.lifts[lift.id].to,i<capacity?lift.top:lift.bottom);
 }
});
