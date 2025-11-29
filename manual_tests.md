# Manual Test Checklist

Goal: verify that after the refactor, the app still works for students and teachers in both offline and online scenarios, with peer sprites and core navigation intact.

---

## A. Offline Basic Usage (Student)

**Setup**

- Disconnect machine from the internet (Wi-Fi off or airplane mode).
- Serve the app locally per docs:
  - `python3 -m http.server 4173` and open `http://localhost:4173/index.html`.   

### A1. Load & Navigate

- [ ] Page loads without network.
- [ ] No visible JavaScript errors in the console related to:
  - `db.js` / Dexie
  - `SyncStatus`
  - `FRQGrader`
- [ ] Lesson list appears.
- [ ] Clicking a unit/lesson enters a quiz as expected.

### A2. Back to Lessons

- [ ] In a quiz view, a visible back button (likely an arrow icon) exists in the header or top area.
- [ ] Clicking this button takes you back to the lesson list reliably.
- [ ] You do *not* have to discover a door in the Study Buddy room to escape a quiz.

### A3. Answering Questions

- [ ] MCQ: select options, submit, see correct/incorrect indicators.
- [ ] FRQ:
  - [ ] Prompt and input area appear.
  - [ ] You can submit answers.
  - [ ] Scoring guide is available via “View Scoring Guide” (or equivalent):
    - [ ] Clicking it reveals the rubric/solution.
  - [ ] This all works with no AI connectivity.

### A4. Local Persistence

- [ ] Answer some questions, then refresh the page while still offline.
- [ ] Your answers and progress are still present (LocalStorage/IndexedDB working).

---

## B. Online Basic Usage (Student + Peers)

**Setup**

- Enable network.
- Run Railway server (if applicable) so peers and FRQ grading can work as intended.   

### B1. Auto / Anonymous Usernames

- [ ] Load the app in one browser window: note the displayed username (auto-generated or chosen).
- [ ] Load the app in a second browser (or incognito).
- [ ] Confirm:
  - [ ] Each session has some username (auto or chosen) without blocking the main UI.
  - [ ] You are not forced into a complex login flow just to answer questions.

### B2. Peer Sprites / Study Buddy

- [ ] Open the Study Buddy view for both sessions.
- [ ] Move player in window A, watch in window B:
  - [ ] Peers appear as sprites.
  - [ ] Movement is visible in both directions.
- [ ] Confirm:
  - [ ] Anonymous/auto users can see peers (no silent “no peers because no currentUsername”).
  - [ ] Name labels appear with meaningful names (auto username fine).

### B3. Doors & Transitions

- [ ] In the Study Buddy room, walk into:
  - [ ] Exit door
  - [ ] Pink door (FAB)
- [ ] Confirm:
  - [ ] Exit door eventually returns you to the right place (lessons or relevant view).
  - [ ] Pink door opens the FAB menu or equivalent UI.
  - [ ] (If implemented) Clicking on the pink door with the mouse also opens the FAB menu.
- [ ] Ensure no “stuck dissolve” state where you can’t move or exit.

---

## C. Sync & Restore (Online)

**Setup**

- Railway server running.
- Supabase configured.

### C1. Sync Status

- [ ] Open the sync status modal.
- [ ] Confirm:
  - [ ] Last sync time is shown (or explicitly “never”).
  - [ ] Answer count is displayed.
  - [ ] Connection status is displayed.
- [ ] Make a few submissions, then trigger a sync.
- [ ] Confirm the status updates sensibly.

### C2. Restore Flow

- [ ] Create some answers and sync to the cloud.
- [ ] Clear local data (simulate new device):
  - [ ] e.g. clear LocalStorage/IndexedDB for the app origin.
- [ ] Use the new restore UI (modal / button) to restore from cloud.
- [ ] Confirm:
  - [ ] There is an obvious way to start restore (even if not called “Restore from Cloud”).
  - [ ] Progress + success/failure feedback appears.
  - [ ] Answers and progress are restored correctly.

---

## D. FRQ AI Grading (Online)

**Setup**

- Railway server running with FRQ grading endpoints.
- Environment set up with Groq/Gemini keys if available.

### D1. With AI Connectivity

- [ ] Open an FRQ question.
- [ ] Confirm “AI grading” button appears (if FRQGrader is enabled).
- [ ] Submit an FRQ answer and click the AI grading button.
- [ ] Confirm:
  - [ ] Request is sent to the server.
  - [ ] Grade/feedback appears in the UI.
  - [ ] Regular FRQ behavior (viewing the scoring guide, etc.) still works.

### D2. Without AI Connectivity

- [ ] Temporarily break AI grading:
  - e.g., stop Railway server, remove API keys, or block those endpoints.
- [ ] Reload the app and open the same FRQ.
- [ ] Confirm:
  - [ ] FRQ still loads and is answerable.
  - [ ] Scoring guide shows up via toggle.
  - [ ] AI grading either:
    - is hidden, **or**
    - shows a clear “grading unavailable” error,
    - but does NOT break the page.

---

## E. Teacher Dashboard & User Management (Online)

**Setup**

- Railway server running.
- Teacher/master password configured as you intend.

### E1. Teacher Login Flow

- [ ] From a fresh load, open the auth/user modal.
- [ ] Follow the flow to log in as a teacher.
- [ ] Confirm:
  - [ ] Teacher FAB/menu button appears when logged in.
  - [ ] Logout clears relevant data and returns to student/anonymous state.

### E2. Roster & Bulk Import

- [ ] Open the teacher dashboard.
- [ ] View current roster.
- [ ] Use CSV import (via teacher dashboard or `docs/import_roster.html`) to add test users.
- [ ] Confirm:
  - [ ] New users appear in the roster.
  - [ ] Log in as one of these users and verify basic quiz functionality.

### E3. Data Export / Reset

- [ ] From teacher dashboard, perform:
  - [ ] Data export (if implemented).
  - [ ] Some kind of reset/clear operation.
- [ ] Confirm these actions do what they claim, without breaking subsequent logins or basic student flow.

---

## F. Level Editor

### F1. Editor Usage

- [ ] Open `level_editor.html`.
- [ ] Load default levels for a unit.
- [ ] Move blocks, adjust parameters, and save.
- [ ] Test-play the level in the editor to confirm behavior.

### F2. Runtime Behavior

- [ ] In the main app, enter the corresponding unit’s Study Buddy room.
- [ ] Confirm:
  - [ ] The level behaves as expected.
  - [ ] If custom local edits are used, this is clearly intentional (you know you’re using your edited levels).
  - [ ] Other users (on different devices) still see canonical levels from `data/levels.js` unless they’ve also edited locally.

---

## G. Regression Sanity Checks

At the end, do a quick “feel test”:

- [ ] Does a new student (who’s never seen the old version) understand how to:
  - Navigate into a lesson,
  - Answer questions,
  - Go back to lessons,
  - Notice peers in the Study Buddy view?
- [ ] With your light explanation, do they:
  - Find the controls intuitive,
  - Enjoy the retro world,
  - Avoid getting stuck or confused?
