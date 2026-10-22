// offline-queue.js — durable local capture of work done with NO server reachable.
// OFFLINE_MODE_SPEC §4.A. Pure browser JS (no build, no imports); loaded as a
// <script> alongside gradebook-client.js / railway_client.js.
//
// ONE FILE, TWO REPOS. follow-alongs/offline-queue.js is the canonical copy;
// curriculum_render/offline-queue.js is a byte-identical mirror written by
// `node scripts/sync-offline-queue.mjs` (follow-alongs). Edit it HERE, run the
// sync, and let tests/offline-queue-identity.test.js (in both repos) catch drift.
// Unified 2026-10-22 (sprint C2): the two copies had diverged in September when
// the parked-row / serverFailures work was mirrored by hand. Comments marked
// [fa] / [cr] / [both] say which side each merged piece came from.
//
// The queue is a faithful TRANSPORT: the app applies its own grade policy
// (appeal-clamp, re-scoring) BEFORE a record reaches here, so the queue only
// needs dedup + latest-wins. On reconnect (or at export) the records flow to the
// server via /ledger/import (teacher side) or /ledger/record (auto-sync).
//
// window.OfflineQueue:
//   .keyOf(rec)                     "source|itemId|attempt" identity
//   .mergeRecord(list, rec)         pure: dedup by key, keep the newer ts
//   .toBundle(list, identity, opts) pure: the export JSON shape (parked rows flagged)
//   .isOffline()                    true when window.OFFLINE_MODE is set
//   .enqueue(rec) -> Promise        durable put (IndexedDB, in-memory fallback)
//   .all() -> Promise<record[]>     durable read (parked rows included)
//   .parked() -> Promise<record[]>  just the rows parked after 12 server failures
//   .clear() -> Promise            durable clear
//   .supersede(rec) -> Promise     delete an older/equal row after a successful send
//   .drain(sender) -> Promise      replay each via sender(rec)->{ok}; deletes on ok

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var DB_NAME = 'apstats_offline_v1';
  var STORE = 'queue';
  var SCHEMA = 'apstats-offline-export/v1';

  // A row the server rejected this many times (5xx) is parked: kept, never
  // re-sent, until a fresh enqueue() of the same key resets it. [both]
  var PARK_AFTER = 12;

  // ── Pure helpers ────────────────────────────────────────────────────────────

  function attemptOf(rec) {
    return (rec && rec.attempt != null) ? rec.attempt : 1;
  }

  function keyOf(rec) {
    return String(rec.source) + '|' + String(rec.itemId) + '|' + String(attemptOf(rec));
  }

  function tsOf(rec) {
    return (rec && typeof rec.ts === 'number' && isFinite(rec.ts)) ? rec.ts : 0;
  }

  // [fa] transportSequence: the sequence number of the call that STARTED the
  // record (gradebook-client stamps one per record()). Rows without one (every
  // cr row, legacy rows) fall back to ts, which is exactly what cr compared on.
  function sequenceOf(rec) {
    return (rec && typeof rec.transportSequence === 'number' && isFinite(rec.transportSequence))
      ? rec.transportSequence : tsOf(rec);
  }

  // Faithful latest-wins is based on call START, not failure completion. A slow
  // older request can therefore never replace a newer answer in the outbox.
  // On a tie the incoming record wins (it is the newer call). [fa; cr compared ts]
  function pickLatest(prev, next) {
    return sequenceOf(next) >= sequenceOf(prev) ? next : prev;
  }

  function isParked(row) {
    return !!row && row.serverFailures >= PARK_AFTER;
  }

  // Pure: merge a record into a list, deduped by keyOf, keeping the newer ts. [both]
  function mergeRecord(list, rec) {
    var out = Array.isArray(list) ? list.slice() : [];
    var k = keyOf(rec);
    for (var i = 0; i < out.length; i++) {
      if (keyOf(out[i]) === k) { out[i] = pickLatest(out[i], rec); return out; }
    }
    out.push(rec);
    return out;
  }

  // [both] Parked rows are exported too (never destroy student work), flagged parked:true.
  function toBundle(list, identity, opts) {
    opts = opts || {};
    return {
      schema: SCHEMA,
      student: identity || null,
      appBuild: opts.appBuild || (root.APP_BUILD || null),
      generatedAt: (typeof opts.now === 'number') ? opts.now
        : (root.Date && root.Date.now ? root.Date.now() : 0),
      records: Array.isArray(list) ? list.map(function (row) {
        if (!isParked(row)) return row;
        var copy = {};
        for (var key in row) { if (Object.prototype.hasOwnProperty.call(row, key)) copy[key] = row[key]; }
        copy.parked = true;
        return copy;
      }) : []
    };
  }

  function isOffline() {
    return root.OFFLINE_MODE === true || root.OFFLINE_MODE === '1';
  }

  // ── Storage adapter: IndexedDB, with an in-memory fallback ────────────────────
  // jsdom / file:// without IDB → the Map fallback keeps the API working (and
  // makes the queue unit-testable). In a real browser the IDB store is durable
  // across reloads/restarts.

  // [both] serverFailure(k, it, status): compare-and-update by key + sequence so a
  // fresh edit never inherits an old failure count.
  function chargeFailure(cur, it, status) {
    if (!cur || sequenceOf(cur) !== sequenceOf(it)) return false;
    cur.serverFailures = (cur.serverFailures || 0) + 1;
    cur.lastServerError = { status: status, at: root.Date.now() };
    return true;
  }

  function makeMemStore() {
    var map = new Map();
    return {
      get: function (k) { return Promise.resolve(map.has(k) ? map.get(k) : null); },
      put: function (k, v) { map.set(k, v); return Promise.resolve(); },
      del: function (k) { map.delete(k); return Promise.resolve(); },
      serverFailure: function (k, it, status) {
        chargeFailure(map.get(k), it, status);
        return Promise.resolve();
      },
      getAll: function () { return Promise.resolve(Array.from(map.values())); },
      clear: function () { map.clear(); return Promise.resolve(); }
    };
  }

  function makeIdbStore() {
    var idb = (typeof root.indexedDB !== 'undefined') ? root.indexedDB : null;
    if (!idb) return null;

    function open() {
      return new Promise(function (resolve, reject) {
        var req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: '_k' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }

    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, mode);
          var store = t.objectStore(STORE);
          var out = fn(store);
          t.oncomplete = function () { resolve(out && out._result !== undefined ? out._result : undefined); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
        });
      });
    }

    return {
      get: function (k) {
        return tx('readonly', function (s) { var box = {}; var r = s.get(k); r.onsuccess = function () { box._result = r.result ? r.result.v : null; }; return box; });
      },
      put: function (k, v) { return tx('readwrite', function (s) { s.put({ _k: k, v: v }); return {}; }); },
      del: function (k) { return tx('readwrite', function (s) { s.delete(k); return {}; }); },
      serverFailure: function (k, it, status) {
        // Compare and update in one transaction: a fresh edit must not inherit an old failure.
        return tx('readwrite', function (s) {
          var r = s.get(k);
          r.onsuccess = function () {
            var cur = r.result && r.result.v;
            if (chargeFailure(cur, it, status)) s.put({ _k: k, v: cur });
          };
          return {};
        });
      },
      getAll: function () {
        return tx('readonly', function (s) { var box = {}; var r = s.getAll(); r.onsuccess = function () { box._result = (r.result || []).map(function (row) { return row.v; }); }; return box; });
      },
      clear: function () { return tx('readwrite', function (s) { s.clear(); return {}; }); }
    };
  }

  var _store = null;
  function store() {
    if (!_store) _store = makeIdbStore() || makeMemStore();
    return _store;
  }

  // [fa] Per-key promise chain: enqueue()/supersede() on the SAME key run one at
  // a time, so a get→put read-modify-write can never interleave with a delete.
  // Different keys stay fully parallel.
  var _keyChains = {};
  function withKeyLock(k, work) {
    var previous = _keyChains[k] || Promise.resolve();
    var run = previous.catch(function () {}).then(work);
    var tail = run.then(function () {}, function () {});
    _keyChains[k] = tail;
    return run.then(function (value) {
      if (_keyChains[k] === tail) delete _keyChains[k];
      return value;
    }, function (err) {
      if (_keyChains[k] === tail) delete _keyChains[k];
      throw err;
    });
  }

  // ── Durable API ───────────────────────────────────────────────────────────

  // [both] copy + default attempt/ts. [fa] also default transportSequence (to ts,
  // else now) so every stored row carries the START-ordered sequence.
  function normalize(rec) {
    var r = {};
    for (var key in rec) { if (Object.prototype.hasOwnProperty.call(rec, key)) r[key] = rec[key]; }
    r.attempt = attemptOf(rec);
    var now = (root.Date && root.Date.now ? root.Date.now() : 0);
    if (typeof r.transportSequence !== 'number' || !isFinite(r.transportSequence)) {
      r.transportSequence = (typeof r.ts === 'number' && isFinite(r.ts)) ? r.ts : now;
    }
    if (typeof r.ts !== 'number' || !isFinite(r.ts)) r.ts = r.transportSequence;
    return r;
  }

  // [both] A fresh edit of a key resets its failure history (un-parks it).
  // [fa] The read-modify-write runs under the key lock.
  function enqueue(rec) {
    var r = normalize(rec);
    r.serverFailures = 0;
    delete r.lastServerError;
    delete r.parked;
    var s = store();
    var k = keyOf(r);
    return withKeyLock(k, function () {
      return s.get(k).then(function (existing) {
        var merged = existing ? pickLatest(existing, r) : r;
        return s.put(k, merged).then(function () { return merged; });
      });
    });
  }

  // [fa] A successful direct send is a durable supersession boundary. Remove only
  // rows that started no later than that send; a newer queued edit survives.
  // Resolves true when a row was deleted, false when nothing (older) was there.
  function supersede(rec) {
    var r = normalize(rec);
    var s = store();
    var k = keyOf(r);
    return withKeyLock(k, function () {
      return s.get(k).then(function (current) {
        if (!current || sequenceOf(current) > sequenceOf(r)) return false;
        return s.del(k).then(function () { return true; });
      });
    });
  }

  function all() { return store().getAll(); }
  function parked() { return all().then(function (rows) { return rows.filter(isParked); }); }
  function clear() { return store().clear(); }

  // [both] A 5xx counts toward parking; an ownership/auth refusal, a 4xx (401/429)
  // and a thrown send are expected + recoverable and never consume an attempt.
  function countsAsServerFailure(res) {
    if (!res || !(res.status >= 500)) return false;
    return res.reason !== 'no-identity' && res.reason !== 'auth-expired' && res.reason !== 'auth';
  }

  // Replay each queued record via sender(rec) -> Promise<{ok:boolean}>.
  // Deletes a record only on a clean ok; leaves the rest queued for next time.
  // Parked rows are skipped (never sent) but still count in `remaining`. [both]
  // Race-safe: a send can take seconds (a network POST), during which the user
  // may edit the SAME item -> enqueue() replaces the key with a newer record.
  // We compare-and-delete (only remove if the stored sequence still matches what
  // we sent) so a newer un-sent edit is never dropped; it drains next round
  // (re-import is idempotent server-side). `sent` is counted only after the
  // delete actually lands. [both]
  // [fa] Before each send we ALSO re-read the row: a direct call may have
  // superseded this getAll() snapshot while an earlier row was in flight, and a
  // row that is already gone must not be re-POSTed.
  function drain(sender) {
    if (typeof sender !== 'function') return Promise.resolve({ sent: 0, failed: 0, remaining: 0 });
    var s = store();
    return s.getAll().then(function (items) {
      var sent = 0, failed = 0;
      var chain = Promise.resolve();
      items.forEach(function (it) {
        if (isParked(it)) return;
        chain = chain.then(function () {
          return s.get(keyOf(it)).then(function (before) {
            if (!before || sequenceOf(before) !== sequenceOf(it)) return;
            return Promise.resolve().then(function () { return sender(it); }).then(function (res) {
              if (!(res && res.ok)) {
                failed += 1;
                if (countsAsServerFailure(res)) return s.serverFailure(keyOf(it), it, res.status);
                return;
              }
              return withKeyLock(keyOf(it), function () {
                return s.get(keyOf(it)).then(function (cur) {
                  if (!cur) { sent += 1; return; }
                  if (sequenceOf(cur) !== sequenceOf(it)) { failed += 1; return; } // newer edit arrived → keep it queued
                  return s.del(keyOf(it)).then(function () { sent += 1; }, function () { failed += 1; });
                });
              });
            });
          }).catch(function () { failed += 1; });
        });
      });
      return chain.then(function () {
        return s.getAll().then(function (remaining) {
          return { sent: sent, failed: failed, remaining: remaining.length };
        });
      });
    });
  }

  root.OfflineQueue = {
    keyOf: keyOf,
    mergeRecord: mergeRecord,
    toBundle: toBundle,
    isOffline: isOffline,
    enqueue: enqueue,
    supersede: supersede,
    all: all,
    parked: parked,
    clear: clear,
    drain: drain,
    _SCHEMA: SCHEMA
  };

})();
