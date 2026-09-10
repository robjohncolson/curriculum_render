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
  function _studentId() {
    try {
      if (window.rosterClient && typeof window.rosterClient.studentId === 'function') return window.rosterClient.studentId();
    } catch (_) { /* best-effort */ }
    return null;
  }
  // ── No-identity / expired-session nudge (2026-09-09) ────────────────────────
  // A grade-bearing write that cannot be saved MUST be visible to the student.
  // kind 'captured' = the answer is queued on this device and will save after the next
  // sign-in; 'lost' = nothing was captured (no identity / no queue). Fires at most once
  // per page; never throws; record()'s contract is unchanged.
  var _parkedNudgeShown = false;
  function _showParkedNudge(rows) {
    try {
      if (!rows.length || _parkedNudgeShown) return;
      console.warn('gradebook-client: parked answers', rows.map(function (row) { return window.OfflineQueue.keyOf(row); }));
      if (typeof document === 'undefined' || !document.body) return;
      _parkedNudgeShown = true;
      if (document.getElementById('gb-parked-nudge')) return;
      var bar = document.createElement('div');
      bar.id = 'gb-parked-nudge';
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#b00020;color:#fff;'
        + 'font-family:Geneva,Verdana,sans-serif;font-size:13px;padding:10px 14px;display:flex;'
        + 'align-items:center;gap:12px;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      bar.textContent = rows.length + ' answer(s) could not be saved to your grade after repeated server errors \u2014 tell your teacher.';
      document.body.appendChild(bar);
    } catch (_) { /* Reporting must never interrupt replay or destroy the saved work. */ }
  }
  var _noIdentityNudgeShown = false;
  function _showNoIdentityNudge(kind) {
    try {
      if (_noIdentityNudgeShown) return;
      if (typeof document === 'undefined' || !document.body) return;
      if (document.getElementById('gb-no-identity-nudge')) return;
      _noIdentityNudgeShown = true;
      var bar = document.createElement('div');
      bar.id = 'gb-no-identity-nudge';
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#b00020;color:#fff;'
        + 'font-family:Geneva,Verdana,sans-serif;font-size:13px;padding:10px 14px;display:flex;'
        + 'align-items:center;gap:12px;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      var msg = document.createElement('span');
      msg.textContent = kind === 'captured'
        ? '⚠️ Your sign-in session expired — your quiz answers are being kept on this device and will be saved to your grade when you sign in again.'
        : '⚠️ You are not signed in — your quiz answers are NOT being saved to your grade.';
      bar.appendChild(msg);
      var link = document.createElement('a');
      link.href = 'https://robjohncolson.github.io/apstats-live-worksheet/ap_stats_roadmap_square_mode.html';
      link.textContent = 'Open the Desk to sign in';
      link.style.cssText = 'color:#fff;font-weight:bold;text-decoration:underline;white-space:nowrap;';
      bar.appendChild(link);
      var x = document.createElement('button');
      x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Dismiss');
      x.style.cssText = 'background:transparent;border:0;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0 4px;';
      x.onclick = function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
      bar.appendChild(x);
      document.body.appendChild(bar);
    } catch (_) { /* best-effort */ }
  }
  // Coalesced drain scheduler: replays the queue a moment after a capture, a sign-in, or load.
  var _drainTimer = null;
  function _scheduleDrain(ms) {
    try {
      if (_drainTimer) clearTimeout(_drainTimer);
      _drainTimer = setTimeout(function () {
        _drainTimer = null;
        try { window.gradebookClient.syncOfflineQueue(); } catch (_) { /* best-effort */ }
      }, ms);
    } catch (_) { /* no timers in this environment */ }
  }
  function _enqueueOffline(opts) {
    if (!_hasQueue()) return Promise.resolve(false);
    var sid = _studentId();
    // An unowned row could never drain (see the ownership gate in syncOfflineQueue) —
    // refuse the capture so record() reports the loss instead of claiming queued:true.
    if (!sid) return Promise.resolve(false);
    try {
      return Promise.resolve(window.OfflineQueue.enqueue({
        source: opts.source, itemId: opts.itemId, response: opts.response,
        score: opts.score, attempt: opts.attempt, grant: opts.grant,
        unit: opts.unit, topic: opts.topic, skill: opts.skill,
        part: opts.part, // PC part rides to the queue so drain hits the right bank
        studentId: sid, kind: opts.kind || 'quiz'
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
      if (!res.ok) { console.warn('gradebook-client: /pc submit HTTP', res.status); return { ok: false, status: res.status, reason: res.status === 401 ? 'auth-expired' : 'network' }; }
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
      if (!res.ok) {
        console.warn('gradebook-client: /ledger/record HTTP', res.status);
        // retryable = the SAME write can succeed later (new session / server back); a 4xx
        // reject is final and must NOT be queued (it would never drain).
        var retryable = res.status === 401 || res.status === 429 || res.status >= 500;
        return { ok: false, status: res.status, reason: res.status === 401 ? 'auth-expired' : 'network', retryable: retryable };
      }
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
          if (await _enqueueOffline(opts)) return { ok: true, queued: true, ledgerId: null };
          _showNoIdentityNudge('lost');   // refused (no studentId / no queue): the write was NOT captured
          return { ok: false, reason: 'no-identity' };
        }

        // Online path: must have identity to attribute the write.
        if (!_token()) {
          _showNoIdentityNudge('lost');   // 2026-09-09: a dropped grade-bearing write is never silent
          return { ok: false, reason: 'no-identity' };
        }

        var r = await _postRecord(opts);
        if (r.ok) { _scheduleDrain(0); return r; }   // a working session also replays anything captured earlier

        // HTTP status is internal drain metadata; preserve the public record result shape.
        delete r.status;

        // 2026-09-09: a quiz taken with an expired token (401) or during a server hiccup used
        // to be dropped with only a console warning — the student "did the quiz but can't see
        // the grade". Capture EVERY non-ok write that can be attributed (the queue row carries
        // the studentId) and replay it when identity / connectivity return.
        if ((r.offline || r.retryable) && _hasQueue() && _studentId()) {
          var captured = false;
          try { captured = await _enqueueOffline(opts); } catch (_) { captured = false; }
          if (captured) {
            _scheduleDrain(30000);
            if (r.reason === 'auth-expired') _showNoIdentityNudge('captured');
            return { ok: false, reason: r.reason || 'network', queued: true };
          }
        }
        if (r.reason === 'auth-expired') _showNoIdentityNudge('lost');
        if (r.offline) delete r.offline;
        if ('retryable' in r) delete r.retryable;
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
        var result = await window.OfflineQueue.drain(function (rec) {
          // Drain-time OWNERSHIP gate (2026-09-09, mirrors the Desk client): _postRecord
          // attributes by the CURRENT token, so a row captured by another student on a
          // shared device — or a legacy row with no owner — must stay queued rather than
          // post under whoever is signed in now (and then be deleted as "sent").
          var sid = _studentId();
          if (!rec || !rec.studentId || !sid || String(rec.studentId) !== String(sid)) {
            return { ok: false, reason: 'no-identity' };
          }
          return _postRecord(rec);
        });
        if (typeof window.OfflineQueue.parked === 'function') _showParkedNudge(await window.OfflineQueue.parked());
        return result;
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
      // 2026-09-09: a sign-in (shared roster session written by the Desk or this app) and a
      // fresh page load with identity both replay captured writes — the queue must not wait
      // for the next 'online' event that may never come.
      window.addEventListener('storage', function (e) {
        try { if (e && e.key === 'apstats_roster.v1') _scheduleDrain(500); } catch (_) { /* best-effort */ }
      });
      if (_token()) _scheduleDrain(3000);
    }
  } catch (_) { /* best-effort */ }

})();
