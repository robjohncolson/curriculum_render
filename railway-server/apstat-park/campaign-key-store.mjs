// Where campaign keys live between relay processes (teacher 2026-10-07: keys are a spendable count).
//   park_campaign_wallet (migrations/0005_park_campaign_wallet.sql): per student, the unspent key
//     count and the cleared stage indexes.
//   park_campaign_open: the stages opened for a park room (stage index; 0 = 1-1 is always open and
//     never stored).
//   park_campaign_spend_key(...): ONE transaction that writes the spender's wallet row and the opened
//     stage together, so a key is never debited without its stage, nor a stage opened for free.
// The wallet (campaign-wallet.mjs) keeps all of this in memory and calls the store only to load a
// section once and to write changed rows. Every call may reject; the wallet logs and retries.
// park_campaign_keys (0004) is no longer written; 0005 carries its holders over with one key each.
export const CAMPAIGN_WALLET_TABLE = 'park_campaign_wallet';
export const CAMPAIGN_OPEN_TABLE = 'park_campaign_open';
export const CAMPAIGN_SPEND_FUNCTION = 'park_campaign_spend_key';

// client: a supabase-js client built with the backend service key, or null (no store).
export function createSupabaseKeyStore(client) {
  if (!client) return null;
  return {
    async load(section) {
      const wallet = await client.from(CAMPAIGN_WALLET_TABLE).select('username,keys,cleared').eq('section', section);
      if (wallet.error) throw wallet.error;
      const open = await client.from(CAMPAIGN_OPEN_TABLE).select('stage,opened_by').eq('section', section);
      if (open.error) throw open.error;
      return {
        wallets: (wallet.data || []).map(row => ({ username: row.username, keys: row.keys, cleared: row.cleared || [] })),
        open: (open.data || []).map(row => ({ stage: row.stage, openedBy: row.opened_by })),
      };
    },
    // Absolute rows: the wallet is the only writer for its sections.
    async saveWallets(section, wallets) {
      const updatedAt = new Date().toISOString();
      const rows = wallets.map(({ username, keys, cleared }) => ({ section, username, keys, cleared, updated_at: updatedAt }));
      const { error } = await client.from(CAMPAIGN_WALLET_TABLE).upsert(rows, { onConflict: 'section,username' });
      if (error) throw error;
    },
    // A spend: the spender's absolute wallet row + the opened stage, in one database transaction.
    async saveSpend(section, { stage, openedBy, wallet }) {
      const { error } = await client.rpc(CAMPAIGN_SPEND_FUNCTION, { p_section: section, p_stage: stage,
        p_username: wallet.username, p_keys: wallet.keys, p_cleared: wallet.cleared, p_opened_by: openedBy });
      if (error) throw error;
    },
  };
}
