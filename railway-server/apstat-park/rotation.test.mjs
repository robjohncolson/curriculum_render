import test from 'node:test';
import assert from 'node:assert/strict';
import {ParkSession} from './session.mjs';
test('earned door progress survives hour boundaries; pressure does not remain after departure',()=>{
 let wall=0;const s=new ParkSession({epoch:'stable',members:['alice','bob'],wallNow:()=>wall});s.setOnline(['alice','bob']);const key=s.open('alice','browser_a');
 for(const [sequence,kind,item] of [[1,'switch',s.level.switches[0]],[2,'key',s.level.key],[3,'unlock',s.level.goal]])s.command(key,{epoch:s.epoch,level:s.level.id,sequence,kind,target:item.id,pose:{x:item.x,y:item.y,vx:0,vy:0}});
 s.setOnline([]);assert.equal(s.progress.bridgeOpen,false);assert.equal(s.progress.doorOpen,true);const original=s.level.id;
 for(const hour of [1,7,24]){wall=hour*3600000;assert.deepEqual(s.rotateIfReady({empty:true}),[]);assert.equal(s.level.id,original);assert.equal(s.progress.doorOpen,true);}
});
