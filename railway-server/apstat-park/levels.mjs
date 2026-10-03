// Original board-sized layouts based on PICO PARK's cooperative rules.
export const PARK_LEVEL_COUNT = 7;
export const PARK_HOUR_MS = 60 * 60 * 1000;
// Protocol 4 is the legacy board client (levels 0-5). Protocol 5 adds level 6's
// schema: latches, party-conditional geometry, catch zones, idle tracking.
export const PARK_PROTOCOL = 4;
export const PARK_PROTOCOL_LATEST = 5;
const tile = (x,y,w,h=16) => ({x,y,w,h});
export const parkLevelMinProtocol = index => index === 6 ? 5 : PARK_PROTOCOL;

// PICO PARK stage_jump01 map (recovered/lua_archive_sources/stage/stage_jump01.lua), stored
// column by column like the Lua (each string is one column, top row first), run-length encoded.
// Codes: N=MC_NON (empty) A=MC_WAR C=MC_FLC L=MC_FLL R=MC_FLR W=MC_WAL I=MC_INC; all but N are solid.
export const JUMP01_TILE_CODES = { N: 1, C: 3, L: 4, R: 5, W: 9, A: 10, I: 11 };
const JUMP01_COLUMNS = [[1,'AAAAAAAAAA'],[16,'NNNNNNNNNC'],[1,'NNNNNNNNNR'],[1,'NNNNNNNNNN'],[1,'NNNNNNNNNL'],
  [11,'NNNNNNNNNC'],[1,'NNNNNNNNNR'],[5,'NNNNNNNNNN'],[1,'NNNNNNNNNL'],[17,'NNNNNNNNNC'],[1,'NNNNLWWWWI'],
  [5,'NNNNCIIIII'],[1,'WWWWIIIIII']].flatMap(([count, column]) => Array(count).fill(column));

// Build-time compiler: solid tiles -> vertical runs per column -> runs merged across
// neighbouring columns with identical runs. Few rectangles, no per-tile collision.
export function compileTileMap(columns, size) {
  const runsOf = column => {
    const runs = [];
    for (let row = 0; row < column.length; row++) {
      if (column[row] === 'N') continue;
      const last = runs.at(-1);
      if (last && last.end === row) last.end++; else runs.push({ start: row, end: row + 1 });
    }
    return runs;
  };
  const rects = [], open = new Map();
  columns.forEach((column, col) => {
    const seen = new Set();
    for (const run of runsOf(column)) {
      const id = run.start + ':' + run.end;
      seen.add(id);
      if (open.has(id) && open.get(id).last === col - 1) open.get(id).last = col;
      else { if (open.has(id)) rects.push(open.get(id)); open.set(id, { ...run, first: col, last: col }); }
    }
    for (const [id, rect] of open) if (!seen.has(id)) { rects.push(rect); open.delete(id); }
  });
  rects.push(...open.values());
  return rects.sort((a, b) => a.first - b.first || a.start - b.start)
    .map(r => ({ x: r.first * size, y: r.start * size, w: (r.last - r.first + 1) * size, h: (r.end - r.start) * size, kind: 'tile' }));
}

// Level 6: PICO PARK 1-1 at half scale. Measured values are in original pixels in the
// CONTINUATION notes and player-trace run-1/run-2; everything here is halved. Poses (and the pose
// anchors key/goal/switch/spawn/exit/checkpoints) are the top-left of the 16x23 body; feet = y + body.h.
// Trigger boxes (key.pickup, switches[].trigger, goal.enter) use body centre x (cx = x + 8) and feet.
function jump01() {
  const T = 24, floor = 216, body = { w: 16, h: 23 };
  const stand = (cx, feet) => ({ x: cx - body.w / 2, y: feet - body.h });
  // Lua Player rows x 100..450 (cx 50..225), shifted 6 px right so slot 0 stays outside the
  // calendar exit's 22 px radius with the exit against the wall.
  const spawnSlots = Array.from({ length: 8 }, (_, i) => stand(56 + 25 * i, floor));
  const catchZones = [
    { id: 'pit-1', x: 384, y: 240, w: 120, h: 48, to: stand(360, -24) },   // Warp 768+240 -> (720,-48)
    { id: 'pit-2', x: 768, y: 240, w: 216, h: 48, to: stand(696, -24) },   // Warp 1536+432 -> (1392,-48)
  ];
  return {
    id: 'pico-1-1-v5', title: 'Jump together', reference: 'PICO PARK 1-1',
    index: 6, protocol: 5, minProtocol: 5, minPlayers: 1, physics: 'pico', width: 62 * T, height: 10 * T,
    body, reach: 32, idleMs: 120000, resetWhenAbandoned: true,
    tiles: { size: T, codes: JUMP01_TILE_CODES, columns: JUMP01_COLUMNS },
    spawn: spawnSlots[0], spawnSlots, exit: stand(32, floor), checkpoint: spawnSlots[0],
    checkpoints: [...spawnSlots, ...catchZones.map(zone => zone.to)],
    platforms: [
      ...compileTileMap(JUMP01_COLUMNS, T),
      { x: 856, y: floor, w: 80, h: 12, kind: 'bridge' },                          // resting bridge, always there
      // Original: step A for <= 6 players, step B for <= 4 (8 players max). Rooms above 8 get step B back.
      // Deliberate deviation: step A is always present (original <= 6), because without it 7-8 need a
      // 3-high stack jumping in a ~100 ms window, too tight over a 2 Hz relay (jump01.test.mjs).
      { x: 648, y: 192, w: 120, h: 24, kind: 'block', party: { min: 0, max: 64 } },  // step A
      { x: 672, y: 168, w: 96, h: 24, kind: 'block', party: [{ min: 0, max: 4 }, { min: 9, max: 64 }] },   // step B, on A
    ],
    // Fires with cx within 14 of 960 and feet at most 4 px above the floor, even airborne.
    switches: [{ id: 'bridge', ...stand(960, floor), latch: true, trigger: { cx: 960, halfWidth: 14, feetMin: 212, feetMax: 216 } }],
    // Extends 2 frames after the trigger at 1 px/frame (60 px/s) from 856 to 746; riders are not carried.
    gates: [{ id: 'bridge', latch: ['bridge'], party: { min: 1, max: 1 },
      terrain: [{ x: 746, y: floor, w: 110, h: 12 }], extend: { from: 856, to: 746, speed: 60, delayMs: 33 } }],
    boxes: [], hazards: [], lift: null,
    // Measured per room size n: riders n, travel 184 + 4n, rise 1, descent 1.2 - 0.1n px/frame (original).
    // Port: n = min(cap, active party). Half scale: top = rest - (92 + 2n), rise 30 px/s, descent 36 - 3n px/s.
    // Solid from below, 9.5 thick; a 'lift-under' lease from a player beneath stops its descent at
    // that player's head; it resumes resumeMs after the last lease ends (4 frames).
    weightedLifts: [{ id: 'lift', x: 1222, w: 92, h: 9.5, rest: 201.5, home: 201.5, bottom: 201.5, speed: 30, floor,
      perParty: { cap: 8, travelBase: 92, travelPer: 2, descentBase: 36, descentPer: -3 },
      blockId: 'lift-under', resumeMs: 67, stack: { max: 7, slack: 17 } }],
    catchZones, catchStack: 25,
    // Pickup: cx within 15 of 1176, feet between 82.7 and 132 (head-above bound measured 106.5-111.5).
    // The key trails its holder by 8 px and opens the door when it reaches x 1420; it is consumed.
    key: { id: 'key', ...stand(1176, 96 + body.h / 2), trail: 8, pickup: { cx: 1176, halfWidth: 15, feetMin: 82.7, feetMax: 132 } },
    // Entry needs a fresh up-press with cx in 1421..1456 once the door is open (key holder or not).
    goal: { ...stand(1440, 96), unlockKeyX: 1420, enter: { cxMin: 1421, cxMax: 1456 } },
    hint: 'Help each other across. Step on the far switch, ride the lift together, then bring the key to the door.',
  };
}

export function createParkLevel(index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= PARK_LEVEL_COUNT) throw new Error('Unknown park level');
  if (index === 6) return jump01();
  const level = {
    id: ['hello','switchback','lift-relay','moving-walls','upstairs-downstairs','weight-together'][index]+'-v4',
    title: ['Hello together','Switchback','Lift relay','Moving walls','Upstairs / downstairs','Weight together'][index],
    reference: ['World 1-1','Paired buttons','Two-person lift','World 1-2','World 1-3','World 1-4'][index],
    index, protocol: PARK_PROTOCOL, minProtocol: PARK_PROTOCOL, minPlayers: 2, physics: 'legacy', width: 960, height: 220,
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
