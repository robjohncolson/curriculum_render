// Teacher 2026-10-07: campaign key counts, cleared stages and open stages persist in the relay's
// Supabase (migrations/0005_park_campaign_wallet.sql). Memory is the hot path; the store is the
// truth across restarts; a store failure is logged and retried at most once per 30 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { createSupabaseKeyStore, CAMPAIGN_WALLET_TABLE, CAMPAIGN_OPEN_TABLE, CAMPAIGN_SPEND_FUNCTION } from './campaign-key-store.mjs';
import { SHARED_PARK } from './shared-classroom.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { CAMPAIGN_PROTOCOL, CAMPAIGN_CLEAR_MS } from './campaign-service.mjs';
import { earnCampaignKey, recordCalculatorPacket } from './campaign-access-fixture.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));

// A park service on a mocked clock, with an optional store and a captured log.
function harness(t, store) {
  t.mock.timers.reset();   // a second harness in one test is a relay restart
  t.mock.timers.enable({ apis: ['setInterval'] });
  let clock = 0;
  const advance = ms => { clock += ms; t.mock.timers.tick(ms); };
  const registry = createClassroomRegistry(), packets = new Map(), logged = [], sent = new Map();
  const service = createParkService({ registry, now: () => clock, keyStore: store,
    calculatorOptions: { available: () => [DEFAULT_LEVEL], log: (...args) => logged.push(args.join(' ')) },
    send(ws, packet) { recordCalculatorPacket(packets, ws, packet); sent.set(ws, packet); } });
  const enter = (ws, section, name) => {
    registry.join(ws, section, name, 'student', clock);
    service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: TEAM_BLOCK.start - 200, y: 676 } });
  };
  // Lets the wallet's promises settle, then runs ticks so it writes.
  const flush = async (ticks = 1) => { await settle(); for (let i = 0; i < ticks; i++) { advance(100); await settle(); } };
  return { service, packets, logged, advance, enter, registry, flush, sent };
}

function fakeStore({ wallets = [], open = [], loadError = null, saveError = null } = {}) {
  const calls = { load: [], saveWallets: [], saveSpend: [] };
  return {
    calls,
    async load(section) {
      calls.load.push(section);
      if (loadError) throw loadError;
      return { wallets, open };
    },
    saveWallets(section, rows) {
      calls.saveWallets.push({ section, rows });
      if (saveError) throw saveError;   // a synchronous throw must be caught too
      return Promise.resolve();
    },
    saveSpend(section, spend) {
      calls.saveSpend.push({ section, spend });
      if (saveError) throw saveError;
      return Promise.resolve();
    },
  };
}

function earn(h) {
  const a = {}, b = {};
  h.registry.join(a, 'B', 'a', 'student', 0);
  h.registry.join(b, 'E', 'b', 'student', 0);
  earnCampaignKey(h.service, [a, b], h.packets, h.advance);
  return { a, b };
}

test('a completed team writes absolute key counts once, under the shared park room', async t => {
  const store = fakeStore({ wallets: [{ username: 'a', keys: 2, cleared: [0] }] });
  const h = harness(t, store);
  try {
    h.enter({}, 'B', 'zed');   // creates the room: the load starts
    await h.flush();
    const { a } = earn(h);
    await h.flush(5);   // more ticks: nothing changed, nothing written again
    assert.equal(store.calls.saveWallets.length, 1);
    assert.equal(store.calls.saveWallets[0].section, SHARED_PARK);
    assert.deepEqual(store.calls.saveWallets[0].rows, [
      { username: 'a', keys: 3, cleared: [0] },   // loaded 2 + earned 1
      { username: 'b', keys: 1, cleared: [] },
    ]);
    assert.deepEqual(h.packets.get(a).lobby.campaignKeys, { a: 3, b: 1 });
  } finally { h.service.close(); }
});

test('a fresh room loads counts, clears and open stages; the lobby shows them', async t => {
  const store = fakeStore({ wallets: [{ username: 'a', keys: 2, cleared: [0, 1] }, { username: 'spent', keys: 0, cleared: [0] }],
    open: [{ stage: 1, openedBy: 'a' }] });
  const h = harness(t, store);
  const a = {};
  try {
    h.enter(a, 'B', 'a');
    await h.flush();
    assert.deepEqual(store.calls.load, [SHARED_PARK]);
    const lobby = h.packets.get(a).lobby;
    assert.deepEqual(lobby.campaignKeys, { a: 2 });
    assert.deepEqual(lobby.campaignCleared, { a: [0, 1], spent: [0] });
    assert.deepEqual(lobby.campaignOpen, [0, 1]);
    assert.deepEqual(lobby.campaignKeyHolders, ['a']);
    assert.deepEqual(store.calls.saveWallets, [], 'loading writes nothing');
    const peek = h.service.handle(a, { type: 'campaign_select' });
    assert.deepEqual(peek.startable, [0, 1], 'stored clears and open stages count after a restart');
  } finally { h.service.close(); }
});

test('keys earned before the load returns are added on top of the stored count, never overwrite it', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const store = fakeStore();
  store.load = async section => { store.calls.load.push(section); await gate; return { wallets: [{ username: 'a', keys: 4, cleared: [] }], open: [] }; };
  const h = harness(t, store);
  try {
    earn(h);   // earned while the load is still in flight
    await h.flush(3);
    assert.equal(store.calls.saveWallets.length, 0, 'no absolute write before the load');
    assert.match(h.service.handle(h.packets.keys().next().value, { type: 'campaign_open_stage', stage: 1 }).message, /still loading/);
    release();
    await h.flush();
    assert.deepEqual(store.calls.saveWallets.at(-1).rows.find(row => row.username === 'a').keys, 5);
  } finally { h.service.close(); }
});

test('a failed write stays unsaved and is retried after the 30 s cooldown, never spammed inside it', async t => {
  let failures = 1;
  const store = fakeStore();
  store.saveWallets = (section, rows) => {
    store.calls.saveWallets.push({ section, rows });
    if (failures-- > 0) return Promise.reject(new Error('network down'));
    return Promise.resolve();
  };
  const h = harness(t, store);
  try {
    h.enter({}, 'B', 'zed');
    await h.flush();
    earn(h);
    await h.flush();
    assert.equal(store.calls.saveWallets.length, 1, 'the first write was attempted');
    assert.equal(h.logged.filter(line => line.includes('save failed')).length, 1);
    for (let i = 0; i < 290; i++) { h.advance(100); await settle(); }
    assert.equal(store.calls.saveWallets.length, 1, 'no retry spam within the cooldown');
    assert.equal(h.logged.filter(line => line.includes('save failed')).length, 1);
    for (let i = 0; i < 20; i++) { h.advance(100); await settle(); }
    assert.equal(store.calls.saveWallets.length, 2, 'retried once after the cooldown');
    assert.deepEqual(store.calls.saveWallets[1].rows.map(row => [row.username, row.keys]), [['a', 1], ['b', 1]]);
    for (let i = 0; i < 400; i++) h.advance(100);
    await settle();
    assert.equal(store.calls.saveWallets.length, 2, 'persisted: nothing more to write');
  } finally { h.service.close(); }
});

test('a failed load is logged, keeps the room memory-only, and is retried after 30 s before any write', async t => {
  let fail = true;
  const store = fakeStore({ wallets: [{ username: 'a', keys: 1, cleared: [] }] });
  const load = store.load;
  store.load = async section => { if (fail) { store.calls.load.push(section); throw new Error('relation missing'); } return load(section); };
  const h = harness(t, store);
  try {
    const { a } = earn(h);
    await h.flush(5);
    assert.ok(h.logged.some(line => line.includes('load failed') && line.includes('relation missing')), h.logged.join('\n'));
    assert.deepEqual(h.packets.get(a).lobby.campaignKeys, { a: 1, b: 1 }, 'the round still pays keys in memory');
    assert.equal(store.calls.saveWallets.length, 0, 'never an absolute write over rows it could not read');
    fail = false;
    for (let i = 0; i < 300; i++) { h.advance(100); await settle(); }
    assert.equal(store.calls.load.length, 2, 'the load is retried once after the cooldown');
    await h.flush();
    assert.deepEqual(store.calls.saveWallets.at(-1).rows.map(row => [row.username, row.keys]), [['a', 2], ['b', 1]]);
  } finally { h.service.close(); }
});

test('opening a stage and clearing a stage are persisted (counts, cleared stages, open stages)', async t => {
  const store = fakeStore({ wallets: [{ username: 'a', keys: 1, cleared: [0] }] });
  const h = harness(t, store);
  const a = {};
  try {
    h.enter(a, 'B', 'a');
    await h.flush();
    assert.equal(h.service.handle(a, { type: 'campaign_open_stage', stage: 1 }).type, 'campaign_progress');
    await h.flush();
    assert.deepEqual(store.calls.saveSpend, [{ section: SHARED_PARK,
      spend: { stage: 1, openedBy: 'a', wallet: { username: 'a', keys: 0, cleared: [0] } } }], 'debit and opening in one write');
    assert.deepEqual(store.calls.saveWallets, [], 'the spender row is never written on its own');
    // Play 1-2 solo and clear it.
    assert.equal(h.service.handle(a, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL, stage: 1 }), null);
    for (let i = 0; i < 20; i++) h.advance(100);
    const state = h.sent.get(a);
    h.service.handle(a, { type: 'campaign_resume', epoch: state.epoch, from: 0 });
    const { epoch, to } = h.sent.get(a);
    h.service.handle(a, { type: 'campaign_clear', epoch, frame: to });
    await h.flush();
    assert.deepEqual(store.calls.saveWallets.at(-1).rows, [{ username: 'a', keys: 0, cleared: [0, 1] }]);
    h.advance(CAMPAIGN_CLEAR_MS);
    h.service.handle(a, { type: 'campaign_resume', epoch: h.sent.get(a).epoch, from: 0 });
    assert.equal(h.sent.get(a).phase, 'select', '1-3 is not open: back to the stage select');
  } finally { h.service.close(); }
});

test('no store: everything is memory-only and nothing is logged', async t => {
  const h = harness(t, null);
  try {
    const { a } = earn(h);
    await h.flush();
    assert.deepEqual(h.packets.get(a).lobby.campaignKeys, { a: 1, b: 1 });
    assert.equal(h.service.handle(a, { type: 'campaign_open_stage', stage: 1 }).type, 'campaign_progress');
    assert.deepEqual(h.logged, []);
  } finally { h.service.close(); }
});

test('the Supabase store reads both tables, upserts absolute wallet rows and first-opener stages, and surfaces errors', async () => {
  const seen = [];
  let results = {};
  const query = table => ({
    select(columns) { seen.push(['select', table, columns]); return this; },
    eq(column, value) { seen.push(['eq', column, value]); return Promise.resolve(results[table]); },
    upsert(rows, options) { seen.push(['upsert', table, rows.map(({ updated_at, ...row }) => row), options]); return Promise.resolve(results[table]); },
  });
  results = {
    [CAMPAIGN_WALLET_TABLE]: { data: [{ username: 'a', keys: 2, cleared: [0] }, { username: 'b', keys: 0, cleared: null }], error: null },
    [CAMPAIGN_OPEN_TABLE]: { data: [{ stage: 1, opened_by: 'a' }], error: null },
  };
  const client = { from(table) { seen.push(['from', table]); return query(table); },
    rpc(name, args) { seen.push(['rpc', name, args]); return Promise.resolve(results[CAMPAIGN_OPEN_TABLE]); } };
  const store = createSupabaseKeyStore(client);
  assert.deepEqual(await store.load(SHARED_PARK), {
    wallets: [{ username: 'a', keys: 2, cleared: [0] }, { username: 'b', keys: 0, cleared: [] }],
    open: [{ stage: 1, openedBy: 'a' }],
  });
  await store.saveWallets(SHARED_PARK, [{ username: 'a', keys: 1, cleared: [0, 1] }]);
  await store.saveSpend(SHARED_PARK, { stage: 2, openedBy: 'a', wallet: { username: 'a', keys: 0, cleared: [0, 1] } });
  assert.deepEqual(seen, [
    ['from', CAMPAIGN_WALLET_TABLE], ['select', CAMPAIGN_WALLET_TABLE, 'username,keys,cleared'], ['eq', 'section', SHARED_PARK],
    ['from', CAMPAIGN_OPEN_TABLE], ['select', CAMPAIGN_OPEN_TABLE, 'stage,opened_by'], ['eq', 'section', SHARED_PARK],
    ['from', CAMPAIGN_WALLET_TABLE],
    ['upsert', CAMPAIGN_WALLET_TABLE, [{ section: SHARED_PARK, username: 'a', keys: 1, cleared: [0, 1] }], { onConflict: 'section,username' }],
    ['rpc', CAMPAIGN_SPEND_FUNCTION, { p_section: SHARED_PARK, p_stage: 2, p_username: 'a', p_keys: 0, p_cleared: [0, 1], p_opened_by: 'a' }],
  ]);
  results[CAMPAIGN_WALLET_TABLE] = { data: null, error: new Error('permission denied') };
  results[CAMPAIGN_OPEN_TABLE] = { data: null, error: new Error('permission denied') };
  await assert.rejects(store.load(SHARED_PARK), /permission denied/);
  await assert.rejects(store.saveWallets(SHARED_PARK, [{ username: 'a', keys: 1, cleared: [] }]), /permission denied/);
  await assert.rejects(store.saveSpend(SHARED_PARK, { stage: 1, openedBy: 'a', wallet: { username: 'a', keys: 0, cleared: [] } }), /permission denied/);
  assert.equal(createSupabaseKeyStore(null), null);
});

// A fake database: saveSpend is one transaction (both rows or neither), like park_campaign_spend_key.
function fakeDatabase(rows = {}) {
  const db = { wallets: new Map(Object.entries(rows)), open: new Map() };
  const fail = { wallets: 0, spend: 0 };
  const store = {
    db, fail,
    async load() {
      return { wallets: [...db.wallets].map(([username, row]) => ({ username, ...row })),
        open: [...db.open].map(([stage, openedBy]) => ({ stage, openedBy })) };
    },
    async saveWallets(section, wallets) {
      if (fail.wallets-- > 0) throw new Error('network down');
      for (const { username, keys, cleared } of wallets) db.wallets.set(username, { keys, cleared });
    },
    async saveSpend(section, { stage, openedBy, wallet }) {
      if (fail.spend-- > 0) throw new Error('network down');
      db.wallets.set(wallet.username, { keys: wallet.keys, cleared: wallet.cleared });
      if (!db.open.has(stage)) db.open.set(stage, openedBy);
    },
  };
  return store;
}

// A relay restart: a fresh park service on the same database.
async function restart(t, store, name) {
  const h = harness(t, store);
  const ws = {};
  h.enter(ws, 'B', name);
  await h.flush();
  return { h, ws, lobby: () => h.packets.get(ws).lobby };
}

test('a spend during a failed load is refused; recovery keeps stored + earned keys (3 + 1 = 4)', async t => {
  const db = fakeDatabase({ a: { keys: 3, cleared: [0] } });
  let fail = true;
  const load = db.load;
  db.load = async section => { if (fail) throw new Error('relation missing'); return load(section); };
  const h = harness(t, db);
  try {
    const { a } = earn(h);   // a earns one key while the load is failing
    await h.flush(3);
    assert.match(h.service.handle(a, { type: 'campaign_open_stage', stage: 1 }).message, /still loading/,
      'no spend on counts the relay could not read');
    fail = false;
    for (let i = 0; i < 310; i++) { h.advance(100); await settle(); }
    await h.flush();
    assert.deepEqual(db.db.wallets.get('a'), { keys: 4, cleared: [0] });
    assert.equal(db.db.open.size, 0);
  } finally { h.service.close(); }
});

test('a failed spend write persists neither side; after a restart the room is consistent', async t => {
  const db = fakeDatabase({ a: { keys: 1, cleared: [0] } });
  db.fail.spend = 1;
  const first = await restart(t, db, 'a');
  try {
    assert.equal(first.h.service.handle(first.ws, { type: 'campaign_open_stage', stage: 1 }).type, 'campaign_progress');
    await first.h.flush();
    assert.deepEqual(db.db.wallets.get('a'), { keys: 1, cleared: [0] }, 'no debit without the opening');
    assert.equal(db.db.open.has(1), false, 'no opening without the debit');
  } finally { first.h.service.close(); }
  const second = await restart(t, db, 'a');   // the relay restarts before its retry
  try {
    assert.deepEqual(second.lobby().campaignKeys, { a: 1 });
    assert.deepEqual(second.lobby().campaignOpen, [0]);
  } finally { second.h.service.close(); }
});

test('a failed spend is retried as one write; after a restart both sides are there', async t => {
  const db = fakeDatabase({ a: { keys: 2, cleared: [0] }, b: { keys: 1, cleared: [] } });
  db.fail.spend = 1;
  const first = await restart(t, db, 'a');
  try {
    first.h.service.handle(first.ws, { type: 'campaign_open_stage', stage: 1 });
    await first.h.flush();
    assert.equal(db.db.open.has(1), false);
    for (let i = 0; i < 310; i++) { first.h.advance(100); await settle(); }
    assert.deepEqual(db.db.wallets.get('a'), { keys: 1, cleared: [0] });
    assert.equal(db.db.open.get(1), 'a');
  } finally { first.h.service.close(); }
  const second = await restart(t, db, 'b');
  try {
    assert.deepEqual(second.lobby().campaignKeys, { a: 1, b: 1 });
    assert.deepEqual(second.lobby().campaignOpen, [0, 1]);
  } finally { second.h.service.close(); }
});

test('while a spend is unconfirmed, other wallet writes never carry the spender row on its own', async t => {
  const db = fakeDatabase({ a: { keys: 1, cleared: [0] } });
  db.fail.spend = 1;
  const first = await restart(t, db, 'a');
  try {
    const { a, b } = earn(first.h);   // a and b earn a key; the rows are written on the next tick
    assert.equal(first.h.service.handle(first.ws, { type: 'campaign_open_stage', stage: 1 }).type, 'campaign_progress');
    await first.h.flush();   // one save: b's row alone, and a's spend (which fails)
    assert.deepEqual(db.db.wallets.get('b'), { keys: 1, cleared: [] }, 'other players are written as usual');
    assert.deepEqual(db.db.wallets.get('a'), { keys: 1, cleared: [0] }, 'a: neither the debit nor the award yet');
    for (let i = 0; i < 310; i++) { first.h.advance(100); await settle(); }
    assert.deepEqual(db.db.wallets.get('a'), { keys: 1, cleared: [0] }, '1 stored - 1 spent + 1 earned');
    assert.equal(db.db.open.get(1), 'a');
    void a; void b;
  } finally { first.h.service.close(); }
});
