import { randomUUID } from 'node:crypto';
import { ParkSession } from './session.mjs';

const types = new Set(['park_start', 'park_join', 'park_resume', 'park_leave', 'park_command', 'park_motion', 'park_run', 'park_next', 'park_stop', 'park_status']);
const retired = new Set(['park_start', 'park_run', 'park_next', 'park_stop']);
const RETENTION_MS = 2 * 60 * 60 * 1000;

// One self-directed park per classroom section, using the existing joined identity.
export function createParkService({ registry, send, now = () => performance.now(), wallNow = () => Date.now() }) {
  const rooms = new Map(), bindings = new Map();

  function identity(ws, cache) {
    const entry = registry._wsEntry(ws);
    if (!entry) throw new Error('Join the classroom first');
    let members = cache?.get(entry.section);
    if (!members) {
      members = registry.stateFor(entry.section, 'student', entry.username)?.members ?? [];
      cache?.set(entry.section, members);
    }
    if (!members.some(member => member.username === entry.username && member.online !== false)) throw new Error('Classroom member is offline');
    return entry;
  }

  function broadcast(room, event) {
    const cache = new Map();
    for (const [ws, binding] of bindings) {
      if (binding.room !== room) continue;
      let who;
      try { who = identity(ws, cache); } catch { bindings.delete(ws); continue; }
      if (who.section !== room.section || who.username !== binding.member) { bindings.delete(ws); continue; }
      if (event.kind === 'motion' && binding.member === event.member) continue;
      if (ws.bufferedAmount > 32768) continue;
      send(ws, { type: 'park_event', ...event });
    }
  }

  function syncPresence(room) {
    const online = [], cache = new Map();
    for (const [ws, binding] of bindings) {
      if (binding.room !== room) continue;
      let who;
      try { who = identity(ws, cache); } catch { bindings.delete(ws); continue; }
      if (who.section !== room.section || who.username !== binding.member) { bindings.delete(ws); continue; }
      online.push(binding.member);
    }
    for (const event of room.session.setOnline(online)) broadcast(room, event);
  }

  function sweep() {
    for (const [section, room] of rooms) {
      if (now() - room.lastActivity < RETENTION_MS) continue;
      syncPresence(room);
      if (!room.session.online.length) rooms.delete(section);
    }
  }

  function unbind(ws, voluntary = false) {
    const binding = bindings.get(ws);
    bindings.delete(ws);
    if (binding) {
      syncPresence(binding.room);
      if (voluntary && !binding.room.session.online.length) binding.room.allowEmptyRotation = true;
    }
  }

  return {
    accepts: message => types.has(message?.type),
    handle(ws, message) {
      if (!types.has(message?.type)) return null;
      const reply = value => ({ type: 'park_result', requestId: message.requestId, ...value });
      try {
        if (retired.has(message.type)) return { type: 'park_error', requestId: message.requestId,
          code: 'PARK_SELF_DIRECTED', message: 'Enter the park doorway on the calendar. Teacher groups are retired.' };
        const who = identity(ws);
        if (message.type === 'park_leave') {
          if (bindings.get(ws)?.room.session.epoch === message.epoch) unbind(ws, true);
          return reply({ left: true });
        }
        const joining = message.type === 'park_join' || message.type === 'park_resume';
        // Validate before allocating a room or member slot.
        if (joining && (typeof message.clientId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(message.clientId))) throw new Error('Invalid park client');
        sweep();
        let room = rooms.get(who.section);
        if (!room && joining) {
          if (rooms.size >= 32) throw new Error('The park is busy. Try entering again shortly.');
          room = { section: who.section, lastActivity: now(), session: new ParkSession({ epoch: randomUUID(), now, wallNow }) };
          rooms.set(who.section, room);
        }
        const changed = () => ({ type: 'park_error', requestId: message.requestId, code: 'PARK_STREAM_CHANGED', message: 'Rejoining your park connection' });
        if (!room) return changed();
        if (joining) {
          const prior = bindings.get(ws);
          if (prior && prior.room !== room) unbind(ws);
          syncPresence(room);
          for (const event of room.session.rotateIfReady({ empty: room.allowEmptyRotation })) broadcast(room, event);
          const activeKeys = new Set([...bindings.values()].filter(binding => binding.room === room).map(binding => binding.key));
          const requestedKey = JSON.stringify([who.username, message.clientId]);
          const shared = [...bindings].some(([socket, binding]) => socket !== ws && binding.room === room && binding.key === requestedKey);
          const clientId = shared ? randomUUID() : message.clientId;
          const events = room.session.addMember(who.username);
          const key = room.session.open(who.username, clientId, activeKeys);
          for (const event of events) broadcast(room, event);
          bindings.set(ws, { room, member: who.username, key });
          room.allowEmptyRotation = false;
          room.lastActivity = now();
          syncPresence(room);
          return reply({ groupId: 'classroom-park', member: who.username, clientId,
            ...room.session.resume(key, message.epoch === room.session.epoch ? message.since : null) });
        }
        const binding = bindings.get(ws);
        if (!binding || binding.room !== room || binding.member !== who.username) return changed();
        room.lastActivity = now();
        if (message.type !== 'park_motion') {
          syncPresence(room);
          for (const event of room.session.rotateIfReady()) broadcast(room, event);
        }
        if (message.type === 'park_status') return reply({ epoch: room.session.epoch, revision: room.session.revision });
        const streamId = room.session.stream(binding.key).id;
        if (message.streamId !== streamId) return changed();
        if (message.type === 'park_motion') {
          const event = room.session.motion(binding.key, message);
          if (event) broadcast(room, event);
          return null;
        }
        const { events, ...receipt } = room.session.command(binding.key, message);
        for (const event of events) broadcast(room, event);
        return reply({ epoch: room.session.epoch, streamId, ...receipt });
      } catch (error) {
        return { type: 'park_error', requestId: message.requestId, message: error.message };
      }
    },
    detached: unbind,
    close() { bindings.clear(); rooms.clear(); },
  };
}
