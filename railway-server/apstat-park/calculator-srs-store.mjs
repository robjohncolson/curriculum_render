// Where calculator spaced-recall records live between relay processes (ABSORB_SPEC §5).
//   park_calc_srs (migrations/0009_park_calc_srs.sql): per section, student and skill, the SM-2
//     record. The relay is the only writer; rows are whole records.
// calculator-srs-state.mjs keeps the records in memory and calls the store only to load a
// section once and to write changed rows. Every call may reject; the module logs and retries.
// A missing table (migration not run yet) rejects with error.missingTable = true: the module
// then stays memory-only for this process, exactly as the clears store works.
export const CALC_SRS_TABLE = 'park_calc_srs';
export const SRS_PAGE_SIZE = 500;

function isMissingTable(error) {
  return ['42P01', 'PGRST205'].includes(String(error?.code || ''));
}

function storeError(error) {
  if (!isMissingTable(error)) return error;
  return Object.assign(new Error(CALC_SRS_TABLE + ' is missing (run migration 0009)'), { missingTable: true });
}

const COLUMNS = 'username,skill_id,repetitions,interval_days,ease,next_review,last_quality,mastered';

export function rowToRecord(row) {
  return { repetitions: row.repetitions, intervalDays: row.interval_days, ease: Number(row.ease),
    nextReview: row.next_review, lastQuality: row.last_quality, mastered: row.mastered === true };
}

export function recordToRow(section, username, skillId, record, updatedAt) {
  return { section, username, skill_id: skillId, repetitions: record.repetitions, interval_days: record.intervalDays,
    ease: record.ease, next_review: record.nextReview, last_quality: record.lastQuality, mastered: record.mastered === true,
    updated_at: updatedAt };
}

// client: a supabase-js client built with the backend service key, or null (no store).
export function createSupabaseSrsStore(client) {
  if (!client) return null;
  return {
    // [{ username, skillId, record }], paged like the clears store.
    async load(section) {
      const rows = [];
      for (let from = 0; ; from += SRS_PAGE_SIZE) {
        const { data, error } = await client.from(CALC_SRS_TABLE).select(COLUMNS)
          .eq('section', section).order('username').order('skill_id').range(from, from + SRS_PAGE_SIZE - 1);
        if (error) throw storeError(error);
        rows.push(...(data || []));
        if (!data || data.length < SRS_PAGE_SIZE) break;
      }
      return rows.map(row => ({ username: row.username, skillId: row.skill_id, record: rowToRecord(row) }));
    },
    // rows: [{ username, skillId, record }], whole records.
    async save(section, rows) {
      const updatedAt = new Date().toISOString();
      const records = rows.map(({ username, skillId, record }) => recordToRow(section, username, skillId, record, updatedAt));
      const { error } = await client.from(CALC_SRS_TABLE).upsert(records, { onConflict: 'section,username,skill_id' });
      if (error) throw storeError(error);
    },
  };
}
