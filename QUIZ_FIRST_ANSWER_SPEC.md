# Quiz: first answer is the grade; peers show reasoning, not letters (spec + build, 2026-09-29)

Status: BUILT 2026-09-29 (teacher decision in session: "1st plus 2nd"). Grade-affecting on the roster server
(only in the honest direction). Client changes in this repo.

## Why

Once peer answers actually loaded (the peer pull had been dead since the Supabase library race — see cr
`753159d`/`e8c3597`), the teacher saw the exploit at once: the peer panel opens after your FIRST answer and shows
every classmate's letter; "Update Answer" is allowed after any reasoning text; the grade engine scores the LATEST
row per item. So: answer anything, type "idk", read the crowd, switch. Consensus for free.

## 1. Server (roster-server `ledger.js`, `POST /ledger/record`)

For `source: 'curriculum_quiz'`: once a ledger row for (student, item, attempt) holds a non-empty response, later
writes KEEP the stored response and score (mirrors the FRQ durable floor). The reply carries
`firstAnswerKept: true`. Nothing else changes: the engine still scores "latest row per item" — the latest row is now
always the first answer. PC items are untouched (own route). Test: `roster-server/tests/ledger.test.js`.

## 2. Client (this repo, `index.html`)

- `answerKeyRevealedFor(questionId)` is the one gate. It is true only when the question's answer-key section is
  showing (the existing post-answer timer logic decides when) or the College Board section is present.
- While NOT revealed: every peer card shows the classmate's **reasoning and votes only** — no "Answer: C", no
  "→ Choice C", no correct/incorrect tint, no ✓. The MCQ distribution chart and the "Consensus reached on choice
  C" line are replaced by "Class results unlock with the answer key."
- When the key is revealed (same rules as before): letters, ✓ marks, the chart and the consensus line come back,
  and the reveal function re-renders the peer panel + chart so they appear without a reload. Since the grade is
  already fixed by then (§1), nothing shown can change it.
- Reasoning still travels with the answer only locally today (the server has no reasoning column — separate open
  bug), so peers mostly see "No explanation provided". That is the next fix, not this one.

## 3. What students should be told

"Your first answer is the one that counts. After you answer you can read what classmates wrote and change your
mind to learn, but the grade is already recorded."

## 4. Tests

`tests/peer-letters-hidden.test.js` (source pins: gate function, four letter sites, chart gate, reveal refresh) +
`roster-server/tests/ledger.test.js` (first answer kept, response + score; a fresh item records normally).
