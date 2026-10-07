// Campaign keys as a spendable count (teacher 2026-10-07, PICO_DESK_SPEC.md "Campaign keys as a
// spendable count"; supersedes "a key is a permanent door unlock").
//
// Per park room (section): every player's unspent key count, the stages each player has cleared,
// and the stages open for the whole room. Stage numbers are 0-based stage indexes, the same as
// campaign_state.stageIndex (0 = 1-1, 47 = 12-4). Stage 0 is always open.
//
// Memory is the hot path; the store (campaign-key-store.mjs) is the truth across restarts. A store
// call never blocks a round: failures are logged and retried at most once per retryMs per section.
// Writes are absolute rows, so nothing is written for a section until its load has succeeded
// (a write before the load would overwrite the stored counts). Earned/cleared changes made before
// the load are merged on top of the loaded rows. Spending needs the loaded rows: it is refused until
// the load has succeeded. A spend is written in ONE store call (the spender's wallet row and the
// open stage together, one database transaction), so a failure can never persist only one side.
export const STAGE_COUNT = 48;
export const WALLET_RETRY_MS = 30000;

export const stageLabel = stage => (Math.floor(stage / 4) + 1) + '-' + (stage % 4 + 1);

export function createCampaignWallet({ store = null, now = () => performance.now(), log = (...args) => console.warn(...args),
  retryMs = WALLET_RETRY_MS } = {}) {
  const sections = new Map();

  function sectionState(section) {
    if (sections.has(section)) return sections.get(section);
    const state = { section, keys: new Map(), cleared: new Map(), open: new Set([0]), openedBy: new Map(),
      // dirtySpends: stage -> spender, opened in memory but not yet confirmed written.
      dirtyWallets: new Set(), dirtySpends: new Map(), load: store ? 'pending' : 'done', loadRetryAt: 0,
      saving: false, saveRetryAt: 0 };
    sections.set(section, state);
    if (store) startLoad(state);
    return state;
  }

  function startLoad(state) {
    state.load = 'pending';
    Promise.resolve().then(() => store.load(state.section))
      .then(data => merge(state, data))
      .catch(error => {
        state.load = 'failed';
        state.loadRetryAt = now() + retryMs;
        log('park campaign wallet: load failed for', state.section, error?.message || error);
      });
  }

  function merge(state, data) {
    for (const row of data?.wallets || []) {
      const keys = Number.isInteger(row.keys) && row.keys > 0 ? row.keys : 0;
      state.keys.set(row.username, (state.keys.get(row.username) || 0) + keys);
      const cleared = clearedSet(state, row.username);
      for (const stage of row.cleared || []) if (Number.isInteger(stage)) cleared.add(stage);
    }
    for (const row of data?.open || []) {
      if (!Number.isInteger(row.stage)) continue;
      state.open.add(row.stage);
      if (!state.openedBy.has(row.stage)) state.openedBy.set(row.stage, row.openedBy ?? null);
    }
    state.load = 'done';
  }

  function clearedSet(state, name) {
    if (!state.cleared.has(name)) state.cleared.set(name, new Set());
    return state.cleared.get(name);
  }

  function highestOpen(state) {
    return Math.max(...state.open);
  }

  // Every party member has cleared every stage before `stage`.
  function missingFor(state, party, stage) {
    const missing = [];
    for (const name of party) {
      const cleared = state.cleared.get(name) || new Set();
      for (let before = 0; before < stage; before++) {
        if (cleared.has(before)) continue;
        missing.push({ name, stage: before });
        break;
      }
    }
    return missing;
  }

  function award(section, names) {
    const state = sectionState(section);
    for (const name of names) {
      state.keys.set(name, (state.keys.get(name) || 0) + 1);
      state.dirtyWallets.add(name);
    }
  }

  function recordClear(section, names, stage) {
    const state = sectionState(section);
    for (const name of names) {
      const cleared = clearedSet(state, name);
      if (cleared.has(stage)) continue;
      cleared.add(stage);
      state.dirtyWallets.add(name);
    }
  }

  // Spend one of `name`'s keys to open the next stage for the room. Throws a player-facing message.
  function open(section, name, stage) {
    const state = sectionState(section);
    if (state.load !== 'done') throw new Error('Keys are still loading. Try again in a moment.');
    if (!Number.isInteger(stage) || stage < 0 || stage >= STAGE_COUNT) throw new Error('Choose a stage from the stage select.');
    if (state.open.has(stage)) throw new Error('Stage ' + stageLabel(stage) + ' is already open.');
    const next = highestOpen(state) + 1;
    if (stage !== next) throw new Error('Only the next stage (' + stageLabel(next) + ') can be opened.');
    if ((state.keys.get(name) || 0) < 1) throw new Error('You need a key to open ' + stageLabel(stage) + '. Finish a calculator team round to earn one.');
    state.keys.set(name, state.keys.get(name) - 1);
    state.open.add(stage);
    state.openedBy.set(stage, name);
    state.dirtySpends.set(stage, name);
    return stage;
  }

  // 1-1 always; otherwise open for the room AND every party member has cleared every stage before it.
  function startable(section, party, stage) {
    if (stage === 0) return true;
    const state = sectionState(section);
    return state.open.has(stage) && !missingFor(state, party, stage).length;
  }

  // Why a stage cannot be started by this party (null when it can).
  function blocked(section, party, stage) {
    if (startable(section, party, stage)) return null;
    const state = sectionState(section);
    if (!state.open.has(stage)) return 'Stage ' + stageLabel(stage) + ' is not open yet. Open it with a key at the stage select.';
    const missing = missingFor(state, party, stage);
    return 'Stage ' + stageLabel(stage) + ' needs everyone to finish the stages before it. Still needed: '
      + missing.map(entry => entry.name + ' (' + stageLabel(entry.stage) + ')').join(', ') + '.';
  }

  function startableList(section, party) {
    const list = [];
    for (let stage = 0; stage < STAGE_COUNT; stage++) if (startable(section, party, stage)) list.push(stage);
    return list;
  }

  // Lobby / progress view: only players with something to show.
  function view(section) {
    const state = sectionState(section);
    const keys = {}, cleared = {};
    for (const [name, count] of state.keys) if (count > 0) keys[name] = count;
    for (const [name, stages] of state.cleared) if (stages.size) cleared[name] = [...stages].sort((a, b) => a - b);
    return { keys, cleared, open: [...state.open].sort((a, b) => a - b) };
  }

  function keysOf(section, name) {
    return sectionState(section).keys.get(name) || 0;
  }

  // Called from the calculator service's 100 ms tick.
  function flush() {
    if (!store) return;
    for (const state of sections.values()) {
      if (state.load === 'failed' && now() >= state.loadRetryAt) startLoad(state);
      if (state.load !== 'done' || state.saving || now() < state.saveRetryAt) continue;
      if (!state.dirtyWallets.size && !state.dirtySpends.size) continue;
      save(state);
    }
  }

  function walletRow(state, username) {
    return { username, keys: state.keys.get(username) || 0,
      cleared: [...(state.cleared.get(username) || [])].sort((a, b) => a - b) };
  }

  function save(state) {
    const spends = [...state.dirtySpends];
    const spenders = new Set(spends.map(([, name]) => name));
    // A spender's wallet row is written only inside its spend, never on its own: a lone debit
    // without its open stage must not reach the database.
    const names = [...state.dirtyWallets].filter(name => !spenders.has(name));
    state.dirtySpends.clear();
    for (const name of names) state.dirtyWallets.delete(name);
    for (const name of spenders) state.dirtyWallets.delete(name);
    const writes = [];
    if (names.length) {
      const rows = names.map(name => walletRow(state, name));
      writes.push(Promise.resolve().then(() => store.saveWallets(state.section, rows))
        .catch(error => { for (const name of names) state.dirtyWallets.add(name); throw error; }));
    }
    for (const [stage, name] of spends) {
      writes.push(Promise.resolve().then(() => store.saveSpend(state.section, { stage, openedBy: name, wallet: walletRow(state, name) }))
        .catch(error => { state.dirtySpends.set(stage, name); throw error; }));
    }
    state.saving = true;
    Promise.allSettled(writes).then(results => {
      state.saving = false;
      const failed = results.find(result => result.status === 'rejected');
      if (!failed) return;
      state.saveRetryAt = now() + retryMs;
      log('park campaign wallet: save failed for', state.section, failed.reason?.message || failed.reason);
    });
  }

  function unsaved(section) {
    const state = sections.get(section);
    return !!state && (state.dirtyWallets.size > 0 || state.dirtySpends.size > 0 || state.saving);
  }

  // Starts the section's load (once). Called when a park room is created.
  function ensure(section) {
    sectionState(section);
  }

  return { ensure, award, recordClear, open, startable, blocked, startableList, view, keysOf, flush, unsaved };
}
