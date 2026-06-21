// version-check.js — "a new version is available — reload" nudge for the quiz app.
//
// Mirrors the Desk's stale-tab fix (ap_stats_roadmap_square_mode.html `_wireUpdateNudge`):
// a long-open quiz tab keeps running its cached build and misses later fixes. Poll
// version.json (no-store, every 5 min + on tab refocus); when the deployed build
// differs from this running APP_BUILD, show a dismissible "Reload" banner.
//
// APP_BUILD here and version.json are bumped TOGETHER by scripts/bump-build.mjs —
// a vitest pins version.json.build === APP_BUILD (or a fresh load would nudge-loop).
(function () {
  var APP_BUILD = '2026-06-21-xvow';   // scripts/bump-build.mjs replaces this stamp
  var nudged = false;

  function showBanner() {
    if (nudged || document.getElementById('cr-update-nudge')) return;
    nudged = true;
    var bar = document.createElement('div');
    bar.id = 'cr-update-nudge';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:100050;' +
      'display:flex;align-items:center;gap:10px;background:#fff7e0;border:2px solid #111;border-radius:6px;' +
      'box-shadow:2px 2px 0 #111;padding:7px 11px;font-size:13px;color:#5f4100;max-width:92vw;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    var msg = document.createElement('span');
    msg.textContent = '\u{1F504} A new version is available.';
    var reload = document.createElement('button');
    reload.textContent = 'Reload';
    reload.style.cssText = 'font-size:12px;padding:3px 10px;border:1px solid #111;border-radius:4px;background:#f3f3f3;cursor:pointer';
    reload.addEventListener('click', function () { try { location.reload(); } catch (_) { location.href = location.href; } });
    var dismiss = document.createElement('button');
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.style.cssText = 'font-size:13px;padding:3px 8px;border:1px solid #111;border-radius:4px;background:#f3f3f3;cursor:pointer';
    dismiss.addEventListener('click', function () { bar.remove(); });
    bar.appendChild(msg); bar.appendChild(reload); bar.appendChild(dismiss);
    (document.body || document.documentElement).appendChild(bar);
  }

  function check() {
    if (nudged) return;
    try {
      fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (v) { if (v && v.build && v.build !== APP_BUILD) showBanner(); })
        .catch(function () {});
    } catch (_) {}
  }

  setTimeout(check, 8000);                  // initial, shortly after load
  setInterval(check, 5 * 60 * 1000);        // every 5 min
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });  // on tab refocus
})();
