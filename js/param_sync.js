/*
 * param_sync.js — tiny cross-device parameter sync via Supabase.
 *
 * Shared service: drop this into ANY page (this app or an external single-file
 * app like the bicycle trackers) and it persists a per-user, per-app JSON blob
 * to the `user_settings` table, keyed on a "sync name". Enter the same sync name
 * on another device and your params come back. (See user_settings_schema.sql.)
 *
 * Design goals:
 *   - Offline-first / additive: every cloud op is best-effort and NEVER throws
 *     into the host app. localStorage stays the source of truth; the cloud is a
 *     mirror. If offline, the supabase CDN is blocked, or no sync name is set,
 *     ops simply no-op and the app keeps working.
 *   - Zero build step: pure browser JS, loads supabase-js from CDN on demand.
 *   - Interop: reuses curriculum_render_v2's existing `consensusUsername` as the
 *     sync name when present, so the two systems share one identity.
 *
 * Usage:
 *   <script src="param_sync.js"></script>            // or copy inline
 *   ParamSync.setSyncName('grape_fox');              // once per device
 *   await ParamSync.save('sa730', state);            // after a local save()
 *   const cloud = await ParamSync.load('sa730');     // returns the blob or null
 *
 * Config (optional): set window.SUPABASE_URL / window.SUPABASE_ANON_KEY before
 * this script, or call ParamSync.configure({url, anonKey}). Defaults target the
 * production project below (same PUBLIC anon key already shipped in the bundle).
 */
(function (global) {
  'use strict';

  // Production Supabase project. The anon key is a PUBLIC client key (already
  // shipped in this app's browser bundle) — safe to embed; it is not a secret.
  var DEFAULT_URL  = 'https://bzqbhtrurzzavhqbgqrs.supabase.co';
  var DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6cWJodHJ1cnp6YXZocWJncXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTc1NDMsImV4cCI6MjA3NDc3MzU0M30.xDHsAxOlv0uprE9epz-M_Emn6q3mRegtTpFt0sl9uBo';
  var SUPABASE_JS_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  var cfg = {
    url:     global.SUPABASE_URL     || DEFAULT_URL,
    anonKey: global.SUPABASE_ANON_KEY || DEFAULT_ANON,
    table:   'user_settings'
  };

  var _client = null;
  var _ready  = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  // Resolves to a Supabase client, or null if the cloud can't be reached.
  function ready() {
    if (_ready) return _ready;
    _ready = (async function () {
      try {
        if (!global.supabase || !global.supabase.createClient) {
          await loadScript(SUPABASE_JS_CDN);
        }
        if (global.supabase && global.supabase.createClient) {
          _client = global.supabase.createClient(cfg.url, cfg.anonKey);
        }
      } catch (e) {
        console.debug('[ParamSync] cloud unavailable:', e && e.message);
        _client = null; // offline — host app keeps using localStorage
      }
      return _client;
    })();
    return _ready;
  }

  // ---------- identity ("sync name") ----------
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }

  function getSyncName() {
    return global.currentUsername ||      // curriculum_render_v2 sets this at runtime
           lsGet('consensusUsername') ||  // ...and persists it here — interop
           lsGet('param_sync_name') ||    // this module's own fallback
           null;
  }
  function setSyncName(name) {
    name = (name == null ? '' : String(name)).trim();
    if (name) lsSet('param_sync_name', name);
    return getSyncName();
  }

  // ---------- core ops (best-effort; never throw) ----------
  async function save(appId, obj) {
    var name = getSyncName();
    if (!appId || !name) return false;
    var client = await ready();
    if (!client) return false;
    try {
      var row = {
        username: name, app_id: appId,
        data: (obj == null ? {} : obj),
        updated_at: new Date().toISOString()
      };
      var res = await client.from(cfg.table).upsert(row, { onConflict: 'username,app_id' });
      if (res.error) throw res.error;
      return true;
    } catch (e) { console.debug('[ParamSync] save failed:', e && e.message); return false; }
  }

  // Returns { data, updated_at } or null.
  async function loadRow(appId) {
    var name = getSyncName();
    if (!appId || !name) return null;
    var client = await ready();
    if (!client) return null;
    try {
      var res = await client.from(cfg.table)
        .select('data, updated_at')
        .eq('username', name).eq('app_id', appId)
        .maybeSingle();
      if (res.error) throw res.error;
      return res.data || null;
    } catch (e) { console.debug('[ParamSync] load failed:', e && e.message); return null; }
  }

  // Returns the param blob or null.
  async function load(appId) {
    var row = await loadRow(appId);
    return row ? row.data : null;
  }

  async function remove(appId) {
    var name = getSyncName();
    if (!appId || !name) return false;
    var client = await ready();
    if (!client) return false;
    try {
      var res = await client.from(cfg.table).delete().eq('username', name).eq('app_id', appId);
      if (res.error) throw res.error;
      return true;
    } catch (e) { console.debug('[ParamSync] delete failed:', e && e.message); return false; }
  }

  function configure(opts) {
    if (!opts) return cfg;
    if (opts.url)     cfg.url = opts.url;
    if (opts.anonKey) cfg.anonKey = opts.anonKey;
    if (opts.table)   cfg.table = opts.table;
    _client = null; _ready = null; // re-init on next op
    return cfg;
  }

  var ParamSync = {
    configure: configure,
    ready: ready,
    getSyncName: getSyncName,
    setSyncName: setSyncName,
    save: save,
    load: load,
    loadRow: loadRow,
    remove: remove
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ParamSync;
  global.ParamSync = ParamSync;

})(typeof window !== 'undefined' ? window : this);
