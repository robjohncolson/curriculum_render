// pc-delivery.js — client side of the Progress-Check makeup delivery
// (PC_MAKEUP_DELIVERY_SPEC.md Phase 1).
//
// Flow: openPc(unit, part)
//   → questions from IndexedDB cache, or ONE authenticated fetch of the
//     token-gated /pc/:unit/:part (roster-server, answers already stripped)
//   → cache locally so a later connection drop never blocks the work
//   → adapt PC26 → cr-native shape → hand to loadLessonWithResources().
//
// No answers ever reach the client; grading is server-authoritative (Phase 2),
// so there is NO client-side correctness reveal here (assessment-correct).
(function (global) {
  'use strict';

  // ── PC26 → cr-native question adapter ────────────────────────────────────
  // cr's renderQuestion reads: prompt, attachments{choices|table|image|chartType},
  // type, solution.parts[{partId, description}]. PC26 uses stem/choices/visual/
  // questionParts{label,lead,prompt,subparts}/glossary. Map, don't edit renderer.
  function pc26ToCrQuestion(item) {
    var isFrq = (item.type && /free/i.test(item.type)) || (Array.isArray(item.questionParts) && item.questionParts.length > 0);
    var prompt = (item.stimulus ? item.stimulus + '\n\n' : '') + (item.stem || '');

    // Glossary has no native slot → fold definitions into the prompt.
    if (item.glossary && typeof item.glossary === 'object') {
      var defs = Object.keys(item.glossary).map(function (k) { return k + ': ' + item.glossary[k]; });
      if (defs.length) prompt += '\n\n(' + defs.join('; ') + ')';
    }

    var out = { id: item.id, prompt: prompt, attachments: {} };

    // Figures. D1-a: the roster server resolved the manifest slots and attached
    // short-lived SIGNED URLs — item.figures = { stems:[url0,url1,…], choices:{A:url,…} }.
    // Render those as real images; fall back to the [Figure: …] text ONLY when no
    // signed URL exists (server env unset / older cached bank). This also fixes the
    // array-visual bug: a multi-figure `item.visual` used to collapse to a single
    // placeholder (typeof [] === 'object', no .kind), silently dropping every figure.
    var figs = (item.figures && typeof item.figures === 'object') ? item.figures : {};
    var stems = Array.isArray(figs.stems) ? figs.stems.filter(Boolean) : [];
    if (stems.length === 1) {
      out.attachments.image = stems[0];              // existing single-image renderer
    } else if (stems.length > 1) {
      out.attachments.images = stems;                // multi-image renderer (index.html)
    } else if (item.visual) {
      var vis = Array.isArray(item.visual) ? item.visual : [item.visual];
      vis.forEach(function (v) {
        if (v && v.kind === 'table' && Array.isArray(v.data)) {
          out.attachments.table = v.data;            // native table (kept; dead for current banks)
        } else if (v) {
          out.prompt += '\n\n[Figure: ' + (v.kind || 'visual') + (v.source ? ' — ' + v.source : '') + ']';
        }
      });
    }

    if (isFrq) {
      out.type = 'free-response';
      // Concatenate per lettered part (decision #2): one textarea per part.
      out.solution = {
        parts: (item.questionParts || []).map(function (p, i) {
          var lines = [];
          if (p.lead) lines.push(p.lead);
          if (p.prompt) lines.push(p.prompt);
          if (Array.isArray(p.subparts)) lines.push.apply(lines, p.subparts);
          return { partId: p.label || ('Part ' + (i + 1)), description: lines.join('\n') };
        }),
      };
    } else {
      out.type = 'multiple-choice';
      // PC26 choices are a { A:"…", B:"…" } map; cr wants [{ key, value }].
      var ch = item.choices;
      out.attachments.choices = Array.isArray(ch) ? ch
        : (ch && typeof ch === 'object')
          ? Object.keys(ch).map(function (k) { return { key: k, value: ch[k] }; })
          : [];
      // Figure-choices (D1-a): staple the signed URL onto each choice by key; the
      // choice `value` text stays as the fallback / aria label.
      var choiceFigs = (figs.choices && typeof figs.choices === 'object') ? figs.choices : {};
      out.attachments.choices = out.attachments.choices.map(function (c) {
        return (c && choiceFigs[c.key]) ? Object.assign({}, c, { image: choiceFigs[c.key] }) : c;
      });
    }
    return out;
  }

  // ── IndexedDB cache (offline-workable after the first fetch) ───────────────
  var DB_NAME = 'pc_cache_v2', STORE = 'banks'; // v2: entries now carry signed figure URLs
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('no indexedDB'));
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function cacheGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }
  function cachePut(key, val) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  // The PC the student currently has open. Stamped by openPc so the submit path
  // (gradebook-client _postPc) knows which (unit, part) bank to score against —
  // the part is NOT reliably derivable from the item id (U5's MCQ-A items live in
  // its REST bank), so it must ride from here, including into the offline queue.
  var activePc = null;

  function rosterBase() {
    return (global.ROSTER_SERVICE_URL || '').replace(/\/$/, '');
  }
  function rosterToken() {
    try { return global.rosterClient && global.rosterClient.token ? global.rosterClient.token() : null; }
    catch (_) { return null; }
  }

  // openPc(unit, part, opts?) — cache-or-fetch → adapt → render.
  async function openPc(unit, part, opts) {
    opts = opts || {};
    // Stamp the active PC so answer submissions route to the matching bank.
    activePc = { unit: Number(unit), part: String(part).toUpperCase() };
    var PART = String(part).toUpperCase();
    var key = unit + '-' + PART;
    var teacherView = false;

    async function fetchItems() {
      var token = rosterToken();
      if (!token) throw new Error('Sign in to take the Progress Check.');
      var resp = await fetch(rosterBase() + '/pc/' + unit + '/' + PART, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (resp.status === 403) { var e = new Error('This Progress Check unlocks after you take the paper version in class.'); e.__locked = true; throw e; }
      if (!resp.ok) throw new Error('Could not load the Progress Check (HTTP ' + resp.status + ').');
      var body = await resp.json();
      teacherView = !!(body && body.teacher);
      return (body && Array.isArray(body.items)) ? body.items : [];
    }

    // Network-FIRST when online so the short-lived signed FIGURE URLs refresh on
    // each open — the IndexedDB cache would otherwise freeze expiring URLs. A
    // 403/locked always propagates; a transient network/server failure falls back
    // to the cached bank so an offline sitting (fetched earlier) still works.
    var online = (typeof global.navigator === 'undefined') ? true : (global.navigator.onLine !== false);
    var items = null;
    if (online) {
      try {
        items = await fetchItems();
        await cachePut(key, items);
      } catch (e) {
        if (e && e.__locked) throw e;
        items = await cacheGet(key);
        if (!items) throw e;
      }
    } else {
      items = await cacheGet(key);
      if (!items) items = await fetchItems();
    }
    var questions = items.map(pc26ToCrQuestion);
    if (typeof global.loadLessonWithResources === 'function') {
      await global.loadLessonWithResources({
        questions: questions,
        newUnit: unit,
        newTopic: opts.newTopic || ('U' + unit + '-PC-' + String(part).toUpperCase()),
        newLabel: opts.newLabel || ('Unit ' + unit + ' Progress Check' + (String(part).toUpperCase() === 'A' ? ' — Part A' : '')),
      });
    }
    // Teacher preview: remind that students are unlock-gated (per-student class
    // status is the Phase 2 teacher console).
    if (teacherView && typeof global.showMessage === 'function') {
      global.showMessage('Teacher preview — students see this only after you unlock them (paper PC first).', 'info');
    }
    return questions.length;
  }

  // active() → { unit, part } the student currently has open, or null. Read by
  // the submit path (recordToGradebookLedger) to tag PC rows with their part.
  function active() { return activePc; }

  global.PcDelivery = { openPc: openPc, pc26ToCrQuestion: pc26ToCrQuestion, active: active };
})(typeof window !== 'undefined' ? window : globalThis);
