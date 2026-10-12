// Where calculator clears live between relay processes (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §1).
//   park_calc_clears (migrations/0008_park_calc_clears.sql): per section, student and skill, how many
//     calculator team rounds the student finished. The relay is the only writer; rows are absolute.
// The clears module (calculator-clears.mjs) keeps the counts in memory and calls the store only to
// load a section once and to write changed rows. Every call may reject; the module logs and retries.
// A missing table (migration not run yet) rejects with error.missingTable = true: the module then
// stays memory-only for this process, exactly as the campaign wallet works without its tables.
export const CALC_CLEARS_TABLE = 'park_calc_clears';
// Rows per load request; below the PostgREST max-rows default (1000) so a full page is unambiguous.
export const CLEARS_PAGE_SIZE = 500;

// Postgres 42P01 / PostgREST PGRST205: the table does not exist.
function isMissingTable(error) {
  return ['42P01', 'PGRST205'].includes(String(error?.code || ''));
}

function storeError(error) {
  if (!isMissingTable(error)) return error;
  return Object.assign(new Error(CALC_CLEARS_TABLE + ' is missing (run migration 0008)'), { missingTable: true });
}

// client: a supabase-js client built with the backend service key, or null (no store).
export function createSupabaseClearsStore(client) {
  if (!client) return null;
  return {
    // [{ username, skillId, clears }]. Paged: PostgREST caps one response (commonly 1000 rows) and a
    // class times 30 skills passes that; a truncated load would turn the missing counts into 0 and
    // the next absolute write would overwrite them. A stable order, then pages until a short one.
    async load(section) {
      const rows = [];
      for (let from = 0; ; from += CLEARS_PAGE_SIZE) {
        const { data, error } = await client.from(CALC_CLEARS_TABLE).select('username,skill_id,clears')
          .eq('section', section).order('username').order('skill_id').range(from, from + CLEARS_PAGE_SIZE - 1);
        if (error) throw storeError(error);
        rows.push(...(data || []));
        if (!data || data.length < CLEARS_PAGE_SIZE) break;
      }
      return rows.map(row => ({ username: row.username, skillId: row.skill_id, clears: row.clears }));
    },
    // rows: [{ username, skillId, clears }], absolute counts.
    async save(section, rows) {
      const updatedAt = new Date().toISOString();
      const records = rows.map(({ username, skillId, clears }) => ({ section, username, skill_id: skillId, clears,
        updated_at: updatedAt }));
      const { error } = await client.from(CALC_CLEARS_TABLE).upsert(records, { onConflict: 'section,username,skill_id' });
      if (error) throw storeError(error);
    },
  };
}
