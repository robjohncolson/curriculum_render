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
