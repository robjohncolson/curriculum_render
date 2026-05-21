// classroom.test.js
// Unit tests for railway-server/classroom.js
// Uses stub ws objects -- no real sockets.

import { describe, it, expect, beforeEach } from 'vitest';
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
});
