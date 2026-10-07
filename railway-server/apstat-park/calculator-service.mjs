import { randomUUID } from 'node:crypto';
import { createMission, advanceMission, pressMissionKey, WORLD, timeLimitFor } from './calculator-mission.mjs';
import { createCalculatorRuntime } from './calculator-runtime.mjs';
import { createLobby, advanceLobby, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { createCalculatorRtc } from './calculator-rtc.mjs';
import { createSnapshotPublisher } from './snapshot-publisher.mjs';
import { createCampaignWallet } from './campaign-wallet.mjs';

import { eligibleLevels, schoolDate, createLevelRotation } from './calculator-curriculum.mjs';

const TYPES = new Set(['calculator_lobby', 'calculator_join', 'calculator_pose', 'calculator_press', 'calculator_leave', 'calculator_restart', 'calculator_rtc_signal']);
export const DEATH_MS = 1000;
// Independent rooms on the existing classroom connection. No grade writes.
// wallet (campaign-wallet.mjs): campaign key counts, cleared stages and open stages, shared with
// the campaign service. Without one (direct tests) the service keeps a memory-only wallet.
export function createCalculatorService({ registry, send, now = () => performance.now(), wallNow = Date.now, random = Math.random, available = eligibleLevels, varyProblems = available === eligibleLevels,
  wallet = null, log = (...args) => console.warn(...args) }) {
  wallet ||= createCampaignWallet({ now, log });
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
        lobby: createLobby(now()), section, rotation, keysAwardedEpoch: null,
        level: rotation.next(available(section, schoolDate(wallNow()))),
      });
      wallet.ensure(section);
    }
    return rooms.get(section);
  }
  // Teacher 2026-10-07: keys are a spendable count. A completed round pays +1 key to every roster
  // member, once per round (epoch). Persistence and retries live in the wallet.
  function awardKeys(room) {
    if (room.keysAwardedEpoch === room.epoch) return;
    room.keysAwardedEpoch = room.epoch;
    wallet.award(room.section, room.lobby.roster);
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
    // Teacher decision 2026-10-06: the teacher is a full peer, so the round's members are exactly the roster.
    const names = room.lobby.roster;
    const members = names.map(name => ({
      teacher: teacherIn(room, name),
      name, ...(room.members.get(name) || { pose: { x: 65, y: WORLD.floor - 24 } }),
      online: room.members.has(name), step: attemptFor(room, name).state.step, solved: attemptFor(room, name).state.complete,
    }));
    return { type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch: room.epoch, ...state, clock: now(),
      teamSize: room.lobby.roster.length,
      failure: room.failure, resetReason: room.resetReason,
      solved: state.complete, complete: !room.failure && teamComplete(room),
      // Teacher decision 2026-10-06: a teacher's solved result counts toward the team like anyone's.
      readyCount: members.filter(member => member.solved).length, members };
  }
  function broadcast(room) {
    if (room.level && room.lobby.phase === 'active' && !room.failure && teamComplete(room)) {
      awardKeys(room);
    }
    const lobby = lobbySnapshot(room);
    for (const [ws, binding] of bindings) {
      if (binding.room !== room || (ws.bufferedAmount || 0) >= 32768) continue;
      publish(ws, lobby);
      // Teacher decision 2026-10-06: no teacher-only snapshot outside an active round.
      if (room.lobby.phase === 'active' && room.members.has(binding.name)) publish(ws, snapshot(room, binding.name));
    }
  }
  function lobbySnapshot(room) {
    const lobby = room.lobby;
    const campaign = wallet.view(room.section);
    return { type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: room.epoch,
      // Kept for older desks: the players holding at least one unspent key.
      campaignKeyHolders: Object.keys(campaign.keys),
      // Teacher 2026-10-07 (additive): unspent key counts {name: n > 0}, cleared stage indexes
      // {name: [stage]}, and the stages open for the room (0 = 1-1 always).
      campaignKeys: campaign.keys, campaignCleared: campaign.cleared, campaignOpen: campaign.open,
      missionId: room.level?.id || null, eligibleCount: available(room.section, schoolDate(wallNow())).length,
      // Teacher decision 2026-10-06: a pushing teacher is listed like any other pusher.
      phase: lobby.phase, blockX: lobby.x, pushers: lobby.pushers, roster: lobby.roster,
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
    // Teacher decision 2026-10-06: the teacher can push the team block.
    room.lobby.members.set(who.username, { pose: { x, y }, at: now(), pushing: message.pushing === true,
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
        // Teacher decision 2026-10-06: the teacher joins a round only from the roster, like everyone.
        if (room.lobby.phase !== 'active' || !room.lobby.roster.includes(who.username)) {
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
      // Teacher decision 2026-10-06: no teacher practice outside an active round.
      if (room.lobby.phase !== 'active' || !room.members.has(binding.name)) {
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
        // Teacher decision 2026-10-06: the teacher's restart follows the team rule (no private practice reset).
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
    // Wallet rows are written from the tick, so they are retried even after the team left.
    wallet.flush();
    for (const [section, room] of rooms) {
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
        // An idle room is dropped after 2 h; its keys live on in the wallet.
        if (now() - room.touched > 2 * 60 * 60 * 1000) rooms.delete(section);
        continue;
      }
      const time = now();
      // Teacher decision 2026-10-06: the teacher stays on the roster (no filter, no private practice timer).
      advanceLobby(room.lobby, time);
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
    // Teacher 2026-10-07: the campaign door is no longer gated on keys (1-1 is always startable);
    // keys gate progression instead (campaign_open_stage).
    canEnterCampaign() {
      return true;
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
