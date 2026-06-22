// pwa-register.js — register the PWA service worker, expose an in-app install
// trigger, and wire background-sync drain. OFFLINE_MODE_SPEC §4.G.
// Best-effort: guarded, never throws, never on file://.
//
// window.PWAInstall.canInstall()  -> true once the browser offers install
// window.PWAInstall.install()     -> Promise<'accepted'|'dismissed'|'unavailable'>
//   ('unavailable' = browser gave no prompt — e.g. already installed, or iOS
//    Safari, which has no programmatic install → the caller shows instructions.)
// Any element with [data-pwa-install] is auto-shown when installable + click-wired.
(function () {
  'use strict';
  try {
    var deferred = null;

    function installEls() { try { return document.querySelectorAll('[data-pwa-install]'); } catch (_) { return []; } }
    function syncInstallUI() {
      var n = installEls();
      for (var i = 0; i < n.length; i += 1) { n[i].hidden = !deferred; }
    }

    window.PWAInstall = {
      canInstall: function () { return !!deferred; },
      install: function () {
        if (!deferred) return Promise.resolve('unavailable');
        var d = deferred; deferred = null;
        try { d.prompt(); } catch (_) { syncInstallUI(); return Promise.resolve('unavailable'); }
        return d.userChoice.then(function (c) {
          syncInstallUI();
          return (c && c.outcome === 'accepted') ? 'accepted' : 'dismissed';
        }, function () { syncInstallUI(); return 'dismissed'; });
      },
    };

    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('beforeinstallprompt', function (e) {
      try { e.preventDefault(); } catch (_) {}
      deferred = e; syncInstallUI();
    });
    window.addEventListener('appinstalled', function () { deferred = null; syncInstallUI(); });

    var swOk = (typeof navigator !== 'undefined') && ('serviceWorker' in navigator)
      && !(typeof location !== 'undefined' && location.protocol === 'file:');

    window.addEventListener('load', function () {
      // Auto-wire any in-app install control ([data-pwa-install]).
      try {
        var n = installEls();
        for (var i = 0; i < n.length; i += 1) {
          n[i].addEventListener('click', function (ev) { try { ev.preventDefault(); } catch (_) {} window.PWAInstall.install(); });
        }
        syncInstallUI();
      } catch (_) {}
      // Register the service worker (offline shell + background sync).
      if (swOk) {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          try {
            if (reg && 'sync' in reg) {
              navigator.serviceWorker.ready.then(function (r) { try { r.sync.register('apstats-sync-grades').catch(function () {}); } catch (_) {} });
            }
          } catch (_) {}
        }).catch(function () {});
      }
    });

    if (swOk) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        try {
          if (e.data && e.data.type === 'drain-offline-queue'
            && window.gradebookClient && typeof window.gradebookClient.syncOfflineQueue === 'function') {
            window.gradebookClient.syncOfflineQueue();
          }
        } catch (_) {}
      });
    }
  } catch (_) { /* PWA is best-effort; never break the page */ }
})();
