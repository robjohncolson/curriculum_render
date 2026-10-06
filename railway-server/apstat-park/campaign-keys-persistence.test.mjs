import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { createSupabaseKeyStore, CAMPAIGN_KEYS_TABLE } from './campaign-key-store.mjs';
import { SHARED_PARK } from './shared-classroom.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { earnCampaignKey, recordCalculatorPacket } from './campaign-access-fixture.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));

// A park service on a mocked clock, with an optional key store and a captured log.
function harness(t, keyStore) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let clock = 0;
  const advance = ms => { clock += ms; t.mock.timers.tick(ms); };
  const registry = createClassroomRegistry(), packets = new Map(), logged = [];
  const service = createParkService({ registry, now: () => clock, keyStore,
    calculatorOptions: { available: () => [DEFAULT_LEVEL], log: (...args) => logged.push(args.join(' ')) },
    send(ws, packet) { recordCalculatorPacket(packets, ws, packet); } });
  const join = ws => service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL });
  const enter = (ws, section, name) => {
    registry.join(ws, section, name, 'student', clock);
    service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: TEAM_BLOCK.start - 200, y: 676 } });
  };
  return { service, packets, logged, advance, join, enter, registry };
}

function fakeStore({ holders = [], loadError = null, awardError = null } = {}) {
  const calls = { load: [], award: [] };
  return {
    calls,
    async load(section) {
      calls.load.push(section);
      if (loadError) throw loadError;
      return holders;
    },
    award(section, usernames, source) {
      calls.award.push({ section, usernames, source });
      if (awardError) throw awardError;   // a synchronous throw must be caught too
      return Promise.resolve();
    },
  };
}

test('a completed team is recorded once in the key store under the shared park room', async t => {
  const store = fakeStore();
  const h = harness(t, store);
  const a = {}, b = {};
  try {
    h.registry.join(a, 'B', 'a', 'student', 0);
    h.registry.join(b, 'E', 'b', 'student', 0);
    earnCampaignKey(h.service, [a, b], h.packets, h.advance);
    h.advance(500);   // more ticks: the same holders are never written again
    await settle();
    assert.deepEqual(store.calls.award.length, 1);
    assert.equal(store.calls.award[0].section, SHARED_PARK);
    assert.deepEqual(store.calls.award[0].usernames, ['a', 'b']);
    assert.equal(store.calls.award[0].source, 'calculator:' + DEFAULT_LEVEL.id);
    assert.deepEqual(h.packets.get(a).lobby.campaignKeyHolders, ['a', 'b']);
  } finally { h.service.close(); }
});

test('a fresh room loads its holders from the key store; the lobby lists them and they may enter', async t => {
  const store = fakeStore({ holders: ['a', 'zed'] });
  const h = harness(t, store);
  const a = {}, c = {};
  try {
    h.enter(a, 'B', 'a');
    h.registry.join(c, 'E', 'c', 'student', 0);
    await settle();
    assert.deepEqual(store.calls.load, [SHARED_PARK]);
    h.advance(100);
    assert.deepEqual(h.packets.get(a).lobby.campaignKeyHolders, ['a', 'zed']);
    assert.equal(h.join(a), null, 'a stored key opens the campaign after a relay restart');
    assert.equal(h.join(c).type, 'campaign_error', 'no key, no entry');
  } finally { h.service.close(); }
});

test('key store errors are logged and swallowed; the round still awards keys in memory', async t => {
  const store = fakeStore({ loadError: new Error('relation missing'), awardError: new Error('network down') });
  const h = harness(t, store);
  const a = {}, b = {};
  try {
    h.registry.join(a, 'B', 'a', 'student', 0);
    h.registry.join(b, 'E', 'b', 'student', 0);
    earnCampaignKey(h.service, [a, b], h.packets, h.advance);
    h.advance(100);   // keys are written from the next tick
    await settle();
    assert.deepEqual(h.packets.get(a).lobby.campaignKeyHolders, ['a', 'b']);
    assert.equal(h.join(a), null);
    assert.ok(h.logged.some(line => line.includes('load failed') && line.includes('relation missing')), h.logged.join('\n'));
    assert.ok(h.logged.some(line => line.includes('save failed') && line.includes('network down')), h.logged.join('\n'));
  } finally { h.service.close(); }
});

test('a failed write stays unsaved and is retried after the 30 s cooldown, never spammed inside it', async t => {
  let failures = 1;
  const store = fakeStore();
  store.award = (section, usernames, source) => {
    store.calls.award.push({ section, usernames, source });
    if (failures-- > 0) return Promise.reject(new Error('network down'));
    return Promise.resolve();
  };
  const h = harness(t, store);
  const a = {}, b = {};
  try {
    h.registry.join(a, 'B', 'a', 'student', 0);
    h.registry.join(b, 'E', 'b', 'student', 0);
    earnCampaignKey(h.service, [a, b], h.packets, h.advance);
    h.advance(100);   // keys are written from the next tick
    await settle();
    assert.equal(store.calls.award.length, 1, 'the first write was attempted');
    assert.equal(h.logged.filter(line => line.includes('save failed')).length, 1);
    // Inside the cooldown: many ticks, no new write, no new log line.
    for (let i = 0; i < 290; i++) { h.advance(100); await settle(); }
    assert.equal(store.calls.award.length, 1, 'no retry spam within the cooldown');
    assert.equal(h.logged.filter(line => line.includes('save failed')).length, 1);
    // Past the cooldown: the next tick writes the same holders again, and it succeeds.
    for (let i = 0; i < 20; i++) { h.advance(100); await settle(); }
    assert.equal(store.calls.award.length, 2, 'retried once after the cooldown');
    assert.deepEqual(store.calls.award[1].usernames, ['a', 'b']);
    // Persisted now: further ticks (even well past another cooldown) write nothing.
    for (let i = 0; i < 400; i++) h.advance(100);
    await settle();
    assert.equal(store.calls.award.length, 2);
    assert.deepEqual(h.packets.get(a).lobby.campaignKeyHolders, ['a', 'b']);
  } finally { h.service.close(); }
});

test('a later load marks the loaded names as already written', async t => {
  let release;
  const store = fakeStore({ holders: ['a', 'b'] });
  const gate = new Promise(resolve => { release = resolve; });
  store.load = async section => { store.calls.load.push(section); await gate; return ['a', 'b']; };
  store.award = (section, usernames, source) => {
    store.calls.award.push({ section, usernames, source });
    return Promise.reject(new Error('network down'));
  };
  const h = harness(t, store);
  const a = {}, b = {};
  try {
    h.registry.join(a, 'B', 'a', 'student', 0);
    h.registry.join(b, 'E', 'b', 'student', 0);
    earnCampaignKey(h.service, [a, b], h.packets, h.advance);   // earned before the load returns
    h.advance(100);
    await settle();
    assert.equal(store.calls.award.length, 1);
    release();
    await settle();
    for (let i = 0; i < 400; i++) h.advance(100);   // well past the cooldown
    await settle();
    assert.equal(store.calls.award.length, 1, 'names the store already has are never written again');
  } finally { h.service.close(); }
});

test('no key store: keys are memory-only, exactly as before', async t => {
  const h = harness(t, null);
  const a = {}, b = {};
  try {
    h.registry.join(a, 'B', 'a', 'student', 0);
    h.registry.join(b, 'E', 'b', 'student', 0);
    earnCampaignKey(h.service, [a, b], h.packets, h.advance);
    h.advance(100);   // keys are written from the next tick
    await settle();
    assert.deepEqual(h.packets.get(a).lobby.campaignKeyHolders, ['a', 'b']);
    assert.equal(h.join(b), null);
    assert.deepEqual(h.logged, []);
  } finally { h.service.close(); }
});

test('the Supabase store reads and upserts park_campaign_keys and surfaces errors', async () => {
  const seen = [];
  const query = result => ({
    select(columns) { seen.push(['select', columns]); return this; },
    eq(column, value) { seen.push(['eq', column, value]); return Promise.resolve(result); },
    upsert(rows, options) { seen.push(['upsert', rows, options]); return Promise.resolve(result); },
  });
  let result = { data: [{ username: 'a' }, { username: 'b' }], error: null };
  const client = { from(table) { seen.push(['from', table]); return query(result); } };
  const store = createSupabaseKeyStore(client);
  assert.deepEqual(await store.load(SHARED_PARK), ['a', 'b']);
  await store.award(SHARED_PARK, ['a'], 'calculator:x');
  assert.deepEqual(seen, [
    ['from', CAMPAIGN_KEYS_TABLE], ['select', 'username'], ['eq', 'section', SHARED_PARK],
    ['from', CAMPAIGN_KEYS_TABLE],
    ['upsert', [{ section: SHARED_PARK, username: 'a', source: 'calculator:x' }], { onConflict: 'section,username', ignoreDuplicates: true }],
  ]);
  result = { data: null, error: new Error('permission denied') };
  await assert.rejects(store.load(SHARED_PARK), /permission denied/);
  await assert.rejects(store.award(SHARED_PARK, ['a'], 'x'), /permission denied/);
  assert.equal(createSupabaseKeyStore(null), null);
});
