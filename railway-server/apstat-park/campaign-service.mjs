import { randomUUID, randomBytes } from 'node:crypto';

// Protocol 6 restores solid push chains and authored bridge/gate geometry.
// Mixed physics versions must not participate in the same input replay.
export const CAMPAIGN_PROTOCOL = 6;
export const CAMPAIGN_STAGES = 48;
export const CAMPAIGN_CLEAR_MS = 3200;
export const CAMPAIGN_IDLE_MS = 60000;
const MEMBERSHIP_CHECK_MS = 1000;
const MAX_PLAYERS = 8, INPUT_TIMEOUT = 1500, RECONNECT_MS = 15000;
const TYPES = new Set(['campaign_join', 'campaign_input', 'campaign_resume', 'campaign_clear', 'campaign_retry', 'campaign_leave']);

// Ordered inputs, not client physics snapshots. Every browser runs the same recovered
// engine, seed, party and 60 Hz frames. Completion requires every active participant.
export function createCampaignService({ registry, send, now = () => performance.now() }) {
  const rooms = new Map(), bindings = new Map();
  const idleSockets = new WeakSet();
  let nextMembershipCheck = 0;
  function identity(ws) {
    const who = registry._wsEntry(ws);
    if (!who || !registry.stateFor(who.section, 'student', who.username)?.members
      ?.some(member => member.username === who.username && member.online !== false)) throw new Error('Join the classroom first.');
    return who;
  }
  function members(room) {
    return [...new Set([...bindings.values()].filter(binding => binding.room === room).map(binding => binding.name))];
  }
  function snapshot(room, from = 0) {
    const events = room.log.filter(event => event.frame >= from);
    const page = events.slice(0, 500);
    const to = events.length > 500 ? events[500].frame - 1 : room.frame;
    return { type: 'campaign_state', protocol: CAMPAIGN_PROTOCOL, team: room.id, epoch: room.epoch,
      stageIndex: room.stageIndex, lap: room.lap, seed: room.seed, roster: room.roster,
      waiting: members(room).filter(name => !room.roster.includes(name)),
      phase: room.phase, reason: room.reason, from, to, events: page, more: to < room.frame };
  }
  function broadcast(room, packet) {
    for (const [ws, binding] of bindings) {
      if (binding.room === room && (ws.bufferedAmount || 0) < 32768) send(ws, packet);
    }
  }
  function restart(room, reason) {
    room.epoch = randomUUID(); room.seed = randomBytes(4).readUInt32LE();
    room.roster = members(room).slice(0, MAX_PLAYERS);
    room.phase = room.roster.length ? 'playing' : 'waiting'; room.reason = reason;
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
  function findRoom(section, name) {
    const candidates = [...rooms.values()].filter(room => room.section === section);
    let room = candidates.find(room => room.roster.includes(name) || members(room).includes(name));
    room ||= candidates.find(room => new Set([...room.roster, ...members(room)]).size < MAX_PLAYERS);
    if (room) return room;
    if (rooms.size >= 64) throw new Error('The park is full. Please try again shortly.');
    room = { id: randomUUID(), section, epoch: randomUUID(), seed: 1, stageIndex: 0, lap: 1,
      roster: [], phase: 'waiting', frame: 0, log: [], inputs: new Map(), cleared: new Set(), missingAt: new Map(),
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
      if (room.roster.some(name => !online.has(name))) {
        if ([...room.missingAt.values()].some(at => now() - at >= RECONNECT_MS)) restart(room, 'A teammate left. Restarting this stage with the current team.');
        room.lastTick = now(); continue;
      }
      if (room.phase === 'clear') {
        if (now() - room.clearAt >= CAMPAIGN_CLEAR_MS) {
          room.stageIndex = (room.stageIndex + 1) % CAMPAIGN_STAGES;
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
          input.bits &= 31; input.buddy &= 31;
          return values;
        });
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
    occupants: section => [...new Set([...bindings.values()].filter(binding => binding.room.section === section).map(binding => binding.name))],
    handle(ws, message) {
      if (!TYPES.has(message?.type)) return null;
      try {
        const who = identity(ws);
        if (message.type === 'campaign_leave') { detach(ws); return null; }
        if (message.type === 'campaign_join') {
          if (message.protocol !== CAMPAIGN_PROTOCOL) throw new Error('Reload the desk to enter the updated campaign.');
          if (idleSockets.has(ws) && message.active !== true) {
            send(ws, { type: 'campaign_idle', message: 'Press a game key to rejoin your team.' }); return null;
          }
          idleSockets.delete(ws);
          let binding = bindings.get(ws);
          if (binding && (binding.name !== who.username || binding.room.section !== who.section)) { detach(ws); binding = null; }
          const room = binding?.room || findRoom(who.section, who.username);
          bindings.set(ws, { room, name: who.username, activeAt: binding?.activeAt ?? now() }); room.missingAt.delete(who.username); room.touched = now();
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
        if (!room.roster.includes(name)) return null;
        if (message.type === 'campaign_input') {
          if (!Number.isInteger(message.bits) || message.bits < 0 || message.bits > 63) return null;
          const previous = room.inputs.get(name);
          // Keep the latest held state even when packets arrive in a burst.
          // Jump edges remain latched until the next authoritative frame.
          if (message.bits || (Number.isInteger(message.buddy) && (message.buddy & 63))) binding.activeAt = now();
          room.inputs.set(name, { bits: message.bits | (previous?.bits & 32),
            buddy: (Number.isInteger(message.buddy) ? message.buddy & 63 : 0) | (previous?.buddy & 32), at: now() });
        } else if (message.type === 'campaign_retry' && now() - room.touched >= 0 && room.frame >= 120) {
          binding.activeAt = now();
          restart(room, 'Retrying the current stage.');
        } else if (message.type === 'campaign_clear' && room.phase === 'playing'
          && Number.isInteger(message.frame) && message.frame > 0 && message.frame <= room.frame) {
          binding.activeAt = now();
          room.cleared.add(name);
          if (room.roster.every(member => room.cleared.has(member))) {
            room.phase = 'clear'; room.clearAt = now(); broadcast(room, { type: 'campaign_clear', epoch: room.epoch });
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
