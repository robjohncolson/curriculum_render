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
// status reflects the member's real status ("present" or "checkedIn").
function toWireMember(member) {
  return {
    username: member.username,
    role:     member.role,
    status:   member.status,
    online:   member.online
  };
}

// Build the full classroom_state payload for a section.
// gate reflects the room's real gate state (null or an armed gate object).
function buildStatePayload(room) {
  var members = [];
  room.members.forEach(function(member) {
    members.push(toWireMember(member));
  });
  return {
    type:    'classroom_state',
    section: room.section,
    gate:    room.gate,
    poll:    null,
    members: members
  };
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
        members: new Map()   // username -> Member
      });
    }
    return classrooms.get(section);
  }

  // join(ws, section, username, role, now)
  //
  // Add the socket to the room. Create the member if first join; re-attach
  // if the member already exists (reconnect after drop).
  //
  // Returns:
  //   { sends, broadcasts }
  //   sends      -- [{ ws, payload }]  -- reply classroom_state to this socket
  //   broadcasts -- [{ sockets, payload }]  -- classroom_member_update to rest
  function join(ws, section, username, role, now) {
    var currentNow = now == null ? Date.now() : now;

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

      // If the member was offline and is now back, we need to broadcast the
      // online-flip below (treated the same as a new member broadcast).
      if (!wasOnline) {
        isNewMember = true; // reuse the broadcast path
      }
    }

    wsIndex.set(ws, { section: section, username: username });

    // Reply to this socket with the full state.
    var statePayload = buildStatePayload(room);
    var sends = [{ ws: ws, payload: statePayload }];

    // Broadcast the member update to everyone else in the room.
    var broadcasts = [];
    if (isNewMember) {
      var others = roomSockets(room, ws);
      if (others.length > 0) {
        broadcasts.push({
          sockets: others,
          payload: {
            type:    'classroom_member_update',
            section: section,
            member:  toWireMember(member)
          }
        });
      }
    }

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

    var others = roomSockets(room, null);
    var broadcasts = [];
    if (others.length > 0) {
      broadcasts.push({
        sockets: others,
        payload: {
          type:    'classroom_member_update',
          section: section,
          member:  toWireMember(member)
        }
      });
    }

    return {
      lostLastSocket: true,
      section:  section,
      username: username,
      broadcasts: broadcasts
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
      var sockets = roomSockets(room, null);
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
          var sockets = allRoomSockets(room);
          if (sockets.length > 0) {
            onlineFlips.push({
              sockets: sockets,
              payload: {
                type:    'classroom_member_update',
                section: section,
                member:  toWireMember(member)
              }
            });
          }
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

    return { onlineFlips: onlineFlips, removals: removals };
  }

  // stateFor(section)
  //
  // Return the snapshot payload for a section, or null if the room
  // does not exist.
  function stateFor(section) {
    var room = classrooms.get(section);
    if (!room) return null;
    return buildStatePayload(room);
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

    return { broadcasts: broadcasts };
  }

  // greenLight(ws, now)
  //
  // TEACHER only. Broadcasts classroom_greenlight to the whole room.
  //
  // Returns { broadcasts }.
  function greenLight(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_greenlight',
          section: entry.section
        }
      });
    }

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

    room.gate = null;
    room.members.forEach(function(m) { m.status = 'present'; });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: buildStatePayload(room)
      });
    }

    return { broadcasts: broadcasts };
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
    reset:      reset
  };
}
