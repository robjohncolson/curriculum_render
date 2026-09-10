// Original board-sized layouts based on PICO PARK's cooperative rules.
export const PARK_LEVEL_COUNT = 6;
export const PARK_HOUR_MS = 60 * 60 * 1000;
export const PARK_PROTOCOL = 4;
const tile = (x,y,w,h=16) => ({x,y,w,h});
export function createParkLevel(index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= PARK_LEVEL_COUNT) throw new Error('Unknown park level');
  const level = {
    id: ['hello','switchback','lift-relay','moving-walls','upstairs-downstairs','weight-together'][index]+'-v4',
    title: ['Hello together','Switchback','Lift relay','Moving walls','Upstairs / downstairs','Weight together'][index],
    reference: ['World 1-1','Paired buttons','Two-person lift','World 1-2','World 1-3','World 1-4'][index],
    index, protocol: PARK_PROTOCOL, width: 960, height: 220,
    spawn:{x:90,y:146},exit:{x:43,y:146},checkpoint:{x:90,y:146},
    platforms:[], switches:[], gates:[], boxes:[], weightedLifts:[], hazards:[],
    key:{id:'key',x:675,y:146},goal:{x:910,y:40}, lift:null
  };
  if(index===0) {
    level.platforms=[tile(0,170,300,50),tile(300,106,100,114),tile(460,106,140,114),tile(600,170,250,50),tile(830,64,130)];
    level.switches=[{id:'bridge',x:510,y:82}];
    level.gates=[{id:'bridge',holds:['bridge'],terrain:[tile(400,106,60,14),tile(260,138,40,32)]}];
    level.lift={x:770,w:60,h:10,bottom:170,top:64,cycleMs:10000};
    level.hint='Give a friend a boost. Hold the button until everyone crosses.';
  } else if(index===1) {
    level.width=1440;
    level.platforms=[tile(0,170,300,50),tile(480,170,220,50),tile(880,170,220,50),tile(1280,170,160,50)];
    for(const [i,x] of [300,700,1100].entries()) {
      level.switches.push({id:'left-'+i,x:x-55,y:146},{id:'right-'+i,x:x+210,y:146});
      level.gates.push({id:'cross-'+i,holds:['left-'+i,'right-'+i],terrain:[tile(x,170,180,14)]});
    }
    level.key={id:'key',x:1330,y:146};level.goal={x:1390,y:146};
    level.hint='Hold a button for your friend. Their button lets you follow.';
  } else if(index===2) {
    level.platforms=[tile(0,170,400,50),tile(500,64,460)];
    level.weightedLifts=[{id:'pair-lift',x:420,w:70,h:10,bottom:170,top:64,minRiders:2,maxRiders:2}];
    level.key={id:'key',x:650,y:40};
    level.hint='Two riders raise the lift. Take turns and come back for friends.';
  } else if(index===3) {
    level.width=1280;
    level.platforms=[tile(0,170,620,50),tile(720,170,280,50),tile(1000,90,280,130)];
    level.boxes=[
      {id:'wall',w:100,h:40,start:1,nodes:[{x:200,y:130},{x:300,y:130},{x:460,y:130},{x:620,y:170}]},
      {id:'step',w:100,h:40,start:0,nodes:[{x:820,y:130},{x:900,y:130}]}
    ];
    level.key={id:'key',x:335,y:146};level.goal={x:1210,y:66};
    level.hint='Push the wall left for the key, then right into the gap. Help everyone over.';
  } else if(index===4) {
    level.width=1280;
    level.platforms=[tile(0,170,480,50),tile(660,170,400,50),tile(180,134,80,12),tile(280,98,80,12),tile(380,64,680,12),tile(1140,64,140)];
    level.switches=[{id:'lower-bridge',x:410,y:40}];
    level.boxes=[
      {id:'crate-a',w:32,h:32,start:0,nodes:[{x:420,y:138},{x:500,y:138},{x:600,y:138},{x:680,y:138}],requires:'lower-bridge'},
      {id:'crate-b',w:32,h:32,start:0,nodes:[{x:760,y:138},{x:830,y:138},{x:900,y:138}]}
    ];
    level.gates=[
      {id:'lower-bridge',holds:['lower-bridge'],terrain:[tile(480,170,180,14)]},
      {id:'upper-a',boxes:['crate-a'],wall:true,terrain:[tile(570,-40,24,104)]},
      {id:'upper-b',boxes:['crate-b'],wall:true,terrain:[tile(930,-40,24,104)]}
    ];
    level.lift={x:1060,w:80,h:10,bottom:170,top:64,cycleMs:10000};
    level.key={id:'key',x:990,y:40};level.goal={x:1210,y:40};
    level.hint='One friend holds the upper button. The other pushes crates onto the red pads.';
  } else {
    level.width=1120;
    level.platforms=[tile(0,170,260,50),tile(320,100,180,16),tile(660,210,190,30),tile(920,64,200)];
    level.lift={x:260,w:60,h:10,bottom:170,top:100,cycleMs:10000};
    level.weightedLifts=[
      {id:'shelter',x:500,w:160,h:10,bottom:210,top:100,minRiders:'half',descend:true},
      {id:'exit-lift',x:850,w:60,h:10,bottom:210,top:64,minRiders:1,maxRiders:'half'}
    ];
    level.hazards=[{id:'sweeper',x:350,toX:760,y:18,w:26,h:82,cycleMs:12000}];
    level.key={id:'key',x:705,y:186};level.goal={x:1050,y:40};
    level.hint='Weight lowers the shelter. Hide from the pillar, fetch the key, and share the small lift.';
  }
  return level;
}
