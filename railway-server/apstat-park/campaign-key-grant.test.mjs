// Teacher 2026-10-08 (PICO_DESK_SPEC "Candy economy", items 7-9): a key bought with candy on
// roster-server is granted by POST /park/campaign/keys/grant. Guarded by PARK_KEY_GRANT_SECRET,
// idempotent on receiptId, identical to an earned key, and pushed to the park room live.
// Bought keys are stored in their own column (park_campaign_wallet.bought, migration 0006) that only
// the grant function writes, so the wallet's absolute saves can never overwrite a purchase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { createCampaignWallet } from './campaign-wallet.mjs';
import { createKeyGrantHandler } from './campaign-key-grant.mjs';
import { createSupabaseKeyStore, CAMPAIGN_GRANT_FUNCTION } from './campaign-key-store.mjs';
import { CAMPAIGN_PROTOCOL } from './campaign-service.mjs';
import { SHARED_PARK } from './shared-classroom.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';

const SECRET = 'grant-secret-for-tests';
const settle = () => new Promise(resolve => setImmediate(resolve));

// An in-memory model of the relay tables after 0006: wallet rows { keys, bought, cleared } and the
// receipts table. saveWallets / saveSpend write keys + cleared only (as the real upsert / 0005 RPC
// do); grantKey is park_campaign_grant_key. loseReplies: that many grant calls commit, then throw.
function dbStore({ rows = {}, loseReplies = 0, failGrant = false } = {}) {
  const wallet = new Map(Object.entries(rows).map(([name, row]) => [name, { keys: 0, bought: 0, cleared: [], ...row }]));
  const receipts = new Set(), calls = { grantKey: [], saveWallets: [] };
  const row = name => { if (!wallet.has(name)) wallet.set(name, { keys: 0, bought: 0, cleared: [] }); return wallet.get(name); };
  return {
    wallet, receipts, calls,
    total: name => (wallet.get(name)?.keys || 0) + (wallet.get(name)?.bought || 0),
    async load() {
      return { wallets: [...wallet].map(([username, r]) => ({ username, ...r })), open: [] };
    },
    async saveWallets(section, list) {
      calls.saveWallets.push(list);
      for (const { username, keys, cleared } of list) Object.assign(row(username), { keys, cleared });
    },
    async saveSpend(section, { wallet: w }) { Object.assign(row(w.username), { keys: w.keys, cleared: w.cleared }); },
    async grantKey(section, { receiptId, username }) {
      calls.grantKey.push(receiptId);
      if (failGrant) throw new Error('relation "park_campaign_key_grants" does not exist');
      const granted = !receipts.has(receiptId);
      if (granted) { receipts.add(receiptId); row(username).bought += 1; }
      if (loseReplies > 0) { loseReplies--; throw new Error('fetch failed (reply lost)'); }
      return { granted, bought: row(username).bought };
    },
  };
}

function park(store = dbStore()) {
  const registry = createClassroomRegistry(), sent = new Map();
  const service = createParkService({ registry, keyStore: store,
    calculatorOptions: { available: () => [DEFAULT_LEVEL], log: () => {} },
    send(ws, packet) { if (!sent.has(ws)) sent.set(ws, []); sent.get(ws).push(packet); } });
  return { registry, service, sent, store };
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
}

async function call(handler, { secret = SECRET, body } = {}) {
  const res = fakeRes();
  await handler({ headers: secret == null ? {} : { 'x-park-grant-secret': secret }, body }, res);
  return res;
}

const BODY = { studentId: 's-1', receiptId: '11111111-2222-4333-8444-555555555555', username: 'ada', section: 'PeriodB', role: 'student' };
const keysIn = (p, section, name) => {
  const ws = {};
  p.registry.join(ws, section, name, 'student', 0);
  return p.service.handle(ws, { type: 'campaign_select' }).keys;
};

test('the grant route is closed without the secret: 503 when unset; 403 { rejected } when wrong or missing', async () => {
  const p = park();
  try {
    const off = createKeyGrantHandler({ park: p.service, secret: () => '' });
    const unset = await call(off, { body: BODY });
    assert.equal(unset.statusCode, 503);
    assert.notEqual(unset.body.rejected, true, 'an unset secret is not a definitive refusal');
    const on = createKeyGrantHandler({ park: p.service, secret: () => SECRET });
    const wrong = await call(on, { secret: 'nope', body: BODY });
    assert.deepEqual([wrong.statusCode, wrong.body.rejected], [403, true]);
    assert.equal((await call(on, { secret: null, body: BODY })).statusCode, 403);
    const bad = await call(on, { body: { ...BODY, receiptId: 'x' } });
    assert.deepEqual([bad.statusCode, bad.body.rejected], [400, true]);
    assert.equal((await call(on, { body: { ...BODY, username: '' } })).statusCode, 400);
    await settle();
    assert.deepEqual(keysIn(p, 'PeriodB', 'ada'), {}, 'nothing was granted');
  } finally { p.service.close(); }
});

test('a grant adds one key in the shared park room; the same receipt again adds nothing', async () => {
  const p = park();
  try {
    const handler = createKeyGrantHandler({ park: p.service, secret: () => SECRET });
    const first = await call(handler, { body: BODY });
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.body, { ok: true, granted: true, keys: 1, section: SHARED_PARK });
    const retry = await call(handler, { body: BODY });
    assert.deepEqual(retry.body, { ok: true, granted: false, keys: 1, section: SHARED_PARK }, 'idempotent on receiptId');
    const second = await call(handler, { body: { ...BODY, receiptId: '99999999-2222-4333-8444-555555555555' } });
    assert.equal(second.body.keys, 2, 'any number per day');
    const r3 = { ...BODY, receiptId: '33333333-2222-4333-8444-555555555555' };
    const [x, y] = await Promise.all([call(handler, { body: r3 }), call(handler, { body: r3 })]);
    assert.equal([x.body.granted, y.body.granted].filter(Boolean).length, 1, 'two concurrent calls grant once');
    assert.equal(p.store.total('ada'), 3);
  } finally { p.service.close(); }
});

test('the teacher in PeriodX buys into the shared B + E park; a PeriodX student keeps their own room', async () => {
  const p = park();
  try {
    const teacher = await p.service.grantKey({ username: 'mr', section: 'PeriodX', role: 'teacher', receiptId: 'aaaaaaaa-1' });
    assert.equal(teacher.section, SHARED_PARK);
    const student = await p.service.grantKey({ username: 'x1', section: 'PeriodX', role: 'student', receiptId: 'aaaaaaaa-2' });
    assert.equal(student.section, 'PeriodX');
  } finally { p.service.close(); }
});

test('a bought key is pushed to the campaign room at once and is spendable like an earned one', async () => {
  const p = park();
  const ws = {};
  try {
    p.registry.join(ws, 'PeriodE', 'ada', 'student', 0);
    await settle();
    p.service.handle(ws, { type: 'campaign_join', protocol: CAMPAIGN_PROTOCOL, stage: 0 });
    p.sent.set(ws, []);
    await p.service.grantKey({ username: 'ada', section: 'PeriodB', role: 'student', receiptId: 'bbbbbbbb-1' });
    const progress = p.sent.get(ws).find(packet => packet.type === 'campaign_progress');
    assert.ok(progress, 'campaign_progress pushed');
    assert.deepEqual(progress.keys, { ada: 1 });
    const opened = p.service.handle(ws, { type: 'campaign_open_stage', stage: 1 });
    assert.deepEqual(opened.open, [0, 1], 'a bought key opens the next stage');
    assert.deepEqual(opened.keys, {});
  } finally { p.service.close(); }
});

test('a lost grant reply is counted on the retry, and a later save cannot overwrite the purchase', async () => {
  // The review's probe: the grant commits, the reply is lost, the retry is a duplicate receipt.
  const store = dbStore({ loseReplies: 1 });
  const wallet = createCampaignWallet({ store, log: () => {} });
  wallet.ensure(SHARED_PARK);
  await settle();
  await assert.rejects(wallet.grant(SHARED_PARK, 'ada', 'cccccccc-1'), /reply lost/);
  assert.equal(store.total('ada'), 1, 'the store committed the purchase');
  const retry = await wallet.grant(SHARED_PARK, 'ada', 'cccccccc-1');
  assert.deepEqual(retry, { granted: false, keys: 1 }, 'the duplicate takes the stored count, not the stale memory');
  // An earned key is saved as an absolute row of keys; the bought key survives it.
  wallet.award(SHARED_PARK, ['ada']);
  wallet.flush();
  await settle();
  assert.deepEqual(store.calls.saveWallets.at(-1), [{ username: 'ada', keys: 1, cleared: [] }], 'the save never carries bought');
  assert.equal(store.total('ada'), 2, 'one bought + one earned, both persisted');
  assert.equal(wallet.keysOf(SHARED_PARK, 'ada'), 2);
});

test('spending a bought key: memory and the store both reach zero; a restart reads keys + bought', async () => {
  const store = dbStore({ rows: { ada: { bought: 1 } } });
  const wallet = createCampaignWallet({ store, log: () => {} });
  wallet.ensure(SHARED_PARK);
  await settle();
  assert.equal(wallet.keysOf(SHARED_PARK, 'ada'), 1, 'loaded bought counts as a key');
  wallet.open(SHARED_PARK, 'ada', 1);
  assert.equal(wallet.keysOf(SHARED_PARK, 'ada'), 0);
  wallet.flush();
  await settle();
  assert.deepEqual(store.wallet.get('ada'), { keys: -1, bought: 1, cleared: [] });
  assert.equal(store.total('ada'), 0);
  const restarted = createCampaignWallet({ store, log: () => {} });
  restarted.ensure(SHARED_PARK);
  await settle();
  assert.equal(restarted.keysOf(SHARED_PARK, 'ada'), 0);
  assert.deepEqual(restarted.view(SHARED_PARK).keys, {});
});

test('no park database (store null): a paid grant is refused with 503, never granted from memory', async () => {
  const p = park(null);
  try {
    const handler = createKeyGrantHandler({ park: p.service, secret: () => SECRET, log: () => {} });
    const res = await call(handler, { body: BODY });
    assert.equal(res.statusCode, 503);
    assert.notEqual(res.body.rejected, true, '503 is indeterminate for roster-server: it holds, never refunds');
    assert.deepEqual(keysIn(p, 'PeriodB', 'ada'), {});
  } finally { p.service.close(); }
});

test('a store failure is a 503 and grants nothing', async () => {
  const p = park(dbStore({ rows: { ada: { keys: 2 } }, failGrant: true }));
  try {
    const handler = createKeyGrantHandler({ park: p.service, secret: () => SECRET, log: () => {} });
    const res = await call(handler, { body: BODY });
    assert.equal(res.statusCode, 503);
    await settle();
    assert.deepEqual(keysIn(p, 'PeriodB', 'ada'), { ada: 2 }, 'only the loaded keys');
  } finally { p.service.close(); }
});

test('the Supabase store: grant returns { granted, bought }; load reads bought and works before 0006', async () => {
  const rpcCalls = [];
  const client = { rpc: async (name, args) => { rpcCalls.push({ name, args });
    return { data: { granted: rpcCalls.length === 1, bought: 1 }, error: null }; } };
  const store = createSupabaseKeyStore(client);
  assert.deepEqual(await store.grantKey(SHARED_PARK, { receiptId: 'r-1', username: 'ada' }), { granted: true, bought: 1 });
  assert.deepEqual(await store.grantKey(SHARED_PARK, { receiptId: 'r-1', username: 'ada' }), { granted: false, bought: 1 });
  assert.deepEqual(rpcCalls[0], { name: CAMPAIGN_GRANT_FUNCTION, args: { p_section: SHARED_PARK, p_username: 'ada', p_receipt: 'r-1' } });
  const failing = createSupabaseKeyStore({ rpc: async () => ({ data: null, error: new Error('boom') }) });
  await assert.rejects(failing.grantKey(SHARED_PARK, { receiptId: 'r-2', username: 'ada' }), /boom/);

  // load(): with the bought column, and the pre-0006 fallback (42703 undefined_column).
  const selects = [];
  const tableClient = (hasBought) => ({ from: () => ({ select(columns) { selects.push(columns); return { eq: async () => {
    if (columns.includes('bought') && !hasBought) return { data: null, error: { code: '42703', message: 'column bought does not exist' } };
    if (columns.startsWith('stage')) return { data: [], error: null };
    return { data: [{ username: 'ada', keys: -1, ...(hasBought ? { bought: 2 } : {}), cleared: [0] }], error: null };
  } }; } }) });
  assert.deepEqual((await createSupabaseKeyStore(tableClient(true)).load(SHARED_PARK)).wallets,
    [{ username: 'ada', keys: -1, bought: 2, cleared: [0] }]);
  assert.deepEqual((await createSupabaseKeyStore(tableClient(false)).load(SHARED_PARK)).wallets,
    [{ username: 'ada', keys: -1, bought: 0, cleared: [0] }]);
});
