import { randomUUID } from 'node:crypto';
import { createMission, advanceMission, pressMissionKey, pickRecognition, recognitionPending, missionFor, WORLD, timeLimitFor } from './calculator-mission.mjs';
import { recognitionFor } from './calculator-recognition.mjs';
import { handheldFor, handheldMatches, HANDHELD_ATTEMPTS } from './calculator-handheld.mjs';
import { createCalculatorRuntime, varyLevel } from './calculator-runtime.mjs';
import { createLobby, advanceLobby, CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { createCalculatorRtc } from './calculator-rtc.mjs';
import { createSnapshotPublisher } from './snapshot-publisher.mjs';
import { createCampaignWallet } from './campaign-wallet.mjs';
import { createCalculatorClears, rungFor } from './calculator-clears.mjs';
import { createCalculatorSrs } from './calculator-srs-state.mjs';
import { qualityFor, isMasteryClear } from './calculator-srs.mjs';

import { eligibleLevels, schoolDate, createLevelRotation, levelById, CALCULATOR_PROBLEMS } from './calculator-curriculum.mjs';

const TYPES = new Set(['calculator_lobby', 'calculator_join', 'calculator_pose', 'calculator_press', 'calculator_pick', 'calculator_recognition', 'calculator_handheld', 'calculator_leave', 'calculator_restart', 'calculator_rtc_signal']);
export const DEATH_MS = 1000;
// Independent rooms on the existing classroom connection. No grade writes.
// wallet (campaign-wallet.mjs): campaign key counts, cleared stages and open stages, shared with
// the campaign service. Without one (direct tests) the service keeps a memory-only wallet.
// clears (calculator-clears.mjs): per student and skill, the completed rounds behind the hint rung.
// varyData (protocol 10): list-based problems get random data each round (calculator-variation.mjs).
// srs (calculator-srs-state.mjs, protocol 15): per student and skill, the spaced-recall record
// advanced on every completed round; a solo join with no skill opens the first due skill.
// onMastery({ section, username, skillId }): called once per student and skill, on the round that
// flips mastered (ABSORB_SPEC §6 pays the solo door's bonus point there; Phase 4).
export function createCalculatorService({ registry, send, now = () => performance.now(), wallNow = Date.now, random = Math.random, available = eligibleLevels, varyProblems = available === eligibleLevels,
  varyData = varyProblems, wallet = null, clears = null, srs = null, onMastery = () => {}, log = (...args) => console.warn(...args) }) {
  wallet ||= createCampaignWallet({ now, log });
  clears ||= createCalculatorClears({ now, log });
  srs ||= createCalculatorSrs({ now, log });
  // rooms: one team room per section. soloRooms (protocol 12, ABSORB_SPEC §3): one room per
  // student, keyed by section + name; the same round machinery with a roster of one.
  const rooms = new Map(), soloRooms = new Map(), bindings = new Map();
  // Codex P2 (2026-10-15): a page already open on an older protocol keeps retrying its join and
  // cannot be patched. Answer the first mismatch with the reload error, then drop (do not answer)
  // further mismatched packets from that socket for STALE_MS. The Desk's version.json nudge
  // (banner within 5 min / on refocus) is what refreshes the open page; the protocol-13 stamp
  // bump already triggers it. Keyed weakly: a closed socket takes its entry with it.
  const STALE_MS = 10000;
  const staleUntil = new WeakMap();
  // true: current protocol. false: a mismatch already answered, drop this packet. Throws the first time.
  function checkProtocol(ws, message) {
    if (message.protocol === CALCULATOR_PROTOCOL) return true;
    if (now() < (staleUntil.get(ws) || 0)) return false;
    staleUntil.set(ws, now() + STALE_MS);
    throw new Error('Reload the page to use the team block.');
  }
  const publish = createSnapshotPublisher({ send, now });
  const rtc = createCalculatorRtc({ bindings, registry, send, now });
  const teacherIn = (room, name) => [...bindings.values()].some(binding => binding.room === room && binding.name === name && binding.teacher);
  function identity(ws) {
    const who = registry._wsEntry(ws);
    if (!who) throw new Error('Join the classroom first.');
    const member = registry.stateFor(who.section, 'student', who.username)?.members
      ?.find(member => member.username === who.username);
    if (!member || member.online === false) throw new Error('Classroom member is offline.');
    // The socket index carries section and name; the role lives on the classroom member.
    return { ...who, role: member.role };
  }
  // The next round's problem from the rotation; with varyData, list data is new every round.
  function nextLevel(room) {
    const level = room.rotation.next(available(room.section, schoolDate(wallNow())));
    if (!level || !varyData) return level;
    return varyLevel(level, random);
  }
  // Protocol 14 (ABSORB_SPEC §4): the recognition step opens a round when the skill has a canonical
  // problem. Solo rounds always; team rounds only with the teacher's toggle (room.recognition,
  // teacher decision 2, 2026-10-15: off by default, it adds a step before the shared clock).
  // One problem and one tile order per round (every member of a team sees the same four tiles).
  function setLevel(room, level) {
    room.level = level;
    const wanted = room.mode === 'solo' || room.recognition === true;
    room.recognitionRound = wanted && level ? recognitionFor(level.skillId, random) : null;
  }
  function roomFor(section) {
    if (!rooms.has(section)) {
      const room = {
        epoch: randomUUID(), attempts: new Map(), members: new Map(), touched: now(), failure: null, resetReason: null,
        lobby: createLobby(now()), section, rotation: createLevelRotation(random, { varyProblems }), keysAwardedEpoch: null,
        level: null, recognition: false, recognitionRound: null,
      };
      setLevel(room, nextLevel(room));
      rooms.set(section, room);
      wallet.ensure(section);
      clears.ensure(section);
      srs.ensure(section);
    }
    return rooms.get(section);
  }
  // A solo room's lobby is always active with a roster of one: no block, no pushing, no gathering.
  function soloLobby(name, time) {
    return { ...createLobby(time), phase: 'active', x: TEAM_BLOCK.dock, roster: [name] };
  }
  // A deep link may pin a skill (ABSORB_SPEC §3, teacher decision 4: the bonus skills are reachable
  // this way only). Only a catalogue skill id counts; a variant id or an unknown id is ignored.
  function pinnedSkillFor(skillId) {
    if (typeof skillId !== 'string') return null;
    const level = levelById(skillId);
    return level && level.id === level.skillId ? skillId : null;
  }
  // The solo round's problem: a pinned skill plays its catalogue problems in turn (never the same
  // one twice in a row), with random data like a team round; with no pin, the first skill the
  // recall schedule says is due (protocol 15, §5), else the section's rotation.
  function soloLevel(room) {
    const skillId = room.skillId || firstDueSkill(room);
    if (!skillId) return nextLevel(room);
    const variants = CALCULATOR_PROBLEMS.filter(problem => problem.skillId === skillId);
    const fresh = variants.filter(problem => problem.id !== room.lastProblemId);
    const choices = fresh.length ? fresh : variants;
    const level = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
    room.lastProblemId = level.id;
    return varyData ? varyLevel(level, random) : level;
  }
  // The most overdue skill with a catalogue level, or null. Skills no longer taught (not in the
  // section's eligible list) still count: a review is a review.
  function firstDueSkill(room) {
    const due = srs.due(room.section, room.name, schoolDate(wallNow()));
    return due.find(entry => pinnedSkillFor(entry.skillId))?.skillId || null;
  }
  // The student's solo room, created on the first join. Joining with a different pinned skill
  // starts a fresh round on it; joining with none, or the same one, resumes the round in progress.
  // skillId omitted (undefined/null/''): resume the round in progress. Supplied and valid: pin it
  // (a different pin starts over). Supplied but unknown: clear the pin and pick from the rotation.
  // Returns null when there is nothing to play (empty rotation): no room is kept for that.
  function createSoloRound(who, skillId) {
    const key = JSON.stringify([who.section, who.username]);
    const supplied = typeof skillId === 'string' && skillId !== '';
    const pinned = pinnedSkillFor(skillId);
    if (supplied && !pinned) log('park calculator solo: unknown skill', skillId, 'for', who.username);
    const existing = soloRooms.get(key);
    if (existing) {
      if (supplied && pinned !== existing.skillId) {
        existing.skillId = pinned;
        resetRoom(existing, { type: 'door' });
        if (!existing.level) { soloRooms.delete(key); return null; }
      }
      return existing;
    }
    const room = {
      mode: 'solo', name: who.username, epoch: randomUUID(), attempts: new Map(), members: new Map(), touched: now(),
      failure: null, resetReason: null, lobby: soloLobby(who.username, now()), section: who.section,
      rotation: createLevelRotation(random, { varyProblems }), keysAwardedEpoch: null, skillId: pinned, lastProblemId: null,
      level: null, emptyTeamAt: null, recognitionRound: null,
    };
    setLevel(room, soloLevel(room));
    if (!room.level) return null;
    soloRooms.set(key, room);
    wallet.ensure(who.section);
    clears.ensure(who.section);
    srs.ensure(who.section);
    return room;
  }
  // What a solo student sees while the section has no playable skill yet: no epoch, no roster,
  // so an older or newer client neither resets nor joins a round. Nothing is retained for it.
  function soloWaitingSnapshot(who, skillId) {
    // wallet.view starts the section's store load on first sight (a read; no reward, no write).
    const campaign = wallet.view(who.section);
    return { type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: null,
      mode: 'solo', pinnedSkill: pinnedSkillFor(skillId), campaignKeyHolders: Object.keys(campaign.keys),
      campaignKeys: campaign.keys, campaignCleared: campaign.cleared, campaignOpen: campaign.open,
      missionId: null, eligibleCount: available(who.section, schoolDate(wallNow())).length,
      phase: 'waiting', blockX: TEAM_BLOCK.dock, pushers: [], roster: [], members: [], rtcPeers: [] };
  }
  // Puts the solo student into their round (first join, reconnect, or straight after the door).
  // A reconnect keeps the attempt and its clock: joining never renews a deadline.
  function seatSolo(room) {
    room.emptyTeamAt = null;
    if (room.members.has(room.name)) return;
    const attempt = attemptFor(room, room.name);
    room.members.set(room.name, { pose: { x: 70, y: 646 }, at: now(), revision: -1 });
    attempt.state.holdAt = null;
  }
  // Teacher 2026-10-07: keys are a spendable count. A completed round pays +1 key to every roster
  // member, once per round (epoch). Persistence and retries live in the wallet.
  // ABSORB_SPEC §6 (Phase 4): a solo clear pays its key through the same path (roster of one).
  function awardKeys(room) {
    if (room.keysAwardedEpoch === room.epoch) return;
    room.keysAwardedEpoch = room.epoch;
    wallet.award(room.section, room.lobby.roster);
    // Protocol 15 (§5): the same moment advances every member's recall record for this skill, at
    // the quality of their own attempt and the hint rung they played at (before this clear counts).
    const skillId = room.level?.skillId, today = schoolDate(wallNow());
    for (const name of room.lobby.roster) {
      const attempt = room.attempts.get(name);
      if (!attempt || !skillId) continue;
      const quality = qualityFor(attempt.state);
      const rung = rungFor(clears.clearsOf(room.section, name, skillId));
      const mastery = isMasteryClear({ solo: room.mode === 'solo', rung, quality });
      const result = srs.record(room.section, name, skillId, quality, today, { mastery });
      attempt.review = { quality, rung, ...result?.record, masteredNow: result?.masteredNow === true };
      if (result?.masteredNow) notifyMastery(room, name, skillId);
      // Protocol 16 (§7): a solo clear may go on to the handheld check (the round's first numeric
      // result, judged here with the trainer's tolerance). Not offered once the skill is mastered.
      const prompt = room.mode === 'solo' && !attempt.review.mastered ? handheldFor(room.level) : null;
      attempt.state.handheld = prompt ? { label: prompt.label, attempts: 0, status: null } : null;
    }
    // Protocol 10: the same moment counts one clear per student for this round's skill.
    clears.record(room.section, room.lobby.roster, room.level?.skillId);
  }
  function notifyMastery(room, name, skillId) {
    try { onMastery({ section: room.section, username: name, skillId }); }
    catch (error) { log('park calculator mastery hook failed for', name, skillId, error?.message || error); }
  }
  // §7: the typed handheld result. Pass: the skill is mastered (first time pays the bonus point).
  // Fail: one retry, then the check closes and nothing is recorded.
  function receiveHandheld(room, binding, message) {
    const attempt = attemptFor(room, binding.name), state = attempt.state;
    if (room.mode !== 'solo' || !state.complete || !state.handheld || state.handheld.status) return false;
    const prompt = handheldFor(missionFor(state));
    if (!prompt) return false;
    if (handheldMatches(message.value, prompt.expected)) {
      state.handheld = { ...state.handheld, status: 'passed', attempts: state.handheld.attempts + 1 };
      const result = srs.master(room.section, binding.name, room.level?.skillId, schoolDate(wallNow()));
      attempt.review = { ...(attempt.review || {}), ...(result?.record || {}), mastered: true, masteredNow: result?.masteredNow === true };
      if (result?.masteredNow) notifyMastery(room, binding.name, room.level?.skillId);
    } else {
      const attempts = state.handheld.attempts + 1;
      state.handheld = { ...state.handheld, attempts, status: attempts >= HANDHELD_ATTEMPTS ? 'failed' : null };
    }
    state.revision++;
    return true;
  }
  function attemptFor(room, name) {
    if (!room.attempts.has(name)) room.attempts.set(name, {
      state: createMission(now(), room.level, room.recognitionRound), engine: createCalculatorRuntime(room.level),
    });
    return room.attempts.get(name);
  }
  function teamComplete(room) {
    return room.lobby.roster.length > 0 && room.lobby.roster.every(name => attemptFor(room, name).state.complete);
  }
  function snapshot(room, name) {
    const state = attemptFor(room, name).state;
    // Protocol 10: this member's clears and hint rung (0 full, 1 goals, 2 none) for the round's skill.
    const cleared = clears.clearsOf(room.section, name, room.level?.skillId);
    // Teacher decision 2026-10-06: the teacher is a full peer, so the round's members are exactly the roster.
    const names = room.lobby.roster;
    const members = names.map(name => ({
      teacher: teacherIn(room, name),
      name, ...(room.members.get(name) || { pose: { x: 65, y: WORLD.floor - 24 } }),
      online: room.members.has(name), step: attemptFor(room, name).state.step, solved: attemptFor(room, name).state.complete,
    }));
    const attempt = attemptFor(room, name);
    return { type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch: room.epoch, ...state, clock: now(),
      // Protocol 14: the right procedure stays on the relay until the pick is made.
      recognition: state.recognition && !state.recognition.picked ? { ...state.recognition, skill: null } : state.recognition,
      // Protocol 15: once the round completed, this member's recall review (quality, next review).
      review: attempt.review ? { quality: attempt.review.quality, intervalDays: attempt.review.intervalDays,
        nextReview: attempt.review.nextReview, mastered: attempt.review.mastered === true, masteredNow: attempt.review.masteredNow } : null,
      mode: room.mode || 'team', pinnedSkill: room.skillId || null,
      teamSize: room.lobby.roster.length, clears: cleared, rung: rungFor(cleared),
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
      mode: room.mode || 'team', pinnedSkill: room.skillId || null,
      // Protocol 14: whether this room's rounds open with the recognition step.
      recognition: room.mode === 'solo' || room.recognition === true,
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
    if (!checkProtocol(ws, message)) return null;
    const { x, y } = message.pose || {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1420 || y < 0 || y > WORLD.floor) return null;
    const old = bindings.get(ws);
    // A team packet from a solo-bound socket leaves the solo room first (its member must not linger).
    if (old && (old.section !== who.section || old.name !== who.username || old.room.mode === 'solo')) detached(ws);
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
    if (!room.level) setLevel(room, nextLevel(room));
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
      room.attempts.clear(); room.members.clear();
      if (room.mode === 'solo') {
        // The next solo round starts at once: same pinned skill with new data, or the rotation.
        room.lobby = soloLobby(room.name, now());
        setLevel(room, soloLevel(room));
        return;
      }
      room.lobby = createLobby(now());
      setLevel(room, nextLevel(room));
      return;
    }
    else for (const attempt of room.attempts.values()) {
      const previous = attempt.state;
      // A timeout keeps the answered recognition step: the procedure was already named once.
      attempt.state = createMission(now(), room.level, previous.recognition);
      // Protocol 15: the restart counts against the recall quality, as do the wrong keys so far.
      attempt.state.timeoutCount = (previous.timeoutCount || 0) + 1;
      attempt.state.wrongKeys = previous.wrongKeys || 0;
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
      // No clock while the word problem is open: it starts at the pick.
      if (state.complete || recognitionPending(state) || time - state.startedAt < timeLimitFor(state)) continue;
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
      // A solo room's 30 s retention starts the moment its student's last socket leaves.
      if (binding.room.mode === 'solo') binding.room.emptyTeamAt ??= now();
    }
    broadcast(binding.room);
  }
  function handle(ws, message) {
    try {
      const who = identity(ws);
      if (message.type === 'calculator_rtc_signal') { rtc.relay(ws, message); return null; }
      if (message.type === 'calculator_leave') { detached(ws); return null; }
      if (message.type === 'calculator_lobby') return receiveLobby(ws, who, message);
      if (message.type === 'calculator_recognition') {
        // The teacher's toggle for the section's team room; it takes effect from the next round
        // (a round in progress keeps whatever it opened with).
        if (who.role !== 'teacher') throw new Error('Only the teacher can switch the recognition step.');
        const room = roomFor(who.section);
        room.recognition = message.on === true;
        if (room.lobby.phase !== 'active') setLevel(room, room.level);
        room.touched = now(); broadcast(room); return null;
      }
      if (message.type === 'calculator_join') {
        if (!checkProtocol(ws, message)) return null;
        const old = bindings.get(ws);
        if (old && (old.section !== who.section || old.name !== who.username)) detached(ws);
        if (message.mode === 'solo') {
          // Protocol 12: the student's own room. No roster gate: the round is theirs by definition.
          const room = createSoloRound(who, message.skill);
          if (old && old.room !== room) detached(ws);
          // Nothing playable yet (empty rotation): answer, bind nothing, keep nothing.
          if (!room) { send(ws, soloWaitingSnapshot(who, message.skill)); return null; }
          bindings.set(ws, { room, section: who.section, name: who.username, teacher: who.role === 'teacher' });
          seatSolo(room);
          room.touched = now(); broadcast(room); return null;
        }
        if (old?.room.mode === 'solo') detached(ws);
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
        if (room.mode === 'solo') {
          // The rotation may have emptied since the round started: drop the room, answer, unbind.
          if (!room.level) {
            soloRooms.delete(JSON.stringify([room.section, room.name]));
            detached(ws); send(ws, soloWaitingSnapshot(who, room.skillId)); return null;
          }
          // The solo student is standing at the door: the next round starts without a rejoin.
          seatSolo(room);
        }
        broadcast(room); return null;
      }
      if (message.type === 'calculator_handheld') {
        if (!receiveHandheld(room, binding, message)) return null;
        room.members.get(binding.name).at = now();
        room.touched = now();
        broadcast(room); return null;
      }
      if (message.type === 'calculator_pick') {
        const time = now();
        if (!pickRecognition(state, message.skill, time)) return null;
        room.members.get(binding.name).at = time;
        room.touched = time;
        broadcast(room); return null;
      }
      if (message.type === 'calculator_press') {
        const time = now();
        pressMissionKey(state, message.key, time, engine.transitions(state), key => engine.isWrongKey(state, key));
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
    clears.flush();
    srs.flush();
    for (const [key, room] of soloRooms) {
      // A solo room with nobody in it for 30 s is dropped (a reload or a brief disconnect survives).
      // emptyTeamAt is stamped by detached() and cleared by seatSolo(); the fallback covers a
      // member removed any other way.
      if (!room.members.has(room.name)) {
        room.emptyTeamAt ??= now();
        if (now() - room.emptyTeamAt >= 30000) soloRooms.delete(key);
        continue;
      }
      const time = now();
      if (room.failure && time >= room.failure.until) {
        resetRoom(room, { type: 'timeout', name: room.failure.name });
        broadcast(room); continue;
      }
      if (checkDeadline(room, time)) { broadcast(room); continue; }
      const { state, engine } = attemptFor(room, room.name);
      if (!state.complete) advanceMission(state, [room.members.get(room.name)], time, engine.transitions(state), key => engine.isWrongKey(state, key));
      broadcast(room);
    }
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
        advanceMission(state, [member], time, transitions, key => engine.isWrongKey(state, key));
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
    // Protocol 15 (§5): GET /park/calc/due. The due skills most overdue first, then today's
    // skills (the Desk resolves its topics through the lesson map and passes the skill ids).
    due(section, username, todaySkills = []) {
      const today = schoolDate(wallNow());
      const due = srs.due(section, username, today).filter(entry => pinnedSkillFor(entry.skillId))
        .map(entry => ({ ...entry, title: levelById(entry.skillId).title }));
      const dueIds = new Set(due.map(entry => entry.skillId));
      const todayIds = [...new Set((todaySkills || []).map(pinnedSkillFor).filter(Boolean))].filter(id => !dueIds.has(id));
      return { today, due, todaySkills: todayIds.map(skillId => ({ skillId, title: levelById(skillId).title })), count: due.length };
    },
    // Test and sweep access to the recall records (read-only shape).
    recall(section, username) { return srs.recordsOf(section, username); },
    // Do not call roomFor/attemptFor: watching must never create an attempt.
    watch(section) {
      // Protocol 12: the section's solo rounds in progress, with or without a team room.
      const solo = [...soloRooms.values()].filter(solo => solo.section === section && solo.members.size)
        .map(solo => ({ name: solo.name, epoch: solo.epoch, level: solo.level, failure: solo.failure,
          state: solo.attempts.get(solo.name)?.state || null }));
      const room = rooms.get(section);
      const teamLive = !!room && (room.members.size > 0 || room.lobby.members.size > 0);
      if (!teamLive && !solo.length) return null;
      // Additive empty-team shape: the team fields are null/empty, the lobby is the room's last
      // snapshot when the room still exists (a spectator may read lobby.blockX), else null.
      if (!teamLive) return { epoch: null, clock: now(), level: null, lobby: room ? lobbySnapshot(room) : null, failure: null, members: [], solo };
      return { epoch: room.epoch, clock: now(), level: room.level, lobby: lobbySnapshot(room), failure: room.failure,
        members: [...room.members].map(([name, member]) => ({ name, pose: member.pose,
          state: room.attempts.get(name)?.state || null })), solo };
    },
    close() { clearInterval(timer); rooms.clear(); soloRooms.clear(); bindings.clear(); } };
}
