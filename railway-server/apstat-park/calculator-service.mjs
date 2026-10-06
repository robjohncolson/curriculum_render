import { randomUUID } from 'node:crypto';
import { createMission, advanceMission, pressMissionKey, WORLD, timeLimitFor } from './calculator-mission.mjs';
import { createCalculatorRuntime } from './calculator-runtime.mjs';
import { createLobby, advanceLobby, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { createCalculatorRtc } from './calculator-rtc.mjs';
import { createSnapshotPublisher } from './snapshot-publisher.mjs';

import { eligibleLevels, schoolDate, createLevelRotation } from './calculator-curriculum.mjs';

const TYPES = new Set(['calculator_lobby', 'calculator_join', 'calculator_pose', 'calculator_press', 'calculator_leave', 'calculator_restart', 'calculator_rtc_signal']);
export const DEATH_MS = 1000;
// Independent rooms on the existing classroom connection. No grade writes.
// keyStore (optional, campaign-key-store.mjs): where earned campaign keys outlive this process.
export function createCalculatorService({ registry, send, now = () => performance.now(), wallNow = Date.now, random = Math.random, available = eligibleLevels, varyProblems = available === eligibleLevels,
  keyStore = null, log = (...args) => console.warn(...args) }) {
  const rooms = new Map(), bindings = new Map();
  const publish = createSnapshotPublisher({ send, now });
  const rtc = createCalculatorRtc({ bindings, registry, send, now });
  const teacherIn = (room, name) => [...bindings.values()].some(binding => binding.room === room && binding.name === name && binding.teacher);
  function identity(ws) {
    const who = registry._wsEntry(ws);
    if (!who) throw new Error('Join the classroom first.');
    const member = registry.stateFor(who.section, 'student', who.username)?.members
      ?.find(member => member.username === who.username);
    if (!member || member.online === false) throw new Error('Classroom member is offline.');
    return who;
  }
  function roomFor(section) {
    if (!rooms.has(section)) {
      const rotation = createLevelRotation(random, { varyProblems });
      rooms.set(section, {
        epoch: randomUUID(), attempts: new Map(), members: new Map(), touched: now(), failure: null, resetReason: null,
        lobby: createLobby(now()), section, rotation, campaignKeys: new Set(),
        // Keys earned here but not yet confirmed written to the key store: name -> source.
        unsavedKeys: new Map(), keySaving: false, keyRetryAt: 0,
        level: rotation.next(available(section, schoolDate(wallNow()))),
      });
      loadKeys(rooms.get(section));
    }
    return rooms.get(section);
  }
  // Campaign keys: memory is the hot path; the key store is the record across restarts, deploys
  // and idle room deletes. A store call never blocks or breaks a round: a failure is logged and
  // the room keeps its memory-only keys (exactly the behaviour without a store). A key counts as
  // written only once the store confirms it; a failed write is retried on a later tick, at most
  // once per KEY_RETRY_MS per room, so an outage logs once per cooldown, not every tick.
  const KEY_RETRY_MS = 30000;
  function loadKeys(room) {
    if (!keyStore) return;
    Promise.resolve().then(() => keyStore.load(room.section))
      .then(names => {
        for (const name of names || []) {
          room.campaignKeys.add(name);
          room.unsavedKeys.delete(name);   // already in the store
        }
      })
      .catch(error => log('park campaign keys: load failed for', room.section, error?.message || error));
  }
  function earnKeys(room, names) {
    const source = 'calculator:' + (room.level?.id || 'unknown');
    for (const name of names) {
      room.campaignKeys.add(name);
      if (keyStore) room.unsavedKeys.set(name, source);
    }
  }
  // Writes the room's unsaved keys (one store call per source). Called from every tick.
  function saveKeys(room) {
    if (!keyStore || room.keySaving || !room.unsavedKeys.size || now() < room.keyRetryAt) return;
    const bySource = new Map();
    for (const [name, source] of room.unsavedKeys) bySource.set(source, [...(bySource.get(source) || []), name]);
    room.keySaving = true;
    const writes = [...bySource].map(([source, names]) => Promise.resolve()
      .then(() => keyStore.award(room.section, names, source))
      .then(() => { for (const name of names) room.unsavedKeys.delete(name); }));
    Promise.allSettled(writes).then(results => {
      room.keySaving = false;
      const failed = results.find(result => result.status === 'rejected');
      if (!failed) return;
      room.keyRetryAt = now() + KEY_RETRY_MS;
      log('park campaign keys: save failed for', room.section, failed.reason?.message || failed.reason);
    });
  }
  function attemptFor(room, name) {
    if (!room.attempts.has(name)) room.attempts.set(name, {
      state: createMission(now(), room.level), engine: createCalculatorRuntime(room.level),
    });
    return room.attempts.get(name);
  }
  function teamComplete(room) {
    return room.lobby.roster.length > 0 && room.lobby.roster.every(name => attemptFor(room, name).state.complete);
  }
  function snapshot(room, name) {
    const state = attemptFor(room, name).state;
    const names = [...new Set([...room.lobby.roster, ...[...room.members.keys()].filter(name => teacherIn(room, name))])];
    const members = names.map(name => ({
      teacher: teacherIn(room, name),
      name, ...(room.members.get(name) || { pose: { x: 65, y: WORLD.floor - 24 } }),
      online: room.members.has(name), step: attemptFor(room, name).state.step, solved: attemptFor(room, name).state.complete,
    }));
    return { type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch: room.epoch, ...state, clock: now(),
      teamSize: room.lobby.roster.length,
      failure: room.failure, resetReason: room.resetReason,
      solved: state.complete, complete: !room.failure && teamComplete(room),
      readyCount: members.filter(member => !member.teacher && member.solved).length, members };
  }
  function broadcast(room) {
    if (room.level && room.lobby.phase === 'active' && !room.failure && teamComplete(room)) {
      // broadcast runs every tick: only the names that are new holders are earned.
      earnKeys(room, room.lobby.roster.filter(name => !room.campaignKeys.has(name)));
    }
    const lobby = lobbySnapshot(room);
    for (const [ws, binding] of bindings) {
      if (binding.room !== room || (ws.bufferedAmount || 0) >= 32768) continue;
      publish(ws, lobby);
      if ((room.lobby.phase === 'active' || binding.teacher) && room.members.has(binding.name)) publish(ws, snapshot(room, binding.name));
    }
  }
  function lobbySnapshot(room) {
    const lobby = room.lobby;
    return { type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: room.epoch,
      campaignKeyHolders: [...room.campaignKeys],
      missionId: room.level?.id || null, eligibleCount: available(room.section, schoolDate(wallNow())).length,
      phase: lobby.phase, blockX: lobby.x, pushers: lobby.pushers.filter(name => !teacherIn(room, name)), roster: lobby.roster,
      members: [...lobby.members].map(([name, member]) => ({ name, ...member })), rtcPeers: rtc.peers(room) };
  }
  function receiveLobby(ws, who, message) {
    if (message.protocol !== CALCULATOR_PROTOCOL) throw new Error('Reload the page to use the team block.');
    const { x, y } = message.pose || {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1420 || y < 0 || y > WORLD.floor) return null;
    const old = bindings.get(ws);
    if (old && (old.section !== who.section || old.name !== who.username)) detached(ws);
    const room = roomFor(who.section);
    bindings.set(ws, { room, section: who.section, name: who.username, teacher: who.role === 'teacher' });
    rtc.optIn(ws, message.rtc === 2, message.rtcGeneration);
    room.lobby.members.set(who.username, { pose: { x, y }, at: now(), pushing: who.role !== 'teacher' && message.pushing === true,
      ready: message.epoch === room.epoch && message.ready === true && x >= 740 });
    room.touched = now();
    // The regular tick distributes movement to everyone. Do not echo a full
    // class roster for each incoming pose; new/reconnecting clients hydrate now.
    if (!old || old.room !== room || message.epoch !== room.epoch) publish(ws, lobbySnapshot(room), true);
    return null;
  }
  function startTeam(room) {
    const lobby = room.lobby;
    if (lobby.phase !== 'assembling' || !lobby.roster.length || !lobby.roster.every(name => {
      const member = lobby.members.get(name);
      return member?.ready && now() - member.at < 1500;
    })) return;
    room.level ||= room.rotation.next(available(room.section, schoolDate(wallNow())));
    if (!room.level) return;
    lobby.phase = 'active';
    for (const name of lobby.roster) {
      const member = lobby.members.get(name);
      attemptFor(room, name).state.startedAt = now();
      room.members.set(name, { pose: { x: member.pose.x - 720, y: member.pose.y }, at: now(), revision: -1, ready: false });
    }
  }
  function resetRoom(room, reason) {
    room.epoch = randomUUID(); room.failure = null; room.resetReason = reason;
    if (reason.type === 'door' || reason.type === 'abandoned') {
      room.attempts.clear(); room.members.clear(); room.lobby = createLobby(now());
      room.level = room.rotation.next(available(room.section, schoolDate(wallNow())));
      return;
    }
    else for (const attempt of room.attempts.values()) {
      const previous = attempt.state;
      attempt.state = createMission(now(), room.level);
      if (previous.step < room.level.route.length) continue;
      // Reaching the summary earns a permanent checkpoint for this run.
      // Team deaths clear the plot, not the calculator work that unlocked it.
      Object.assign(attempt.state, { step: room.level.route.length, keys: previous.checkpointKeys.slice(),
        checkpointKeys: previous.checkpointKeys.slice(), bonus: Math.min(previous.bonus, room.level.route.length) });
    }
    for (const [name, member] of room.members) {
      attemptFor(room, name);
      Object.assign(member, { pose: { x: 65, y: WORLD.floor - 24 }, revision: -1, ready: false });
    }
  }
  function checkDeadline(room, time) {
    if (room.failure) return true;
    for (const name of room.lobby.roster) {
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
    rtc.detached(ws);
    bindings.delete(ws);
    if (![...bindings.values()].some(other => other.room === binding.room && other.name === binding.name)) {
      binding.room.members.delete(binding.name);
      binding.room.lobby.members.delete(binding.name);
      const attempt = binding.room.attempts.get(binding.name);
      if (attempt) attempt.state.holdAt = null;
    }
    broadcast(binding.room);
  }
  function handle(ws, message) {
    try {
      const who = identity(ws);
      if (message.type === 'calculator_rtc_signal') { rtc.relay(ws, message); return null; }
      if (message.type === 'calculator_leave') { detached(ws); return null; }
      if (message.type === 'calculator_lobby') return receiveLobby(ws, who, message);
      if (message.type === 'calculator_join') {
        if (message.protocol !== CALCULATOR_PROTOCOL) throw new Error('Reload the page to use the team block.');
        const old = bindings.get(ws);
        if (old && (old.section !== who.section || old.name !== who.username)) detached(ws);
        const room = roomFor(who.section);
        if (who.role !== 'teacher' && (room.lobby.phase !== 'active' || !room.lobby.roster.includes(who.username))) {
          send(ws, lobbySnapshot(room)); return null;
        }
        if (!room.level) { send(ws, lobbySnapshot(room)); return null; }
        bindings.set(ws, { room, section: who.section, name: who.username, teacher: who.role === 'teacher' });
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
      if ((!binding.teacher && room.lobby.phase !== 'active') || !room.members.has(binding.name)) {
        send(ws, lobbySnapshot(room)); return null;
      }
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
        if (binding.teacher) {
          // A teacher's practice/reset never restarts the students' round.
          const old = state.timeoutCount;
          Object.assign(state, createMission(now(), room.level), { timeoutCount: old + 1 });
          broadcast(room); return null;
        }
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
      const seenAt = Math.max(binding.room.lobby.members.get(binding.name)?.at ?? -Infinity,
        binding.room.members.get(binding.name)?.at ?? -Infinity);
      if (!who || who.section !== binding.section || who.username !== binding.name || now() - seenAt > 5000) detached(ws);
    }
    for (const [section, room] of rooms) {
      // Unsaved keys are written from the tick, so they are retried even after the team left.
      saveKeys(room);
      const emptyTeam = room.lobby.phase === 'active' ? !room.lobby.roster.some(name => room.members.has(name))
        : room.lobby.phase === 'assembling' && room.lobby.roster.every(name => !room.lobby.members.has(name));
      if (!emptyTeam) room.emptyTeamAt = null;
      else {
        room.emptyTeamAt ??= now();
        if (now() - room.emptyTeamAt >= 30000) {
          resetRoom(room, { type: 'abandoned' }); broadcast(room);
        }
      }
      if (!room.lobby.members.size && !room.members.size) {
        // An idle room is dropped after 2 h, but never while it holds keys not yet written.
        if (now() - room.touched > 2 * 60 * 60 * 1000 && !room.unsavedKeys.size) rooms.delete(section);
        continue;
      }
      const time = now();
      advanceLobby(room.lobby, time);
      room.lobby.roster = room.lobby.roster.filter(name => !teacherIn(room, name));
      if (room.lobby.phase === 'assembling' && !room.lobby.roster.length) room.lobby.phase = 'gathering';
      for (const [name] of room.members) {
        if (!teacherIn(room, name)) continue;
        const { state } = attemptFor(room, name);
        if (state.complete || time - state.startedAt < timeLimitFor(state)) continue;
        const checkpoint = state.step >= room.level.route.length;
        const keys = state.checkpointKeys.slice(), count = state.timeoutCount + 1;
        Object.assign(state, createMission(time, room.level), { timeoutCount: count });
        if (checkpoint) Object.assign(state, { step: room.level.route.length, keys, checkpointKeys: keys.slice() });
      }
      startTeam(room);
      if (room.lobby.phase !== 'active') { broadcast(room); continue; }
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
    canEnterCampaign(who) {
      const keys = rooms.get(who.section)?.campaignKeys;
      return who.role === 'teacher' ? !!keys?.size : !!keys?.has(who.username);
    },
    // Do not call roomFor/attemptFor: watching must never create an attempt.
    watch(section) {
      const room = rooms.get(section);
      if (!room || (!room.members.size && !room.lobby.members.size)) return null;
      return { epoch: room.epoch, clock: now(), level: room.level, lobby: lobbySnapshot(room), failure: room.failure,
        members: [...room.members].map(([name, member]) => ({ name, pose: member.pose,
          state: room.attempts.get(name)?.state || null })) };
    },
    close() { clearInterval(timer); rooms.clear(); bindings.clear(); } };
}
