// Calculator clears (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §1, teacher 2026-10-12: rungs follow the
// student). Per section, student and skill: how many calculator team rounds the student was on when
// the team completed. The round state turns it into a hint rung: 0 never cleared (full hints),
// 1 cleared once (goals only), 2 cleared twice or more (no hints).
//
// Memory is the hot path; the store (calculator-clears-store.mjs) is the truth across restarts, the
// same pattern as campaign-wallet.mjs. A store call never blocks a round: failures are logged and
// retried at most once per retryMs per section. Rows are absolute, so nothing is written for a
// section until its load has succeeded; clears recorded before the load are added on top of the
// loaded rows. A missing table (migration 0008 not run) makes the section memory-only.
export const CLEARS_RETRY_MS = 30000;

export const rungFor = clears => Math.min(2, clears);

const rowKey = (name, skillId) => JSON.stringify([name, skillId]);

export function createCalculatorClears({ store = null, now = () => performance.now(), log = (...args) => console.warn(...args),
  retryMs = CLEARS_RETRY_MS } = {}) {
  const sections = new Map();

  function sectionState(section) {
    if (sections.has(section)) return sections.get(section);
    // counts: rowKey(name, skillId) -> clears. dirty: row keys changed since the last write.
    const state = { section, counts: new Map(), dirty: new Set(), load: store ? 'pending' : 'memory',
      loadRetryAt: 0, saving: false, saveRetryAt: 0 };
    sections.set(section, state);
    if (store) startLoad(state);
    return state;
  }

  function memoryOnly(state, error) {
    state.load = 'memory';
    state.dirty.clear();
    log('park calculator clears: memory-only for', state.section, error?.message || error);
  }

  function startLoad(state) {
    state.load = 'pending';
    Promise.resolve().then(() => store.load(state.section))
      .then(rows => merge(state, rows))
      .catch(error => {
        if (error?.missingTable) { memoryOnly(state, error); return; }
        state.load = 'failed';
        state.loadRetryAt = now() + retryMs;
        log('park calculator clears: load failed for', state.section, error?.message || error);
      });
  }

  function merge(state, rows) {
    for (const row of rows || []) {
      if (!Number.isInteger(row.clears) || row.clears < 0) continue;
      const key = rowKey(row.username, row.skillId);
      state.counts.set(key, (state.counts.get(key) || 0) + row.clears);
    }
    state.load = 'done';
  }

  // One completed round: +1 for every name, for that round's skill.
  function record(section, names, skillId) {
    if (!skillId) return;
    const state = sectionState(section);
    for (const name of names) {
      const key = rowKey(name, skillId);
      state.counts.set(key, (state.counts.get(key) || 0) + 1);
      if (state.load !== 'memory') state.dirty.add(key);
    }
  }

  function clearsOf(section, name, skillId) {
    return sectionState(section).counts.get(rowKey(name, skillId)) || 0;
  }

  // Called from the calculator service's 100 ms tick.
  function flush() {
    if (!store) return;
    for (const state of sections.values()) {
      if (state.load === 'failed' && now() >= state.loadRetryAt) startLoad(state);
      if (state.load !== 'done' || state.saving || now() < state.saveRetryAt || !state.dirty.size) continue;
      save(state);
    }
  }

  function save(state) {
    const keys = [...state.dirty];
    state.dirty.clear();
    const rows = keys.map(key => {
      const [username, skillId] = JSON.parse(key);
      return { username, skillId, clears: state.counts.get(key) || 0 };
    });
    state.saving = true;
    Promise.resolve().then(() => store.save(state.section, rows))
      .then(() => { state.saving = false; })
      .catch(error => {
        state.saving = false;
        if (error?.missingTable) { memoryOnly(state, error); return; }
        for (const key of keys) state.dirty.add(key);
        state.saveRetryAt = now() + retryMs;
        log('park calculator clears: save failed for', state.section, error?.message || error);
      });
  }

  function unsaved(section) {
    const state = sections.get(section);
    return !!state && (state.dirty.size > 0 || state.saving);
  }

  // Starts the section's load (once). Called when a calculator room is created.
  function ensure(section) {
    sectionState(section);
  }

  return { ensure, record, clearsOf, flush, unsaved };
}
