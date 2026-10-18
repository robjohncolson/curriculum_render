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

// ABSORB_2_SPEC §3: a messy clear does not climb the rung (the trainer's 3+ errors demotion).
// The change to this student's clear count for one completed round at quality qualityFor(...):
//   quality >= 3          -> +1 (as before)
//   quality 2             -> 0 ("messy clear")
//   quality <= 1, rung 2  -> back to one clear (goals-only hints next round)
//   quality <= 1, rung 0/1 -> 0
// Clears are counted past 2, so "back to one clear" is 1 - clears (-1 at exactly two clears).
export const CLEAN_CLEAR_QUALITY = 3;
export const MESSY_CLEAR_QUALITY = 2;

export function clearDelta({ quality, clears }) {
  if (quality >= CLEAN_CLEAR_QUALITY) return 1;
  if (quality >= MESSY_CLEAR_QUALITY) return 0;
  if (rungFor(clears) < 2) return 0;
  return 1 - clears;
}

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

  // One completed round, for that round's skill. deltaByName (optional, §3): name -> change to the
  // count (clearDelta); a name it does not list gets +1. Counts never go below 0.
  function record(section, names, skillId, deltaByName = null) {
    if (!skillId) return;
    const state = sectionState(section);
    for (const name of names) {
      const delta = deltaByName && Number.isInteger(deltaByName[name]) ? deltaByName[name] : 1;
      if (delta === 0) continue;
      const key = rowKey(name, skillId);
      state.counts.set(key, Math.max(0, (state.counts.get(key) || 0) + delta));
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

  // True once the section's counts are the truth (loaded, or memory-only).
  function loaded(section) {
    const load = sectionState(section).load;
    return load === 'done' || load === 'memory';
  }

  // Starts the section's load (once). Called when a calculator room is created.
  function ensure(section) {
    sectionState(section);
  }

  return { ensure, record, clearsOf, loaded, flush, unsaved };
}
