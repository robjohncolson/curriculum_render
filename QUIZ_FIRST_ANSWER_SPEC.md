# Quiz answers: one retry after a wrong answer, explained; peers only once your answer is settled (spec v2, 2026-09-29)

Status: BUILT 2026-09-29 (Opus 5.5 implemented; three Codex gpt-6-astra review rounds folded; Fable gated) — supersedes v1 (first-answer-only + letters hidden, shipped `27fc3574` /
`f9dcf61` / `72e1bac`). Grade-affecting on the roster server. Reasoning sync becomes part of this build.

Teacher (2026-09-29, in session): "if a student gets a wrong answer, they get one retry but they have to explain
their mind change. No grade window. They can't see peer answers until then. The 2nd answer becomes THE grade, and the
peer answers are revealed. Only display student answers if they have an explanation."

## 1. The rule, per multiple-choice quiz item

1. **First answer.** The app tells the student right away whether it was correct (it already can — the key is
   local).
2. **Correct first answer** → that is the grade (full credit). The item is *settled*.
3. **Wrong first answer** → exactly **one retry**, and the retry requires an explanation of the change of mind (a
   few words, not one character). The second answer is **THE grade** whatever it is. The item is then *settled*.
   No third attempt, ever.
4. **Nothing from classmates is visible until the item is settled**: no peer cards, no letters, no distribution
   chart, no consensus line. The panel says "Answer (and, if you were wrong, retry with an explanation) to see what
   classmates wrote."
5. **Once settled**, the peer panel and chart show in full (letters included — nothing shown can move the grade
   any more), and the answer key + College Board explanation show at once (the old 5/15-minute reveal timers go).
6. **Explanation filter.** A classmate's card appears only if they wrote an explanation. The count reads
   "N classmates explained". A classmate with no explanation is simply absent (still counted in the chart).
7. Free-response items are unchanged (unlimited revisions, AI/peer flow as today).

## 2. Server (roster-server `ledger.js`, `POST /ledger/record`, `source: 'curriculum_quiz'`)

- The client sends `attempt: 1` for the first answer and `attempt: 2` for the retry. Rows are keyed
  (student, item, attempt), so both are kept; the grade engine already scores the LATEST row per item, which is the
  retry when it exists.
- **Server enforcement (can't be bypassed by a modified client):**
  - `attempt: 1` — accepted only if no attempt-1 row with a real response exists; otherwise the stored row is kept
    (`firstAnswerKept: true`, as v1).
  - `attempt: 2` — accepted only if an attempt-1 row exists, no attempt-2 row exists, the attempt-1 response was
    **wrong** against the server's answer key, and the body carries a non-empty `reasoning` (≥ 3 words). Otherwise
    the write is refused with `{ ok:false, error:'retry not allowed' }` (correct first answer / already retried /
    no explanation) — the client shows that plainly.
  - any `attempt > 2` — refused.
- `reasoning` is stored on the ledger row (new nullable column `reasoning text` on `item_ledger` — migration
  USER-RUN) and echoed in the ledger reads the quiz app uses for restore.

## 3. Reasoning sync (curriculum_render + cr railway-server)

- cr Supabase `answers` table gains `reasoning text null` (USER-RUN). `POST /api/submit-answer` accepts and stores
  `reasoning`; `/api/peer-data` returns it; the WebSocket answer broadcast carries it.
- The quiz page sends `reasoning` with every answer submit, and "Share My Reasoning" sends the reasoning (today it
  re-sends the letter). Pulled peer rows populate `classData.users[peer].reasons[questionId]`.

## 4. Client (curriculum_render `index.html`)

- `quizSettledFor(questionId)`: answered AND (first answer correct OR attempts ≥ 2). Replaces the v1
  `answerKeyRevealedFor` gate everywhere (peer cards, letters, tint, chart, consensus line, key reveal).
- After a wrong first answer: choices re-enable, the reasoning box is **required** and the Update Answer button
  enables the moment ≥ 3 words are typed (live `input` listener — v1's "button stays disabled" bug came from
  rendering the disabled state once and never re-checking). Label: "You were not correct. One retry: explain what
  changed your mind."
- After the retry (or a correct first answer): choices lock for good ("This answer is your grade."), peers + chart +
  key appear.
- Peer cards: only classmates whose `reasons[questionId]` is non-empty; count "N classmates explained".
- The v1 retry-always change (`canRetry` → true) is replaced by: `attempts === 0 || (attempts === 1 && !firstCorrect)`.

## 5. Tests

- roster-server `ledger.test.js`: attempt-1 kept; attempt-2 accepted only after a wrong attempt-1 with reasoning;
  refused after a correct first answer, without reasoning, or as a third attempt; engine scores the retry.
- cr: `peer-letters-hidden.test.js` → `quiz-settled-gate.test.js` (gate, filter, no timers, live enable of the
  retry button); `peer-pull-client.test.js` + `peer-data-paging.test.js` extended for `reasoning`.

## 6. What students are told

"Answer. If you're right, that's your grade and you'll see what classmates wrote. If you're wrong, you get one
retry — but you have to explain what changed your mind, and that second answer is your grade. Only classmates who
explained their answer show up."
