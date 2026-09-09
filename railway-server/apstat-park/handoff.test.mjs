import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession } from './session.mjs';
import { ParkReplica } from '../../../follow-alongs/apstat-park/replica.mjs';
const at = item => ({ x: item.x, y: item.y, vx: 0, vy: 0 });

for(const count of [1,2,24]) for(const index of [1,2]) test('shared sample puzzle '+index+' supports '+count+' players and absent collectors',()=>{
 const members=Array.from({length:count},(_,i)=>'player'+i);
 const session=new ParkSession({epoch:'handoff',members,wallNow:()=>index*3600000});
 const streams=members.map(name=>session.open(name,'client_'+name)), sequences=members.map(()=>0);
 const replica=new ParkReplica();replica.resume(session.resume(streams[0]));
 const act=(i,kind,item,location=item)=>session.command(streams[i],{epoch:session.epoch,level:session.level.id,sequence:++sequences[i],kind,target:item.id,pose:at(location)});
 for(const [i,parcel] of session.level.samples.entries()){
   const destination=session.level.switches.find(station=>station.id===parcel.destination);
   assert.equal(act(0,'deliver',parcel,destination).status,'rejected');
   assert.equal(act(0,'switch',destination).status,'rejected');
   assert.equal(act(0,'sample',parcel).status,'accepted');
   // Any teammate can finish a collected parcel, even if its collector disconnects.
   session.setOnline(members.slice(1));
   const helper=count===1?0:1;
   assert.equal(act(helper,'deliver',parcel,destination).status,'accepted');
   assert.equal(act(helper,'switch',destination).status,'accepted');
 }
 assert.equal(session.progress.bridgeOpen,true);assert.equal(session.progress.deliveries.length,4);
 replica.resume(session.resume(streams[0],replica.revision));
 assert.deepEqual(replica.state.progress,session.progress);
 for(let i=0;i<count;i++) assert.equal(act(i,'arrive',{id:'exit',...session.level.goal}).status,'accepted');
 assert.equal(session.progress.arrived.length,count);
});
