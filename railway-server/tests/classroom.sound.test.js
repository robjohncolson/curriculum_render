// classroom.sound.test.js
// The teacher's class-sound switch (park music, 2026-10-10): off by default, durable like `live`,
// broadcast as classroom_sound_state, carried on the classroom_state snapshot.

import { describe, it, expect, beforeEach } from 'vitest';
import { createClassroomRegistry } from '../classroom.js';

function makeWs() {
  return { readyState: 1, sent: [], send(msg) { this.sent.push(JSON.parse(msg)); } };
}

function seedRoom(registry, section, studentCount) {
  var teacherWs = makeWs();
  registry.join(teacherWs, section, 'teach', 'teacher', Date.now());
  var students = [];
  for (var i = 0; i < studentCount; i++) {
    var sws = makeWs();
    registry.join(sws, section, 'student' + (i + 1), 'student', Date.now());
    students.push(sws);
  }
  return { teacherWs: teacherWs, students: students };
}

describe('class sound switch', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('defaults to off on the snapshot', () => {
    seedRoom(registry, 'P1', 1);
    expect(registry.stateFor('P1', 'teacher', 'teach').sound).toBe(false);
  });

  it('is a no-op for an unjoined socket, a student socket, or an identity transition', () => {
    expect(registry.setSound(makeWs(), true, 1).broadcasts).toEqual([]);
    var bag = seedRoom(registry, 'P1', 1);
    expect(registry.setSound(bag.students[0], true, 1).broadcasts).toEqual([]);
    expect(registry.stateFor('P1', 'teacher', 'teach').sound).toBe(false);
    expect(registry.setSound(bag.teacherWs, false, 1).broadcasts).toEqual([]);
  });

  it('broadcasts classroom_sound_state to the room and sticks for late joiners', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var res = registry.setSound(bag.teacherWs, true, 1);
    expect(res.broadcasts).toHaveLength(1);
    expect(res.broadcasts[0].payload).toEqual({ type: 'classroom_sound_state', section: 'P1', sound: true });
    expect(res.broadcasts[0].sockets).toContain(bag.students[0]);
    expect(res.broadcasts[0].sockets).toContain(bag.students[1]);
    var late = makeWs();
    var joinRes = registry.join(late, 'P1', 'newbie', 'student', Date.now());
    expect(joinRes.sends[0].payload.sound).toBe(true);
    expect(registry.setSound(bag.teacherWs, false, 2).broadcasts[0].payload.sound).toBe(false);
  });

  it('survives armGate and reset like the live flag', () => {
    var bag = seedRoom(registry, 'P1', 1);
    registry.setSound(bag.teacherWs, true, 1);
    registry.setLive('P1', true, 1);
    registry.armGate(bag.teacherWs, 'theme', 2);
    expect(registry.stateFor('P1', 'teacher', 'teach').sound).toBe(true);
    if (typeof registry.reset === 'function') {
      registry.reset(bag.teacherWs, 3);
      expect(registry.stateFor('P1', 'teacher', 'teach').sound).toBe(true);
    }
  });
});

describe('monitor snapshot', () => {
  it('carries sound per section', () => {
    var registry = createClassroomRegistry();
    var bag = seedRoom(registry, 'P1', 1);
    registry.setSound(bag.teacherWs, true, 1);
    var all = registry.getAllSectionsState();
    expect(all.sections.find(function (s) { return s.section === 'P1'; }).sound).toBe(true);
  });
});
