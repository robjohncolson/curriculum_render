// gradebook-client.js — AP Stats gradebook ledger feeder client
// Repo root sibling of roster-client.js and roster_config.js.
// Loaded AFTER roster_config.js + roster-client.js.
// Pure browser JS: no build, no imports, no Supabase, no secrets.
// Reads window.ROSTER_SERVICE_URL and window.rosterClient.token() at call time.
//
// Implements FROZEN CONTRACT 3 (GRADEBOOK_PHASE1_BUILD.md):
//   window.gradebookClient.record({ source, itemId, unit, topic, skill, response, score, attempt })
//   → { ok:true, ledgerId } | { ok:false, reason:'no-identity'|'network'|'bad-args' }
//
// Decision L-D: fire-and-forget, no-ops without identity, NEVER throws/blocks the caller.
// Decision L-C: No proctor header is ever sent — proctored evidence tier is server-gated only.

(function () {
  'use strict';

  // ── Receipt capture (RECEIPTS_BUILD.md / receipt-system-spec v1.1) ──────────
  // Stores signed receipts from /ledger/record responses in localStorage
  // 'desk_receipts_v1': newest-first array of {id, compact, src, i, sc, ts},
  // capped at 500. Shared-origin: the Desk's "My Receipts" view reads this key.
  // Best-effort — must never break record()'s fire-and-forget contract.
  var RECEIPTS_KEY = 'desk_receipts_v1';
  var RECEIPTS_CAP = 500;
  function _captureReceipt(receipt, source, itemId, score) {
    try {
      if (!receipt || !receipt.receiptId || !receipt.compact) return;
      var list = [];
      try { list = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || '[]'); } catch (_) { list = []; }
      if (!Array.isArray(list)) list = [];
      var id = receipt.receiptId;
      list = list.filter(function (row) { return !row || row.id !== id; });
      list.unshift({
        id: id,
        compact: receipt.compact,
        src: source,
        i: itemId,
        sc: (typeof score === 'number') ? score : undefined,
        ts: Date.now()
      });
      if (list.length > RECEIPTS_CAP) list.length = RECEIPTS_CAP;
      localStorage.setItem(RECEIPTS_KEY, JSON.stringify(list));
    } catch (_) { /* receipts are best-effort; never block or throw from record() */ }
  }

  window.gradebookClient = {

    // Fire-and-forget ledger write.
    // NEVER throws. NEVER rejects. NEVER blocks the caller.
    // Returns a Promise that always resolves to { ok, ... }.
    record: async function (opts) {
      try {
        // --- Validate required args BEFORE touching the network ---
        var source   = opts && opts.source;
        var itemId   = opts && opts.itemId;
        var response = opts && opts.response;

        if (!source || !itemId || response === undefined) {
          return { ok: false, reason: 'bad-args' };
        }

        // --- Read token at call time (decision L-D) ---
        var token = null;
        try {
          if (
            window.rosterClient &&
            window.rosterClient.token &&
            typeof window.rosterClient.token === 'function'
          ) {
            token = window.rosterClient.token();
          }
        } catch (_) {
          // rosterClient.token() threw — treat as no identity
        }

        if (!token) {
          return { ok: false, reason: 'no-identity' };
        }

        // --- Read service URL at call time ---
        var baseUrl = window.ROSTER_SERVICE_URL || null;
        if (!baseUrl) {
          console.warn('gradebook-client: ROSTER_SERVICE_URL is not configured');
          return { ok: false, reason: 'network' };
        }

        // --- POST to /ledger/record — no proctor header (decision L-C) ---
        var body = {
          token:    token,
          source:   source,
          itemId:   itemId,
          unit:     opts.unit,
          topic:    opts.topic,
          skill:    opts.skill,
          response: response,
          score:    opts.score,
          grant:    opts.grant,
          attempt:  opts.attempt
        };

        var res = await fetch(baseUrl + '/ledger/record', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body)
        });

        var data = await res.json();

        if (data && data.ok) {
          _captureReceipt(data.receipt, source, itemId, opts.score);
          return { ok: true, ledgerId: data.ledgerId, receipt: data.receipt || null };
        }

        // Server returned ok:false (e.g. 400/401) — treat as network failure
        console.warn('gradebook-client: server returned ok:false', data);
        return { ok: false, reason: 'network' };

      } catch (err) {
        // Catches: fetch rejection, JSON parse error, any other throw
        console.warn('gradebook-client: record failed —', err && err.message);
        return { ok: false, reason: 'network' };
      }
    },

    // ── WALLET_BUILD.md Task B — fetchReceipts() ────────────────────────────
    captureQuizReceipt: function (receipt, questionId) {
      _captureReceipt(receipt, 'quiz_verdict', questionId);
    },

    // Read-only self-fetch of this student's DURABLE signed receipts (persisted
    // server-side, migration 0018). Returns an array of {id, compact, src, i,
    // sc, ts} for rows that carry a receipt_compact, newest first. Merged with
    // the local desk_receipts_v1 cache (deduped by id) so the receipt history
    // survives a browser-storage wipe or a device switch.
    //
    // NEVER throws. Resolves to [] on any failure (offline, signed-out,
    // pre-migration server with no receipt columns).
    fetchReceipts: async function () {
      try {
        var token = null;
        var sid = null;
        try {
          if (window.rosterClient && typeof window.rosterClient.token === 'function') {
            token = window.rosterClient.token();
          }
          if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
            sid = window.rosterClient.studentId();
          }
        } catch (_) {
          return [];
        }
        if (!token || !sid) return [];

        var baseUrl = window.ROSTER_SERVICE_URL || null;
        if (!baseUrl) return [];

        var url = baseUrl + '/ledger/student/' + encodeURIComponent(sid);
        var res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res || !res.ok) return [];
        var data = await res.json();
        if (!data || !data.ok || !Array.isArray(data.rows)) return [];

        var out = [];
        for (var i = 0; i < data.rows.length; i++) {
          var r = data.rows[i];
          if (!r || !r.receipt_compact) continue;
          out.push({
            id: r.receipt_id || null,
            compact: r.receipt_compact,
            src: r.source,
            i: r.item_id,
            sc: (typeof r.score === 'number') ? r.score : undefined,
            ts: r.recorded_at ? Date.parse(r.recorded_at) : undefined
          });
        }
        return out;
      } catch (_) {
        return [];
      }
    }

  };

})();
