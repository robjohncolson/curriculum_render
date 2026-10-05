import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkRegistry } from './shared-classroom.mjs';
import { createCampaignService, CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { createCalculatorService } from './calculator-service.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { TEAM_BLOCK, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { ROUTE, SUMMARY } from './calculator-mission.mjs';

test('Period X teacher can move in a B/E campaign without changing the roster, epoch or clear quorum', () => {
  let time = 0;
  const classroom = createClassroomRegistry(), sent = new Map();
  const registry = createParkRegistry(classroom);
  const service = createCampaignService({ registry, now: () => time, send: (ws, packet) => sent.set(ws, packet) });
  const b = {}, e = {}, teacher = {};
  try {
    for (const [ws, section, name, role] of [[b, 'PeriodB', 'bee', 'student'], [e, 'PeriodE', 'eve', 'student'], [teacher, 'PeriodX', 'teacher', 'teacher']]) classroom.join(ws, section, name, role, 0);
    for (const ws of [b, e]) service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL });
    time = 1500; service.tick(); const epoch = sent.get(b).epoch;
    service.handle(teacher, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL });
    assert.equal(sent.get(teacher).epoch, epoch);
    assert.deepEqual(sent.get(teacher).roster, ['bee', 'eve']);
    service.handle(teacher, { type: 'campaign_input', epoch, bits: 2 });
    time += 50; service.tick();
    service.handle(b, { type: 'campaign_resume', epoch, from: 0 });
    assert.ok(sent.get(b).events.some(event => event.inputs[2] === 130));
    const frame = sent.get(b).to;
    for (const ws of [b, e]) service.handle(ws, { type: 'campaign_clear', epoch, frame });
    assert.equal(sent.get(b).type, 'campaign_clear', 'students clear without the teacher entering the goal');
    assert.equal(classroom._wsEntry(teacher).section, 'PeriodX');
  } finally { service.close(); }
});

test('teacher can practice and push alongside a student but cannot enlarge or fail their calculator team', () => {
  let time = 0;
  const classroom = createClassroomRegistry(), lobby = new Map(), states = new Map();
  const student = {}, teacher = {};
  classroom.join(student, 'PeriodB', 'bee', 'student', 0);
  classroom.join(teacher, 'PeriodX', 'teacher', 'teacher', 0);
  const service = createCalculatorService({ registry: createParkRegistry(classroom), now: () => time,
    available: () => [DEFAULT_LEVEL], send(ws, packet) { (packet.type === 'calculator_state' ? states : lobby).set(ws, packet); } });
  const approach = (ws, x, pushing = true, ready = false) => service.handle(ws, { type: 'calculator_lobby',
    protocol: CALCULATOR_PROTOCOL, epoch: lobby.get(ws)?.epoch, pose: { x, y: 676 }, pushing, ready });
  try {
    let x = TEAM_BLOCK.start;
    for (let i = 0; i < 120 && x < TEAM_BLOCK.dock; i++) {
      approach(student, x - 20); approach(teacher, x - 40); time += 100; service.tick(); x = lobby.get(student).blockX;
    }
    assert.deepEqual(lobby.get(student).roster, ['bee']);
    assert.deepEqual(lobby.get(student).pushers, ['bee']);
    approach(student, x - 20, false, true); service.tick();
    service.handle(teacher, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
    assert.equal(states.get(teacher).teamSize, 1);
    const teacherState = states.get(teacher);
    service.handle(teacher, { type: 'calculator_press', epoch: teacherState.epoch, revision: teacherState.revision, key: 'STAT' });
    assert.deepEqual(states.get(teacher).keys, ['STAT']);
    for (const key of [...ROUTE, ...SUMMARY.map(String)]) {
      const state = states.get(student);
      service.handle(student, { type: 'calculator_press', epoch: state.epoch, revision: state.revision, key });
    }
    assert.equal(states.get(student).complete, true);
    time += 15001;
    approach(student, x - 20, false); approach(teacher, x - 40, false); service.tick();
    assert.equal(states.get(student).complete, true);
    assert.equal(states.get(student).failure, null);
    assert.equal(states.get(teacher).timeoutCount, 1);
  } finally { service.close(); }
});
