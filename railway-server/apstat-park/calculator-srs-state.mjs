// Calculator spaced recall (APSTAT_PARK_TRAINER_ABSORB_SPEC §5): per section, student and
// skill, the SM-2 record (calculator-srs.mjs) the relay advances on every completed round.
//
// Memory is the hot path; the store (calculator-srs-store.mjs) is the truth across restarts,
// the same pattern as calculator-clears.mjs. A store call never blocks a round: failures are
// logged and retried at most once per retryMs per section. Rows are whole records, so a record
// advanced before the section's load finished wins over the loaded row (it is newer). A missing
// table (migration 0009 not run) makes the section memory-only.
import { freshRecord, advance, dueSkills, addDays } from './calculator-srs.mjs';

export const SRS_RETRY_MS = 30000;
const rowKey = (name, skillId) => JSON.stringify([name, skillId]);

export function createCalculatorSrs({ store = null, now = () => performance.now(), log = (...args) => console.warn(...args),
  retryMs = SRS_RETRY_MS } = {}) {
  const sections = new Map();

  function sectionState(section) {
    if (sections.has(section)) return sections.get(section);
    // records: rowKey(name, skillId) -> record. dirty: row keys changed since the last write.
    const state = { section, records: new Map(), dirty: new Set(), load: store ? 'pending' : 'memory',
      loadRetryAt: 0, saving: false, saveRetryAt: 0 };
    sections.set(section, state);
    if (store) startLoad(state);
    return state;
  }

  function memoryOnly(state, error) {
    state.load = 'memory';
    state.dirty.clear();
    log('park calculator srs: memory-only for', state.section, error?.message || error);
  }

  function startLoad(state) {
    state.load = 'pending';
    Promise.resolve().then(() => store.load(state.section))
      .then(rows => merge(state, rows))
      .catch(error => {
        if (error?.missingTable) { memoryOnly(state, error); return; }
        state.load = 'failed';
        state.loadRetryAt = now() + retryMs;
        log('park calculator srs: load failed for', state.section, error?.message || error);
      });
  }

  function merge(state, rows) {
    for (const row of rows || []) {
      const key = rowKey(row.username, row.skillId);
      // A round recorded while the load was in flight is newer than the stored row.
      if (state.dirty.has(key)) continue;
      state.records.set(key, { ...freshRecord(), ...row.record });
    }
    state.load = 'done';
  }

  function recordOf(section, name, skillId) {
    return sectionState(section).records.get(rowKey(name, skillId)) || null;
  }

  // { skillId: record } for one student.
  function recordsOf(section, name) {
    const out = {};
    for (const [key, record] of sectionState(section).records) {
      const [username, skillId] = JSON.parse(key);
      if (username === name) out[skillId] = record;
    }
    return out;
  }

  // One completed round for one student: advance the record; `mastery` true flips mastered.
  // Returns { record, masteredNow } (masteredNow: this round is the first mastery of the skill).
  function record(section, name, skillId, quality, today, { mastery = false } = {}) {
    if (!skillId) return null;
    const state = sectionState(section);
    const key = rowKey(name, skillId);
    const previous = state.records.get(key) || freshRecord();
    const next = advance(previous, quality, today);
    const masteredNow = mastery && !previous.mastered;
    if (mastery) next.mastered = true;
    state.records.set(key, next);
    if (state.load !== 'memory') state.dirty.add(key);
    return { record: next, masteredNow };
  }

  // Marks a skill mastered without a round (the handheld check, spec §7). Same return shape.
  function master(section, name, skillId, today) {
    if (!skillId) return null;
    const state = sectionState(section);
    const key = rowKey(name, skillId);
    const previous = state.records.get(key) || freshRecord();
    const masteredNow = !previous.mastered;
    const next = { ...previous, mastered: true, nextReview: previous.nextReview || addDays(today, 1) };
    state.records.set(key, next);
    if (state.load !== 'memory') state.dirty.add(key);
    return { record: next, masteredNow };
  }

  function due(section, name, today) {
    return dueSkills(recordsOf(section, name), today);
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
      return { username, skillId, record: state.records.get(key) };
    });
    state.saving = true;
    Promise.resolve().then(() => store.save(state.section, rows))
      .then(() => { state.saving = false; })
      .catch(error => {
        state.saving = false;
        if (error?.missingTable) { memoryOnly(state, error); return; }
        for (const key of keys) state.dirty.add(key);
        state.saveRetryAt = now() + retryMs;
        log('park calculator srs: save failed for', state.section, error?.message || error);
      });
  }

  function unsaved(section) {
    const state = sections.get(section);
    return !!state && (state.dirty.size > 0 || state.saving);
  }

  // Starts the section's load (once). Called when a calculator room is created.
  function ensure(section) { sectionState(section); }

  return { ensure, record, master, recordOf, recordsOf, due, flush, unsaved };
}
