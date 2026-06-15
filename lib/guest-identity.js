/* guest-identity.js — stable, shared "guest" alias for signed-out students.
 *
 * A signed-out student who needs to get work done gets ONE persistent
 * Guest_Fruit_Animal identity (localStorage key 'apstats_guest_identity').
 * Because the Desk and the quiz are the same web origin, this key is shared, so
 * a guest is the SAME alias in both apps automatically. All answer work saves
 * under this alias and is recovered into a roster student via the Guest Pass QR
 * (?claimGuest=<alias>) + the teacher's POST /api/guest/reconcile, which re-keys
 * the alias's answers onto the real roster username.
 *
 * Defines window.getGuestIdentity() — the function both apps already reference
 * (DogePresence, the Guest Pass, the quiz "continue as guest" path). Idempotent:
 * generates once, then returns the same stable alias on every later call/reload.
 * The Desk (single-file app) keeps its own identical copy of this function; the
 * shared localStorage KEY — not the word lists — is what keeps the alias in sync.
 */
(function (root) {
  'use strict';
  var KEY = 'apstats_guest_identity';
  var FRUITS = ['Apple', 'Banana', 'Cherry', 'Mango', 'Kiwi', 'Lemon', 'Lime', 'Melon',
    'Peach', 'Pear', 'Plum', 'Berry', 'Fig', 'Guava', 'Papaya', 'Orange', 'Apricot',
    'Coconut', 'Pomelo', 'Olive', 'Grape', 'Lychee', 'Quince', 'Date'];
  var ANIMALS = ['Koala', 'Panda', 'Tiger', 'Otter', 'Seal', 'Fox', 'Wolf', 'Bear',
    'Eagle', 'Hawk', 'Owl', 'Swan', 'Deer', 'Llama', 'Sloth', 'Gecko', 'Turtle',
    'Frog', 'Rabbit', 'Badger', 'Beaver', 'Heron', 'Lynx', 'Moth'];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function generate() { return 'Guest_' + pick(FRUITS) + '_' + pick(ANIMALS); }

  function getGuestIdentity() {
    try {
      var v = localStorage.getItem(KEY);
      if (v && /^Guest_/i.test(v)) return v;          // already minted — stable
      var g = generate();
      try { localStorage.setItem(KEY, g); } catch (_) {}
      return g;
    } catch (_) {
      return 'Guest_Anon';                             // storage blocked — non-persistent fallback
    }
  }

  root.getGuestIdentity = getGuestIdentity;
  root.GUEST_IDENTITY_KEY = KEY;
})(typeof window !== 'undefined' ? window : this);
