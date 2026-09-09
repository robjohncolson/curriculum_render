import { randomUUID } from 'node:crypto';
import { ParkSession } from './session.mjs';

const types = new Set(['park_start', 'park_join', 'park_resume', 'park_leave', 'park_command', 'park_motion', 'park_run', 'park_next', 'park_stop', 'park_status']);
const RETENTION_MS = 30 * 60 * 1000;

// Classroom identity comes from the existing registry, never from packet names.
export function createParkService({ registry, send, now = () => performance.now() }) {
  const groups = new Map(), bindings = new Map();
  const groupKey = (section, id) => JSON.stringify([section, id]);

  function removeGroup(group) {
    groups.delete(groupKey(group.section, group.id));
    for (const [socket, binding] of bindings) if (binding.group === group) bindings.delete(socket);
  }

  // At most 32 groups: reclaim lazily before requests, with no timer or traffic.
  // A disconnected group's receipts stay intact throughout the recovery window.
  function sweep() {
    const at = now();
    for (const group of groups.values()) if (at - group.lastActivity >= RETENTION_MS) removeGroup(group);
  }

  function identity(ws) {
    const entry = registry._wsEntry(ws);
    if (!entry) throw new Error('Join the classroom first');
    const members = registry.stateFor(entry.section, 'student', entry.username)?.members ?? [];
    const member = members.find(item => item.username === entry.username && item.online !== false);
    if (!member) throw new Error('Classroom member is offline');
    return { ...entry, teacher: member.role === 'teacher', members };
  }

  function broadcast(group, event) {
    for (const [ws, binding] of bindings) {
      if (binding.group !== group) continue;
      let who;
      try { who = identity(ws); } catch { bindings.delete(ws); continue; }
      if (who.section !== group.section || who.username !== binding.member) { bindings.delete(ws); continue; }
      if (event.kind === 'motion' && (who.teacher || binding.member === event.member)) continue;
      // Ephemeral motion is expendable under backpressure. Durable progress is
      // recovered from its revision when the client's status check sees a gap.
      if (ws.bufferedAmount > 32768) continue;
      send(ws, { type: 'park_event', ...event });
    }
  }

  function teacherSummary(group) {
    const s = group.session;
    return { epoch: s.epoch, revision: s.revision, sequence: 0, mode: 'summary', members: [...s.members],
      online: [...s.online], running: s.running, done: s.done, level: structuredClone(s.level), progress: structuredClone(s.progress), poses: Object.fromEntries(s.poses) };
  }

  // Count live park bindings, not motion: a stationary teammate is still here.
  // Multiple tabs count as one member; closing one must not mark the other away.
  function syncPresence(group) {
    const online = [];
    for (const [socket, binding] of bindings) {
      if (binding.group !== group) continue;
      let who;
      try { who = identity(socket); } catch { bindings.delete(socket); continue; }
      if (who.section !== group.section || who.username !== binding.member) {
        bindings.delete(socket);
        continue;
      }
      if (binding.key) online.push(binding.member);
    }
    for (const event of group.session.setOnline(online)) broadcast(group, event);
  }

  return {
    accepts: message => types.has(message?.type),
    handle(ws, message) {
      if (!types.has(message?.type)) return null;
      sweep();
      const reply = value => ({ type: 'park_result', requestId: message.requestId, ...value });
      try {
        const who = identity(ws);
        if (message.type === 'park_leave') {
          const binding = bindings.get(ws);
          if (binding && message.epoch === binding.group.session.epoch) {
            bindings.delete(ws);
            syncPresence(binding.group);
          }
          return reply({ left: true });
        }
        if (message.type === 'park_start') {
          if (!who.teacher) throw new Error('Only your teacher can create a park group');
          const id = message.groupId;
          if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid park group');
          const members = message.members;
          if (!Array.isArray(members) || !members.every(name => who.members.some(item => item.username === name && item.role === 'student' && item.online !== false))) throw new Error('Choose online students in this classroom');
          if (groups.size >= 32 || groups.has(groupKey(who.section, id))) throw new Error('Park group already exists or capacity reached');
          if ([...groups.values()].some(group => group.section === who.section && group.session.members.some(name => members.includes(name)))) throw new Error('A student is already in another park group');
          const group = { id, section: who.section, lastActivity: now(), session: new ParkSession({ epoch: randomUUID(), members, now }) };
          groups.set(groupKey(who.section, id), group);
          bindings.set(ws, { group, member: who.username, key: null });
          return reply({ groupId: id, ...teacherSummary(group) });
        }
        const group = who.teacher
          ? groups.get(groupKey(who.section, message.groupId))
          : [...groups.values()].find(group => group.section === who.section && group.session.members.includes(who.username));
        if (!group) return { type: 'park_error', requestId: message.requestId, code: 'PARK_NOT_ASSIGNED', message: 'No park group is assigned. Your teacher can create a new group.' };
        if (['park_join', 'park_resume'].includes(message.type)) {
          syncPresence(group);
          const activeKeys = new Set([...bindings.values()].filter(binding => binding.group === group).map(binding => binding.key));
          const requestedKey = JSON.stringify([who.username, message.clientId]);
          const sharedClient = !who.teacher && [...bindings].some(([socket, binding]) => socket !== ws
            && binding.group === group && binding.key === requestedKey);
          const clientId = sharedClient ? randomUUID() : message.clientId;
          const key = who.teacher ? null : group.session.open(who.username, clientId, activeKeys);
          bindings.set(ws, { group, member: who.username, key });
          group.lastActivity = now();
          syncPresence(group);
          return reply({ groupId: group.id, member: who.username, ...(who.teacher ? {} : { clientId }),
            ...(who.teacher ? teacherSummary(group) : group.session.resume(key, message.epoch === group.session.epoch ? message.since : null)) });
        }
        syncPresence(group);
        if (bindings.get(ws)?.group === group) group.lastActivity = now();
        if (['park_run', 'park_next', 'park_stop'].includes(message.type)) {
          if (!who.teacher) throw new Error('Teacher controls required');
          if (message.type === 'park_stop') {
            broadcast(group, { epoch: group.session.epoch, kind: 'stopped' });
            removeGroup(group);
            return reply({ stopped: true });
          }
          const events = message.type === 'park_next' ? group.session.nextLevel() : group.session.setRunning(message.running);
          for (const event of events) broadcast(group, event);
          return reply({ epoch: group.session.epoch, revision: group.session.revision });
        }
        if (message.type === 'park_status') return reply({ epoch: group.session.epoch, revision: group.session.revision });
        const binding = bindings.get(ws);
        if (!binding || binding.group !== group || binding.member !== who.username || !binding.key || who.teacher) throw new Error('Join your assigned park group first');
        const streamId = group.session.stream(binding.key).id;
        if (message.streamId !== streamId) return { type: 'park_error', code: 'PARK_STREAM_CHANGED', message: 'Rejoining your park connection' };
        if (message.type === 'park_motion') {
          const event = group.session.motion(binding.key, message);
          if (event) broadcast(group, event);
          return null;
        }
        const { events, ...receipt } = group.session.command(binding.key, message);
        for (const event of events) broadcast(group, event);
        return reply({ epoch: group.session.epoch, streamId, ...receipt });
      } catch (error) {
        return { type: 'park_error', requestId: message.requestId, message: error.message };
      }
    },
    detached(ws) {
      const binding = bindings.get(ws);
      bindings.delete(ws);
      if (binding) syncPresence(binding.group);
    },
    close() { bindings.clear(); groups.clear(); },
  };
}
