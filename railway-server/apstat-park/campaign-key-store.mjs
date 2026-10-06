// Where earned campaign keys live between relay processes: the Supabase table
// park_campaign_keys (migrations/0004_park_campaign_keys.sql). The calculator service keeps
// keys in memory (the hot path) and calls this store only to load a room's holders when the
// room is created and to record new holders when a team completes. Both calls may reject; the
// service logs and carries on memory-only.
export const CAMPAIGN_KEYS_TABLE = 'park_campaign_keys';

// client: a supabase-js client built with the backend service key, or null (no store).
export function createSupabaseKeyStore(client) {
  if (!client) return null;
  return {
    async load(section) {
      const { data, error } = await client.from(CAMPAIGN_KEYS_TABLE).select('username').eq('section', section);
      if (error) throw error;
      return (data || []).map(row => row.username);
    },
    // A key earned again keeps its first earned_at (ignoreDuplicates).
    async award(section, usernames, source) {
      const rows = usernames.map(username => ({ section, username, source }));
      const { error } = await client.from(CAMPAIGN_KEYS_TABLE)
        .upsert(rows, { onConflict: 'section,username', ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}
