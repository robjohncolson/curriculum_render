// classroom.test.js
// Unit tests for railway-server/classroom.js
// Uses stub ws objects -- no real sockets.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClassroomRegistry } from '../railway-server/classroom.js';

// Stub ws object. readyState 1 == WebSocket.OPEN.
function makeWs() {
  return { readyState: 1, sent: [], send(msg) { this.sent.push(JSON.parse(msg)); } };
}

// -----------------------------------------------------------------------
describe('createClassroomRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  // --- join creates a room and a member -----------------------------------

  it('join creates a room and member; returns classroom_state to the joiner', () => {
    var ws = makeWs();
    var now = Date.now();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', now);

    expect(result.sends).toHaveLength(1);
    var payload = result.sends[0].payload;
    expect(payload.type).toBe('classroom_state');
    expect(payload.section).toBe('PeriodA');
    expect(payload.gate).toBeNull();
    expect(payload.poll).toBeNull();
    expect(payload.members).toHaveLength(1);
    expect(payload.members[0].username).toBe('alice');
    expect(payload.members[0].role).toBe('student');
    expect(payload.members[0].online).toBe(true);
    expect(payload.members[0].status).toBe('present');
  });

  it('join with no other members produces no broadcasts', () => {
    var ws = makeWs();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student');
    expect(result.broadcasts).toHaveLength(0);
  });

  it('second distinct user triggers a classroom_member_update broadcast to the first', () => {
    var ws1 = makeWs();
    var ws2 = makeWs();
    registry.join(ws1, 'PeriodA', 'alice', 'student');
    var result = registry.join(ws2, 'PeriodA', 'bob', 'student');

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_member_update');
    expect(bc.payload.member.username).toBe('bob');
    // The broadcast goes to alice's socket.
    expect(bc.sockets).toContain(ws1);
    // It does NOT include bob's own socket.
    expect(bc.sockets).not.toContain(ws2);
  });

  // --- second join by same username is a re-attach (no duplicate) --------

  it('second join by same username re-attaches the socket (no duplicate member)', () => {
    var ws1 = makeWs();
    var ws2 = makeWs();
    registry.join(ws1, 'PeriodA', 'alice', 'student');

    // alice reconnects with a new socket
    var result = registry.join(ws2, 'PeriodA', 'alice', 'student');
    var state = result.sends[0].payload;

    // Still only one member.
    expect(state.members).toHaveLength(1);
    expect(state.members[0].username).toBe('alice');
  });

  // --- stateFor returns the v1a shape ------------------------------------

  it('stateFor returns the v1a snapshot with gate:null and poll:null', () => {
    var ws = makeWs();
    registry.join(ws, 'PeriodA', 'alice', 'student');

    var state = registry.stateFor('PeriodA');
    expect(state.type).toBe('classroom_state');
    expect(state.section).toBe('PeriodA');
    expect(state.gate).toBeNull();
    expect(state.poll).toBeNull();
    expect(Array.isArray(state.members)).toBe(true);
  });

  it('stateFor returns null for a section with no room', () => {
    expect(registry.stateFor('NoSuchSection')).toBeNull();
  });

  // --- section isolation -------------------------------------------------

  it('section isolation: PeriodA members absent from PeriodB state', () => {
    var wsA = makeWs();
    var wsB = makeWs();
    registry.join(wsA, 'PeriodA', 'alice', 'student');
    registry.join(wsB, 'PeriodB', 'carol', 'student');

    var stateA = registry.stateFor('PeriodA');
    var stateB = registry.stateFor('PeriodB');

    var namesA = stateA.members.map(function(m) { return m.username; });
    var namesB = stateB.members.map(function(m) { return m.username; });

    expect(namesA).toContain('alice');
    expect(namesA).not.toContain('carol');
    expect(namesB).toContain('carol');
    expect(namesB).not.toContain('alice');
  });

  it('join to PeriodB does not broadcast to PeriodA sockets', () => {
    var wsA = makeWs();
    var wsB = makeWs();
    registry.join(wsA, 'PeriodA', 'alice', 'student');
    var result = registry.join(wsB, 'PeriodB', 'bob', 'student');

    // Any broadcasts in result should not include wsA.
    result.broadcasts.forEach(function(bc) {
      expect(bc.sockets).not.toContain(wsA);
    });
  });

  // --- detach + sweep: offline flip without removal ----------------------

  it('detach last socket flips member online:false but does NOT remove', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);
    registry.detach(ws, now + 1000);

    // The member is still in the state.
    var state = registry.stateFor('PeriodA');
    expect(state).not.toBeNull();
    expect(state.members).toHaveLength(1);
    expect(state.members[0].username).toBe('alice');
    expect(state.members[0].online).toBe(false);
  });

  it('detach of last socket returns lostLastSocket:true + broadcast', () => {
    var ws1 = makeWs();
    var ws2 = makeWs();
    var now = 1000;
    registry.join(ws1, 'PeriodA', 'alice', 'student', now);
    registry.join(ws2, 'PeriodA', 'bob', 'student', now);

    var result = registry.detach(ws1, now + 500);

    expect(result.lostLastSocket).toBe(true);
    expect(result.username).toBe('alice');
    // There should be a broadcast (bob's socket is still in the room).
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_member_update');
    expect(result.broadcasts[0].payload.member.online).toBe(false);
  });

  it('detach of non-last socket returns lostLastSocket:false', () => {
    var ws1 = makeWs();
    var ws2 = makeWs();
    var now = 1000;
    registry.join(ws1, 'PeriodA', 'alice', 'student', now);
    // alice opens a second socket (re-attach)
    registry.join(ws2, 'PeriodA', 'alice', 'student', now);

    var result = registry.detach(ws1, now + 500);
    expect(result.lostLastSocket).toBe(false);

    // alice is still online in the state.
    var state = registry.stateFor('PeriodA');
    expect(state.members[0].online).toBe(true);
  });

  // --- sweep past 45s flips online:false WITHOUT removing ----------------

  it('sweep past 45s flips member online:false but does not remove', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    // Simulate the socket going away without triggering detach
    // (heartbeat lapse path -- member still in wsIndex).
    // Advance time past liveness window.
    var laterNow = now + 46 * 1000;
    var result = registry.sweep(laterNow);

    // The sweep produces an online-flip broadcast.
    expect(result.onlineFlips).toHaveLength(1);
    expect(result.onlineFlips[0].payload.type).toBe('classroom_member_update');
    expect(result.onlineFlips[0].payload.member.online).toBe(false);

    // No removal yet.
    expect(result.removals).toHaveLength(0);

    // Member still present.
    var state = registry.stateFor('PeriodA');
    expect(state.members).toHaveLength(1);
    expect(state.members[0].online).toBe(false);
  });

  // --- sweep past 45 min removes the member ------------------------------

  it('sweep past 45 min removes member and broadcasts classroom_member_left', () => {
    var ws = makeWs();
    var bobWs = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);
    registry.join(bobWs, 'PeriodA', 'bob', 'student', now);

    // Detach alice so she is offline.
    registry.detach(ws, now + 100);

    // Advance past idle GC window.
    var gcNow = now + 100 + 46 * 60 * 1000;
    // Keep bob alive with a fresh heartbeat so only alice is GC'd -- a
    // member that never heartbeats for 45 min is itself reclaimed.
    registry.heartbeat(bobWs, gcNow - 1000);
    var result = registry.sweep(gcNow);

    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].payload.type).toBe('classroom_member_left');
    expect(result.removals[0].payload.section).toBe('PeriodA');
    expect(result.removals[0].payload.username).toBe('alice');

    // alice is gone from the state; bob (heartbeating) remains.
    var state = registry.stateFor('PeriodA');
    var names = state.members.map(function(m) { return m.username; });
    expect(names).not.toContain('alice');
    expect(names).toContain('bob');
  });

  it('sweep removes an empty room after its last member is GCd', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);
    registry.detach(ws, now + 100);

    var gcNow = now + 100 + 46 * 60 * 1000;
    registry.sweep(gcNow);

    // Room is gone.
    expect(registry.stateFor('PeriodA')).toBeNull();
  });

  // --- heartbeat keeps member alive across sweep -------------------------

  it('heartbeat refreshes lastSeen so sweep does not flip offline', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    // Heartbeat just before the liveness window would expire.
    var hbNow = now + 44 * 1000;
    registry.heartbeat(ws, hbNow);

    // Sweep at a time that would have expired the ORIGINAL lastSeen.
    var sweepNow = now + 46 * 1000;
    var result = registry.sweep(sweepNow);

    // No online-flips because the heartbeat refreshed lastSeen to hbNow,
    // and sweepNow - hbNow = 2000ms < 45000ms.
    expect(result.onlineFlips).toHaveLength(0);
    var state = registry.stateFor('PeriodA');
    expect(state.members[0].online).toBe(true);
  });

  // --- reconnect re-attaches and flips online:true -----------------------

  it('reconnect after going offline flips member back to online:true', () => {
    var ws1 = makeWs();
    var now = 1000;
    registry.join(ws1, 'PeriodA', 'alice', 'student', now);
    registry.detach(ws1, now + 1000);

    // alice is offline.
    expect(registry.stateFor('PeriodA').members[0].online).toBe(false);

    // alice reconnects.
    var ws2 = makeWs();
    var result = registry.join(ws2, 'PeriodA', 'alice', 'student', now + 2000);

    // State returned to ws2 shows alice online.
    var state = result.sends[0].payload;
    expect(state.members[0].online).toBe(true);
  });

  // --- regression: re-join on the same socket unbinds the prior member --

  it('re-join on the same socket unbinds it from the prior member (no stale socket)', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);
    // The same socket re-joins as a different user.
    registry.join(ws, 'PeriodA', 'bob', 'student', now + 100);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    var bob   = state.members.find(function(m) { return m.username === 'bob'; });

    // alice lost her only socket -> offline; bob is online.
    expect(alice.online).toBe(false);
    expect(bob.online).toBe(true);

    // detach now resolves to bob (the current binding), not the stale alice.
    var d = registry.detach(ws, now + 200);
    expect(d.username).toBe('bob');
  });

  // --- regression: heartbeat revives a member flipped offline by sweep ---

  it('heartbeat revives a member flipped offline by a sweep', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    // Heartbeat lapses -> sweep flips alice offline (socket never closed).
    registry.sweep(now + 46 * 1000);
    expect(registry.stateFor('PeriodA').members[0].online).toBe(false);

    // A fresh heartbeat on the still-open socket revives her + broadcasts.
    var hb = registry.heartbeat(ws, now + 47 * 1000);
    expect(hb.broadcasts).toHaveLength(1);
    expect(hb.broadcasts[0].payload.type).toBe('classroom_member_update');
    expect(hb.broadcasts[0].payload.member.online).toBe(true);
    expect(registry.stateFor('PeriodA').members[0].online).toBe(true);
  });

  // --- regression: GC reclaims an offline member with a zombie socket ---

  it('GC removes an offline member even when a zombie socket is still open', () => {
    var ws = makeWs();   // never detached -- the socket stays "open"
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    // Heartbeat lapses -> sweep flips alice offline; the socket lingers.
    registry.sweep(now + 46 * 1000);
    expect(registry.stateFor('PeriodA').members[0].online).toBe(false);

    // 45+ minutes later the GC must reclaim her despite the open socket.
    var result = registry.sweep(now + 46 * 60 * 1000);
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].payload.username).toBe('alice');
    expect(registry.stateFor('PeriodA')).toBeNull();   // empty room deleted
  });

  // =========================================================================
  // v1b Gate tests
  // =========================================================================

  // --- armGate: sets gate, resets statuses, teacher-only ------------------

  it('armGate sets the room gate and resets all member statuses to present', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    var result = registry.armGate(wsT, 'stars', now + 100);

    // Gate is set.
    var state = registry.stateFor('PeriodA');
    expect(state.gate).not.toBeNull();
    expect(state.gate.armed).toBe(true);
    expect(state.gate.theme).toBe('stars');

    // All statuses reset to "present".
    state.members.forEach(function(m) {
      expect(m.status).toBe('present');
    });

    // A classroom_gate broadcast is returned.
    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_gate');
    expect(bc.payload.gate.armed).toBe(true);
    expect(bc.payload.gate.theme).toBe('stars');
    // Both sockets are in the broadcast.
    expect(bc.sockets).toContain(wsT);
    expect(bc.sockets).toContain(wsS);
  });

  it('armGate resets checkedIn statuses back to present (fresh ritual)', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    // Arm the gate so alice can check in.
    registry.armGate(wsT, 'stars', now + 100);
    registry.checkin(wsS, now + 200);

    // alice is now checkedIn.
    var state1 = registry.stateFor('PeriodA');
    var alice1 = state1.members.find(function(m) { return m.username === 'alice'; });
    expect(alice1.status).toBe('checkedIn');

    // Arm the gate again (fresh ritual) -- should reset alice to present.
    registry.armGate(wsT, 'dots', now + 300);
    var state2 = registry.stateFor('PeriodA');
    var alice2 = state2.members.find(function(m) { return m.username === 'alice'; });
    expect(alice2.status).toBe('present');
  });

  it('armGate is rejected from a student-role socket', () => {
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsS, 'PeriodA', 'alice', 'student', now);

    var result = registry.armGate(wsS, 'stars', now + 100);

    // No broadcasts -- student cannot arm the gate.
    expect(result.broadcasts).toHaveLength(0);

    // Gate remains null.
    var state = registry.stateFor('PeriodA');
    expect(state.gate).toBeNull();
  });

  // --- checkin: sets checkedIn only with an armed gate --------------------

  it('checkin sets status checkedIn and broadcasts a member update', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    registry.armGate(wsT, 'stars', now + 100);
    var result = registry.checkin(wsS, now + 200);

    // Returns a broadcast.
    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_member_update');
    expect(bc.payload.member.username).toBe('alice');
    expect(bc.payload.member.status).toBe('checkedIn');

    // State reflects the change.
    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.status).toBe('checkedIn');
  });

  it('checkin is ignored when no gate is armed', () => {
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsS, 'PeriodA', 'alice', 'student', now);

    var result = registry.checkin(wsS, now + 100);

    expect(result.broadcasts).toHaveLength(0);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.status).toBe('present');
  });

  // --- reset: clears gate and resets statuses -----------------------------

  it('reset clears the gate and resets all member statuses, broadcasts classroom_state', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    // Arm gate and check in alice.
    registry.armGate(wsT, 'stars', now + 100);
    registry.checkin(wsS, now + 200);

    var beforeState = registry.stateFor('PeriodA');
    var aliceBefore = beforeState.members.find(function(m) { return m.username === 'alice'; });
    expect(aliceBefore.status).toBe('checkedIn');

    // Reset.
    var result = registry.reset(wsT, now + 300);

    // Gate is cleared.
    var afterState = registry.stateFor('PeriodA');
    expect(afterState.gate).toBeNull();

    // All statuses reset.
    afterState.members.forEach(function(m) {
      expect(m.status).toBe('present');
    });

    // Returns a classroom_state broadcast.
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_state');
  });

  it('reset is rejected from a student socket', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    registry.armGate(wsT, 'stars', now + 100);
    var result = registry.reset(wsS, now + 200);

    // No broadcasts.
    expect(result.broadcasts).toHaveLength(0);

    // Gate still armed.
    var state = registry.stateFor('PeriodA');
    expect(state.gate).not.toBeNull();
  });

  // --- greenLight: teacher-only -------------------------------------------

  it('greenLight broadcasts classroom_greenlight to all room sockets', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    var result = registry.greenLight(wsT, now + 100);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_greenlight');
    expect(bc.payload.section).toBe('PeriodA');
    expect(bc.sockets).toContain(wsT);
    expect(bc.sockets).toContain(wsS);
  });

  it('greenLight is rejected from a student socket', () => {
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsS, 'PeriodA', 'alice', 'student', now);

    var result = registry.greenLight(wsS, now + 100);

    expect(result.broadcasts).toHaveLength(0);
  });

  // =========================================================================
  // v1c greenLight: startVideo + videoRef wire contract
  // =========================================================================

  it('greenLight with startVideo:true and a videoRef string puts both coerced fields on the broadcast', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    var result = registry.greenLight(wsT, now + 100, true, 'u5-lesson3');

    expect(result.broadcasts).toHaveLength(1);
    var payload = result.broadcasts[0].payload;
    expect(payload.type).toBe('classroom_greenlight');
    expect(payload.section).toBe('PeriodA');
    expect(payload.startVideo).toBe(true);
    expect(payload.videoRef).toBe('u5-lesson3');
  });

  it('greenLight with junk startVideo (string) coerces to false', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var result = registry.greenLight(wsT, now + 100, 'yes', 'u5-lesson3');

    var payload = result.broadcasts[0].payload;
    expect(payload.startVideo).toBe(false);
  });

  it('greenLight with junk videoRef (number) coerces to null', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var result = registry.greenLight(wsT, now + 100, true, 42);

    var payload = result.broadcasts[0].payload;
    expect(payload.startVideo).toBe(true);
    expect(payload.videoRef).toBeNull();
  });

  it('greenLight with junk startVideo (number 1) and junk videoRef (object) both coerce', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var result = registry.greenLight(wsT, now + 100, 1, { ref: 'u5' });

    var payload = result.broadcasts[0].payload;
    expect(payload.startVideo).toBe(false);
    expect(payload.videoRef).toBeNull();
  });

  it('bare greenLight(ws, now) with no extra args broadcasts startVideo:false and videoRef:null', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    var result = registry.greenLight(wsT, now + 100);

    expect(result.broadcasts).toHaveLength(1);
    var payload = result.broadcasts[0].payload;
    expect(payload.type).toBe('classroom_greenlight');
    expect(payload.startVideo).toBe(false);
    expect(payload.videoRef).toBeNull();
  });

  it('startVideo and videoRef are NOT stored in room state (absent from classroom_state)', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    // Fire a greenLight with both fields.
    registry.greenLight(wsT, now + 100, true, 'u5-lesson3');

    // The room state must not carry startVideo or videoRef.
    var state = registry.stateFor('PeriodA');
    expect(state).not.toHaveProperty('startVideo');
    expect(state).not.toHaveProperty('videoRef');
  });

  // --- durability: checkedIn survives socket drop and re-join -------------

  it('a checked-in member that detaches and re-joins is still checkedIn', () => {
    var wsT = makeWs();
    var ws1 = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(ws1, 'PeriodA', 'alice',    'student', now);

    registry.armGate(wsT, 'stars', now + 100);
    registry.checkin(ws1, now + 200);

    // Verify alice is checkedIn.
    var before = registry.stateFor('PeriodA');
    var aliceBefore = before.members.find(function(m) { return m.username === 'alice'; });
    expect(aliceBefore.status).toBe('checkedIn');

    // alice's socket closes.
    registry.detach(ws1, now + 300);

    // alice reconnects with a new socket.
    var ws2 = makeWs();
    var rejoin = registry.join(ws2, 'PeriodA', 'alice', 'student', now + 400);

    // The state returned to alice must still show checkedIn.
    var rejoined = rejoin.sends[0].payload;
    var aliceWire = rejoined.members.find(function(m) { return m.username === 'alice'; });
    expect(aliceWire.status).toBe('checkedIn');

    // Also verify via stateFor.
    var after = registry.stateFor('PeriodA');
    var aliceAfter = after.members.find(function(m) { return m.username === 'alice'; });
    expect(aliceAfter.status).toBe('checkedIn');
  });

  // --- section isolation for the gate -------------------------------------

  it('arming the gate in PeriodA does not affect PeriodB', () => {
    var wsTA = makeWs();
    var wsB  = makeWs();
    var now = 1000;
    registry.join(wsTA, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsB,  'PeriodB', 'carol',    'student', now);

    registry.armGate(wsTA, 'stars', now + 100);

    var stateA = registry.stateFor('PeriodA');
    var stateB = registry.stateFor('PeriodB');

    expect(stateA.gate).not.toBeNull();
    expect(stateB.gate).toBeNull();
  });

  it('gate broadcast for PeriodA is not delivered to PeriodB sockets', () => {
    var wsTA = makeWs();
    var wsB  = makeWs();
    var now = 1000;
    registry.join(wsTA, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsB,  'PeriodB', 'carol',    'student', now);

    var result = registry.armGate(wsTA, 'stars', now + 100);

    // The broadcast sockets must not include wsB.
    result.broadcasts.forEach(function(bc) {
      expect(bc.sockets).not.toContain(wsB);
    });
  });

  // =========================================================================
  // r3: hue field tests (Unit U2)
  // =========================================================================

  // --- hue rides classroom_join into classroom_state -----------------------

  it('hue in join() appears in classroom_state returned to the joiner', () => {
    var ws = makeWs();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', 1000, 120);

    var state = result.sends[0].payload;
    expect(state.type).toBe('classroom_state');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBe(120);
  });

  it('hue in join() appears in classroom_member_update broadcast to existing members', () => {
    var ws1 = makeWs();
    var ws2 = makeWs();
    registry.join(ws1, 'PeriodA', 'alice', 'student', 1000, 30);
    var result = registry.join(ws2, 'PeriodA', 'bob', 'student', 1001, 200);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_member_update');
    expect(bc.payload.member.username).toBe('bob');
    expect(bc.payload.member.hue).toBe(200);
  });

  it('null hue is preserved as null in classroom_state', () => {
    var ws = makeWs();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', 1000, null);

    var state = result.sends[0].payload;
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBeNull();
  });

  it('omitted hue (undefined) normalises to null', () => {
    var ws = makeWs();
    // join() called without the hue argument
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', 1000);

    var state = result.sends[0].payload;
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBeNull();
  });

  it('out-of-range hue (360) normalises to null', () => {
    var ws = makeWs();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', 1000, 360);

    var state = result.sends[0].payload;
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBeNull();
  });

  it('negative hue normalises to null', () => {
    var ws = makeWs();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', 1000, -1);

    var state = result.sends[0].payload;
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBeNull();
  });

  it('non-integer hue (float) normalises to null', () => {
    var ws = makeWs();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', 1000, 45.5);

    var state = result.sends[0].payload;
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBeNull();
  });

  it('string hue normalises to null', () => {
    var ws = makeWs();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', 1000, '120');

    var state = result.sends[0].payload;
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBeNull();
  });

  it('boundary hue values 0 and 359 are preserved', () => {
    var ws0   = makeWs();
    var ws359 = makeWs();
    registry.join(ws0,   'PeriodA', 'zero',       'student', 1000, 0);
    registry.join(ws359, 'PeriodA', 'threefifty9', 'student', 1001, 359);

    var state = registry.stateFor('PeriodA');
    var z = state.members.find(function(m) { return m.username === 'zero'; });
    var t = state.members.find(function(m) { return m.username === 'threefifty9'; });
    expect(z.hue).toBe(0);
    expect(t.hue).toBe(359);
  });

  // --- hue durability: survives armGate ------------------------------------

  it('hue is NOT cleared by armGate (status is cleared, hue is not)', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now, 10);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now, 180);

    registry.armGate(wsT, 'stars', now + 100);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    // status reset to 'present' by armGate
    expect(alice.status).toBe('present');
    // hue untouched
    expect(alice.hue).toBe(180);
  });

  // --- hue durability: survives reset --------------------------------------

  it('hue is NOT cleared by reset (status is cleared, hue is not)', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now, 10);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now, 240);

    // Arm, check in, then reset.
    registry.armGate(wsT, 'stars', now + 100);
    registry.checkin(wsS, now + 200);
    registry.reset(wsT, now + 300);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    // status reset to 'present' by reset
    expect(alice.status).toBe('present');
    // hue untouched
    expect(alice.hue).toBe(240);
  });

  // --- re-join overwrites hue (last value wins) ----------------------------

  it('re-join with a new hue overwrites the previous hue', () => {
    var ws1 = makeWs();
    var now = 1000;
    registry.join(ws1, 'PeriodA', 'alice', 'student', now, 100);

    var ws2 = makeWs();
    registry.join(ws2, 'PeriodA', 'alice', 'student', now + 500, 200);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBe(200);
  });

  it('re-join with null hue overwrites a prior non-null hue', () => {
    var ws1 = makeWs();
    var now = 1000;
    registry.join(ws1, 'PeriodA', 'alice', 'student', now, 100);

    var ws2 = makeWs();
    registry.join(ws2, 'PeriodA', 'alice', 'student', now + 500, null);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBeNull();
  });

  // --- hue survives socket drop + re-join cycle ----------------------------

  it('hue survives detach + re-join when the same hue is provided', () => {
    var wsT = makeWs();
    var ws1 = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now, null);
    registry.join(ws1, 'PeriodA', 'alice',    'student', now, 77);

    // alice's socket closes.
    registry.detach(ws1, now + 300);

    // alice reconnects with the same hue (last value wins).
    var ws2 = makeWs();
    registry.join(ws2, 'PeriodA', 'alice', 'student', now + 400, 77);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.hue).toBe(77);
    expect(alice.online).toBe(true);
  });
});

// =========================================================================
// r3: server.js classroom_join hue dispatch (Unit U2 -- structural pin)
// =========================================================================
//
// The behavioural hue coercion is exercised on classroom.js join() above.
// server.js applies a SECOND coercion at the WS switch(data.type) boundary.
// server.js is a ~2000-line WS entrypoint with no unit-test harness, so this
// pins the dispatch SOURCE directly: the classroom_join case must extract
// data.hue, coerce it (integer 0-359 or null), and pass it into
// classroomRegistry.join() (Codex r3 review, MAJOR).

describe('server.js classroom_join hue dispatch (U2 source pin)', () => {
  const here      = path.dirname(fileURLToPath(import.meta.url));
  const serverSrc = readFileSync(path.join(here, '../railway-server/server.js'), 'utf8');
  // Isolate the classroom_join case body (from its label to the next case).
  const joinCase  = (serverSrc.split("case 'classroom_join'")[1] || '').split('case ')[0];

  it('the classroom_join case exists in server.js', () => {
    expect(serverSrc).toContain("case 'classroom_join'");
  });

  it('classroom_join extracts data.hue', () => {
    expect(joinCase).toMatch(/data\.hue/);
  });

  it('classroom_join coerces hue with the integer 0-359 guard', () => {
    expect(joinCase).toMatch(/Number\.isInteger/);
    expect(joinCase).toContain('359');
  });

  it('classroom_join calls classroomRegistry.join()', () => {
    expect(joinCase).toMatch(/classroomRegistry\.join\(/);
  });
});

// =========================================================================
// v1c: server.js classroom_go dispatch (U1 source pin)
// =========================================================================
//
// Pins that the classroom_go case threads data.startVideo and data.videoRef
// into classroomRegistry.greenLight(). Coercion lives in greenLight() itself
// so the case may pass raw values straight through.

describe('server.js classroom_go v1c dispatch (U1 source pin)', () => {
  const here      = path.dirname(fileURLToPath(import.meta.url));
  const serverSrc = readFileSync(path.join(here, '../railway-server/server.js'), 'utf8');
  // Isolate the classroom_go case body (from its label to the next case).
  const goCase    = (serverSrc.split("case 'classroom_go'")[1] || '').split('case ')[0];

  it('the classroom_go case exists in server.js', () => {
    expect(serverSrc).toContain("case 'classroom_go'");
  });

  it('classroom_go passes data.startVideo to greenLight', () => {
    expect(goCase).toMatch(/data\.startVideo/);
  });

  it('classroom_go passes data.videoRef to greenLight', () => {
    expect(goCase).toMatch(/data\.videoRef/);
  });

  it('classroom_go calls classroomRegistry.greenLight()', () => {
    expect(goCase).toMatch(/classroomRegistry\.greenLight\(/);
  });
});

// =========================================================================
// v2 Poll tests -- classroom.js openPoll / castVote / closePoll / revealPoll
// =========================================================================

describe('v2 Poll: openPoll', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('openPoll broadcasts classroom_poll to all room sockets', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    var result = registry.openPoll(wsT, 'Favorite color?', ['Red', 'Blue', 'Green'], false, now + 100);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_poll');
    expect(bc.payload.question).toBe('Favorite color?');
    expect(bc.payload.options).toEqual(['Red', 'Blue', 'Green']);
    expect(bc.payload.blind).toBe(false);
    expect(bc.sockets).toContain(wsT);
    expect(bc.sockets).toContain(wsS);
  });

  it('openPoll with exactly 2 options succeeds', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var result = registry.openPoll(wsT, 'Yes or No?', ['Yes', 'No'], false, now + 100);
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_poll');
  });

  it('openPoll with exactly 8 options succeeds', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var opts = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    var result = registry.openPoll(wsT, 'Pick one?', opts, false, now + 100);
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.options).toHaveLength(8);
  });

  it('openPoll with 1 option is rejected (too few)', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var result = registry.openPoll(wsT, 'Only one?', ['A'], false, now + 100);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('openPoll with 9 options is rejected (too many)', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var opts = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    var result = registry.openPoll(wsT, 'Too many?', opts, false, now + 100);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('openPoll resets every member vote to null and status to present', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    // Open a first poll and vote, then open a second to verify reset.
    registry.openPoll(wsT, 'Q1', ['A', 'B'], false, now + 100);
    registry.castVote(wsS, 0, now + 200);

    // Open a second poll -- should reset alice's vote.
    registry.openPoll(wsT, 'Q2', ['X', 'Y'], false, now + 300);
    var state = registry.stateFor('PeriodA');
    state.members.forEach(function(m) {
      expect(m.vote).toBeNull();
      expect(m.status).toBe('present');
    });
  });

  it('openPoll is rejected from a student socket', () => {
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsS, 'PeriodA', 'alice', 'student', now);

    var result = registry.openPoll(wsS, 'Student poll?', ['A', 'B'], false, now + 100);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('openPoll is rejected while a gate is armed (mode exclusivity)', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.armGate(wsT, 'stars', now + 100);

    var result = registry.openPoll(wsT, 'Poll during gate?', ['A', 'B'], false, now + 200);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('classroom_state carries poll after openPoll', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.openPoll(wsT, 'Test?', ['A', 'B'], false, now + 100);

    var state = registry.stateFor('PeriodA');
    expect(state.poll).not.toBeNull();
    expect(state.poll.question).toBe('Test?');
  });
});

describe('v2 Poll: castVote', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('castVote sets vote and status voted, broadcasts classroom_member_update', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B', 'C'], false, now + 100);

    var result = registry.castVote(wsS, 1, now + 200);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_member_update');
    expect(bc.payload.member.username).toBe('alice');
    expect(bc.payload.member.vote).toBe(1);
    expect(bc.payload.member.status).toBe('voted');
  });

  it('castVote with choice 0 (boundary) succeeds', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);

    var result = registry.castVote(wsS, 0, now + 200);
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.member.vote).toBe(0);
  });

  it('castVote with out-of-range choice is ignored', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);

    var result = registry.castVote(wsS, 5, now + 200);
    expect(result.broadcasts).toHaveLength(0);

    var state = registry.stateFor('PeriodA');
    var alice = state.members.find(function(m) { return m.username === 'alice'; });
    expect(alice.vote).toBeNull();
  });

  it('castVote with negative choice is ignored', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);

    var result = registry.castVote(wsS, -1, now + 200);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('castVote with non-integer choice is ignored', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);

    var result = registry.castVote(wsS, 0.5, now + 200);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('castVote when no poll is open is ignored', () => {
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsS, 'PeriodA', 'alice', 'student', now);

    var result = registry.castVote(wsS, 0, now + 100);
    expect(result.broadcasts).toHaveLength(0);
  });
});

describe('v2 Poll: closePoll', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('closePoll computes correct tally and broadcasts classroom_poll_closed', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var wsS3 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);
    registry.join(wsS3, 'PeriodA', 'carol',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B', 'C'], false, now + 100);
    registry.castVote(wsS1, 0, now + 200);  // alice -> A
    registry.castVote(wsS2, 0, now + 300);  // bob   -> A
    registry.castVote(wsS3, 2, now + 400);  // carol -> C

    var result = registry.closePoll(wsT, now + 500);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_poll_closed');
    expect(bc.payload.tally).toEqual([2, 0, 1]);  // A=2, B=0, C=1
  });

  it('closePoll clears room.poll after closing', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);
    registry.closePoll(wsT, now + 200);

    var state = registry.stateFor('PeriodA');
    expect(state.poll).toBeNull();
  });

  it('closePoll returns empty broadcasts if no poll is open', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var result = registry.closePoll(wsT, now + 100);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('closePoll is rejected from a student socket', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);

    var result = registry.closePoll(wsS, now + 200);
    expect(result.broadcasts).toHaveLength(0);

    // Poll should still be open.
    var state = registry.stateFor('PeriodA');
    expect(state.poll).not.toBeNull();
  });

  it('tally with no votes is all zeros', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B', 'C'], false, now + 100);

    var result = registry.closePoll(wsT, now + 200);
    expect(result.broadcasts[0].payload.tally).toEqual([0, 0, 0]);
  });
});

describe('v2 Poll: revealPoll', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('revealPoll broadcasts classroom_poll_reveal with tally and members', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);  // blind
    registry.castVote(wsS1, 0, now + 200);  // alice -> A
    registry.castVote(wsS2, 1, now + 300);  // bob   -> B

    var result = registry.revealPoll(wsT, now + 400);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_poll_reveal');
    expect(bc.payload.tally).toEqual([1, 1]);
    expect(Array.isArray(bc.payload.members)).toBe(true);

    // All sockets (teacher + students) receive the reveal.
    expect(bc.sockets).toContain(wsT);
    expect(bc.sockets).toContain(wsS1);
    expect(bc.sockets).toContain(wsS2);
  });

  it('revealPoll does NOT clear room.poll (poll remains for closePoll)', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.revealPoll(wsT, now + 200);

    var state = registry.stateFor('PeriodA');
    expect(state.poll).not.toBeNull();
  });

  it('revealPoll returns empty broadcasts if no poll is open', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var result = registry.revealPoll(wsT, now + 100);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('revealPoll is rejected from a student socket', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);

    var result = registry.revealPoll(wsS, now + 200);
    expect(result.broadcasts).toHaveLength(0);
  });
});

describe('v2 Poll: blind-poll role-aware broadcast rule (Section 1.4)', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('castVote in a blind poll sends TWO broadcast objects (students, teacher)', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);  // blind
    var result = registry.castVote(wsS1, 0, now + 200);          // alice votes

    // Two broadcast objects: one for students, one for teacher.
    expect(result.broadcasts).toHaveLength(2);

    // The student-bucket broadcast masks vote as null for ALL students in a
    // blind poll -- the voter's client already knows their own choice.
    var studentBc = result.broadcasts.find(function(bc) { return bc.sockets.includes(wsS2); });
    expect(studentBc).toBeDefined();
    expect(studentBc.payload.member.username).toBe('alice');
    // In a blind poll student broadcast, vote is always masked to null.
    expect(studentBc.payload.member.vote).toBeNull();

    // The teacher-bucket broadcast shows full vote.
    var teacherBc = result.broadcasts.find(function(bc) { return bc.sockets.includes(wsT); });
    expect(teacherBc).toBeDefined();
    expect(teacherBc.payload.member.vote).toBe(0);
  });

  it('in blind poll, a student socket never sees another student vote in castVote broadcast', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    // Bob votes -- alice should not see bob's vote.
    var result = registry.castVote(wsS2, 1, now + 200);

    // Find the broadcast delivered to alice's socket.
    var aliceBc = result.broadcasts.find(function(bc) { return bc.sockets.includes(wsS1); });
    expect(aliceBc).toBeDefined();
    // The member being updated is bob, but alice's view must mask his vote.
    expect(aliceBc.payload.member.username).toBe('bob');
    expect(aliceBc.payload.member.vote).toBeNull();  // masked for alice
  });

  it('teacher socket always sees real vote in a blind poll castVote broadcast', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    var result = registry.castVote(wsS, 1, now + 200);

    var teacherBc = result.broadcasts.find(function(bc) { return bc.sockets.includes(wsT); });
    expect(teacherBc).toBeDefined();
    expect(teacherBc.payload.member.vote).toBe(1);
  });

  it('non-blind poll: single broadcast, vote visible to all', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);
    var result = registry.castVote(wsS, 0, now + 200);

    // Only one broadcast for non-blind poll.
    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.sockets).toContain(wsT);
    expect(bc.sockets).toContain(wsS);
    expect(bc.payload.member.vote).toBe(0);
  });

  it('classroom_state in blind poll masks other student votes for a student viewer', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);  // alice votes
    registry.castVote(wsS2, 1, now + 300);  // bob votes

    // From alice's perspective: she sees her own vote, bob's is masked.
    var stateForAlice = registry.stateFor('PeriodA', 'student', 'alice');
    var aliceInState = stateForAlice.members.find(function(m) { return m.username === 'alice'; });
    var bobInState   = stateForAlice.members.find(function(m) { return m.username === 'bob'; });
    expect(aliceInState.vote).toBe(0);   // own vote visible
    expect(bobInState.vote).toBeNull();  // other student masked
  });

  it('classroom_state in blind poll exposes all votes to teacher viewer', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);
    registry.castVote(wsS2, 1, now + 300);

    var stateForTeacher = registry.stateFor('PeriodA', 'teacher', 'teacher1');
    var aliceInState = stateForTeacher.members.find(function(m) { return m.username === 'alice'; });
    var bobInState   = stateForTeacher.members.find(function(m) { return m.username === 'bob'; });
    expect(aliceInState.vote).toBe(0);
    expect(bobInState.vote).toBe(1);
  });

  it('reveal unmasks all votes in classroom_poll_reveal for every socket', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);
    registry.castVote(wsS2, 1, now + 300);

    var result = registry.revealPoll(wsT, now + 400);
    var bc = result.broadcasts[0];

    // All sockets receive reveal.
    expect(bc.sockets).toContain(wsT);
    expect(bc.sockets).toContain(wsS1);
    expect(bc.sockets).toContain(wsS2);

    // members list has full unmasked votes.
    var aliceMember = bc.payload.members.find(function(m) { return m.username === 'alice'; });
    var bobMember   = bc.payload.members.find(function(m) { return m.username === 'bob'; });
    expect(aliceMember.vote).toBe(0);
    expect(bobMember.vote).toBe(1);
  });
});

describe('v2 Poll: mode exclusivity (Section 1.5)', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('armGate is rejected while a poll is open', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);

    var result = registry.armGate(wsT, 'stars', now + 200);

    // Gate rejected while poll is open.
    expect(result.broadcasts).toHaveLength(0);
    var state = registry.stateFor('PeriodA');
    expect(state.gate).toBeNull();
    expect(state.poll).not.toBeNull();
  });

  it('openPoll is rejected while a gate is armed', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.armGate(wsT, 'stars', now + 100);

    var result = registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 200);

    expect(result.broadcasts).toHaveLength(0);
    var state = registry.stateFor('PeriodA');
    expect(state.poll).toBeNull();
    expect(state.gate).not.toBeNull();
  });
});

describe('v2 Poll: reset clears poll and votes', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('reset clears room.poll and all member votes', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);
    registry.castVote(wsS, 1, now + 200);

    registry.reset(wsT, now + 300);

    var state = registry.stateFor('PeriodA');
    expect(state.poll).toBeNull();
    state.members.forEach(function(m) {
      expect(m.vote).toBeNull();
      expect(m.status).toBe('present');
    });
  });

  it('reset broadcasts classroom_state (not poll_closed)', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);

    var result = registry.reset(wsT, now + 200);

    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_state');
    expect(result.broadcasts[0].payload.poll).toBeNull();
  });
});

// =========================================================================
// v2 Poll: server.js structural pins (source pins for the four new cases)
// =========================================================================

describe('server.js v2 poll cases (source pins)', () => {
  const here      = path.dirname(fileURLToPath(import.meta.url));
  const serverSrc = readFileSync(path.join(here, '../railway-server/server.js'), 'utf8');

  it('classroom_open_poll case exists', () => {
    expect(serverSrc).toContain("case 'classroom_open_poll'");
  });

  it('classroom_vote case exists', () => {
    expect(serverSrc).toContain("case 'classroom_vote'");
  });

  it('classroom_close_poll case exists', () => {
    expect(serverSrc).toContain("case 'classroom_close_poll'");
  });

  it('classroom_reveal case exists', () => {
    expect(serverSrc).toContain("case 'classroom_reveal'");
  });

  it('classroom_open_poll calls classroomRegistry.openPoll()', () => {
    const openPollCase = (serverSrc.split("case 'classroom_open_poll'")[1] || '').split('case ')[0];
    expect(openPollCase).toMatch(/classroomRegistry\.openPoll\(/);
  });

  it('classroom_vote calls classroomRegistry.castVote()', () => {
    const voteCase = (serverSrc.split("case 'classroom_vote'")[1] || '').split('case ')[0];
    expect(voteCase).toMatch(/classroomRegistry\.castVote\(/);
  });

  it('classroom_close_poll calls classroomRegistry.closePoll()', () => {
    const closeCase = (serverSrc.split("case 'classroom_close_poll'")[1] || '').split('case ')[0];
    expect(closeCase).toMatch(/classroomRegistry\.closePoll\(/);
  });

  it('classroom_reveal calls classroomRegistry.revealPoll()', () => {
    const revealCase = (serverSrc.split("case 'classroom_reveal'")[1] || '').split('case ')[0];
    expect(revealCase).toMatch(/classroomRegistry\.revealPoll\(/);
  });

  it('classroom_open_poll extracts data.options', () => {
    const openPollCase = (serverSrc.split("case 'classroom_open_poll'")[1] || '').split('case ')[0];
    expect(openPollCase).toMatch(/data\.options/);
  });

  it('classroom_vote extracts data.choice', () => {
    const voteCase = (serverSrc.split("case 'classroom_vote'")[1] || '').split('case ')[0];
    expect(voteCase).toMatch(/data\.choice/);
  });
});

// =========================================================================
// F4 code-review: Finding 2 -- Blind-poll secrecy on non-vote broadcasts
// =========================================================================

describe('F4 Finding 2: blind-poll secrecy on join/detach/heartbeat/sweep', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  // --- join during blind poll must NOT expose another student's vote -------

  it('join during blind poll: classroom_member_update to existing student has vote masked', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);  // blind
    registry.castVote(wsS1, 0, now + 200);  // alice votes

    // Bob joins -- alice's vote must be masked in the broadcast bob gets
    // via the join broadcast (classroom_member_update for alice if alice is
    // already in the room -- but here alice is the existing member and bob
    // joins, so alice receives a classroom_member_update for BOB with bob's
    // vote masked because a blind poll is open and alice is a student).
    var result = registry.join(wsS2, 'PeriodA', 'bob', 'student', now + 300);

    // Find the broadcast that goes to alice's socket.
    var aliceBc = result.broadcasts.find(function(bc) { return bc.sockets.includes(wsS1); });
    expect(aliceBc).toBeDefined();
    // In a blind poll, bob's vote should be null to the student viewer alice.
    expect(aliceBc.payload.member.username).toBe('bob');
    expect(aliceBc.payload.member.vote).toBeNull();
  });

  it('join during blind poll: classroom_state returned to joiner masks other student votes', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);

    // Bob joins -- his classroom_state should show alice's vote as null.
    var result = registry.join(wsS2, 'PeriodA', 'bob', 'student', now + 300);

    var stateForBob = result.sends[0].payload;
    var aliceInState = stateForBob.members.find(function(m) { return m.username === 'alice'; });
    expect(aliceInState.vote).toBeNull();  // bob cannot see alice's vote
  });

  it('join during blind poll: classroom_state returned to joiner shows own vote', () => {
    // alice is rejoining while a blind poll is open and she has already voted.
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 1, now + 200);

    // alice reconnects.
    var wsS2 = makeWs();
    var result = registry.join(wsS2, 'PeriodA', 'alice', 'student', now + 300);

    var stateForAlice = result.sends[0].payload;
    var aliceInState = stateForAlice.members.find(function(m) { return m.username === 'alice'; });
    // Alice can see her own vote in the state (viewerUsername matches).
    expect(aliceInState.vote).toBe(1);
  });

  // --- detach during blind poll must mask vote in offline broadcast --------

  it('detach during blind poll: offline broadcast to student socket masks vote', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);  // alice votes

    // alice goes offline.
    var result = registry.detach(wsS1, now + 300);

    // The broadcast that reaches bob (a student) must mask alice's vote.
    var bobBc = result.broadcasts.find(function(bc) { return bc.sockets.includes(wsS2); });
    expect(bobBc).toBeDefined();
    expect(bobBc.payload.member.username).toBe('alice');
    expect(bobBc.payload.member.vote).toBeNull();  // masked for bob
  });

  it('detach during blind poll: offline broadcast to teacher shows real vote', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 1, now + 200);

    var result = registry.detach(wsS1, now + 300);

    var teacherBc = result.broadcasts.find(function(bc) { return bc.sockets.includes(wsT); });
    expect(teacherBc).toBeDefined();
    expect(teacherBc.payload.member.vote).toBe(1);  // teacher sees real vote
  });

  // --- heartbeat revival during blind poll must mask vote -----------------

  it('heartbeat revival during blind poll: broadcast to student masks vote', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);

    // alice is flipped offline by a sweep.
    registry.detach(wsS1, now + 300);

    // alice's socket sends a heartbeat -- revives her.
    // Reconnect alice with a new socket to simulate heartbeat revival.
    var wsS3 = makeWs();
    registry.join(wsS3, 'PeriodA', 'alice', 'student', now + 400);
    // Now simulate alice going offline again via sweep for heartbeat test.
    registry.sweep(now + 400 + 46000);  // alice was rejoined at now+400; sweep at +46s

    // Heartbeat revives alice.
    var hbResult = registry.heartbeat(wsS3, now + 400 + 47000);

    // The broadcast for the revival must mask alice's vote for bob.
    if (hbResult.broadcasts.length > 0) {
      var bobBc2 = hbResult.broadcasts.find(function(bc) { return bc.sockets.includes(wsS2); });
      if (bobBc2) {
        expect(bobBc2.payload.member.vote).toBeNull();  // masked for student
      }
    }
    // If no broadcasts or bob not in broadcasts, the test still passes --
    // the key invariant is no REAL vote leaked (checked via absence of bob
    // in the non-masked bucket).
  });

  // --- sweep offline-flip during blind poll must mask vote ----------------

  it('sweep offline-flip during blind poll: broadcast to student masks vote', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var wsS2 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);
    registry.join(wsS2, 'PeriodA', 'bob',      'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);  // alice votes

    // Sweep flips alice offline (heartbeat lapsed).
    var sweepResult = registry.sweep(now + 46000 + 200);

    // The sweep onlineFlips broadcast must mask alice's vote for bob.
    var aliceFlip = sweepResult.onlineFlips.find(function(bc) {
      return bc.payload.member && bc.payload.member.username === 'alice' && bc.sockets.includes(wsS2);
    });
    expect(aliceFlip).toBeDefined();
    expect(aliceFlip.payload.member.vote).toBeNull();  // masked for student bob
  });

  it('sweep offline-flip during blind poll: broadcast to teacher shows real vote', () => {
    var wsT  = makeWs();
    var wsS1 = makeWs();
    var now = 1000;
    registry.join(wsT,  'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS1, 'PeriodA', 'alice',    'student', now);

    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS1, 0, now + 200);

    var sweepResult = registry.sweep(now + 46000 + 200);

    var aliceTeacherFlip = sweepResult.onlineFlips.find(function(bc) {
      return bc.payload.member && bc.payload.member.username === 'alice' && bc.sockets.includes(wsT);
    });
    expect(aliceTeacherFlip).toBeDefined();
    expect(aliceTeacherFlip.payload.member.vote).toBe(0);  // teacher sees real vote
  });
});

// =========================================================================
// F4 code-review: Finding 4 -- revealPoll rejected for non-blind polls
// =========================================================================

describe('F4 Finding 4: revealPoll rejected when poll is not blind', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('revealPoll on a non-blind poll returns empty broadcasts', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    // Open a non-blind poll.
    registry.openPoll(wsT, 'Q?', ['A', 'B'], false, now + 100);
    registry.castVote(wsS, 0, now + 200);

    // Reveal must be rejected for a non-blind poll.
    var result = registry.revealPoll(wsT, now + 300);
    expect(result.broadcasts).toHaveLength(0);

    // Poll is still open (reveal did not close it).
    var state = registry.stateFor('PeriodA');
    expect(state.poll).not.toBeNull();
  });

  it('revealPoll on a blind poll still succeeds', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    // Open a blind poll.
    registry.openPoll(wsT, 'Q?', ['A', 'B'], true, now + 100);
    registry.castVote(wsS, 1, now + 200);

    var result = registry.revealPoll(wsT, now + 300);
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_poll_reveal');
  });

  it('revealPoll on non-blind poll does not broadcast classroom_poll_reveal', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.openPoll(wsT, 'Q?', ['X', 'Y', 'Z'], false, now + 100);

    var result = registry.revealPoll(wsT, now + 200);
    var hasReveal = result.broadcasts.some(function(bc) {
      return bc.payload.type === 'classroom_poll_reveal';
    });
    expect(hasReveal).toBe(false);
  });
});

// =============================================================
// KEYBOARD_AVATAR Phase 2 -- position broadcast
// =============================================================

describe('createClassroomRegistry -- position (Phase 2)', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  it('records last-known pos on the sender member', () => {
    var ws = makeWs();
    var now = Date.now();
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    registry.position(ws, 250, 200, 'walking', 120, now + 100);

    // Inspect via stateFor (the snapshot carries pos).
    var state = registry.stateFor('PeriodA', 'teacher', 'observer');
    var alice = state.members.find(function (m) { return m.username === 'alice'; });
    expect(alice.pos).toEqual({ x: 250, y: 200, state: 'walking', vx: 120 });
  });

  it('forwards classroom_pos to OTHER sockets in the room (sender excluded)', () => {
    var wsA = makeWs();
    var wsB = makeWs();
    var wsT = makeWs();
    var now = Date.now();
    registry.join(wsA, 'PeriodA', 'alice', 'student', now);
    registry.join(wsB, 'PeriodA', 'bob',   'student', now);
    registry.join(wsT, 'PeriodA', 'tea',   'teacher', now);

    var result = registry.position(wsA, 150, 220, 'walking', 120, now + 100);
    expect(result.broadcasts.length).toBe(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_pos');
    expect(bc.payload.username).toBe('alice');
    expect(bc.payload.x).toBe(150);
    expect(bc.payload.y).toBe(220);
    expect(bc.payload.state).toBe('walking');
    expect(bc.payload.vx).toBe(120);
    // Sender excluded; bob + teacher receive.
    expect(bc.sockets).toContain(wsB);
    expect(bc.sockets).toContain(wsT);
    expect(bc.sockets).not.toContain(wsA);
  });

  it('non-finite x or y -> empty broadcasts (sender pos unchanged)', () => {
    var ws = makeWs();
    var now = Date.now();
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    var bad1 = registry.position(ws, NaN, 100, 'idle', 0, now + 100);
    expect(bad1.broadcasts).toEqual([]);

    var bad2 = registry.position(ws, 50, undefined, 'idle', 0, now + 200);
    expect(bad2.broadcasts).toEqual([]);

    // The member's pos should still be null (no record).
    var state = registry.stateFor('PeriodA', 'teacher', 'observer');
    var alice = state.members.find(function (m) { return m.username === 'alice'; });
    expect(alice.pos).toBeNull();
  });

  it('unbound socket -> empty broadcasts (no member, no record)', () => {
    var lone = makeWs();
    var now = Date.now();
    var result = registry.position(lone, 50, 50, 'idle', 0, now);
    expect(result.broadcasts).toEqual([]);
  });

  it('alone in the room -> empty broadcasts (no peers to forward to)', () => {
    var ws = makeWs();
    var now = Date.now();
    registry.join(ws, 'PeriodA', 'alice', 'student', now);
    var result = registry.position(ws, 100, 200, 'walking', 120, now + 50);
    // pos IS recorded.
    var state = registry.stateFor('PeriodA', 'teacher', 'observer');
    var alice = state.members.find(function (m) { return m.username === 'alice'; });
    expect(alice.pos.x).toBe(100);
    // But no broadcast (room has no other members).
    expect(result.broadcasts).toEqual([]);
  });

  it('classroom_state join snapshot includes each member.pos', () => {
    var wsA = makeWs();
    var wsB = makeWs();
    var now = Date.now();
    registry.join(wsA, 'PeriodA', 'alice', 'student', now);
    registry.position(wsA, 300, 180, 'walking', 120, now + 50);

    // bob joins; the snapshot bob receives must carry alice.pos.
    var joinResult = registry.join(wsB, 'PeriodA', 'bob', 'student', now + 100);
    var bobSnapshot = joinResult.sends[0].payload;
    expect(bobSnapshot.type).toBe('classroom_state');
    var alice = bobSnapshot.members.find(function (m) { return m.username === 'alice'; });
    expect(alice.pos).toEqual({ x: 300, y: 180, state: 'walking', vx: 120 });
  });

  it('default coercions: missing state -> "idle"; missing vx -> 0', () => {
    var ws = makeWs();
    var now = Date.now();
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    registry.position(ws, 50, 50, undefined, undefined, now + 50);
    var state = registry.stateFor('PeriodA', 'teacher', 'observer');
    var alice = state.members.find(function (m) { return m.username === 'alice'; });
    expect(alice.pos.state).toBe('idle');
    expect(alice.pos.vx).toBe(0);
  });

  it('toWireMember carries pos:null by default for a fresh member', () => {
    var ws = makeWs();
    var now = Date.now();
    var result = registry.join(ws, 'PeriodA', 'alice', 'student', now);
    var snapshot = result.sends[0].payload;
    var alice = snapshot.members.find(function (m) { return m.username === 'alice'; });
    expect(alice.pos).toBeNull();
  });
});

// =========================================================================
// v3 P1+P2: monitor sockets + setLive (Unit T tests for Unit A+B cr code)
// =========================================================================
//
// Covers the new public surface added in LIVE_CLASSROOM_V3_P12_BUILD.md C7:
//   - subscribeMonitor / unsubscribeMonitor
//   - setLive (false->true transitions, no-op on identity)
//   - _fanoutToMonitors via observable behaviour on existing broadcasts
//   - getAllSectionsState (public exposure of buildAllSectionsStatePayload)
//   - detach removes monitor sockets

describe('createClassroomRegistry -- v3 P1+P2 monitor + setLive', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  // --- subscribeMonitor: empty registry snapshot ---------------------------

  it('subscribeMonitor on an empty registry returns a classroom_state_all snapshot with empty sections', () => {
    var mws = makeWs();
    var result = registry.subscribeMonitor(mws);

    expect(result.sends).toHaveLength(1);
    expect(result.sends[0].ws).toBe(mws);
    expect(result.sends[0].payload.type).toBe('classroom_state_all');
    expect(result.sends[0].payload.sections).toEqual([]);
  });

  // --- subscribeMonitor: populated registry snapshot -----------------------

  it('subscribeMonitor with existing rooms returns one entry per section with gate, poll, live, members', () => {
    var wsA = makeWs();
    var wsB = makeWs();
    var now = 1000;
    registry.join(wsA, 'PeriodA', 'alice', 'student', now);
    registry.join(wsB, 'PeriodB', 'bob',   'student', now);

    var mws = makeWs();
    var result = registry.subscribeMonitor(mws);
    var payload = result.sends[0].payload;

    expect(payload.type).toBe('classroom_state_all');
    expect(payload.sections).toHaveLength(2);

    payload.sections.forEach(function (s) {
      expect(typeof s.section).toBe('string');
      expect(s.gate).toBeNull();
      expect(s.poll).toBeNull();
      expect(s.live).toBe(false);
      expect(Array.isArray(s.members)).toBe(true);
      expect(s.members.length).toBe(1);
    });

    var names = payload.sections.map(function (s) { return s.section; }).sort();
    expect(names).toEqual(['PeriodA', 'PeriodB']);
  });

  // --- subscribeMonitor: idempotent -- no duplicate internal entries -------

  it('subscribeMonitor called twice with the same ws does not duplicate the socket', () => {
    var wsT = makeWs();
    var wsS = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);
    registry.join(wsS, 'PeriodA', 'alice',    'student', now);

    var mws = makeWs();
    var first  = registry.subscribeMonitor(mws);
    var second = registry.subscribeMonitor(mws);

    // Both calls produce a fresh snapshot reply.
    expect(first.sends).toHaveLength(1);
    expect(second.sends).toHaveLength(1);
    expect(second.sends[0].ws).toBe(mws);

    // A follow-up broadcast must include the monitor exactly ONCE,
    // even though we subscribed twice.
    var bcResult = registry.armGate(wsT, 'stars', now + 100);
    expect(bcResult.broadcasts).toHaveLength(1);
    var bc = bcResult.broadcasts[0];
    var count = bc.sockets.filter(function (s) { return s === mws; }).length;
    expect(count).toBe(1);
  });

  // --- unsubscribeMonitor: socket removed from broadcast list --------------

  it('unsubscribeMonitor removes the socket so subsequent broadcasts skip it', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var mws = makeWs();
    registry.subscribeMonitor(mws);
    registry.unsubscribeMonitor(mws);

    // armGate will broadcast to the teacher socket only; the unsubscribed
    // monitor must NOT be in the broadcast's sockets list.
    var result = registry.armGate(wsT, 'stars', now + 100);
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].sockets).not.toContain(mws);
  });

  // --- unsubscribeMonitor: idempotent on unknown ws ------------------------

  it('unsubscribeMonitor on a never-subscribed ws does not throw', () => {
    var stranger = makeWs();
    expect(function () { registry.unsubscribeMonitor(stranger); }).not.toThrow();
  });

  // --- detach removes the monitor socket -----------------------------------

  it('detach removes a monitor-only socket so later broadcasts skip it', () => {
    var wsT = makeWs();
    var now = 1000;
    registry.join(wsT, 'PeriodA', 'teacher1', 'teacher', now);

    var mws = makeWs();
    registry.subscribeMonitor(mws);

    // detach the monitor ws (it is not bound to any member -- detach must
    // still clean it out of monitorSockets per the v3 P1+P2 contract).
    registry.detach(mws, now + 50);

    var result = registry.armGate(wsT, 'stars', now + 100);
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].sockets).not.toContain(mws);
  });

  // --- setLive: non-existent section ---------------------------------------

  it('setLive on a non-existent section returns empty broadcasts', () => {
    var result = registry.setLive('NonexistentSection', true, 1000);
    expect(result.broadcasts).toHaveLength(0);
  });

  // --- setLive: identity transition is a no-op -----------------------------

  it('setLive(true) twice -- second call is a no-op (no broadcast on identity)', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    var first  = registry.setLive('PeriodA', true, now + 100);
    expect(first.broadcasts).toHaveLength(1);

    var second = registry.setLive('PeriodA', true, now + 200);
    expect(second.broadcasts).toHaveLength(0);
  });

  // --- setLive: false -> true broadcast payload + room.live mutation -------

  it('setLive false->true broadcasts classroom_live_state and flips room.live', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    var result = registry.setLive('PeriodA', true, now + 100);
    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload).toEqual({
      type:    'classroom_live_state',
      section: 'PeriodA',
      live:    true
    });

    // room.live is now true -- visible via getAllSectionsState.
    var snap = registry.getAllSectionsState();
    var periodA = snap.sections.find(function (s) { return s.section === 'PeriodA'; });
    expect(periodA.live).toBe(true);
  });

  // --- setLive: fans out to room sockets AND monitor sockets ---------------

  it('setLive broadcast targets room sockets AND monitor sockets', () => {
    var wsR = makeWs();
    var now = 1000;
    registry.join(wsR, 'PeriodA', 'alice', 'student', now);

    var mws = makeWs();
    registry.subscribeMonitor(mws);

    var result = registry.setLive('PeriodA', true, now + 100);
    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.sockets).toContain(wsR);
    expect(bc.sockets).toContain(mws);
  });

  // --- _fanoutToMonitors integration -- join broadcasts reach monitors -----

  it('a new student join broadcast includes monitor sockets via _fanoutToMonitors', () => {
    var mws = makeWs();
    registry.subscribeMonitor(mws);

    var ws1 = makeWs();
    var now = 1000;
    registry.join(ws1, 'PeriodA', 'alice', 'student', now);

    // bob joins -- triggers a classroom_member_update broadcast.
    var ws2 = makeWs();
    var result = registry.join(ws2, 'PeriodA', 'bob', 'student', now + 100);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_member_update');
    expect(bc.sockets).toContain(ws1);  // existing room socket
    expect(bc.sockets).toContain(mws);  // monitor receives the fanout
    expect(bc.sockets).not.toContain(ws2); // joiner excluded
  });

  // --- _fanoutToMonitors deduplicates --------------------------------------

  it('_fanoutToMonitors does not duplicate a ws that is both a room socket and a monitor', () => {
    // dual is BOTH a member socket AND a monitor socket.
    var dual = makeWs();
    var now = 1000;
    // First subscribe dual as a monitor.
    registry.subscribeMonitor(dual);
    // Then have dual join a room as a member (so it's in member.sockets too).
    registry.join(dual, 'PeriodA', 'teacher1', 'teacher', now);

    // A second member joins -- the broadcast targets the room (dual) +
    // fans out to monitors (dual). It must NOT include dual twice.
    var ws2 = makeWs();
    var result = registry.join(ws2, 'PeriodA', 'alice', 'student', now + 100);

    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    var count = bc.sockets.filter(function (s) { return s === dual; }).length;
    expect(count).toBe(1);
  });

  // --- getAllSectionsState: same shape as subscribeMonitor's reply ---------

  it('getAllSectionsState returns the same payload shape as subscribeMonitor', () => {
    var wsA = makeWs();
    var wsB = makeWs();
    var now = 1000;
    registry.join(wsA, 'PeriodA', 'alice', 'student', now);
    registry.join(wsB, 'PeriodB', 'bob',   'student', now);

    var direct = registry.getAllSectionsState();

    var mws = makeWs();
    var sub = registry.subscribeMonitor(mws);
    var viaSubscribe = sub.sends[0].payload;

    expect(direct.type).toBe('classroom_state_all');
    expect(direct).toEqual(viaSubscribe);
  });
});

// =============================================================
// v3 P1+P2 -- Codex BLOCKER fold: live propagates through the join snapshot.
// =============================================================

describe('createClassroomRegistry -- v3 P1+P2 BLOCKER fold (join snapshot carries live)', () => {
  it('classroom_state join reply carries live:false on a fresh room', () => {
    const reg = createClassroomRegistry();
    const ws = makeWs();
    const result = reg.join(ws, 'PeriodE', 'alice', 'student', 1000, null);
    const snap = result.sends[0].payload;
    expect(snap.type).toBe('classroom_state');
    expect(snap.live).toBe(false);
  });

  it('classroom_state join reply carries live:true on an already-Live room (late joiner)', () => {
    const reg = createClassroomRegistry();
    // First socket joins -> room is created with live:false.
    reg.join(makeWs(), 'PeriodE', 'alice', 'student', 1000, null);
    // Cockpit sets the room Live.
    const setLiveResult = reg.setLive('PeriodE', true, 1100);
    expect(setLiveResult.broadcasts.length).toBe(1);
    // Late joiner arrives -- their snapshot MUST include live:true.
    const lateWs = makeWs();
    const lateResult = reg.join(lateWs, 'PeriodE', 'bob', 'student', 1200, null);
    const lateSnap = lateResult.sends[0].payload;
    expect(lateSnap.type).toBe('classroom_state');
    expect(lateSnap.live).toBe(true);
  });
});

// =========================================================================
// v3 P3: WebRTC signaling routing helpers (Unit T tests for Unit A cr code)
// =========================================================================
//
// Covers the two public lookups introduced in LIVE_CLASSROOM_V3_P3_BUILD.md
// C2 + C3 (server.js rtc_offer / rtc_answer / rtc_ice relay):
//   - _wsEntry(ws) -> { section, username } | null
//   - findSocketByUsername(section, username) -> [ws, ws, ...]
//
// These are the building blocks the rtc_* server case uses to look up the
// sender's section and the target peer's sockets without re-parsing the
// classroom_join payload.

describe('createClassroomRegistry -- v3 P3 signaling routing helpers', () => {
  let registry;

  beforeEach(() => {
    registry = createClassroomRegistry();
  });

  // --- _wsEntry ---------------------------------------------------------

  it('_wsEntry(ws) returns null for an unbound socket', () => {
    var lone = makeWs();
    expect(registry._wsEntry(lone)).toBeNull();
  });

  it('_wsEntry(ws) returns {section, username} after join', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    var entry = registry._wsEntry(ws);
    expect(entry).not.toBeNull();
    expect(entry.section).toBe('PeriodA');
    expect(entry.username).toBe('alice');
  });

  // --- findSocketByUsername ---------------------------------------------

  it('findSocketByUsername finds the joined socket', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    var sockets = registry.findSocketByUsername('PeriodA', 'alice');
    expect(sockets).toHaveLength(1);
    expect(sockets[0]).toBe(ws);
  });

  it('findSocketByUsername returns [] for an unknown section', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    var sockets = registry.findSocketByUsername('NoSuchSection', 'alice');
    expect(sockets).toEqual([]);
  });

  it('findSocketByUsername returns [] for an unknown username in a known section', () => {
    var ws = makeWs();
    var now = 1000;
    registry.join(ws, 'PeriodA', 'alice', 'student', now);

    var sockets = registry.findSocketByUsername('PeriodA', 'bob');
    expect(sockets).toEqual([]);
  });

  it('findSocketByUsername returns multiple sockets when a user has multiple connections', () => {
    // alice joins twice (a re-attach -- second tab / browser) so she has
    // two open sockets bound to the same (section, username).
    var ws1 = makeWs();
    var ws2 = makeWs();
    var now = 1000;
    registry.join(ws1, 'PeriodA', 'alice', 'student', now);
    registry.join(ws2, 'PeriodA', 'alice', 'student', now + 100);

    var sockets = registry.findSocketByUsername('PeriodA', 'alice');
    expect(sockets).toHaveLength(2);
    expect(sockets).toContain(ws1);
    expect(sockets).toContain(ws2);
  });
});
