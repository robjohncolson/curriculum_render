// Teacher decision 2026-10-06: the teacher plays as a full peer (pushes the block, is on the roster,
// earns and holds a key under their own username, enters the campaign like anyone), and Period B and
// Period E share every room, team and key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkRegistry, SHARED_PARK } from './shared-classroom.mjs';
import { createParkService } from './service.mjs';
import { createCampaignService, CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { TEAM_BLOCK, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { earnCampaignKey, recordCalculatorPacket } from './campaign-access-fixture.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(t, keyStore = null) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let clock = 0;
  const advance = ms => { clock += ms; t.mock.timers.tick(ms); };
  const registry = createClassroomRegistry(), packets = new Map();
  const service = createParkService({ registry, now: () => clock, keyStore,
    calculatorOptions: { available: () => [DEFAULT_LEVEL], log: () => {} },
    send(ws, packet) { recordCalculatorPacket(packets, ws, packet); } });
  const join = ws => service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL });
  return { service, registry, packets, advance, join };
}

function recordingStore() {
  const saves = [];
  return { saves, async load() { return { wallets: [], open: [] }; },
    saveWallets(section, wallets) { saves.push({ section, wallets }); return Promise.resolve(); },
    saveSpend() { return Promise.resolve(); } };
}

test('a teacher pushes the team block and lands on the roster', t => {
  const h = harness(t);
  const student = {}, teacher = {};
  try {
    h.registry.join(student, 'PeriodB', 'bee', 'student', 0);
    h.registry.join(teacher, 'PeriodX', 'teach', 'teacher', 0);
    // The teacher alone pushes first: the block moves and the teacher is a pusher.
    for (let i = 0; i < 5; i++) {
      const blockX = h.packets.get(teacher)?.lobby?.blockX ?? TEAM_BLOCK.start;
      h.service.handle(teacher, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
        epoch: h.packets.get(teacher)?.lobby?.epoch, pose: { x: blockX - 20, y: 676 }, pushing: true });
      h.advance(100);
    }
    assert.ok(h.packets.get(teacher).lobby.pushers.includes('teach'), 'the teacher is listed as a pusher');
    assert.ok(h.packets.get(teacher).lobby.blockX > TEAM_BLOCK.start, 'a teacher push moves the block');
    earnCampaignKey(h.service, [student, teacher], h.packets, h.advance);
    assert.deepEqual([...h.packets.get(student).lobby.roster].sort(), ['bee', 'teach']);
    const state = h.packets.get(teacher).state;
    assert.equal(state.teamSize, 2, 'the teacher counts toward the team size');
    assert.equal(state.complete, true, 'the round completes only with the teacher finished too');
    assert.equal(state.members.find(member => member.name === 'teach').teacher, true, 'member shape keeps the teacher flag');
  } finally { h.service.close(); }
});

// Teacher 2026-10-07: keys are a spendable count; the teacher earns and spends like a student.
test('a teacher on the team earns a key under their own username and it is persisted', async t => {
  const store = recordingStore();
  const h = harness(t, store);
  const student = {}, teacher = {}, otherTeacher = {};
  try {
    h.registry.join(student, 'PeriodE', 'eve', 'student', 0);
    h.registry.join(teacher, 'PeriodX', 'teach', 'teacher', 0);
    h.registry.join(otherTeacher, 'PeriodX', 'coteach', 'teacher', 0);
    earnCampaignKey(h.service, [student, teacher], h.packets, h.advance);
    await settle();   // the wallet load resolves; rows are written from the next tick
    h.advance(200);
    await settle();
    assert.deepEqual(h.packets.get(student).lobby.campaignKeys, { eve: 1, teach: 1 });
    assert.equal(store.saves.length, 1);
    assert.equal(store.saves[0].section, SHARED_PARK);
    assert.deepEqual(store.saves[0].wallets.map(row => [row.username, row.keys]).sort(), [['eve', 1], ['teach', 1]]);
    const open = stage => h.service.handle(otherTeacher, { type: 'campaign_open_stage', stage });
    assert.match(open(1).message, /need a key/, 'holding a key is personal: no "any holder" teacher rule');
    const opened = h.service.handle(teacher, { type: 'campaign_open_stage', stage: 1 });
    assert.equal(opened.type, 'campaign_progress', 'the teacher spends their own key');
    assert.deepEqual(opened.open, [0, 1]);
    assert.deepEqual(opened.keys, { eve: 1 });
  } finally { h.service.close(); }
});

test('a mixed Period B + Period E + teacher roster completes the calculator round together', t => {
  const h = harness(t);
  const b = {}, e = {}, teacher = {};
  try {
    h.registry.join(b, 'PeriodB', 'bee', 'student', 0);
    h.registry.join(e, 'E', 'eve', 'student', 0);
    h.registry.join(teacher, 'PeriodX', 'teach', 'teacher', 0);
    earnCampaignKey(h.service, [b, e, teacher], h.packets, h.advance);
    for (const ws of [b, e, teacher]) {
      assert.deepEqual([...h.packets.get(ws).lobby.roster].sort(), ['bee', 'eve', 'teach']);
      assert.equal(h.packets.get(ws).state.complete, true);
      assert.equal(h.packets.get(ws).state.readyCount, 3);
    }
    for (const ws of [b, e, teacher]) assert.equal(h.join(ws), null, 'all three share one key room');
  } finally { h.service.close(); }
});

test('a teacher in the B/E campaign is an ordinary roster member: their clear is part of the quorum', () => {
  let time = 0;
  const classroom = createClassroomRegistry(), sent = new Map();
  const registry = createParkRegistry(classroom);
  const service = createCampaignService({ registry, now: () => time, send: (ws, packet) => sent.set(ws, packet) });
  const b = {}, e = {}, teacher = {};
  try {
    for (const [ws, section, name, role] of [[b, 'PeriodB', 'bee', 'student'], [e, 'PeriodE', 'eve', 'student'], [teacher, 'PeriodX', 'teach', 'teacher']]) classroom.join(ws, section, name, role, 0);
    for (const ws of [b, e, teacher]) service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL });
    time = 1500; service.tick();
    const { epoch, roster, helpers } = sent.get(b);
    assert.deepEqual(roster, ['bee', 'eve', 'teach']);
    assert.deepEqual(helpers, [], 'the helpers field stays in the packet shape, always empty');
    time += 3000; service.tick();
    const frame = sent.get(b).to;
    for (const ws of [b, e]) service.handle(ws, { type: 'campaign_clear', epoch, frame });
    assert.notEqual(sent.get(b).type, 'campaign_clear', 'the students alone are not the whole team');
    service.handle(teacher, { type: 'campaign_clear', epoch, frame });
    assert.equal(sent.get(b).type, 'campaign_clear', 'the stage clears once the teacher reaches the goal too');
  } finally { service.close(); }
});
