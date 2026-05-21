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
});
