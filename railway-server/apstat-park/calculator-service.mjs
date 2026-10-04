import { randomUUID } from 'node:crypto';
import { createMission, advanceMission, pressMissionKey, WORLD, timeLimitFor } from './calculator-mission.mjs';
import { createCalculatorRuntime } from './calculator-runtime.mjs';

const TYPES = new Set(['calculator_join', 'calculator_pose', 'calculator_press', 'calculator_leave', 'calculator_restart']);
export const DEATH_MS = 1000;
// Independent rooms on the existing classroom connection. No grade writes.
export function createCalculatorService({ registry, send, now = () => performance.now() }) {
  const rooms = new Map(), bindings = new Map();
  function identity(ws) {
    const who = registry._wsEntry(ws);
    if (!who) throw new Error('Join the classroom first.');
    const member = registry.stateFor(who.section, 'student', who.username)?.members
      ?.find(member => member.username === who.username);
    if (!member || member.online === false) throw new Error('Classroom member is offline.');
    return who;
  }
  function roomFor(section) {
    if (!rooms.has(section)) rooms.set(section, {
      epoch: randomUUID(), attempts: new Map(), members: new Map(), touched: now(), failure: null, resetReason: null,
    });
    return rooms.get(section);
  }
  function attemptFor(room, name) {
    if (!room.attempts.has(name)) room.attempts.set(name, {
      state: createMission(now()), engine: createCalculatorRuntime(),
    });
    return room.attempts.get(name);
  }
  function teamComplete(room) {
    return room.members.size > 0 && [...room.members.keys()].every(name => attemptFor(room, name).state.complete);
  }
  function snapshot(room, name) {
    const state = attemptFor(room, name).state;
    const members = [...room.members].map(([name, member]) => ({
      name, ...member, solved: attemptFor(room, name).state.complete,
    }));
    return { type: 'calculator_state', protocol: 4, epoch: room.epoch, ...state, clock: now(),
      failure: room.failure, resetReason: room.resetReason,
      solved: state.complete, complete: !room.failure && teamComplete(room),
      readyCount: members.filter(member => member.solved).length, members };
  }
  function broadcast(room) {
    for (const [ws, binding] of bindings) {
      if (binding.room === room && (ws.bufferedAmount || 0) < 32768) send(ws, snapshot(room, binding.name));
    }
  }
  function resetRoom(room, reason) {
    room.epoch = randomUUID(); room.attempts.clear(); room.failure = null; room.resetReason = reason;
    for (const [name, member] of room.members) {
      attemptFor(room, name);
      Object.assign(member, { pose: { x: 65, y: WORLD.floor - 24 }, revision: -1, ready: false });
    }
  }
  function checkDeadline(room, time) {
    if (room.failure) return true;
    for (const name of room.members.keys()) {
      const state = attemptFor(room, name).state;
      if (state.complete || time - state.startedAt < timeLimitFor(state)) continue;
      room.failure = { name, at: time, until: time + DEATH_MS };
      return true;
    }
    return false;
  }
  function detached(ws) {
    const binding = bindings.get(ws);
    if (!binding) return;
    bindings.delete(ws);
    if (![...bindings.values()].some(other => other.room === binding.room && other.name === binding.name)) {
      binding.room.members.delete(binding.name);
      attemptFor(binding.room, binding.name).state.holdAt = null;
    }
    broadcast(binding.room);
  }
  function handle(ws, message) {
    try {
      const who = identity(ws);
      if (message.type === 'calculator_leave') { detached(ws); return null; }
      if (message.type === 'calculator_join') {
        if (message.protocol !== 4) throw new Error('Reload the page to use the team restart rules.');
        const old = bindings.get(ws);
        if (old && (old.section !== who.section || old.name !== who.username)) detached(ws);
        const room = roomFor(who.section);
        bindings.set(ws, { room, section: who.section, name: who.username });
        if (!room.members.has(who.username)) {
          const attempt = attemptFor(room, who.username);
          room.members.set(who.username, { pose: { x: 70, y: 646 }, at: now(), revision: -1 });
          attempt.state.holdAt = null;
        }
        room.touched = now(); broadcast(room); return null;
      }
      const binding = bindings.get(ws);
      if (!binding || binding.section !== who.section || binding.name !== who.username) {
        detached(ws); throw new Error('Rejoin the calculator room.');
      }
      const { room } = binding;
      if (message.type === 'calculator_press') checkDeadline(room, now());
      if (room.failure) {
        // Keep presence alive during the death animation, but freeze all inputs.
        room.members.get(binding.name).at = now();
        broadcast(room); return null;
      }
      const { state, engine } = attemptFor(room, binding.name);
      if (message.epoch !== room.epoch || message.revision !== state.revision) {
        send(ws, snapshot(room, binding.name)); return null;
      }
      if (message.type === 'calculator_restart') {
        if (!teamComplete(room)) return null;
        resetRoom(room, { type: 'door' });
        broadcast(room); return null;
      }
      if (message.type === 'calculator_press') {
        const time = now();
        pressMissionKey(state, message.key, time, engine.transitions(state));
        room.members.get(binding.name).at = time;
        room.touched = time;
        broadcast(room); return null;
      }
      const { x, y } = message.pose || {};
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > WORLD.width - 20 || y < 0 || y > WORLD.floor) return null;
      room.members.set(who.username, { pose: { x, y }, at: now(), revision: message.revision, ready: message.ready !== false });
      room.touched = now();
      return null;
    } catch (error) {
      return { type: 'calculator_error', message: error.message };
    }
  }
  function tick() {
    for (const [ws, binding] of bindings) {
      const who = registry._wsEntry(ws);
      const member = binding.room.members.get(binding.name);
      if (!who || who.section !== binding.section || who.username !== binding.name || now() - (member?.at ?? 0) > 5000) detached(ws);
    }
    for (const [section, room] of rooms) {
      if (!room.members.size) {
        if (now() - room.touched > 2 * 60 * 60 * 1000) rooms.delete(section);
        continue;
      }
      const time = now();
      if (room.failure && time >= room.failure.until) {
        resetRoom(room, { type: 'timeout', name: room.failure.name });
        broadcast(room); continue;
      }
      if (checkDeadline(room, time)) { broadcast(room); continue; }
      for (const [name, member] of room.members) {
        const { state, engine } = attemptFor(room, name);
        if (state.complete) continue;
        const transitions = engine.transitions(state);
        advanceMission(state, [member], time, transitions);
      }
      broadcast(room);
    }
  }
  const timer = setInterval(tick, 100);
  timer.unref?.();
  return { accepts: message => TYPES.has(message?.type), handle, detached, tick,
    close() { clearInterval(timer); rooms.clear(); bindings.clear(); } };
}
