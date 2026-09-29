# Quiz: after a wrong retry, an AI conversation that shows understanding earns half credit (spec, 2026-09-29)

Status: SPEC approved by the teacher in session ("use your best judgement… two exchanges is fine… keep the
exception"). Companion to `QUIZ_FIRST_ANSWER_SPEC.md` v2 (one explained retry; second answer is the grade).
Grade-affecting only upward (a wrong item can rise from 0 to ½). Roster server unchanged.

## 1. The rule

1. **Who:** a multiple-choice quiz item that is **settled and wrong** — the student's second answer (or a first answer
   that was wrong with the retry already used) does not match the key. Correct items and free-response items are
   not affected; the existing free-response AI review flow stays exactly as it is.
2. **What:** the student opens "Talk it through" and gets **two exchanges** with the AI. The AI's job is NOT to grade
   an appeal of the student's answer; it is to decide whether the student can explain **why the keyed answer is
   right and why their own answer is not**. Exchange 1: the AI asks (in one short prompt) for that explanation; the
   student writes. Exchange 2: the AI may ask ONE follow-up (a gap, a misconception it wants probed); the student
   writes. Then the verdict is final for that item. No third message.
3. **Verdict → credit:** `understands` → **½ credit** (0.5) on the item; `not-yet` → 0 (the grade stands). The
   existing **defensible-question exception** survives: if the AI judges the question itself ambiguous/flawed
   (`exceptionGranted`), full credit as today.
4. **Once per item.** After the verdict the panel shows it and is closed. The credit rides the existing signed
   review-grant path, so the roster server needs no change (it already accepts any credit in [0, 1] and the grade
   engine already takes max(key result, review credit)).
5. **Wording shown to the student:** "You've used your retry. Talk it through with the AI: explain why the correct
   answer is right and why yours wasn't. If you show you understand, you get half credit."

## 2. Server (`curriculum_render/railway-server/server.js`)

- New mode on the existing appeal route (keep the route; add `mode: 'understanding'` in the body, default = today's
  appeal behaviour so the free-response flow is untouched). In understanding mode:
  - the prompt (a sibling of `buildAppealPrompt`) states the question, choices, the keyed answer, the student's final
    answer, the conversation so far, and asks for JSON `{ "verdict": "understands" | "not-yet", "followUp": "<one
    question or empty>", "feedback": "<2-3 sentences to the student>", "exceptionGranted": bool }`;
  - the server tracks the exchange number (client sends `exchange: 1 | 2` and the prior turns); on exchange 1 the
    model may return `followUp` and NO verdict is final; on exchange 2 the verdict is final (a missing/invalid verdict
    = `not-yet`);
  - credit ladder for this mode: `exceptionGranted` → 1, `understands` → 0.5, else 0. Only a FINAL verdict issues a
    review grant (exchange 2, or exchange 1 when the model already returns `understands` with no follow-up — allow
    that: a clear first explanation should not be forced into a second round);
  - persist to `quiz_reviews` as today (appeal_text = the full conversation JSON, verdict, credit, feedback).
- Provider/queue/fallback behaviour identical to the appeal path (DeepSeek primary, Groq fallback; thinking off).

## 3. Client (`curriculum_render/index.html`)

- Gate: the panel appears only when `quizSettledFor(questionId)` is true AND the settled answer is wrong (compare the
  accepted/second answer to the local key). Replaces the "Request AI Review" / appeal UI for multiple-choice items
  only; free-response keeps its current buttons.
- Panel: the AI's opening prompt, a textarea, "Send" (disabled until ≥ 3 real words), an exchange counter ("1 of 2"),
  then the AI reply (follow-up or verdict). After the final verdict: "½ credit earned" / "Not yet — your grade
  stands" / "Full credit: the question was flawed", plus the AI's feedback, and the panel locks.
- Recording: on a final verdict with credit > 0, record the review grant to the roster ledger exactly as the current
  appeal path does (same source, same grant handling, offline queue included). Persist the conversation state per
  (student, item) locally so a reload shows the locked verdict and never offers a third exchange.
- Every AI/student string rendered as text (escaped), as everywhere else in the peer panel.

## 4. Tests

- Server: understanding prompt contains the key, the student's answer and the prior turns; exchange 1 with
  `followUp` issues NO grant; exchange 2 `understands` → grant credit 0.5; `not-yet` → no grant (or credit 0);
  `exceptionGranted` → 1; invalid JSON → `not-yet`; appeal mode unchanged (existing tests still pass).
- Client (runtime, jsdom, in `tests/quiz-settled-dom.test.js` or a sibling): panel absent for correct/unsettled/FRQ
  items; present for settled-wrong; Send gating; two exchanges then lock; reload keeps the lock; escaping.

## 5. What students are told

"Wrong twice isn't the end. Talk it through with the AI — explain why the right answer is right and why yours wasn't.
Show you get it and you earn half credit."
