// name-finder.js
// Roster-aligned "Find your name" dial sign-in — a self-contained port of the
// AP Stats Desk's Name Finder (ap_stats_roadmap_square_mode.html `_nf*`). Same
// ↑ ← → ↓ binary-narrow dial over the class roster, then a password step that
// calls the injected signIn(). Brings its OWN CSS (no dependency on the Desk's
// System-7 classes/vars) so any same-origin app can reuse it. Config-injected,
// so it stays decoupled from any one app's identity/post-sign-in wiring.
//
// Usage:
//   RosterNameFinder.open({
//     rosterUrl: ROSTER_SERVICE_URL + '/roster/section/PeriodX',  // public, no-auth
//     signIn:    (username, password) => rosterClient.signIn(username, password),
//     onSuccess: (result, username) => { ...mirror identity, close... },
//     onTypeUsername: () => { ...open the legacy username/password form... },
//   });
// Pass `getRoster: async () => [{username, realName, role?}]` to override the fetch.
(function () {
  'use strict';

  // ── pure helpers (unit-tested via RosterNameFinder._internals) ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // "Ana Brown" -> "Ana B."  (first name + last initial — brevity + a little privacy)
  function friendly(r) {
    var nm = (r && r.realName || '').trim();
    if (!nm) return (r && r.username) || '(unnamed)';
    var parts = nm.split(/\s+/);
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
  }
  // Short alpha key for range labels, e.g. "Ana B." -> "An".
  function rangeKey(r) {
    var nm = ((r && (r.realName || r.username)) || '').trim();
    if (!nm) return '?';
    return nm.charAt(0).toUpperCase() + (nm.charAt(1) || '').toLowerCase();
  }
  // Split [lo,hi] into up to 4 contiguous buckets. <=4 names -> one leaf per name
  // (the final press picks a real person). >4 -> 4 ranges, last absorbs remainder.
  function buckets(lo, hi) {
    var n = hi - lo + 1, out = [];
    if (n <= 0) return out;
    if (n <= 4) {
      for (var i = lo; i <= hi; i++) out.push({ lo: i, hi: i, leaf: true });
      return out;
    }
    var bs = Math.ceil(n / 4), start = lo;
    for (var b = 0; b < 4 && start <= hi; b++) {
      var end = (b === 3) ? hi : Math.min(start + bs - 1, hi);
      out.push({ lo: start, hi: end, leaf: false });
      start = end + 1;
    }
    return out;
  }

  // ── state ──
  var roster = [], stack = [], lo = 0, hi = -1, state = 'dial', picked = null, cfg = null;

  function host() { return document.getElementById('rnf-content'); }
  function show() { var ov = document.getElementById('rnf-overlay'); if (ov) ov.style.display = 'flex'; }
  function close() { var ov = document.getElementById('rnf-overlay'); if (ov) ov.style.display = 'none'; }

  function ensureOverlay() {
    if (document.getElementById('rnf-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'rnf-overlay';
    ov.innerHTML =
      '<style>'
      + '#rnf-overlay{position:fixed;inset:0;z-index:100002;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Geneva,sans-serif}'
      + '#rnf-overlay .rnf-card{background:#fff;border:2px solid #111;border-radius:6px;box-shadow:3px 3px 0 #111;max-width:460px;width:94%;padding:18px;text-align:center;box-sizing:border-box}'
      + '#rnf-overlay .rnf-title{font-size:15px;font-weight:bold;margin-bottom:2px;color:#111}'
      + '#rnf-overlay .rnf-hint{font-size:11px;color:#555;margin-bottom:10px}'
      + '#rnf-overlay .rnf-diamond{display:flex;flex-direction:column;align-items:center;gap:6px;margin:4px 0}'
      + '#rnf-overlay .rnf-row{display:flex;gap:6px;justify-content:center;width:100%}'
      + '#rnf-overlay .rnf-tile{flex:1;min-width:120px;max-width:200px;min-height:58px;border:2px solid #111;border-radius:4px;background:#fff;cursor:pointer;padding:6px 8px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;font:inherit}'
      + '#rnf-overlay .rnf-tile:hover{background:#eef}#rnf-overlay .rnf-tile:active{background:#dde}'
      + '#rnf-overlay .rnf-arrow{font-size:18px;line-height:1}'
      + '#rnf-overlay .rnf-label{font-size:13px;font-weight:bold;margin-top:2px;color:#111}'
      + '#rnf-overlay .rnf-sub{font-size:9px;color:#666;margin-top:2px}'
      + '#rnf-overlay .rnf-foot{font-size:10px;color:#555;margin-top:10px}'
      + '#rnf-overlay .rnf-foot a{color:#1564c0;cursor:pointer;text-decoration:underline}'
      + '#rnf-overlay input.rnf-pw{width:100%;max-width:240px;font-size:14px;padding:7px;border:1px solid #111;border-radius:4px;box-sizing:border-box}'
      + '#rnf-overlay .rnf-btn{min-width:150px;font-size:13px;padding:7px 12px;border:2px solid #111;border-radius:4px;background:#f3f3f3;cursor:pointer;font:inherit}'
      + '#rnf-overlay .rnf-btn:hover{background:#e8e8e8}'
      + '#rnf-overlay .rnf-err{color:#cc0000;font-size:11px;margin-top:6px;min-height:13px}'
      + '</style>'
      + '<div class="rnf-card" role="dialog" aria-modal="true" aria-label="Find your name to sign in"><div id="rnf-content"></div></div>';
    // Click on the dim backdrop (outside the card) cancels.
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKeydown);
  }

  function renderDial() {
    state = 'dial';
    var h = host(); if (!h) return;
    var n = hi - lo + 1;
    if (n <= 1) { selectName(roster[lo]); return; }   // singleton: auto-pick, no wasted press
    var bk = buckets(lo, hi);
    var arrows = ['↑', '←', '→', '↓'], arrowName = ['up', 'left', 'right', 'down'];
    function tile(b, i) {
      if (!b) return '<div class="rnf-tile" style="visibility:hidden"></div>';
      var label, sub, aria;
      if (b.leaf) {
        var r = roster[b.lo];
        label = esc(friendly(r)); sub = '';
        aria = 'Press ' + arrowName[i] + ': select ' + friendly(r);
      } else {
        var first = roster[b.lo], last = roster[b.hi], c = b.hi - b.lo + 1;
        label = esc(rangeKey(first)) + '–' + esc(rangeKey(last));
        sub = esc(friendly(first)) + ' … ' + esc(friendly(last)) + ' (' + c + ')';
        aria = 'Press ' + arrowName[i] + ': ' + friendly(first) + ' to ' + friendly(last) + ', ' + c + ' names';
      }
      return '<button class="rnf-tile" aria-label="' + esc(aria) + '" data-i="' + i + '">'
        + '<div class="rnf-arrow">' + arrows[i] + '</div>'
        + '<div class="rnf-label">' + label + '</div>'
        + (sub ? '<div class="rnf-sub">' + sub + '</div>' : '')
        + '</button>';
    }
    h.innerHTML =
      '<div class="rnf-title">🔒 Find your name</div>'
      + '<div class="rnf-hint" aria-live="polite">' + n + ' classmates left · turn the dial to you</div>'
      + '<div class="rnf-diamond">'
      + '<div class="rnf-row">' + tile(bk[0], 0) + '</div>'
      + '<div class="rnf-row">' + tile(bk[1], 1) + tile(bk[2], 2) + '</div>'
      + '<div class="rnf-row">' + tile(bk[3], 3) + '</div>'
      + '</div>'
      + '<div class="rnf-foot">press ↑ ← → ↓' + (stack.length ? ' · <a data-act="back">⌫ back</a>' : '') + '</div>'
      + '<div class="rnf-foot"><a data-act="type">Type my username instead →</a></div>';
    // Wire via addEventListener (no inline onclick — CSP-safe, decoupled).
    Array.prototype.forEach.call(h.querySelectorAll('.rnf-tile'), function (el) {
      el.addEventListener('click', function () { pick(Number(el.getAttribute('data-i'))); });
    });
    var bk1 = h.querySelector('[data-act="back"]'); if (bk1) bk1.addEventListener('click', back);
    var ty1 = h.querySelector('[data-act="type"]'); if (ty1) ty1.addEventListener('click', typeUsername);
  }

  function pick(i) {
    if (state !== 'dial') return;
    var bk = buckets(lo, hi), b = bk[i];
    if (!b) return;
    if (b.leaf) { selectName(roster[b.lo]); return; }
    stack.push({ lo: lo, hi: hi }); lo = b.lo; hi = b.hi; renderDial();
  }
  function back() { if (!stack.length) return; var w = stack.pop(); lo = w.lo; hi = w.hi; renderDial(); }
  function selectName(r) { picked = r || null; renderPassword(); }

  // Picked a person -> ask ONLY for their password (no username field to type).
  function renderPassword() {
    state = 'password';
    var h = host(); if (!h) return;
    var r = picked || {};
    h.innerHTML =
      '<div class="rnf-title">👋 Hi, ' + esc(friendly(r)) + '!</div>'
      + '<div class="rnf-hint">Enter your password to sign in.</div>'
      + '<input type="password" id="rnf-pw" class="rnf-pw" autocomplete="current-password" placeholder="password">'
      + '<div id="rnf-pw-err" class="rnf-err"></div>'
      + '<div style="margin-top:10px"><button class="rnf-btn" id="rnf-pw-ok">Sign in</button></div>'
      + '<div class="rnf-foot"><a data-act="notme">← that’s not me</a></div>';
    var pw = h.querySelector('#rnf-pw');
    var ok = h.querySelector('#rnf-pw-ok');
    var nm = h.querySelector('[data-act="notme"]');
    if (ok) ok.addEventListener('click', submitPassword);
    if (nm) nm.addEventListener('click', renderDial);
    if (pw) {
      pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPassword(); });
      setTimeout(function () { try { pw.focus(); } catch (_) {} }, 60);
    }
  }

  async function submitPassword() {
    if (submitPassword._pending) return;
    var r = picked || {};
    var h = host(); if (!h) return;
    var pw = h.querySelector('#rnf-pw');
    var err = h.querySelector('#rnf-pw-err');
    var ok = h.querySelector('#rnf-pw-ok');
    var password = (pw && pw.value) || '';   // NOT trimmed — edge whitespace can be valid
    if (err) err.textContent = '';
    if (!r.username) { renderDial(); return; }
    if (!password) { if (err) err.textContent = 'Enter your password.'; return; }
    if (!cfg || typeof cfg.signIn !== 'function') {
      if (err) err.textContent = 'Sign-in unavailable (offline). Try again on the school network.';
      return;
    }
    submitPassword._pending = true;
    if (ok) ok.disabled = true;
    if (err) err.textContent = 'Signing in…';
    try {
      var result;
      try { result = await cfg.signIn(r.username, password); }
      catch (e) { result = { ok: false, error: (e && e.message) || 'Network error' }; }
      if (!result || !result.ok) {
        if (err) err.textContent = (result && result.error) || 'Sign-in failed. Check your password.';
        return;
      }
      try { if (typeof cfg.onSuccess === 'function') await cfg.onSuccess(result, r.username); } catch (_) {}
      close();
    } finally {
      submitPassword._pending = false;
      if (ok) ok.disabled = false;
    }
  }

  // "Type my username instead" — hand off to the host's legacy form.
  function typeUsername() {
    close();
    if (cfg && typeof cfg.onTypeUsername === 'function') cfg.onTypeUsername();
  }

  function onKeydown(e) {
    var ov = document.getElementById('rnf-overlay');
    if (!ov || ov.style.display === 'none') return;
    if (state !== 'dial') {
      // password screen has its own controls; only intercept Escape to cancel.
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    var map = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2, ArrowDown: 3 };
    if (e.key in map) { e.preventDefault(); pick(map[e.key]); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  async function defaultFetchRoster(url) {
    if (!url) return [];
    try {
      var res = await fetch(url);
      if (!res.ok) return [];
      var data = await res.json();
      var students = (data && data.ok && Array.isArray(data.students)) ? data.students : [];
      // Drop the teacher account from the student-facing dial.
      return students.filter(function (s) { return (s && (s.role || 'student')) !== 'teacher'; });
    } catch (_) { return []; }
  }

  async function open(config) {
    cfg = config || {};
    ensureOverlay();
    var list = [];
    try {
      list = (typeof cfg.getRoster === 'function')
        ? await cfg.getRoster()
        : await defaultFetchRoster(cfg.rosterUrl);
    } catch (_) { list = []; }
    if (!list || !list.length) {
      // No roster (offline / empty) -> fall straight back to the typed-username form.
      if (typeof cfg.onTypeUsername === 'function') cfg.onTypeUsername();
      return;
    }
    roster = list.slice().sort(function (a, b) {
      return (a.realName || a.username || '').localeCompare(b.realName || b.username || '');
    });
    lo = 0; hi = roster.length - 1; stack = []; picked = null;
    show();
    renderDial();
  }

  window.RosterNameFinder = {
    open: open,
    close: close,
    _internals: { buckets: buckets, friendly: friendly, rangeKey: rangeKey, esc: esc }
  };
})();
