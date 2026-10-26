# Quiz: the first answer is the grade; the retry is removed (spec v1, 2026-10-26)

Status: implemented 2026-10-26, awaiting the orchestrator gate

## 0. Decision

Teacher decision, 2026-10-26 evening, hours after the half-credit rule shipped (`follow-alongs/QUIZ_RETRY_HALF_CREDIT_SPEC.md`): **remove the quiz retry.** One answer per keyed question; the first answer is the grade. **Keep** the optional explanation box and the explanation-vs-pick check (the rule-based detector and the DeepSeek read behind the confirm card), and **extend the read to explanations of any length**.

Why. Every item has five options, so any graded retry is a second draw: at full credit a pure guesser's expected score goes from 20% to 40%, at half credit to 30%. Only one graded answer removes the loophole. The check is not retry machinery. It never sees the key, it fires before anything is recorded, and it exists for the student who writes the right reasoning and clicks the wrong letter. A live probe on 2026-10-26 showed it fires the same way when both the click and the explanation are wrong.

## 1. Rules

1. A keyed multiple-choice item takes **exactly one graded answer**, the first one the ledger records (first-writer-wins stays). After it the item is settled: the page says correct or not correct, reveals the key, and offers "Talk it through with the AI". No retry form, no second submit, no retry pick.
2. **Historical retries** (attempt-2 rows recorded before the cutoff) stay as graded, at full credit through the grandfather branch of `quizCredit`. The half-credit branch stays in the code but can no longer fire, because retries close at the same instant; a one-line comment at `quizCredit` says so.
3. **Server guard** (`follow-alongs/roster-server/ledger.js`): `POST /ledger/record` for a `curriculum_quiz` row with attempt 2 recorded at or after `QUIZ_RETRIES_CLOSED_FROM = '2026-10-27T04:00:00Z'` (midnight EDT ending Monday 2026-10-26, the same instant as the half-credit cutoff) is refused through `refuseQuizRetry` with the new reason `retries-closed`, same shape as the other reasons. Attempt 1 is unchanged. `POST /ledger/quiz-reset` stays as a teacher tool; after the cutoff a reset gives nothing back, and its comment says so. The constant lives in `grade-config.js` next to `QUIZ_RETRY_HALF_CREDIT_FROM`; tests reach it through `configOverrides` or the route's injectable clock, whichever the ledger tests already use.
4. **Explanation check, any length.** The rule is unchanged: the detector first, then the AI read when the detector is silent. The floor drops to one real word: `QUIZ_CONGRUENCE_READ_MIN_WORDS = 1` in `index.html` and `CONGRUENCE_MIN_WORDS = 1` in `railway-server/quiz-congruence.js` (a token with a letter or digit; an empty or punctuation-only box sends nothing). The card offers the clicked letter and the letter the explanation names; the student chooses before anything is recorded. Correctness-blind as before. Decision 1 of `QUIZ_CONGRUENCE_AI_READ_SPEC.md` ("a card for a retry arguing its own first answer") is moot.
5. **Reconcile** (`/ledger/record` answers 409 `firstAnswerKept` because a fresh device answered before its ledger restore landed): the page shows the kept answer as settled with the line "The gradebook already had your first answer on this question (A). That answer stands." Nothing is re-sent to the ledger; the typed explanation (it argued for the dropped letter) is cleared, and the peer server gets the kept letter so classmates see what the gradebook has.
6. **A retry in flight at deploy** (old page, attempt 2 reaching the server after the cutoff, or replayed from the offline queue): the refusal `retries-closed` settles the item on the page from the ledger, with "Retries have closed; your first answer stands." once a ledger read lands and shows a first answer (a failed read is tried again after 5 s, 30 s and 2 min; no line before). Other refusal reasons repaint without the line. No error loop, nothing left in the queue.

## 2. The quiz page (`curriculum_render/index.html`): what goes, what stays

**Goes:** retry mode and its form, lock line, buttons and labels; the retry pick map and the new-click rule (`_quizRetryPicks`, `_quizRetryFirstLetter`, `_quizRetrySubmitReady`, the first-answer tag); `canRetry`; `_quizEffectiveAttempts` (new writes are always attempt 1); the `retries` half of the retry state (`firstAnswers` may stay only where the reconcile or restore still needs it); `_sayWrongRetryRecorded`, `_quizRetrySentText`, `_sayKeptFirstAnswerStands`, every `QUIZ_RETRY_*` text and the half-credit texts shipped 2026-10-26; the AI-read retry logic (first-answer letter, `congruenceAiSkip` on the reconcile auto-send); replaying a queued attempt 2 (a refusal settles, see rule 6); the "you have used your retry" wording.

**Stays:** the optional explanation box on the first answer, with the hint "Optional: say why, in your own words. It protects you from a mis-click."; the detector block between `// ── Explanation ↔ pick congruence` and `// ── end congruence ──`, untouched; the AI read and the confirm card for first answers; the settled view and the reveal (`_mcqRevealHtml`); the talk-it-through line, reworded "Talk it through with the AI: explain why the correct answer is right and why yours was not."; peers-after-settled; the ledger restore, which still shows a historical attempt-2 row as that item's settled answer; first-writer-wins handling; FRQ items; the PC flow (its route and server scoring). A PC makeup item also takes one answer: its second submit came only through the retry form, which goes, and the PC route is best-wins, so a second submit was a second draw.

**Copy.** Correct first answer: "✅ Correct answer submitted!" unchanged. Wrong first answer: "Not correct. The correct answer is shown below." in red, then the reveal.

**Specs.** `QUIZ_FIRST_ANSWER_SPEC.md` gets a header note "Retry removed 2026-10-26, see QUIZ_RETRY_REMOVAL_SPEC.md; sections on the retry describe history." `QUIZ_INCONGRUENCE_CHECK_SPEC.md` and `QUIZ_CONGRUENCE_AI_READ_SPEC.md` get the same one-line note under their status lines; nothing else in them is rewritten. `scripts/quiz-congruence-ai-calibrate.mjs` header: the floor is `CONGRUENCE_MIN_WORDS` (1 since this change).

## 3. follow-alongs

- `roster-server/ledger.js`: the `retries-closed` guard (rule 3). `roster-server/grade-config.js`: `QUIZ_RETRIES_CLOSED_FROM`. `roster-server/scoring.js`: the comment at `quizCredit` (rule 2). Bundle: `grade-config.js` is bundled, so regenerate `grade-engine.bundle.js` (and list any new export in `scripts/build-grade-engine.mjs` if another bundled module imports it).
- Desk (`ap_stats_roadmap_square_mode.html`) and `start-here.html`: the grade-rules copy and the Quiz Done tooltip say "one answer per question; the first answer is the grade"; the half-credit wording added 2026-10-26 goes. The half renderer may stay (historical rows never show a half, so it is harmless) or go with its test; smallest diff wins. After any Desk edit run `npm run gitnexus:shadow` and include the regenerated shadow.
- Teacher surfaces: grep `teacher-dashboard.html`, `teacher-classroom.html`, `teacher-roster-console.html` and the Desk teacher fold for retry or quiz-reset copy and say retries are closed where it states the rule.
- Tests: ledger route tests (attempt 2 before the cutoff accepted, at and after refused with `retries-closed`, attempt 1 unchanged, quiz-reset unchanged); golden masters byte-identical; `tests/grade-engine-bundle-parity.test.js`; `npm run test:quick`; `cd roster-server && npm test`.

## 4. Tests (curriculum_render)

Delete the retry-only suites (`quiz-retry-pick`, `quiz-retry-click-dom`, `quiz-retry-copy-dom`) and the retry sections of the others. Keep or rewrite, booting the real page in jsdom: right and wrong first answer copy and reveal; the card on a first answer, including a one-word explanation through the AI read; the AI read with no floor (one real word sends, an empty box does not); the kept-first reconcile line; the ledger restore with a historical attempt-2 row; the `retries-closed` refusal settling the item; FRQ unaffected; PC takes its first answer and refuses a second. Full suite green.

## 5. Rollout

Both pushes the same evening, outside class blocks: follow-alongs (roster-server redeploys) and curriculum_render (GitHub Pages plus the cr Railway server for the floor). Cutoff midnight EDT. Teacher announcement Tuesday 2026-10-27: one answer per quiz question, the first answer is the grade, write a short why if you like, it protects you from a mis-click.
