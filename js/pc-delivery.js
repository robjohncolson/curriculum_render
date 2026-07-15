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

    // Visual → attachments. Phase 1: tables render natively; other figures get a
    // described placeholder so the item still renders (faithful chart rendering
    // is a later polish pass — flagged in the spec §4 risks).
    if (item.visual && typeof item.visual === 'object') {
      var v = item.visual;
      if (v.kind === 'table' && Array.isArray(v.data)) {
        out.attachments.table = v.data;
      } else {
        out.prompt += '\n\n[Figure: ' + (v.kind || 'visual') + (v.source ? ' — ' + v.source : '') + ']';
      }
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
    }
    return out;
  }

  // ── IndexedDB cache (offline-workable after the first fetch) ───────────────
  var DB_NAME = 'pc_cache_v1', STORE = 'banks';
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
    var key = unit + '-' + String(part).toUpperCase();
    var teacherView = false;
    var items = await cacheGet(key);
    if (!items) {
      var token = rosterToken();
      if (!token) throw new Error('Sign in to take the Progress Check.');
      var resp = await fetch(rosterBase() + '/pc/' + unit + '/' + String(part).toUpperCase(), {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (resp.status === 403) throw new Error('This Progress Check unlocks after you take the paper version in class.');
      if (!resp.ok) throw new Error('Could not load the Progress Check (HTTP ' + resp.status + ').');
      var body = await resp.json();
      items = (body && Array.isArray(body.items)) ? body.items : [];
      teacherView = !!(body && body.teacher);
      await cachePut(key, items);
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
