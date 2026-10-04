import { randomUUID } from 'node:crypto';
import { createMission, advanceMission, WORLD } from './calculator-mission.mjs';

const TYPES = new Set(['calculator_join', 'calculator_pose', 'calculator_leave', 'calculator_restart']);
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
      epoch: randomUUID(), state: createMission(now()), members: new Map(), touched: now(),
    });
    return rooms.get(section);
  }
  function snapshot(room) {
    return { type: 'calculator_state', epoch: room.epoch, ...room.state, clock: now(),
      members: [...room.members].map(([name, member]) => ({ name, ...member })) };
  }
  function broadcast(room) {
    const packet = snapshot(room);
    for (const [ws, binding] of bindings) {
      if (binding.room === room && (ws.bufferedAmount || 0) < 32768) send(ws, packet);
    }
  }
  function detached(ws) {
    const binding = bindings.get(ws);
    if (!binding) return;
    bindings.delete(ws);
    if (![...bindings.values()].some(other => other.room === binding.room && other.name === binding.name)) {
      binding.room.members.delete(binding.name);
      binding.room.state.holdAt = null;
    }
    broadcast(binding.room);
  }
  function handle(ws, message) {
    try {
      const who = identity(ws);
      if (message.type === 'calculator_leave') { detached(ws); return null; }
      if (message.type === 'calculator_join') {
        const old = bindings.get(ws);
        if (old && (old.section !== who.section || old.name !== who.username)) detached(ws);
        const room = roomFor(who.section);
        bindings.set(ws, { room, section: who.section, name: who.username });
        if (!room.members.has(who.username)) {
          room.members.set(who.username, { pose: { x: 70, y: 646 }, at: now(), revision: -1 });
          room.state.holdAt = null;
        }
        room.touched = now(); broadcast(room); return null;
      }
      const binding = bindings.get(ws);
      if (!binding || binding.section !== who.section || binding.name !== who.username) {
        detached(ws); throw new Error('Rejoin the calculator room.');
      }
      const { room } = binding;
      if (message.epoch !== room.epoch || message.revision !== room.state.revision) {
        send(ws, snapshot(room)); return null;
      }
      if (message.type === 'calculator_restart') {
        if (!room.state.complete) return null;
        room.epoch = randomUUID(); room.state = createMission(now());
        for (const member of room.members.values()) member.revision = -1;
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
      advanceMission(room.state, [...room.members.values()], now());
      broadcast(room);
    }
  }
  const timer = setInterval(tick, 100);
  timer.unref?.();
  return { accepts: message => TYPES.has(message?.type), handle, detached, tick,
    close() { clearInterval(timer); rooms.clear(); bindings.clear(); } };
}
