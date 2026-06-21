// roster-dropdown.js — a filterable class-roster dropdown for a username <input>,
// matching the Desk's typed sign-in. The student types a name OR a username, the
// dropdown shows matching classmates (real name + username), and picking one fills
// the input with the canonical username. Fetches the public PeriodX roster (same
// source as the name-finder dial). Reused by both cr sign-in surfaces.
//
// Usage:  RosterDropdown.attach(inputEl, { onPick: function (row) { ... } })
(function () {
  'use strict';

  var _cache = null; // [{username, realName}] sorted by realName

  async function fetchRoster() {
    if (_cache) return _cache;
    try {
      var base = window.ROSTER_SERVICE_URL || '';
      if (!base) return [];
      var res = await fetch(base + '/roster/section/PeriodX', { cache: 'no-store' });
      if (!res.ok) return [];
      var j = await res.json();
      var list = (j && j.ok && Array.isArray(j.students)) ? j.students : [];
      _cache = list
        .map(function (s) { return { username: s.username, realName: s.realName }; })
        .filter(function (r) { return r.username; })
        .sort(function (a, b) { return (a.realName || a.username || '').localeCompare(b.realName || b.username || ''); });
      return _cache;
    } catch (_) { return []; }
  }

  function attach(input, opts) {
    if (!input || input._rosterDropdownAttached) return;
    input._rosterDropdownAttached = true;
    opts = opts || {};

    // Wrap the input in a position:relative box so the dropdown sits right below it.
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var dd = document.createElement('div');
    dd.className = 'roster-dd';
    dd.style.cssText = 'display:none;position:absolute;top:100%;left:0;right:0;background:#fff;' +
      'border:1px solid #111;border-radius:0 0 4px 4px;max-height:220px;overflow-y:auto;z-index:10000;' +
      'box-shadow:2px 2px 6px rgba(0,0,0,.25)';
    wrap.appendChild(dd);

    var data = [];

    function render(ft) {
      ft = (ft || '').trim().toLowerCase();
      dd.innerHTML = '';
      var matches = data.filter(function (r) {
        if (!ft) return true;
        return (r.realName || '').toLowerCase().indexOf(ft) >= 0 ||
               (r.username || '').toLowerCase().indexOf(ft) >= 0;
      });
      if (matches.length === 0) {
        var e = document.createElement('div');
        e.style.cssText = 'padding:7px 9px;font-style:italic;color:#888;font-size:12px';
        e.textContent = data.length === 0 ? 'No class list loaded — type your username.' : 'No matches.';
        dd.appendChild(e);
        return;
      }
      matches.slice(0, 50).forEach(function (r) {
        var row = document.createElement('div');
        row.style.cssText = 'padding:6px 9px;cursor:pointer;font-size:13px;display:flex;' +
          'justify-content:space-between;gap:10px;align-items:baseline;border-bottom:1px solid #eee';
        row.addEventListener('mouseenter', function () { row.style.background = '#eef'; });
        row.addEventListener('mouseleave', function () { row.style.background = ''; });
        var nm = document.createElement('span'); nm.textContent = r.realName || '(unnamed)';
        var un = document.createElement('span'); un.style.cssText = 'color:#666;font-size:11px'; un.textContent = r.username;
        row.appendChild(nm); row.appendChild(un);
        // mousedown (fires before the input's blur) so the pick always lands.
        row.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          input.value = r.username;
          try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
          close();
          if (typeof opts.onPick === 'function') { try { opts.onPick(r); } catch (_) {} }
        });
        dd.appendChild(row);
      });
      if (matches.length > 50) {
        var more = document.createElement('div');
        more.style.cssText = 'padding:6px 9px;font-style:italic;color:#888;font-size:11px';
        more.textContent = '… ' + (matches.length - 50) + ' more — keep typing to narrow';
        dd.appendChild(more);
      }
    }

    async function open() {
      if (data.length === 0) data = await fetchRoster();
      if (data.length === 0) { close(); return; }   // offline / empty: leave it typed-only
      render(input.value);
      dd.style.display = 'block';
    }
    function close() { dd.style.display = 'none'; }

    input.addEventListener('focus', open);
    input.addEventListener('input', function () { if (dd.style.display === 'block') render(input.value); else open(); });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', 'Type your name or username');
  }

  window.RosterDropdown = { attach: attach, _fetchRoster: fetchRoster };
})();
