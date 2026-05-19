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
          attempt:  opts.attempt
        };

        var res = await fetch(baseUrl + '/ledger/record', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body)
        });

        var data = await res.json();

        if (data && data.ok) {
          return { ok: true, ledgerId: data.ledgerId };
        }

        // Server returned ok:false (e.g. 400/401) — treat as network failure
        console.warn('gradebook-client: server returned ok:false', data);
        return { ok: false, reason: 'network' };

      } catch (err) {
        // Catches: fetch rejection, JSON parse error, any other throw
        console.warn('gradebook-client: record failed —', err && err.message);
        return { ok: false, reason: 'network' };
      }
    }

  };

})();
