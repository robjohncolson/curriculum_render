import { randomUUID, randomBytes } from 'node:crypto';

// Protocol 8 adds persistent switches and key delivery with UP at the goal.
// Mixed physics versions must not participate in the same input replay.
// Protocol 9 (teacher 2026-10-07): push boxes that fall past the kill line return from the sky
// (recovered patch 'push-box-sky-respawn'); a protocol-8 replay would diverge from it.
// Protocol 10 (teacher 2026-10-07): boxes hold switches, ride cats' heads, stacked cats weigh lifts
// (recovered patches 'push-box-holds-switches', 'push-box-head-carry', 'stacked-cats-weigh-lifts').
// Protocol 11 (teacher 2026-10-07): literal Rects use the native left-bottom anchor ('rect-left-bottom-anchor').
// Protocol 12 (teacher 2026-10-07): head boxes follow the native rule ('push-box-head-carry' rewrite: walking
// leaves the box, a cat cannot jump through it, only lifts / MoveWalls carry the stack).
// Protocol 13 (teacher 2026-10-07, retail capture): a jump with a body on the head hands the jump up the column;
// the first free box hops 22 units ('head-stack-jump-impulse').
// Protocol 14 (teacher 2026-10-07, retail capture): what rests on a walking cat (cats, boxes, transitively)
// rides its sideways move; a cat on a pushed box carries its own stack ('stack-riding').
// Protocol 15 (teacher 2026-10-07, retail capture): a lift coming down onto a standing cat or box stops on its top
// and holds, never moving into it ('descending-lift-stops-on-bodies').
// Protocol 16 (teacher 2026-10-07, 1-4 vs the original): MoveWall rows decode to the native pillar that waits for its
// sensor ('native-movewall'); the UpDownLift has its native 118 x 18 body ('native-lift-and-ledge-look').
// Protocol 17 (teacher 2026-10-07, 1-4 platforms): plain WeightedLifts use the native wide body, threshold, travel,
// step speeds, auto-return, box weight and underside freeze ('native-weighted-lift').
// Protocol 18 (fidelity audit 2026-10-07, batch 1): every cat has the native 32 x 46 body standing 1 above its row
// point, p0 = 1 rows spawn facing left, and player rows bind slots by row order ('native-player-body').
// Protocol 19 (fidelity audit 2026-10-07, batch 2): goals open only on a delivered key, native doors; Rects with
// party terms; party-moved keys; bottom-anchored FallBox / ColorBox ('goal-native-open-and-door', 'rect-party-terms',
// 'key-party-offset', 'bottom-anchored-boxes').
// Protocol 20 (fidelity audit 2026-10-07, batch 3): box-family / ColorBox push boxes, box pushes box, WeightedLiftEx
// variants, the Lift's sideways carry, folded / moving Bridges and Gates ('normal-small-box-are-pushboxes',
// 'colorbox-colour-push', 'weighted-lift-ex-variants', 'lift-horizontal-carry', 'bridge-folded-start-and-motion').
// Protocol 21 (teacher 2026-10-07, 1-4 freeze): a MoveWall step that would pin a body is undone, and a rising weighted
// lift never carries its riders into a solid ('native-movewall-rollback', 'weighted-lift-chain-test').
// Protocol 22 (fidelity audit 2026-10-07, batch 5): swept / cut / drawn Thunder beams, GuardPlayer shield planks,
// native StepEnemy / UpDownEnemy / BowwowEnemy bodies and motion ('thunder-beam', 'guard-shields', 'step-enemy-native').
// Protocol 23 (fidelity audit 2026-10-08, batch 6): solid armed FallBoxes, every push box falls, solid MC_D* chips,
// DarknessWeightedLift ignores chips, native BowwowEnemy states, StepEnemy chip face rule ('fallbox-solid-while-armed',
// 'pushbox-general-fall', 'mc-d-tiles-solid', 'darkness-weighted-lift-tiles', 'bowwow-chase-stops', 'stepenemy-unspawn').
// Protocol 24 (fidelity audit 2026-10-08, batch 7): native rope, solid launching JumpStands (boxes too), a growing cat
// lifts its rider ('distance-constraint-native', 'jumpstand-launch', 'scaleswitch-carry').
// Protocol 25 (fidelity audit 2026-10-08, batch 8): MultiPlayer jump relay, majority vote, JumpSwitch / DelaySwitch,
// top-left JumpArea and Warp sensors ('multi-jump-relay', 'jumparea-top-left', 'majority-player', 'jumpswitch-launch',
// 'delayswitch-countdown', 'warp-sensor-top-left').
// Protocol 26 (fidelity audit 2026-10-08, batch 9): jump off a falling partner, pushed boxes carry their stack,
// ColorBox body inset 2, landing on a rising lift ('jump-off-body-contact', 'pushed-box-carries-stack',
// 'colorbox-native-body', 'land-on-rising-lift').
// Protocol 27 (fidelity audit 2026-10-08, batch 10): native walk 3 per tick and push 1 per tick
// ('native-walk-and-push-speed').
// Protocol 28 (fidelity audit 2026-10-08, batch 11): native breakout (dome paddles, a ball per row, lost balls and
// restart, hidden key, inert sync area) ('breakout-paddle-dome', 'breakout-ball-per-row', 'breakout-loss-and-fail',
// 'breakout-key-hidden-until-clear', 'breakout-syncarea-inert').
// Protocol 29 (fidelity audit 2026-10-08, batch 12): world 9 - laser cannon / key box, seesaws and balance pans,
// bouncing ball / ball box ('laser-ball-pitcher', 'laser-key-box', 'seesaw-and-balance', 'bound-ball-pitcher', 'ball-box').
// Protocol 30 (fidelity audit 2026-10-08, batch 13): world 11 action button / warp gun / magnet.
// Protocol 31 (fidelity audit 2026-10-08, batch 14): 8-1 / 8-3 native co-op Tetris puzzle sub-stage, seeded from the
// stage seed ('puzzle-stage-data', 'puzzle-proxies-netcode-only', 'puzzle-tetris', 'puzzle-tetris-draw').
// Protocol 32 (fidelity audit 2026-10-08, batch 15): rope drawn between the cats and swept against bodies, cats in
// front of the door, native door entry on an UP press (hidden, bodiless, can come back out after 1 s)
// ('rope-draw', 'rope-pull-solids', 'actor-draw-depth', 'goal-enter-native'); input bit 512 = UP press edge, so an
// input timeout followed by the same held-UP heartbeat is never a new press.
export const CAMPAIGN_PROTOCOL = 32;
export const CAMPAIGN_STAGES = 48;
export const CAMPAIGN_CLEAR_MS = 3200;
export const CAMPAIGN_IDLE_MS = 60000;
const MEMBERSHIP_CHECK_MS = 1000;
const MAX_PLAYERS = 8, INPUT_TIMEOUT = 1500, RECONNECT_MS = 15000;
// Input bits: 31 held directions + jump, 32 jump press edge, 64 action held, 256 action press edge, 512 up press edge
// (128 is reserved).
const HELD_BITS = 31 | 64, EDGE_BITS = 32 | 256 | 512, INPUT_BITS = HELD_BITS | EDGE_BITS;
const TYPES = new Set(['campaign_join', 'campaign_input', 'campaign_resume', 'campaign_clear', 'campaign_retry', 'campaign_leave',
  'campaign_select', 'campaign_open_stage']);

// Ordered inputs, not client physics snapshots. Every browser runs the same recovered
// engine, seed, party and 60 Hz frames. Completion requires every active participant.
// wallet (campaign-wallet.mjs, teacher 2026-10-07): keys, cleared stages and open stages. A stage is
// startable by a party when it is 1-1, or open for the park room AND every present party member has
// cleared every stage before it. Without a wallet every stage is startable (the pre-key behaviour).
export function createCampaignService({ registry, send, now = () => performance.now(), canEnter = () => true, wallet = null }) {
  const rooms = new Map(), bindings = new Map();
  const idleSockets = new WeakSet();
  let nextMembershipCheck = 0;
  const allStages = Array.from({ length: CAMPAIGN_STAGES }, (_, stage) => stage);
  function startable(section, party, stage) {
    return !wallet || wallet.startable(section, party, stage);
  }
  // The additive progress view: unspent keys {name: n}, cleared stages {name: [stage]}, the room's
  // open stages, the present party and the stages that party may start.
  function progress(section, party) {
    if (!wallet) return { keys: {}, cleared: {}, open: allStages, party, startable: allStages };
    return { ...wallet.view(section), party, startable: wallet.startableList(section, party) };
  }
  // A non-binding look at where this player would land: their own team, else the first team with
  // space that has players, else a team of their own.
  function prospect(section, name, binding) {
    const candidates = [...rooms.values()].filter(room => room.section === section);
    const room = binding?.room || candidates.find(room => room.roster.includes(name) || members(room).includes(name))
      || candidates.find(room => members(room).length && new Set([...room.roster, ...members(room)]).size < MAX_PLAYERS);
    const others = room ? members(room).filter(other => other !== name) : [];
    const team = room && others.length ? { stageIndex: room.stageIndex, phase: room.phase, roster: room.roster } : null;
    return { type: 'campaign_progress', protocol: CAMPAIGN_PROTOCOL, ...progress(section, [...others, name]), team };
  }
  function sendProgress(section) {
    for (const [ws, binding] of bindings) {
      if (binding.room.section !== section || (ws.bufferedAmount || 0) >= 32768) continue;
      send(ws, prospect(section, binding.name, binding));
    }
  }
  function stageLabel(stage) {
    return (Math.floor(stage / 4) + 1) + '-' + (stage % 4 + 1);
  }
  function identity(ws) {
    const who = registry._wsEntry(ws);
    if (!who || !registry.stateFor(who.section, 'student', who.username)?.members
      ?.some(member => member.username === who.username && member.online !== false)) throw new Error('Join the classroom first.');
    return who;
  }
  function members(room) {
    // Teacher decision 2026-10-06: the teacher is a team member like anyone (no helper exclusion).
    return [...new Set([...bindings.values()].filter(binding => binding.room === room).map(binding => binding.name))];
  }
  function snapshot(room, from = 0) {
    const events = room.log.filter(event => event.frame >= from);
    const page = events.slice(0, 500);
    const to = events.length > 500 ? events[500].frame - 1 : room.frame;
    return { type: 'campaign_state', protocol: CAMPAIGN_PROTOCOL, team: room.id, epoch: room.epoch,
      stageIndex: room.stageIndex, lap: room.lap, seed: room.seed, roster: room.roster, helpers: room.helpers,
      waiting: members(room).filter(name => !room.roster.includes(name)),
      phase: room.phase, reason: room.reason, from, to, events: page, more: to < room.frame,
      progress: progress(room.section, members(room)) };
  }
  function broadcast(room, packet) {
    for (const [ws, binding] of bindings) {
      if (binding.room === room && (ws.bufferedAmount || 0) < 32768) send(ws, packet);
    }
  }
  function restart(room, reason) {
    room.epoch = randomUUID(); room.seed = randomBytes(4).readUInt32LE();
    room.roster = members(room).slice(0, MAX_PLAYERS);
    // Teacher decision 2026-10-06: helpers are retired, so only a roster starts play.
    // A team at the stage select stays there until someone chooses a stage.
    room.phase = !room.roster.length ? 'waiting' : room.phase === 'select' ? 'select' : 'playing'; room.reason = reason;
    room.frame = 0; room.broadcastFrame = 0; room.log = [{ frame: 0, inputs: Array(Math.max(2, room.roster.length)).fill(0) }];
    room.inputs.clear(); room.cleared.clear(); room.lastTick = now(); room.clearAt = null;
    room.missingAt.clear(); room.touched = now();
    broadcast(room, snapshot(room));
  }
  function detach(ws) {
    const binding = bindings.get(ws);
    bindings.delete(ws);
    if (!binding) return;
    const { room, name } = binding;
    if (!members(room).includes(name)) {
      room.inputs.delete(name); room.missingAt.set(name, now());
    }
  }
  // stage (optional): the stage chosen at the stage select. A team fits when nobody else is playing
  // in it, it is at the stage select, or it is already on that stage.
  function findRoom(section, name, stage) {
    const fits = room => stage === undefined || room.phase === 'select' || room.stageIndex === stage
      || !members(room).some(other => other !== name);
    const candidates = [...rooms.values()].filter(room => room.section === section && fits(room));
    let room = candidates.find(room => room.roster.includes(name) || members(room).includes(name));
    // Teacher decision 2026-10-06: the teacher is placed by the same rule as students (no "join any team" branch).
    room ||=candidates.find(room => new Set([...room.roster, ...members(room)]).size < MAX_PLAYERS);
    if (room) return room;
    if (rooms.size >= 64) throw new Error('The park is full. Please try again shortly.');
    room = { id: randomUUID(), section, epoch: randomUUID(), seed: 1, stageIndex: stage ?? 0, lap: 1,
      roster: [], helpers: [], phase: 'waiting', frame: 0, log: [], inputs: new Map(), cleared: new Set(), missingAt: new Map(),
      startAt: now() + 1500, lastTick: now(), touched: now(), reason: null, clearAt: null };
    rooms.set(room.id, room);
    return room;
  }
  function tick() {
    const changedRooms = new Set();
    const checkMembership = now() >= nextMembershipCheck;
    if (checkMembership) nextMembershipCheck = now() + MEMBERSHIP_CHECK_MS;
    for (const [ws, binding] of bindings) {
      if (checkMembership) {
        try { const who = identity(ws); if (who.section !== binding.room.section || who.username !== binding.name) detach(ws); }
        catch { detach(ws); }
      }
      // A team reading the stage select is not idle.
      if (binding.room.phase === 'select') binding.activeAt = now();
      if (bindings.has(ws) && now() - binding.activeAt >= CAMPAIGN_IDLE_MS) {
        send(ws, { type: 'campaign_idle', message: 'Press a game key to rejoin your team.' });
        idleSockets.add(ws); detach(ws); changedRooms.add(binding.room);
      }
    }
    for (const room of changedRooms) {
      if (room.roster.some(name => !members(room).includes(name))) {
        restart(room, 'An inactive teammate left. Restarting this stage with the active team.');
      }
    }
    // Group connections once, instead of scanning every connection for every room.
    const onlineByRoom = new Map();
    for (const { room, name } of bindings.values()) {
      if (!onlineByRoom.has(room)) onlineByRoom.set(room, new Set());
      onlineByRoom.get(room).add(name);
    }
    for (const room of rooms.values()) {
      const online = onlineByRoom.get(room) || new Set();
      if (!online.size) { room.lastTick = now(); if (now() - room.touched > 7200000) rooms.delete(room.id); continue; }
      if (room.phase === 'waiting') { if (now() >= room.startAt) restart(room, null); continue; }
      // At the stage select nothing is simulated; a member's campaign_join {stage} starts play.
      if (room.phase === 'select') { room.lastTick = now(); room.touched = now(); continue; }
      if (!room.roster.length && members(room).length) { restart(room, null); continue; }
      if (room.roster.some(name => !online.has(name))) {
        if ([...room.missingAt.values()].some(at => now() - at >= RECONNECT_MS)) restart(room, 'A teammate left. Restarting this stage with the current team.');
        room.lastTick = now(); continue;
      }
      if (room.phase === 'clear') {
        if (now() - room.clearAt >= CAMPAIGN_CLEAR_MS) {
          const next = (room.stageIndex + 1) % CAMPAIGN_STAGES;
          // Teacher 2026-10-07: a team never walks into a stage that is not open, or that someone
          // present has not earned. It goes back to the stage select instead.
          if (next && !startable(room.section, members(room), next)) {
            room.phase = 'select';
            restart(room, 'Stage ' + stageLabel(next) + ' is locked. Open it with a key, or choose a stage.');
            continue;
          }
          room.stageIndex = next;
          if (!room.stageIndex) room.lap++;
          restart(room, null);
        }
        continue;
      }
      // Cap catch-up after an event-loop stall, so a lag spike cannot fast-forward hazards.
      const steps = Math.min(6, Math.floor((now() - room.lastTick) * 60 / 1000 + 1e-7));
      if (!steps) continue;
      const events = [];
      for (let step = 0; step < steps; step++) {
        const inputs = room.roster.flatMap(name => {
          const input = room.inputs.get(name);
          if (!input || now() - input.at > INPUT_TIMEOUT) return room.roster.length === 1 ? [0, 0] : [0];
          const values = room.roster.length === 1 ? [input.bits, input.buddy] : [input.bits];
          // Bits: 1 left, 2 right, 4 up, 8 down, 16 jump, 32 jump press edge, 64 action (native input bit 11,
          // '[shot]'), 256 action press edge, 512 up press edge. Held buttons persist; the press edges last one tick.
          input.bits &= HELD_BITS; input.buddy &= HELD_BITS;
          return values;
        });
        while (inputs.length < 2) inputs.push(0);
        // Teacher decision 2026-10-06: no helper slots (the teacher's off-roster cat); every player is on the roster.
        room.frame++;
        if (JSON.stringify(inputs) !== JSON.stringify(room.log.at(-1)?.inputs)) {
          const event = { frame: room.frame, inputs }; room.log.push(event); events.push(event);
        }
      }
      room.lastTick = Math.max(room.lastTick + steps * 1000 / 60, now() - 1000 / 60); room.touched = now();
      // Bounded replay journal; no silent eviction that could desynchronize newcomers.
      if (room.log.length > 20000) { restart(room, 'Starting a fresh attempt.'); continue; }
      // Publish every completed tick; clients must not wait for a batch before
      // advancing movement. Membership validation stays on the slower cadence.
      broadcast(room, { type: 'campaign_frames', epoch: room.epoch,
        from: room.broadcastFrame, to: room.frame, events });
      room.broadcastFrame = room.frame;
    }
  }
  const timer = setInterval(tick, 16); timer.unref?.();
  return {
    accepts: message => TYPES.has(message?.type),
    // Reading a replay never binds a socket or refreshes player activity.
    watch(section, request = {}) {
      const active = [...rooms.values()].filter(room => room.section === section && members(room).length);
      const room = active.find(room => room.id === request.team) || active[0];
      const from = room && request.epoch === room.epoch && Number.isInteger(request.from)
        && request.from >= 0 && request.from <= room.frame ? request.from : 0;
      return { teams: active.map(room => ({ id: room.id, roster: room.roster, stageIndex: room.stageIndex })),
        state: room ? snapshot(room, from) : null };
    },
    occupants: section => [...new Set([...bindings.values()].filter(binding => binding.room.section === section).map(binding => binding.name))],
    // Re-send the key counts / open stages to everyone in the park room (a key bought with candy).
    refresh: sendProgress,
    handle(ws, message) {
      if (!TYPES.has(message?.type)) return null;
      try {
        const who = identity(ws);
        if (message.type === 'campaign_leave') { detach(ws); return null; }
        // Teacher 2026-10-07: the stage select reads progress without joining a team.
        if (message.type === 'campaign_select') {
          let binding = bindings.get(ws);
          if (binding && (binding.name !== who.username || binding.room.section !== who.section)) binding = null;
          return prospect(who.section, who.username, binding);
        }
        // Spend one key to open the next stage for the whole park room (teacher is a peer).
        if (message.type === 'campaign_open_stage') {
          if (!wallet) throw new Error('Every stage is already open.');
          wallet.open(who.section, who.username, message.stage);
          sendProgress(who.section);
          return prospect(who.section, who.username, bindings.get(ws));
        }
        if (message.type === 'campaign_join') {
          if (message.protocol !== CAMPAIGN_PROTOCOL) throw new Error('Reload the desk to enter the updated campaign.');
          if (!canEnter(who)) throw new Error('Finish a calculator team activity to earn the campaign key.');
          if (idleSockets.has(ws) && message.active !== true) {
            send(ws, { type: 'campaign_idle', message: 'Press a game key to rejoin your team.' }); return null;
          }
          const requested = message.stage;
          if (requested !== undefined && !(Number.isInteger(requested) && requested >= 0 && requested < CAMPAIGN_STAGES)) {
            throw new Error('Choose a stage from the stage select.');
          }
          let binding = bindings.get(ws);
          if (binding && (binding.name !== who.username || binding.room.section !== who.section)) { detach(ws); binding = null; }
          // Teacher decision 2026-10-06: the teacher joins as an ordinary member (no helper slot, no campaign_helpers).
          const room = binding?.room || findRoom(who.section, who.username, requested);
          // Teacher 2026-10-07: the relay decides which stage a party may start.
          const others = members(room).filter(name => name !== who.username);
          const choosing = !others.length || room.phase === 'select';
          const stage = requested ?? room.stageIndex;
          if (!choosing && stage !== room.stageIndex) {
            throw new Error('Your team is playing ' + stageLabel(room.stageIndex) + '. Choose ' + stageLabel(room.stageIndex) + ' to join them.');
          }
          const party = [...others, who.username];
          if (!startable(who.section, party, stage)) throw new Error(wallet.blocked(who.section, party, stage));
          idleSockets.delete(ws);
          bindings.set(ws, { room, name: who.username, activeAt: binding?.activeAt ?? now() }); room.missingAt.delete(who.username); room.touched = now();
          if (choosing && (stage !== room.stageIndex || room.phase === 'select')) {
            // A new choice starts the chosen stage for everyone present.
            const fresh = room.phase === 'waiting';
            room.stageIndex = stage;
            bindings.get(ws).activeAt = now();
            if (!fresh) { room.phase = 'playing'; restart(room, null); return null; }
          }
          send(ws, snapshot(room));
          return null;
        }
        if (idleSockets.has(ws)) return null;
        const binding = bindings.get(ws);
        if (!binding || binding.name !== who.username || binding.room.section !== who.section) throw new Error('Rejoin your campaign team.');
        const { room, name } = binding;
        if (message.epoch !== room.epoch) { send(ws, snapshot(room)); return null; }
        if (message.type === 'campaign_resume') {
          const from = Number.isInteger(message.from) && message.from >= 0 && message.from <= room.frame ? message.from : 0;
          send(ws, snapshot(room, from)); return null;
        }
        // Teacher decision 2026-10-06: only roster members send inputs, the teacher included.
        if (!room.roster.includes(name)) return null;
        if (message.type === 'campaign_input') {
          // Old clients send bits <= 63; the action button adds 64 (held) and 256 (press edge), UP adds 512 (press
          // edge). 128 is the desk's teacher-helper flag and never travels from a client.
          if (!Number.isInteger(message.bits) || message.bits < 0 || message.bits > 1023) return null;
          const previous = room.inputs.get(name);
          const bits = message.bits & INPUT_BITS;
          const buddy = Number.isInteger(message.buddy) ? message.buddy & INPUT_BITS : 0;
          // Keep the latest held state even when packets arrive in a burst.
          // Jump, action and up edges remain latched until the next authoritative frame.
          if (bits || buddy) binding.activeAt = now();
          room.inputs.set(name, { bits: bits | (previous?.bits & EDGE_BITS),
            buddy: buddy | (previous?.buddy & EDGE_BITS), at: now() });
        // Teacher decision 2026-10-06: retry and clear follow one rule for every roster member.
        } else if (message.type === 'campaign_retry' && now() - room.touched >= 0 && room.frame >= 120) {
          binding.activeAt = now();
          restart(room, 'Retrying the current stage.');
        } else if (message.type === 'campaign_clear' && room.phase === 'playing'
          && Number.isInteger(message.frame) && message.frame > 0 && message.frame <= room.frame) {
          binding.activeAt = now();
          room.cleared.add(name);
          if (room.roster.every(member => room.cleared.has(member))) {
            room.phase = 'clear'; room.clearAt = now(); broadcast(room, { type: 'campaign_clear', epoch: room.epoch });
            // Teacher 2026-10-07: the cleared stage is recorded for every roster member (persisted).
            if (wallet) { wallet.recordClear(room.section, room.roster, room.stageIndex); sendProgress(room.section); }
          }
        }
        return null;
      } catch (error) { return { type: 'campaign_error', message: error.message }; }
    },
    tick,
    detached: detach,
    close() { clearInterval(timer); bindings.clear(); rooms.clear(); },
  };
}
