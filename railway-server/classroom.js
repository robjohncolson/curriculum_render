// classroom.js
// ES module -- exports createClassroomRegistry()
//
// Owns the in-memory classroom state for the Live Classroom feature.
// Holds socket references but performs NO socket I/O.
// Methods return { sends: [{ ws, payload }], broadcasts: [{ sockets, payload }] }
// so server.js can call .send() and the module stays unit-testable.
//
// Protocol: see LIVE_CLASSROOM_V1B_BUILD.md Section 2.
// Knobs: heartbeat 30s, liveness window 45s, idle GC 45 min.

const LIVENESS_MS = 45 * 1000;          // 45 seconds
const IDLE_GC_MS  = 45 * 60 * 1000;     // 45 minutes

// WireMember -- the shape sent on the wire (v1b).
// status reflects the member's real status ("present", "checkedIn", or "voted").
// hue is an integer 0-359 or null (r3 addition -- see Section 2.7).
// vote is an option index or null (v2 poll addition).
// pos is the last-known position broadcast by the member, or null
// (KEYBOARD_AVATAR Phase 2 addition; shape: { x, y, state, vx }).
function toWireMember(member) {
  return {
    username: member.username,
    role:     member.role,
    status:   member.status,
    online:   member.online,
    hue:      member.hue,
    vote:     member.vote,
    pos:      member.pos || null
  };
}

// toWireMemberForRole -- role-aware wire shape for a single member.
// In a blind poll (room.poll && room.poll.blind === true):
//   - for a teacher: always include real vote.
//   - for a student: include vote only for themselves (viewerUsername);
//     for other students mask vote as null.
// When no blind poll is open, vote is always included (toWireMember is sufficient).
function toWireMemberForRole(member, viewerRole, viewerUsername, blindPollOpen) {
  if (!blindPollOpen || viewerRole === 'teacher') {
    return toWireMember(member);
  }
  // blind poll, student viewer
  return {
    username: member.username,
    role:     member.role,
    status:   member.status,
    online:   member.online,
    hue:      member.hue,
    vote:     (member.username === viewerUsername) ? member.vote : null,
    pos:      member.pos || null
  };
}

// Build the full classroom_state payload for a section.
// forRole: 'teacher' or 'student'. forUsername: the viewer's username.
// gate reflects the room's real gate state (null or an armed gate object).
// poll carries the live poll descriptor (null when idle).
// Member votes are role-gated per Section 1.4.
function buildStatePayload(room, forRole, forUsername) {
  var blindPollOpen = !!(room.poll && room.poll.blind);
  var members = [];
  room.members.forEach(function(member) {
    members.push(toWireMemberForRole(member, forRole, forUsername, blindPollOpen));
  });
  return {
    type:    'classroom_state',
    section: room.section,
    gate:    room.gate,
    poll:    room.poll || null,
    live:    !!room.live,
    // v3 P4 Codex BLOCKER fold: include doorways in the snapshot so
    // late-joiners + cockpit refreshes see the active data mode.
    doorways: room.doorways || null,
    members: members
  };
}

// buildRoleAwareMemberUpdateBroadcasts(room, section, member)
//
// Shared helper for classroom_member_update broadcasts (Finding 2).
// When a blind poll is open, we must split recipients so students never
// see another student's real vote -- this applies to join, detach,
// heartbeat, and sweep, not just castVote.
//
// Returns [] or a 1-2 element broadcasts array ready to dispatch.
function buildRoleAwareMemberUpdateBroadcasts(room, section, member, excludeWs) {
  var blindPollOpen = !!(room.poll && room.poll.blind);

  if (!blindPollOpen) {
    // No blind poll -- send full member to everyone (existing behaviour).
    var sockets = roomSockets(room, excludeWs);
    if (sockets.length === 0) return [];
    return [{
      sockets: sockets,
      payload: {
        type:    'classroom_member_update',
        section: section,
        member:  toWireMember(member)
      }
    }];
  }

  // Blind poll open -- split into student and teacher buckets.
  var studentSockets = [];
  var teacherSockets = [];
  room.members.forEach(function(m) {
    m.sockets.forEach(function(sock) {
      if (sock === excludeWs) return;
      if (m.role === 'teacher') {
        teacherSockets.push(sock);
      } else {
        studentSockets.push(sock);
      }
    });
  });

  var broadcasts = [];

  if (studentSockets.length > 0) {
    // Students: mask vote for ALL members (no student can infer another's vote).
    var studentShape = {
      username: member.username,
      role:     member.role,
      status:   member.status,
      online:   member.online,
      hue:      member.hue,
      vote:     null,
      pos:      member.pos || null
    };
    broadcasts.push({
      sockets: studentSockets,
      payload: {
        type:    'classroom_member_update',
        section: section,
        member:  studentShape
      }
    });
  }

  if (teacherSockets.length > 0) {
    // Teacher: full vote always visible.
    broadcasts.push({
      sockets: teacherSockets,
      payload: {
        type:    'classroom_member_update',
        section: section,
        member:  toWireMember(member)
      }
    });
  }

  return broadcasts;
}

// Collect all open sockets for a room (excluding a specific ws if given).
function roomSockets(room, excludeWs) {
  var sockets = [];
  room.members.forEach(function(member) {
    member.sockets.forEach(function(ws) {
      if (ws !== excludeWs) {
        sockets.push(ws);
      }
    });
  });
  return sockets;
}

// All open sockets in the room including the joiner.
function allRoomSockets(room) {
  return roomSockets(room, null);
}

// createClassroomRegistry -- factory for the registry singleton.
// Returns an object with: join, detach, heartbeat, sweep, stateFor.
export function createClassroomRegistry() {
  // section -> ClassroomRoom
  var classrooms = new Map();

  // ws -> { section, username }
  var wsIndex = new Map();

  // Ensure a room exists for section and return it.
  function getOrCreateRoom(section) {
    if (!classrooms.has(section)) {
      classrooms.set(section, {
        section: section,
        gate:    null,       // { armed, theme, openedAt } | null
        poll:    null,       // { id, question, options, blind, openedAt } | null
        live:    false,      // v3 P1+P2: durable Live flag (NOT cleared by armGate/greenLight/reset)
        doorways: null,   // v3 P4: { id, question, options: [{label, doorId, count}], openedAt } | null
        members: new Map()   // username -> Member
      });
    }
    return classrooms.get(section);
  }

  // Set of teacher sockets in "monitor" mode -- they receive every
  // broadcast from every room without joining any specific room.
  var monitorSockets = new Set();

  // subscribeMonitor(ws) -> { sends }
  // Add ws to monitorSockets and send back a classroom_state_all snapshot.
  // No room state mutation; idempotent.
  function subscribeMonitor(ws) {
    monitorSockets.add(ws);
    return { sends: [{ ws: ws, payload: buildAllSectionsStatePayload() }] };
  }

  // unsubscribeMonitor(ws) -> void
  // Remove ws from monitorSockets. Idempotent.
  function unsubscribeMonitor(ws) {
    monitorSockets.delete(ws);
  }

  // buildAllSectionsStatePayload() -> { type, sections: [...] }
  // Returns a snapshot of every room's state, role-aware for teachers
  // (monitor is teacher-only -- buildStatePayload's blind-poll mask
  // does not apply since the viewer is always a teacher).
  function buildAllSectionsStatePayload() {
    var sections = [];
    classrooms.forEach(function(room, section) {
      var members = [];
      room.members.forEach(function(member) {
        // Monitor viewer is always teacher -- no blind-poll mask needed.
        members.push(toWireMember(member));
      });
      sections.push({
        section:  section,
        gate:     room.gate,
        poll:     room.poll || null,
        live:     !!room.live,
        // v3 P4 Codex BLOCKER fold: include doorways so the cockpit's
        // global presence view can hydrate the active data mode.
        doorways: room.doorways || null,
        members:  members
      });
    });
    return { type: 'classroom_state_all', sections: sections };
  }

  // setLive(section, live, now) -> { broadcasts }
  // Set the room's live state. Returns a classroom_live_state broadcast
  // that fans out to the room's sockets AND every monitor socket via the
  // shared _fanoutToMonitors helper (avoids the duplicate-broadcast bug
  // where a ws that is BOTH a room socket and a monitor socket would
  // otherwise receive the message twice).
  // If the section's room does not exist, returns empty broadcasts (no-op).
  function setLive(section, live, now) {
    if (!classrooms.has(section)) {
      return { broadcasts: [] };
    }
    var room = classrooms.get(section);
    var liveBool = !!live;
    if (room.live === liveBool) {
      return { broadcasts: [] };  // no-op on identity transition
    }
    room.live = liveBool;
    var payload = { type: 'classroom_live_state', section: section, live: liveBool };
    var sockets = roomSockets(room, null);
    if (sockets.length === 0 && monitorSockets.size === 0) {
      return { broadcasts: [] };
    }
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // Inject monitor sockets into every broadcast target list. Call AFTER
  // building the room-scoped broadcasts; mutates each broadcast's
  // sockets list in place.
  function _fanoutToMonitors(broadcasts) {
    if (monitorSockets.size === 0 || !broadcasts || broadcasts.length === 0) {
      return broadcasts;
    }
    broadcasts.forEach(function(bc) {
      monitorSockets.forEach(function(mws) {
        if (!bc.sockets.includes(mws)) {
          bc.sockets.push(mws);
        }
      });
    });
    return broadcasts;
  }

  // join(ws, section, username, role, now, hue)
  //
  // Add the socket to the room. Create the member if first join; re-attach
  // if the member already exists (reconnect after drop).
  //
  // hue -- integer 0-359 or null. Durable: not cleared by armGate or reset.
  //        A re-join overwrites hue (last value wins).
  //
  // Returns:
  //   { sends, broadcasts }
  //   sends      -- [{ ws, payload }]  -- reply classroom_state to this socket
  //   broadcasts -- [{ sockets, payload }]  -- classroom_member_update to rest
  function join(ws, section, username, role, now, hue) {
    var currentNow = now == null ? Date.now() : now;
    // Normalise hue: must be an integer in 0-359 or null.
    var safeHue = (typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 359)
      ? hue
      : null;

    // If this socket is already bound to a member (a re-join on the same
    // connection, possibly to a different section/username), unbind it
    // from the prior member first so no stale socket reference leaks.
    var priorEntry = wsIndex.get(ws);
    if (priorEntry) {
      var priorRoom = classrooms.get(priorEntry.section);
      if (priorRoom) {
        var priorMember = priorRoom.members.get(priorEntry.username);
        if (priorMember) {
          priorMember.sockets.delete(ws);
          if (priorMember.sockets.size === 0) {
            priorMember.online = false;
            priorMember.lastSeen = currentNow;
          }
        }
      }
      wsIndex.delete(ws);
    }

    var room = getOrCreateRoom(section);

    var isNewMember = !room.members.has(username);
    var member;

    if (isNewMember) {
      member = {
        username: username,
        role:     role,
        status:   'present',  // durable decision; cleared only by armGate or reset
        hue:      safeHue,    // durable; NOT cleared by armGate or reset
        vote:     null,       // option index or null; reset by openPoll and reset
        pos:      null,       // last-known {x,y,state,vx} from classroom_pos (Phase 2)
        online:   true,
        lastSeen: currentNow,
        sockets:  new Set([ws])
      };
      room.members.set(username, member);
    } else {
      member = room.members.get(username);
      member.sockets.add(ws);
      var wasOnline = member.online;
      member.online  = true;
      member.lastSeen = currentNow;
      // Re-join always overwrites hue (last value wins).
      member.hue = safeHue;

      // If the member was offline and is now back, we need to broadcast the
      // online-flip below (treated the same as a new member broadcast).
      if (!wasOnline) {
        isNewMember = true; // reuse the broadcast path
      }
    }

    wsIndex.set(ws, { section: section, username: username });

    // Reply to this socket with the full state (role-aware for blind polls).
    var statePayload = buildStatePayload(room, role, username);
    var sends = [{ ws: ws, payload: statePayload }];

    // Broadcast the member update to everyone else in the room.
    // Use the role-aware helper so blind-poll secrecy is preserved on
    // join / reconnect (Finding 2 fix).
    var broadcasts = [];
    if (isNewMember) {
      var joinBroadcasts = buildRoleAwareMemberUpdateBroadcasts(room, section, member, ws);
      broadcasts = joinBroadcasts;
    }

    _fanoutToMonitors(broadcasts);
    return { sends: sends, broadcasts: broadcasts };
  }

  // detach(ws, now)
  //
  // Remove this socket from its member's socket set.
  // If the member loses its last socket, flip online:false.
  //
  // Returns:
  //   { lostLastSocket: bool, section, username, broadcasts }
  //   broadcasts -- [{ sockets, payload }] -- classroom_member_update if
  //                 the member just went offline.
  function detach(ws, now) {
    // v3 P1+P2: remove from monitorSockets BEFORE building broadcasts so a
    // detached monitor ws does not receive the broadcast it just generated.
    monitorSockets.delete(ws);
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) {
      return { lostLastSocket: false, section: null, username: null, broadcasts: [] };
    }

    var section  = entry.section;
    var username = entry.username;
    wsIndex.delete(ws);

    var room = classrooms.get(section);
    if (!room) {
      return { lostLastSocket: false, section: section, username: username, broadcasts: [] };
    }

    var member = room.members.get(username);
    if (!member) {
      return { lostLastSocket: false, section: section, username: username, broadcasts: [] };
    }

    member.sockets.delete(ws);

    if (member.sockets.size > 0) {
      // Still has open sockets -- stays online.
      return { lostLastSocket: false, section: section, username: username, broadcasts: [] };
    }

    // No sockets left -- flip offline but do NOT remove.
    member.online   = false;
    member.lastSeen = currentNow;

    // Use the role-aware helper so blind-poll secrecy is preserved on
    // detach / offline-flip (Finding 2 fix).
    var detachBroadcasts = buildRoleAwareMemberUpdateBroadcasts(room, section, member, null);

    _fanoutToMonitors(detachBroadcasts);
    return {
      lostLastSocket: true,
      section:  section,
      username: username,
      broadcasts: detachBroadcasts
    };
  }

  // heartbeat(ws, now)
  //
  // Refresh the member's lastSeen. If the member had been flipped
  // offline (by a sweep, while this socket stayed open), a fresh
  // heartbeat revives it: flip online:true and broadcast the update.
  //
  // Returns:
  //   { section, broadcasts }
  //   broadcasts -- [{ sockets, payload }] -- classroom_member_update if revived
  function heartbeat(ws, now) {
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) return { section: null, broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { section: null, broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { section: null, broadcasts: [] };

    member.lastSeen = currentNow;

    var broadcasts = [];
    if (!member.online) {
      member.online = true;
      // Use the role-aware helper so blind-poll secrecy is preserved on
      // heartbeat-driven online revival (Finding 2 fix).
      broadcasts = buildRoleAwareMemberUpdateBroadcasts(room, entry.section, member, null);
    }

    _fanoutToMonitors(broadcasts);
    return { section: entry.section, broadcasts: broadcasts };
  }

  // sweep(now)
  //
  // Time-driven scan. Two things happen:
  //   1. Members that are online but whose heartbeat has lapsed past
  //      LIVENESS_MS get flipped offline.
  //   2. Members that have been offline for more than IDLE_GC_MS are
  //      removed.
  // Empty rooms are deleted.
  //
  // Returns:
  //   { onlineFlips, removals }
  //   onlineFlips -- [{ sockets, payload }]  -- classroom_member_update (online:false)
  //   removals    -- [{ sockets, payload }]  -- classroom_member_left
  function sweep(now) {
    var currentNow = now == null ? Date.now() : now;
    var onlineFlips = [];
    var removals    = [];

    classrooms.forEach(function(room, section) {
      var toRemove = [];

      room.members.forEach(function(member, username) {
        var age = currentNow - member.lastSeen;

        // Flip online:false if heartbeat lapsed but no sockets closed it
        // (i.e. the socket is still open but no heartbeat arrived).
        if (member.online && age > LIVENESS_MS) {
          member.online = false;
          // Use the role-aware helper so blind-poll secrecy is preserved on
          // sweep-driven offline-flip (Finding 2 fix).
          var sweepBroadcasts = buildRoleAwareMemberUpdateBroadcasts(room, section, member, null);
          sweepBroadcasts.forEach(function(bc) { onlineFlips.push(bc); });
        }

        // GC: remove members that have been offline for longer than
        // IDLE_GC_MS. Do NOT also require zero sockets -- a member whose
        // heartbeat lapsed but whose (zombie) socket never closed is
        // still offline and must be reclaimed, or rooms leak forever.
        if (!member.online && age > IDLE_GC_MS) {
          toRemove.push(username);
        }
      });

      // Process removals for this room.
      toRemove.forEach(function(username) {
        var goneMember = room.members.get(username);
        if (goneMember) {
          // Drop any lingering socket->member index entries so a later
          // close/heartbeat on a zombie socket is a clean no-op.
          goneMember.sockets.forEach(function(sock) { wsIndex.delete(sock); });
        }
        room.members.delete(username);
        // Always record the removal. The recipient socket list may be
        // empty (the room is now empty, or had no other members) -- the
        // server's broadcast is then a harmless no-op -- but the
        // removal itself still happened and callers must see it.
        removals.push({
          sockets: allRoomSockets(room),
          payload: {
            type:     'classroom_member_left',
            section:  section,
            username: username
          }
        });
      });

      // Delete empty rooms.
      if (room.members.size === 0) {
        classrooms.delete(section);
      }
    });

    _fanoutToMonitors(onlineFlips);
    _fanoutToMonitors(removals);
    return { onlineFlips: onlineFlips, removals: removals };
  }

  // stateFor(section, forRole, forUsername)
  //
  // Return the snapshot payload for a section, or null if the room
  // does not exist. forRole and forUsername are used for role-aware masking
  // when a blind poll is open; both are optional (default: teacher view).
  function stateFor(section, forRole, forUsername) {
    var room = classrooms.get(section);
    if (!room) return null;
    return buildStatePayload(room, forRole || 'teacher', forUsername || null);
  }

  // -------------------------------------------------------------------------
  // v1b Gate methods
  // -------------------------------------------------------------------------

  // armGate(ws, theme, now)
  //
  // TEACHER only. Arms the gate for the sender's room:
  //   - Sets room.gate = { armed:true, theme, openedAt: now }.
  //   - Resets every member's status back to "present" (fresh ritual).
  //   - Returns a classroom_gate broadcast to all room sockets.
  //
  // Returns { broadcasts } -- empty if role check fails or room not found.
  function armGate(ws, theme, now) {
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Mode-exclusivity guard: reject if a poll is open (Section 1.5).
    if (room.poll !== null) return { broadcasts: [] };
    // v3 P4 Codex MAJOR 3 fold: armGate is mutually exclusive with
    // an active doorways data mode.
    if (room.doorways) return { broadcasts: [] };

    // Arm the gate and reset all member statuses.
    room.gate = { armed: true, theme: theme || '', openedAt: currentNow };
    room.members.forEach(function(m) { m.status = 'present'; });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_gate',
          section: entry.section,
          gate:    { armed: room.gate.armed, theme: room.gate.theme }
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // checkin(ws, now)
  //
  // STUDENT. If an armed gate is present, set the sender's status to
  // "checkedIn" and broadcast a classroom_member_update.
  // Ignored (no broadcast) if there is no armed gate.
  //
  // Returns { broadcasts }.
  function checkin(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    // Ignore if no gate is armed.
    if (!room.gate || !room.gate.armed) return { broadcasts: [] };
    // v3 P4 Codex MAJOR 3 fold: silently drop checkins while doorways
    // are open -- the gate ritual is suspended during a data mode.
    if (room.doorways) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    member.status = 'checkedIn';

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_member_update',
          section: entry.section,
          member:  toWireMember(member)
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // greenLight(ws, now, startVideo, videoRef)
  //
  // TEACHER only. Broadcasts classroom_greenlight to the whole room.
  //
  // startVideo -- coerced to strict boolean (startVideo === true).
  // videoRef   -- coerced to string-or-null (typeof videoRef === 'string' ? videoRef : null).
  // Both fields ride only on the live broadcast; NOT stored in room state.
  //
  // Returns { broadcasts }.
  function greenLight(ws, now, startVideo, videoRef) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Coerce types.
    var safeStartVideo = startVideo === true;
    var safeVideoRef   = typeof videoRef === 'string' ? videoRef : null;

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:       'classroom_greenlight',
          section:    entry.section,
          startVideo: safeStartVideo,
          videoRef:   safeVideoRef
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // reset(ws, now)
  //
  // TEACHER only. Clears the gate and resets every member status to "present".
  // Broadcasts a full classroom_state.
  //
  // Returns { broadcasts }.
  function reset(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    room.gate     = null;
    room.poll     = null;
    // v3 P4 Codex BLOCKER fold: reset also clears doorways + each
    // member's doorVote. Otherwise the server stayed in the doorway
    // session while clients saw "idle".
    room.doorways = null;
    room.members.forEach(function(m) {
      m.status   = 'present';
      m.vote     = null;
      m.doorVote = null;
    });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: buildStatePayload(room)
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // -------------------------------------------------------------------------
  // v2 Poll methods
  // -------------------------------------------------------------------------

  // openPoll(ws, question, options, blind, now)
  //
  // TEACHER only. Opens a poll:
  //   - options must have length 2-8.
  //   - Rejected if a gate is armed (mode exclusivity, Section 1.5).
  //   - Resets every member vote=null, status="present".
  //   - Broadcasts classroom_poll to all room sockets.
  //
  // Returns { broadcasts }.
  function openPoll(ws, question, options, blind, now) {
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    if (room.doorways) return { broadcasts: [] };  // mutual exclusion vs P4

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // options must be an array with 2-8 entries.
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
      return { broadcasts: [] };
    }

    // Mode-exclusivity guard: reject if a gate is armed.
    if (room.gate !== null) return { broadcasts: [] };

    // Assign a poll id.
    var pollId = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : String(currentNow) + '-' + Math.random().toString(36).slice(2);

    room.poll = {
      id:       pollId,
      question: String(question || ''),
      options:  options.map(String),
      blind:    blind === true,
      openedAt: currentNow
    };

    // Reset every member vote and status.
    room.members.forEach(function(m) {
      m.vote   = null;
      m.status = 'present';
    });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:     'classroom_poll',
          section:  entry.section,
          id:       room.poll.id,
          question: room.poll.question,
          options:  room.poll.options,
          blind:    room.poll.blind
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // castVote(ws, choice, now)
  //
  // STUDENT. Records the sender's vote:
  //   - Ignored if no poll is open.
  //   - Ignored if choice is not an integer in [0, options.length).
  //   - Sets sender vote=choice, status="voted".
  //   - Broadcasts a role-aware classroom_member_update per Section 1.4.
  //
  // Returns { broadcasts }.
  function castVote(ws, choice, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    // Ignore if no poll is open.
    if (!room.poll) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Validate choice: must be an integer in [0, options.length).
    if (typeof choice !== 'number' || !Number.isInteger(choice) ||
        choice < 0 || choice >= room.poll.options.length) {
      return { broadcasts: [] };
    }

    member.vote   = choice;
    member.status = 'voted';

    // Build role-aware broadcasts per Section 1.4.
    var blindPollOpen = room.poll.blind;
    var broadcasts    = [];

    if (blindPollOpen) {
      // Split sockets into student and teacher buckets.
      var studentSockets = [];
      var teacherSockets = [];
      room.members.forEach(function(m) {
        m.sockets.forEach(function(sock) {
          if (m.role === 'teacher') {
            teacherSockets.push(sock);
          } else {
            studentSockets.push(sock);
          }
        });
      });

      // Student payload: vote is always masked (null) in a blind poll.
      // A student can only see their OWN vote in classroom_state, not in
      // member_update payloads where another student's socket is the viewer.
      // The voter's client already knows their own choice (they sent it).
      if (studentSockets.length > 0) {
        var studentMemberShape = {
          username: member.username,
          role:     member.role,
          status:   member.status,
          online:   member.online,
          hue:      member.hue,
          vote:     null,
          pos:      member.pos || null
        };
        broadcasts.push({
          sockets: studentSockets,
          payload: {
            type:    'classroom_member_update',
            section: entry.section,
            member:  studentMemberShape
          }
        });
      }

      // Teacher payload: full vote visible.
      if (teacherSockets.length > 0) {
        broadcasts.push({
          sockets: teacherSockets,
          payload: {
            type:    'classroom_member_update',
            section: entry.section,
            member:  toWireMember(member)
          }
        });
      }
    } else {
      // Non-blind poll: vote visible to all.
      var sockets = allRoomSockets(room);
      if (sockets.length > 0) {
        broadcasts.push({
          sockets: sockets,
          payload: {
            type:    'classroom_member_update',
            section: entry.section,
            member:  toWireMember(member)
          }
        });
      }
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // closePoll(ws, now)
  //
  // TEACHER only. Closes the active poll:
  //   - Computes the final tally (count per option index).
  //   - Clears room.poll.
  //   - Broadcasts classroom_poll_closed to all room sockets.
  //
  // Returns { broadcasts }.
  function closePoll(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Nothing to close.
    if (!room.poll) return { broadcasts: [] };

    var pollId      = room.poll.id;
    var optionCount = room.poll.options.length;

    // Tally votes.
    var tally = [];
    var i;
    for (i = 0; i < optionCount; i++) { tally.push(0); }
    room.members.forEach(function(m) {
      if (typeof m.vote === 'number' && m.vote >= 0 && m.vote < optionCount) {
        tally[m.vote]++;
      }
    });

    // Clear the poll.
    room.poll = null;

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_poll_closed',
          section: entry.section,
          id:      pollId,
          tally:   tally
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // revealPoll(ws, now)
  //
  // TEACHER only. Reveals blind poll results to ALL sockets:
  //   - Broadcasts classroom_poll_reveal with full tally + per-member votes.
  //   - Does NOT clear room.poll (poll remains open for closePoll).
  //   - If no poll is open, returns empty broadcasts.
  //
  // Returns { broadcasts }.
  function revealPoll(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Nothing to reveal.
    if (!room.poll) return { broadcasts: [] };

    // Reveal is blind-only (Section 1.4 / Finding 4).
    if (!room.poll.blind) return { broadcasts: [] };

    var pollId      = room.poll.id;
    var optionCount = room.poll.options.length;

    // Tally votes.
    var tally = [];
    var i;
    for (i = 0; i < optionCount; i++) { tally.push(0); }
    room.members.forEach(function(m) {
      if (typeof m.vote === 'number' && m.vote >= 0 && m.vote < optionCount) {
        tally[m.vote]++;
      }
    });

    // Build per-member list (username + vote), unmasked.
    var memberList = [];
    room.members.forEach(function(m) {
      memberList.push({ username: m.username, vote: m.vote });
    });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_poll_reveal',
          section: entry.section,
          id:      pollId,
          tally:   tally,
          members: memberList
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // openDoorways(ws, id, question, options, now) -> { broadcasts }
  // Teacher-only. Rejects if a poll is open (mutual exclusion).
  // Initializes per-option count to 0; broadcasts to the room.
  function openDoorways(ws, id, question, options, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    if (room.poll) return { broadcasts: [] };  // mutual exclusion vs v2 poll
    // v3 P4 Codex MAJOR 2 fold: reject if doorways are ALREADY open
    // (a second open would overwrite without clearing prior doorVotes).
    if (room.doorways) return { broadcasts: [] };
    // v3 P4 Codex MAJOR 3 fold: mutual exclusion with the v1b gate.
    if (room.gate && room.gate.armed) return { broadcasts: [] };
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) return { broadcasts: [] };
    var safeId       = (typeof id === 'string' && id.trim()) ? id.trim() : ('doorways-' + (now || Date.now()));
    var safeQuestion = (typeof question === 'string') ? question.trim() : '';
    var optionsState = [];
    for (var i = 0; i < options.length; i++) {
      var o = options[i] || {};
      optionsState.push({
        label:  (typeof o.label === 'string') ? o.label.trim() : ('Option ' + String.fromCharCode(65 + i)),
        doorId: (typeof o.doorId === 'string' && o.doorId.trim()) ? o.doorId.trim() : ('d' + i),
        count:  0
      });
    }
    room.doorways = {
      id:       safeId,
      question: safeQuestion,
      options:  optionsState,
      openedAt: now == null ? Date.now() : now
    };
    // Reset each member's status to "present" + clear stale doorVote
    // (Codex MAJOR 2 defense-in-depth -- even if a future code path
    // reuses room.doorways, votes start from a clean slate).
    room.members.forEach(function(m) { m.status = 'present'; m.doorVote = null; });
    var payload = {
      type:     'classroom_open_doorways',
      section:  entry.section,
      id:       safeId,
      question: safeQuestion,
      options:  optionsState.map(function(o) { return { label: o.label, doorId: o.doorId }; }),
      openedAt: room.doorways.openedAt
    };
    var sockets = roomSockets(room, null);
    if (sockets.length === 0 && monitorSockets.size === 0) {
      return { broadcasts: [] };
    }
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // castDoorwayVote(ws, id, doorId, now) -> { broadcasts }
  // Student-only. Idempotent on a re-vote (the same student switching
  // doors moves their vote; one vote per student). Broadcasts the live
  // tally to the room + monitors.
  function castDoorwayVote(ws, id, doorId, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.doorways) return { broadcasts: [] };
    if (room.doorways.id !== id) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'student') return { broadcasts: [] };
    var safeDoorId = (typeof doorId === 'string') ? doorId.trim() : '';
    // Find the option for the new vote. Bail if doorId unknown.
    var found = null;
    for (var i = 0; i < room.doorways.options.length; i++) {
      if (room.doorways.options[i].doorId === safeDoorId) { found = room.doorways.options[i]; break; }
    }
    if (!found) return { broadcasts: [] };
    // If switching, decrement the prior doorId's count.
    var priorDoorId = member.doorVote || null;
    if (priorDoorId && priorDoorId !== safeDoorId) {
      for (var j = 0; j < room.doorways.options.length; j++) {
        if (room.doorways.options[j].doorId === priorDoorId) {
          room.doorways.options[j].count = Math.max(0, room.doorways.options[j].count - 1);
        }
      }
    }
    // No-op if voting for the same door again.
    if (priorDoorId !== safeDoorId) {
      found.count += 1;
      member.doorVote = safeDoorId;
      member.status   = 'voted';
    }
    var payload = {
      type:    'classroom_doorway_tally',
      section: entry.section,
      id:      room.doorways.id,
      tally:   room.doorways.options.map(function(o) { return { doorId: o.doorId, count: o.count }; })
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // closeDoorways(ws, id, now) -> { broadcasts }
  // Teacher-only. Emits the final tally then clears room.doorways.
  // Each member's doorVote is cleared.
  function closeDoorways(ws, id, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.doorways) return { broadcasts: [] };
    if (room.doorways.id !== id) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    var finalTally = room.doorways.options.map(function(o) { return { doorId: o.doorId, count: o.count }; });
    var closedId = room.doorways.id;
    var closedQuestion = room.doorways.question;
    var closedOptions = room.doorways.options.map(function(o) { return { label: o.label, doorId: o.doorId }; });
    room.doorways = null;
    room.members.forEach(function(m) {
      if (m.doorVote != null) { m.doorVote = null; }
      m.status = 'present';
    });
    var payload = {
      type:     'classroom_close_doorways',
      section:  entry.section,
      id:       closedId,
      question: closedQuestion,
      options:  closedOptions,
      tally:    finalTally
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // -------------------------------------------------------------------------
  // KEYBOARD_AVATAR Phase 2 -- position broadcast
  // -------------------------------------------------------------------------

  // position(ws, x, y, state, vx, now)
  //
  // Cross-client position sync (KEYBOARD_AVATAR_SPEC.md Phase 2).
  // Records last-known {x, y, state, vx} on the member (for late-joiner
  // classroom_state snapshots) and forwards the position broadcast to all
  // OTHER sockets in the room. The sender does not receive an echo --
  // their PlayerSprite already owns the local position.
  //
  // Ignored (empty broadcasts) if the socket is not bound to a member,
  // the room is missing, or the values are not finite numbers.
  //
  // Returns { broadcasts }.
  function position(ws, x, y, state, vx, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    var safeX = (typeof x === 'number' && isFinite(x)) ? x : null;
    var safeY = (typeof y === 'number' && isFinite(y)) ? y : null;
    if (safeX === null || safeY === null) return { broadcasts: [] };

    var safeVx    = (typeof vx === 'number' && isFinite(vx)) ? vx : 0;
    var safeState = (typeof state === 'string') ? state : 'idle';

    // Update last-known position for late-joiner snapshots.
    member.pos = { x: safeX, y: safeY, state: safeState, vx: safeVx };

    // Forward to all OTHER sockets in the room (sender excluded -- they
    // already own the authoritative local position).
    var sockets = roomSockets(room, ws);
    if (sockets.length === 0) return { broadcasts: [] };

    var posBroadcasts = [{
      sockets: sockets,
      payload: {
        type:     'classroom_pos',
        section:  entry.section,
        username: entry.username,
        x:        safeX,
        y:        safeY,
        state:    safeState,
        vx:       safeVx
      }
    }];
    _fanoutToMonitors(posBroadcasts);
    return { broadcasts: posBroadcasts };
  }

  // findSocketByUsername(section, username) -> [ws, ws, ...]
  // Returns the open WS sockets bound to (section, username), or an
  // empty array if the user is not in the section or has no sockets.
  // Used by the rtc_* relay to target a specific peer in the same room.
  function findSocketByUsername(section, username) {
    if (!classrooms.has(section)) { return []; }
    var room = classrooms.get(section);
    var member = room.members.get(username);
    if (!member) { return []; }
    var sockets = [];
    member.sockets.forEach(function(s) {
      if (s.readyState === 1) { sockets.push(s); }
    });
    return sockets;
  }

  // _wsEntry(ws) -> { section, username } | null
  // Internal-but-exported lookup for the section/username bound to a ws.
  // Used by server.js to route the rtc_* signaling without re-parsing
  // any classroom_join payload.
  function _wsEntry(ws) {
    return wsIndex.get(ws) || null;
  }

  return {
    join:       join,
    detach:     detach,
    heartbeat:  heartbeat,
    sweep:      sweep,
    stateFor:   stateFor,
    armGate:    armGate,
    checkin:    checkin,
    greenLight: greenLight,
    reset:      reset,
    openPoll:   openPoll,
    castVote:   castVote,
    closePoll:  closePoll,
    revealPoll: revealPoll,
    openDoorways:    openDoorways,
    castDoorwayVote: castDoorwayVote,
    closeDoorways:   closeDoorways,
    position:   position,
    // v3 P1+P2 additions:
    subscribeMonitor:    subscribeMonitor,
    unsubscribeMonitor:  unsubscribeMonitor,
    setLive:             setLive,
    getAllSectionsState: buildAllSectionsStatePayload,
    // v3 P3 additions:
    findSocketByUsername: findSocketByUsername,
    _wsEntry:             _wsEntry
  };
}
