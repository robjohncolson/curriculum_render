// pwa-register.js — register the PWA service worker + wire background-sync drain.
// OFFLINE_MODE_SPEC §4.G. Loaded by the Desk; the SW's repo-root scope then covers
// the worksheets + study guide too. Best-effort: guarded, never throws, never on
// file:// (the offline pack uses a localhost server, where the SW works fine).
(function () {
  'use strict';
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (typeof location !== 'undefined' && location.protocol === 'file:') return;

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          // Ask for a one-off background sync so the queue drains when connectivity
          // returns (the SW messages an open client to do the authenticated POST).
          try {
            if (reg && 'sync' in reg) {
              navigator.serviceWorker.ready.then(function (r) {
                try { r.sync.register('apstats-sync-grades').catch(function () {}); } catch (_) {}
              });
            }
          } catch (_) { /* sync unsupported — the page 'online' listener still drains */ }
        }).catch(function () { /* registration is best-effort */ });
      });
    }

    // When the SW (on a background sync) asks, drain from the page — it has the
    // auth token in localStorage that the SW cannot read.
    navigator.serviceWorker.addEventListener('message', function (e) {
      try {
        if (e.data && e.data.type === 'drain-offline-queue'
          && window.gradebookClient && typeof window.gradebookClient.syncOfflineQueue === 'function') {
          window.gradebookClient.syncOfflineQueue();
        }
      } catch (_) { /* best-effort */ }
    });
  } catch (_) { /* PWA is best-effort; never break the page */ }
})();
