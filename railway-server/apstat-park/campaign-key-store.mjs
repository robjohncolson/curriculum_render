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
// migrations/0006_park_key_grants.sql: a key bought with candy (roster-server POST /wallet/buy-key).
// One transaction records the receipt and adds the key to park_campaign_wallet.bought (a column only
// that function writes, so the wallet's absolute saves of keys can never overwrite a purchase).
// A repeated receipt changes nothing. Either way it returns the stored bought count.
export const CAMPAIGN_GRANT_FUNCTION = 'park_campaign_grant_key';

// client: a supabase-js client built with the backend service key, or null (no store).
export function createSupabaseKeyStore(client) {
  if (!client) return null;
  return {
    async load(section) {
      // Before 0006 there is no bought column: read without it (nobody has bought a key yet).
      let wallet = await client.from(CAMPAIGN_WALLET_TABLE).select('username,keys,bought,cleared').eq('section', section);
      if (wallet.error && String(wallet.error.code) === '42703') {
        wallet = await client.from(CAMPAIGN_WALLET_TABLE).select('username,keys,cleared').eq('section', section);
      }
      if (wallet.error) throw wallet.error;
      const open = await client.from(CAMPAIGN_OPEN_TABLE).select('stage,opened_by').eq('section', section);
      if (open.error) throw open.error;
      return {
        wallets: (wallet.data || []).map(row => ({ username: row.username, keys: row.keys, bought: row.bought ?? 0,
          cleared: row.cleared || [] })),
        open: (open.data || []).map(row => ({ stage: row.stage, openedBy: row.opened_by })),
      };
    },
    // Absolute rows of keys (earned - spent) and cleared: the wallet is their only writer. Never
    // writes bought (park_campaign_grant_key owns it).
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
    // A bought key: { granted: this receipt was new, bought: the stored bought count after the call }.
    async grantKey(section, { receiptId, username }) {
      const { data, error } = await client.rpc(CAMPAIGN_GRANT_FUNCTION, { p_section: section,
        p_username: username, p_receipt: receiptId });
      if (error) throw error;
      if (!data || !Number.isInteger(data.bought)) throw new Error('park_campaign_grant_key returned no count');
      return { granted: data.granted === true, bought: data.bought };
    },
  };
}
