# AP Stats Consensus Quiz – v2 Design Doc

## 1. Purpose

This document describes the **intended behavior and priorities** of the “retro + Study Buddy” refactor (v2).

It is not about implementation details; it’s a **contract for future changes**:

- What absolutely must work (non‑negotiables),
- What is nice to have (additive systems),
- Which design tradeoffs are *intentional*.

When in doubt during future refactors: preserve the **Non‑Negotiable Behaviors** first.

---

## 2. Core Product Goals

1. **AP Stats learning tool first, game second.**
   - Students must be able to answer questions, see explanations, and compare with peers.
   - Game elements should *enhance* motivation, not block core usage.

2. **Local-first, no-build, low-friction.**
   - Runs from `index.html` + static assets.
   - Works in a classroom on shaky Wi‑Fi, including pure offline usage.

3. **Collaborative / “peer cloud” feel.**
   - Real-time or near-real-time awareness of peers (peer sprites, consensus data) is part of the magic.

4. **Teacher-friendly controls.**
   - Teachers can manage rosters, see data, and drive activities without fighting the UI.

---

## 3. Non‑Negotiable Behaviors

These must be preserved across future changes.

### 3.1 Student Core Flow (Single User)

From the perspective of a brand-new student:

- **Can load and use the app without instructions.**
  - Page loads to a clear **unit/lesson selection**.
  - No mandatory confusing auth flow before they can do anything.

- **Can answer questions easily.**
  - MCQ:
    - See question, select answer, submit, get clear feedback.
  - FRQ:
    - See prompt, type answer, submit.
    - Can view a scoring guide / solution without hunting.

- **Can always get “Back to Lessons.”**
  - A visible back affordance (e.g., arrow in header) exists in quiz views.
  - Navigation back to the lesson list does **not** depend solely on finding a door in the Study Buddy room.

- **Local persistence works.**
  - Answers and progress survive a refresh on the same device.
  - This should hold offline.

- **Offline first.**
  - With no network:
    - App loads.
    - Questions & answer keys show.
    - Basic Study Buddy / sprites can run in “local-only” mode.
  - AI grading and live sync are allowed to fail, but must fail gracefully.

---

### 3.2 Multiplayer & Peer Sprites

- **Auto-username / anonymous flow still works.**
  - If students don’t manually choose a name, the app should auto-generate one.
  - There should not be a state where a normal student is stuck with “no username” and loses all peer visibility.

- **Peer sprites visible by default (when online).**
  - In a typical class session (Railway + Supabase up), the Study Buddy room shows other online peers.
  - Entering the room should feel like “I see the class,” not “I’m alone in a void.”

- **Room transitions never trap the user.**
  - Entering exit/menu doors must always:
    - Complete animations,
    - Lead somewhere sensible (back to lessons, menu, etc.),
    - Not leave players stuck mid-transition.

- **Sprite system is optional, but non-destructive.**
  - If sprite/Study Buddy scripts fail to load, core quiz behavior still works.
  - No hard crashes.

---

### 3.3 Navigation, FAB, and Doors

- **Back to lessons is obvious.**
  - A visible, clickable UI control (arrow icon or similar) exists outside the canvas.

- **FAB / menu is reachable two ways (ideal).**
  - From retro/game world:
    - Pink door interaction (player sprite colliding).
  - From UI:
    - Clicking the pink door in the canvas **or**
    - Another clear control that opens the same menu.
  - Game interactions are fun, but **never the only path** to a needed control.

---

### 3.4 Teacher & Classroom Use

- **Teacher dashboard is functional, not decorative.**
  - With Railway/server properly configured, a teacher can:
    - View roster,
    - Import students from CSV,
    - See relevant sync/data views,
    - Log in/out as teacher without breaking student flow.

- **Student experience isn’t blocked by teacher features.**
  - If teacher endpoints are down:
    - Students can still use the app locally.
    - Login/teacher-only features may fail, but core quiz flow stays intact.

---

## 4. Additive / Optional Systems

These are **nice-to-have** features. They should enhance v2, but if they fail, v2 is still considered “working” as long as the non‑negotiables hold.

### 4.1 Study Buddy World Details

- Physics (pushable blocks, cliffs, inclines).
- Level-specific geometry from `data/levels.js`.
- Exit doors that show stars for completion.
- Per-peer block overlays.

These are allowed to evolve or be simplified if they ever conflict with the non‑negotiables (especially navigation and offline resilience).

---

### 4.2 AI FRQ Grading

- FRQ AI grading via Railway/LLMs is **additive**:
  - If it’s available, it’s a fun/high-value bonus.
  - If it’s down/misconfigured, FRQs must still:
    - Render,
    - Accept answers,
    - Show the human scoring guide.

No classroom session should depend on AI being up.

---

### 4.3 Toasts, Badges, Retro Flair

- Toast notifications, sync badges, extra retro styling, and pixel art flourish are all optional.
- They must not:
  - Hide essential functionality,
  - Crash the app when missing,
  - Make text unreadable or impossible to navigate.

---

### 4.4 Level Editor

- The level editor (`level_editor.html`) is a **power tool**, not core flow.
  - It can:
    - Save custom levels to localStorage,
    - Allow test-playing.
  - It should not silently corrupt or replace canonical `data/levels.js` for general users.

In other words:
- Level editor is for **authoring & experimentation**, not something students must use to function.

---

## 5. Explicit Non-Goals (For Now)

These are things that *might* matter in a different deployment context, but are intentionally not the focus right now:

- Strong authentication, password hygiene, and “real” security.
- Privacy of FRQ responses and answer rows.
- Strict access control around FRQ grading data.

For the current classroom/pedagogical setup:

- Transparency and ease of use are prioritized over traditional security/privacy.
- If this ever moves to a context with real grades or sensitive data, this section should be revisited.

---

## 6. Practical “Guardrails” for Future Changes

When editing the app in the future:

1. **Ask first:** Does this change make it harder for a student to:
   - Open the app,
   - Answer a question,
   - Go back to lessons,
   - See peers in Study Buddy (when online)?

2. **If yes, stop or add a redundancy.**
   - E.g., if a door or icon is taking over a crucial action, also add a clear button outside the canvas.

3. **Offline test at least once per big change.**
   - Turn off Wi‑Fi, open `index.html`, and:
     - Load unit/lesson,
     - Answer MCQ & FRQ,
     - View scoring guide.

4. **“Peer cloud” test for multiplayer changes.**
   - Two browser windows:
     - Confirm peer sprites still show,
     - Username requirements didn’t regress the view into emptiness.

5. **Teacher sanity pass.**
   - Teacher can log in, use dashboard, and then logout without the app getting stuck.

---

## 7. Summary

v2 is about:

- Keeping the **heart** of the original experience:
  - Offline-first,
  - Peer-aware,
  - Teacher-usable.
- While layering on:
  - Retro aesthetics,
  - Study Buddy world,
  - AI helpers,
  - Teacher tooling.

If a future change ever forces a choice, **prioritize non‑negotiable behaviors over flair**.
