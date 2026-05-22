// roster-client.js — AP Stats shared identity client
// Mirrors the sibling pattern of railway_client.js.
// Pure browser JS: no build, no imports, no Supabase, no secrets.
// Talks ONLY to window.ROSTER_SERVICE_URL (read at call time so tests can override).

(function () {
  'use strict';

  var STORAGE_KEY = 'apstats_roster.v1';

  // --- localStorage helpers (never throw) ---

  function readSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeSession(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {
      // blocked — silently skip
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // blocked — silently skip
    }
  }

  // --- service URL helper (read at call time, not module load) ---

  function serviceUrl() {
    return window.ROSTER_SERVICE_URL || null;
  }

  // --- public API ---

  window.rosterClient = {

    // Returns { studentId, username, realName, section, role, spriteHue } from
    // localStorage, or null. role defaults to 'student' when absent (old sessions
    // are safe); spriteHue is null when unset. Never throws.
    current: function () {
      var session = readSession();
      if (!session || !session.studentId) return null;
      return {
        studentId: session.studentId,
        username: session.username,
        realName: session.realName,
        section: session.section,
        role: session.role || 'student',
        spriteHue: (typeof session.spriteHue === 'number') ? session.spriteHue : null,
        mustChangePassword: !!session.mustChangePassword
      };
    },

    // POST /roster/verify — persists the session key on success.
    // Returns { ok, studentId, realName, section, spriteHue, error? }
    signIn: async function (username, password) {
      var baseUrl = serviceUrl();
      if (!baseUrl) {
        return { ok: false, error: 'ROSTER_SERVICE_URL is not configured' };
      }

      try {
        var response = await fetch(baseUrl + '/roster/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, password: password })
        });

        var data = await response.json();

        if (!data.ok) {
          return { ok: false, error: data.error || 'Sign-in failed' };
        }

        writeSession({
          studentId: data.studentId,
          username: data.username || username,
          realName: data.realName,
          section: data.section,
          token: data.token,
          role: data.role || 'student',
          spriteHue: (typeof data.spriteHue === 'number') ? data.spriteHue : null,
          mustChangePassword: !!data.mustChangePassword,
          signedInAt: new Date().toISOString()
        });

        return {
          ok: true,
          studentId: data.studentId,
          realName: data.realName,
          section: data.section,
          spriteHue: (typeof data.spriteHue === 'number') ? data.spriteHue : null,
          mustChangePassword: !!data.mustChangePassword
        };
      } catch (err) {
        return { ok: false, error: err.message || 'Network error' };
      }
    },

    // POST /roster/change-password — student changes their own password using
    // the stored session token. On success, clears mustChangePassword in the
    // persisted session. Returns { ok, error? }. Never throws.
    changePassword: async function (newPassword) {
      var session = readSession();
      if (!session || !session.token) {
        return { ok: false, error: 'Not signed in' };
      }

      var baseUrl = serviceUrl();
      if (!baseUrl) {
        return { ok: false, error: 'ROSTER_SERVICE_URL is not configured' };
      }

      try {
        var response = await fetch(baseUrl + '/roster/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: session.token, newPassword: newPassword })
        });

        var data = await response.json();

        if (!data.ok) {
          return { ok: false, error: data.error || 'Password change failed' };
        }

        session.mustChangePassword = false;
        writeSession(session);

        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message || 'Network error' };
      }
    },

    // POST /roster/enroll with x-teacher-secret header.
    // Enroll does NOT persist a session (enroll != sign-in).
    // Returns { ok, username, studentId, error? }
    enroll: async function (opts) {
      var realName = opts.realName;
      var section = opts.section;
      var password = opts.password;
      var teacherSecret = opts.teacherSecret;
      var email = opts.email;

      var body = { realName: realName, section: section, password: password };
      if (email) body.email = email;

      var baseUrl = serviceUrl();
      if (!baseUrl) {
        return { ok: false, error: 'ROSTER_SERVICE_URL is not configured' };
      }

      try {
        var response = await fetch(baseUrl + '/roster/enroll', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-teacher-secret': teacherSecret
          },
          body: JSON.stringify(body)
        });

        var data = await response.json();

        if (!data.ok) {
          return { ok: false, error: data.error || 'Enrollment failed' };
        }

        return {
          ok: true,
          studentId: data.studentId,
          username: data.username
        };
      } catch (err) {
        return { ok: false, error: err.message || 'Network error' };
      }
    },

    // Removes the localStorage key.
    signOut: function () {
      clearSession();
    },

    // Convenience: current()?.studentId ?? null.  Never throws.
    studentId: function () {
      var session = readSession();
      if (!session || !session.studentId) return null;
      return session.studentId;
    },

    // Convenience for Phase-1 feeders.  Never throws.
    token: function () {
      var session = readSession();
      if (!session || !session.token) return null;
      return session.token;
    }
  };

})();
