// gradebook-client.js — AP Stats gradebook ledger feeder client
// Repo root sibling of roster-client.js and roster_config.js.
// Loaded AFTER roster_config.js + roster-client.js.
// Pure browser JS: no build, no imports, no Supabase, no secrets.
// Reads window.ROSTER_SERVICE_URL and window.rosterClient.token() at call time.
//
// Implements FROZEN CONTRACT 3 (GRADEBOOK_PHASE1_BUILD.md):
//   window.gradebookClient.record({ source, itemId, unit, topic, skill, response, score, attempt })
//   → { ok:true, ledgerId } | { ok:false, reason:'no-identity'|'network'|'auth-expired'|'bad-args'|'read-only' }
//
// OFFLINE_MODE_SPEC §4.A (additive): when a write is captured into window.OfflineQueue
// (offline pack or an unreachable fetch), the result carries `queued:true` — offline
// pack → { ok:true, queued:true }; an unreachable fetch → { ok:false, reason:'network',
// queued:true }. The `reason` whitelist is unchanged. Quiz grades flow through here
// (the feeder calls gradebookClient.record), so this captures quiz work offline too.
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

  // ── Offline capture (OFFLINE_MODE_SPEC §4.A) ────────────────────────────────
  // The quiz feeder records grades through gradebookClient.record. When there is
  // no server (a baked OFFLINE_MODE pack, or an unreachable fetch) the record is
  // captured into window.OfflineQueue instead of dropped, then flushed later by
  // syncOfflineQueue() (auto on 'online', or by the teacher importing the export).
  // Degrades gracefully if offline-queue.js isn't loaded on the page.
  function _token() {
    try {
      if (window.rosterClient && typeof window.rosterClient.token === 'function') return window.rosterClient.token();
    } catch (_) { /* treat as no identity */ }
    return null;
  }
  function _hasQueue() {
    return !!(window.OfflineQueue && typeof window.OfflineQueue.enqueue === 'function');
  }
  function _isOfflineMode() {
    try { return !!(window.OfflineQueue && typeof window.OfflineQueue.isOffline === 'function' && window.OfflineQueue.isOffline()); }
    catch (_) { return false; }
  }
  function _enqueueOffline(opts) {
    if (!_hasQueue()) return Promise.resolve(false);
    var sid;
    try { if (window.rosterClient && typeof window.rosterClient.studentId === 'function') sid = window.rosterClient.studentId(); } catch (_) { /* best-effort */ }
    try {
      return Promise.resolve(window.OfflineQueue.enqueue({
        source: opts.source, itemId: opts.itemId, response: opts.response,
        score: opts.score, attempt: opts.attempt, grant: opts.grant,
        unit: opts.unit, topic: opts.topic, skill: opts.skill,
        part: opts.part, // PC part rides to the queue so drain hits the right bank
        studentId: sid || undefined, kind: opts.kind || 'quiz'
      })).then(function () { return true; }, function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }
  // Raw POST. NEVER throws; NEVER enqueues (safe to call from a drain). An
  // unreachable fetch (thrown) is marked offline:true so record() queues it;
  // an HTTP error (401 → auth-expired, else network) is NOT queued.
  // Progress-Check makeup: score server-side against the CB-secure pc_bank via
  // the token-gated /pc/:unit/:part/submit (NOT /ledger/record — the public
  // answer key has no PC26 answers). One item per call; the endpoint enforces
  // best-wins server-side. NEVER throws; an unreachable fetch marks offline:true
  // so record()/drain re-queue it (part rides in the queued record).
  async function _postPc(opts, baseUrl, token) {
    try {
      var m = /^U(\d+)-/.exec(String(opts.itemId || ''));
      var unit = m ? m[1] : (opts.unit ? String(opts.unit).replace(/^U/i, '') : '');
      var part = opts.part ? String(opts.part).toUpperCase() : (/-MCQ-A-/i.test(String(opts.itemId)) ? 'A' : 'REST');
      if (!unit || !part) return { ok: false, reason: 'bad-args' };
      var res = await fetch(baseUrl + '/pc/' + unit + '/' + part + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ responses: [{ itemId: opts.itemId, response: opts.response }] })
      });
      if (!res.ok) { console.warn('gradebook-client: /pc submit HTTP', res.status); return { ok: false, reason: res.status === 401 ? 'auth-expired' : 'network' }; }
      var data = await res.json();
      if (data && data.ok) return { ok: true, ledgerId: null };
      console.warn('gradebook-client: /pc submit returned ok:false', data);
      return { ok: false, reason: 'network' };
    } catch (err) {
      console.warn('gradebook-client: /pc submit failed —', err && err.message);
      return { ok: false, reason: 'network', offline: true };
    }
  }

  async function _postRecord(opts) {
    try {
      var token = _token();
      if (!token) return { ok: false, reason: 'no-identity' };
      var baseUrl = window.ROSTER_SERVICE_URL || null;
      if (!baseUrl) { console.warn('gradebook-client: ROSTER_SERVICE_URL is not configured'); return { ok: false, reason: 'network' }; }
      if (opts.source === 'pc') return await _postPc(opts, baseUrl, token);
      var body = {
        token: token, source: opts.source, itemId: opts.itemId,
        unit: opts.unit, topic: opts.topic, skill: opts.skill,
        response: opts.response, score: opts.score, grant: opts.grant, attempt: opts.attempt
      };
      var res = await fetch(baseUrl + '/ledger/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { console.warn('gradebook-client: /ledger/record HTTP', res.status); return { ok: false, reason: res.status === 401 ? 'auth-expired' : 'network' }; }
      var data = await res.json();
      if (data && data.ok) { _captureReceipt(data.receipt, opts.source, opts.itemId, opts.score); return { ok: true, ledgerId: data.ledgerId, receipt: data.receipt || null }; }
      console.warn('gradebook-client: server returned ok:false', data);
      return { ok: false, reason: 'network' };
    } catch (err) {
      console.warn('gradebook-client: record failed —', err && err.message);
      return { ok: false, reason: 'network', offline: true };
    }
  }

  window.gradebookClient = {

    // Fire-and-forget ledger write.
    // NEVER throws. NEVER rejects. NEVER blocks the caller.
    // Returns a Promise that always resolves to { ok, ... }.
    record: async function (opts) {
      try {
        var source   = opts && opts.source;
        var itemId   = opts && opts.itemId;
        var response = opts && opts.response;

        if (!source || !itemId || response === undefined) {
          return { ok: false, reason: 'bad-args' };
        }

        // View-as / read-only: never capture or send (defense-in-depth).
        if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) {
          return { ok: false, reason: 'read-only' };
        }

        // Offline pack: capture locally, skip the network entirely.
        if (_isOfflineMode()) {
          await _enqueueOffline(opts);
          return { ok: true, queued: true, ledgerId: null };
        }

        // Online path: must have identity to attribute the write.
        if (!_token()) {
          return { ok: false, reason: 'no-identity' };
        }

        var r = await _postRecord(opts);
        if (r.ok) return r;

        // Unreachable fetch → capture for later instead of dropping the grade.
        if (r.offline && _hasQueue()) {
          await _enqueueOffline(opts);
          return { ok: false, reason: 'network', queued: true };
        }
        if (r.offline) delete r.offline;
        return r;

      } catch (err) {
        console.warn('gradebook-client: record failed —', err && err.message);
        return { ok: false, reason: 'network' };
      }
    },

    // ── OFFLINE_MODE_SPEC §4.A — flush queued work to the server ────────────────
    // Replays each queued record via the raw POST; the queue deletes only the ones
    // that land. Auto-runs on 'online'. NEVER throws; resolves to { sent, failed }.
    syncOfflineQueue: async function () {
      try {
        if (!window.OfflineQueue || typeof window.OfflineQueue.drain !== 'function') return { sent: 0, failed: 0 };
        return await window.OfflineQueue.drain(function (rec) { return _postRecord(rec); });
      } catch (_) {
        return { sent: 0, failed: 0 };
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

  // Auto-flush the offline queue when connectivity returns (intermittent case).
  // Best-effort; never throws. The export→teacher-import path covers the fully
  // disconnected case where 'online' never fires.
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', function () {
        try { window.gradebookClient.syncOfflineQueue(); } catch (_) { /* best-effort */ }
      });
    }
  } catch (_) { /* best-effort */ }

})();
