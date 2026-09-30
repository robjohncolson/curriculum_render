# Quiz MCQ reveal: one box, no repeats — spec (teacher 2026-09-29)

## Why

Once a multiple-choice item is settled, the page shows THREE things: the "Answer Key" box, the
"🏛️ College Board Official Explanation" box and the consensus chart. The first two repeat the
correct letter, and on items with no explanation the College Board box prints filler
("Official explanation not available for this question. You got it right!") — even when the
student got it wrong. The reveal design predates the one-retry rule and "Talk it through".

Facts (verified 2026-09-29):
- 326 of 354 MCQs in `data/curriculum.js` carry an explanation (`reasoning` field, read by
  `getOfficialExplanation`); 28 have none (e.g. `U1-L7-Q02`).
- FRQs never reach the MCQ reveal: `displayAnswerKey` returns into `displayFRQSolution` on its
  first branch, and the FRQ on-load path calls `displayCollegeBoardExplanation` from its own
  branch in `renderQuestion`.

## Rule (multiple-choice only, after the item is SETTLED)

| Answer that counts | Shows |
|---|---|
| Correct | Chart + peers. If an explanation exists: ONE collapsed line **"Why this is right ▸"** (a `<details>`) that expands to the explanation. No letter, no "Answer Key" heading. No explanation → nothing. |
| Wrong (retry used, settled) | ONE box: **"Correct answer: B"** + the explanation if one exists. No filler text. ("Talk it through" asks why the key is right — the student must see it.) |
| Not settled | Nothing (unchanged). |

- "The answer that counts" = `_currentAnswerValue(questionId)` vs the key (`_quizAnswerMatchesKey`).
- The College Board box (`college-board-explanation-<id>`) is never shown for an MCQ; if it exists
  (older code created it), it is hidden.
- The single box is the existing `answer-key-<id>` host; its `display` stays the settled signal
  (`block` when there is something to show).
- Repaints are frequent (every peer update runs `_refreshAfterReveal`): the box must NOT rewrite
  its content when nothing changed, so an expanded "Why this is right" stays expanded.
- Explanations may contain MathJax (`\( ... \)`): typeset the box after its content changes.
- Explanation text is trusted curriculum content (inserted as today); the letter is escaped.

## Out of scope / DON'T

- FRQ solution display, `displayFRQSolution`, the FRQ branch of `renderQuestion`, and
  `displayCollegeBoardExplanation` itself (still used by that FRQ branch) — unchanged.
- The settled gate (`quizSettledFor`), peers, chart, "Talk it through" — unchanged.
- No new timers, no CSS framework changes beyond a few rules for the new line.

## Tests

- Correct + explanation: box shown, contains a collapsed `<details>` "Why this is right" with the
  explanation, does NOT contain the letter line or "Answer Key"; College Board box not shown.
- Correct + no explanation: box hidden.
- Wrong settled + explanation: box shows "Correct answer: B" + explanation; no filler text.
- Wrong settled + no explanation: letter only, no filler.
- Expanded `<details>` survives a repaint (`_refreshAfterReveal`).
- Unsettled: hidden (existing tests).
- FRQ: `displayAnswerKey` still routes to `displayFRQSolution` (existing pin).
