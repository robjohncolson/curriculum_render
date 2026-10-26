# Quiz retry form: keep the student's pick, and ask when the explanation points to a different letter (spec v1, 2026-10-25)

Status: APPROVED by the teacher 2026-10-25 (both parts; "use your best judgement"). Part A shipped 2026-10-25 (cr `0389295`), the two §0 resets done the same evening, Part B shipped 2026-10-26 (the commit carrying this line); addendum 2026-10-26 shipped (the commit carrying this line). Client-only (curriculum_render `index.html` + tests); no roster-server,
ledger, migration or grade-engine change. Builds on QUIZ_FIRST_ANSWER_SPEC v2 (one explained retry = the grade),
the 2026-10-23 teacher retry reset (`POST /ledger/quiz-reset`) and `_reconcileKeptFirstAnswer` (cr `02dbe58`).
Reviewed 2026-10-25 by a six-lens adversarial pass (key leakage, state races, detector red team, UX,
implementability, completeness; 22 findings confirmed and folded in — the biggest one is §0).

Teacher (2026-10-25, in session): "on friday, a student had a problem with quiz in curriculum_render — he had
provided correct written response, but accidentally selected incorrect multiple choice. He was graded as incorrect,
and I had to do a lot to get it fixed. I wonder if we can fix this so that in the future, if anything is marked
incorrect, but has a written response, the written response should be evaluated to be sure it doesn't conflict with
what was marked on the multiple choice, and if it conflicts, then the user should be given an opportunity to fix one
or the other — simply letting the user know that their multiple choice answer and their written response are
incongruent, and that they should choose one of them to be their actual graded response." Decided in the same
session: the check runs on **every** pick, right or wrong (never only on wrong ones, see §3), and on **both** the
first answer (when an explanation was written) and the retry.

## 0. What actually happened — and why this spec has two parts

The student's case (U2-L2-Q01, 2026-10-23): first answer D (wrong); on the retry the explanation argued C (the
key) but D was recorded again. A dry run of the §4 detector over every quiz explanation in the roster ledger (105
explanations by 11 students: 64 first answers, 41 retries) found the **same shape twice more, both still graded
wrong today**:

| Student | Item | First | Retry | Explanation (verbatim) |
|---|---|---|---|---|
| a Period B student | U1-L4-Q06 | E | E | "Actually, D is the statement that is NOT supported, because Region C is about 35% of 30 days…" (key D) |
| a Period E student | U3-L2-Q06 | B | B | "C observing only" (key C) |

(This repo publishes to GitHub Pages, so names stay in the roster and the session log, not here.)

Three students "clicked the same wrong letter twice" while writing the right one. The review found the mechanism,
and it is not clumsy thumbs. **In retry mode the form re-selects the stored first answer on every repaint.**
`_applyQuizFormState` (index.html ~7572) computes `shown = _quizRetryChoice[qid] || stored` and forces every radio
to it, where `stored` is the first (wrong) answer; `_quizRetryChoice` exists only for the fresh-device reconcile
path and is deleted at the top of every `submitAnswer` (~8581). Repaints into an open retry form are frequent: every
classmate's answer on the same item (`peer:answer` → `refreshQuestionIfVisible` → `_refreshAfterReveal`) and the
30-second peer pull (`mergePeerDataIntoStores` refreshes every rendered question), plus the ledger restore. So: the
student clicks C, types the explanation (a few peer events land meanwhile), presses Submit — and the checked radio
is D again. Reproduced three ways in jsdom against the real page during the review.

Hence two parts, shipped in this order:

- **Part A (§1) — the radio keeps the student's pick.** Tiny, grade-closing, no detector involved. Covers the ~90%
  of explanations that never name a letter.
- **Part B (§2–§6) — the confirm card** the teacher asked for: when the explanation argues for a different letter
  than the one picked, ask before sending. Catches the cases Part A cannot (the student really did click the wrong
  letter) and is the safety net if a repaint path is ever missed again.

The two open cases are the teacher's call (dashboard → "Reset a quiz retry", then the student reloads and submits
their one retry). **Do the resets after Part A ships**, or the redo can fail the same way.

**Addendum 2026-10-26 (teacher test).** The teacher tried the shipped card on two U4 items and it never appeared:
"0.19 because" names option B (`0.190`) by its number, and "law of large numbers" is option D without its
article, but Step 4 wanted the option text verbatim with three words and a letter, so both read as unclear; §4 now
has R1 (the paste may drop one leading article) and R2 (a bare-number option is named by its value). The wrong
retry was recorded correctly as the picked letter, but a blue line over the "Correct answer" box read as "marked
correct", so a wrong retry now says in red "Not correct. This retry is your grade. The correct answer is shown
below." once the server accepts it, in place of the blue "waiting" line, also when a queued retry replays after a
reload (the line is read from the retry and the key, never from the old text) and when the sign-in ledger restore
finds a retry this device was still waiting on already accepted. On the fresh-device reconcile path the verdict
follows that path's own line ("… Your C was sent as your one retry. Not correct. …"), and a right retry sent there
says "✅ It is correct." in green. An item with no key on the page (a
Progress Check makeup, scored by the server) never says "Not correct": its first answer gets the plain "submitted"
line and its retry no verdict.

## 1. Part A — the retry form never overrides the student's pick

1. `_applyQuizFormState` in `first` and `retry` mode shows, in this order: the confirm-card marker's `picked` if a
   card is up (Part B); else `_quizRetryChoice[qid]` if set; else the stored answer (today's rule). What changes is
   who writes `_quizRetryChoice`: today only the reconcile path does, and every submit deletes it; after Part A the
   student's own clicks write it (rule 2) and only a submit that goes out deletes it (rule 3). So a repaint keeps the
   live pick, while a page-driven transition — a 409 revert, a ledger restore, a teacher reset — still shows the
   stored letter (`quiz-settled-dom.test.js` pins those: "rejected retry (409)" expects the first answer back,
   "a teacher reset … reopens the form" expects the kept first answer). Never "leave whatever radio is checked":
   that version was tried in review and keeps a refused letter selected after the revert. In `pending`, `checking`
   and `settled` mode nothing changes: the stored (sent) letter, radios disabled.
2. One delegated `change` listener on `document` for `input[name^="choice-"]`: in `retry` mode it records
   `_quizRetryChoice[qid] = radio.value` (the live pick survives any repaint); in every mode it clears the Part B
   marker and removes the card. The per-radio listeners in `setupQuestionActivityTracking` only log activity and are
   re-attached on every render; leave them alone.
3. `delete _quizRetryChoice[qid]` moves from the top of `submitAnswer` to just before the first state write
   (`retryState.firstAnswers[...]` / `userRecord.answers[...]`), i.e. after every early return (not signed in,
   `canRetry` false, no radio, <3-word retry explanation, the Part B card). A submit that does not go out leaves the
   pick alone.
4. Tests (`quiz-retry-pick.test.js`, real page in jsdom as in `quiz-settled-dom.test.js`): wrong first answer D;
   click C; run `refreshQuestionIfVisible(qid)` twice and `_refreshAfterReveal(qid)` once; type "the median is
   resistant"; Submit → exactly one `gradebookClient.record` with `response:'C', attempt:2`. Same with a
   `<3-word` refusal in between (the refusal must not reset the pick). The pre-fix failure is pinned directly: after
   the repaints the checked radio is still C. Pending/settled: radios disabled and showing the stored letter after a
   repaint (unchanged behaviour, pinned). The 409 revert and the teacher reset keep showing the stored letter
   (existing tests, unchanged).

Part A alone is one small commit. It ships first, then the two resets in §0 happen.

## 2. Part B — the rule

For a multiple-choice quiz item, at the moment the student presses **Submit Answer** or **Submit retry**:

1. Read the picked letter (the checked radio) and the explanation (the `reason-<id>` textarea) exactly as the submit
   path does today. If the explanation is empty (allowed on a first answer), nothing changes: submit as today.
2. Ask the detector (§4) which option the explanation **argues for**. It answers one letter, or "unclear".
3. If it answers a letter **different from the pick**, do **not** submit. Show the confirm card (§5):
   "Your explanation points to C, but you picked D. Which one is your answer?" with a button per letter.
4. The student's click decides. **C** → the radio flips to C and the submit goes out with C and the explanation as
   written. **D** → the submit goes out with D as picked. Either way exactly one submit happens, with the same
   `attempt` number the untouched flow would have used. "Let me fix my explanation" removes the card and focuses
   the textarea; the next Submit re-runs the check.
5. If the detector says "unclear" or names the picked letter, submit as today. The check never blocks a submit on
   its own, never changes a letter on its own, and never writes anything.

The check runs on the **first answer** (whenever an explanation was typed) and on the **retry** (always has one).
It runs on correct and wrong picks alike. Free-response items are untouched. It applies to every MCQ the quiz
renders through `renderQuestion`, PC26 makeup items included — nothing about what is recorded changes.

## 3. Correctness-blind, by construction

The teacher's phrasing ("if anything is marked incorrect, but has a written response") would leak the key: the
prompt appearing only after a wrong pick would tell the student "that letter is wrong" before anything is recorded,
and a student who writes their second-favourite letter in the box would get a free second guess on every item. So:

- The detector takes `(explanation, choices, pickedKey, firstAnswerKey, prompt)` and **nothing else**. `prompt` is
  the question text the student is reading (`question.prompt || ''`, a plain string; tags are stripped inside the
  function), never the question object. It never receives `question.answerKey`, `_quizKeyFor`, `getCorrectAnswer`,
  `firstAnswerWasCorrect` or `correct_answer`. A source-pin test asserts the function body references none of them
  and never touches `question.`.
- The card's copy and buttons are identical whether the pick is right or wrong. A behavioural test submits the
  correct letter with an explanation naming another letter and asserts the same card appears.
- The card shows only the two letters in question; nothing on it, in the DOM or in `localStorage` names the key.

## 4. The detector: `quizExplanationPointsTo(text, choices, pickedKey, firstAnswerKey, prompt)` → `letter | null`

Pure, synchronous, offline. Lives next to `retryReasoningReady` in `index.html`. `choices` are the item's
`choice.key` / `choice.value` pairs (every one of the 354 keyed items has five, A–E; 513 of the 1,770 values carry
LaTeX, none carries HTML). `firstAnswerKey` on a retry is `_quizRetryState().firstAnswers[qid] ??
_currentAnswerValue(qid)` — the same fallback `firstAnswerWasCorrect` uses, so the detector and the retry form
always agree on which letter is "the first answer"; `null` on a first answer.

**Step 1 — collect letter references.** Normalise curly quotes and whitespace. A reference is one of the item's keys
appearing as:

- an **uppercase** standalone token not touching letters, digits or `/`: `C`, `C.`, `(C)`, `C,`;
- any case right after a **noun cue** `option | choice | answer | letter | ans | opt | opción | respuesta | letra |
  inciso | alternativa` (optionally `:`/`#`, optionally `the | la | el`): "option c", "la respuesta es la C";
- any case **in parentheses** `(c)`, or **leading** the text `c)` / `C.` / `c -` / a bullet `- C`;
- lowercase **b–e** right after a **verb cue** `is | it's | its | be | was | pick(ed) | chose | choose | choosing |
  select(ed) | think | thought | say | said | keep | went | go(ing) | stick | stay | now | actually | definitely |
  probably | likely | guess(ed) | put | clicked | pressed | meant | want(ed) | chosen | es | sería | era | elegí |
  escogí | puse | pongo | marqué | seleccioné | creo | pienso | opté | la` (optionally followed by `be | that | it's |
  answer | option | choice`). Lowercase **a** never counts after a verb ("is a sample"), only after a noun cue
  ("option a"). The cue lists are one shared table in the code; adding a language is adding rows.
- a **change of mind**: `X -> Y`, `X → Y`, `X => Y` always; `X to Y` / `X into Y` only when `changed | switched |
  moved | swapped | went | cambié` sits within the 3 tokens before X. X is *rejected*, Y *supported*.
- a **range or comparison**: `A-D`, `A to D`, `A through D` (X before Y in the alphabet, no change cue) gives every
  letter in the range the polarity of the words around Y ("A-D are wrong" rejects all four; "compare A to B" and
  "going from A to B on the graph" support both → unclear).

Drop a reference when:

- the **uppercase `A`** has no cue: no cue word right before it, no punctuation right after it (`. , ; : ! ? )`), and
  the next word is not one of `because | since | as | bc | b/c | cuz | cause | is | was | would | will | makes | seems |
  due | which | and | but | so | for | the | it | if | when | porque | ya | pues | es | era | por | y | pero`.
  "A sample of 30…" is the article; "A." / "A, because" / "chose A" are option A.
- the previous or next token is a **number** ("5 C 2", "10 C 3" — combinatorics, never an option);
- the previous token is `a | an | got | get | getting | earned | scored` ("got a B" is a grade) or `Mr | Mrs | Ms | Dr |
  vitamin | hepatitis | grade`;
- the previous token is a **label noun** (`event(s) | group(s) | team(s) | treatment(s) | sample(s) | plan(s) | part(s) |
  machine(s) | brand(s) | type(s) | class(es) | player(s) | line(s) | route(s) | region(s) | airport(s) | station(s) |
  method(s) | model(s) | version(s) | store(s) | school(s) | agency | simulation | strain | department | condition |
  city | company | diet | drug | variety | bag | box | coin | die | histogram | graph | plot | distribution | dataset |
  study | design | survey | test | section | table | chart | curve | point | interval | variable | population | …` and
  the Spanish `grupo(s) | evento(s) | región | muestra(s) | plan(es) | tipo(s)` — one shared list in the code):
  "Region C is about 35%…", "Group B had the higher mean";
- the explanation's **`<word> X` bigram also occurs in the item's own text** ("Agency B", "letter A", "Condition B");
- it is a letter **the item itself prints as a label**: after stripping tags and LaTeX delimiters, every standalone
  uppercase A–E in the prompt or a choice text (random variable `\(B\)`, "events A and B", "Agency B", `P(A)`,
  subscripts `\mu_A`), except an `A` followed by a lowercase word (the article) — unless the reference carries an
  explicit cue word right before it ("option B", "chose B", "I think its B"). So in an item about random variable
  B, "B is the number of books so you multiply…" names nothing, while "I think its B" names B.
- it sits in **notation**: inside `P(…)`, `E[…]`, `Var(…)` (an identifier before the bracket), after `|`, or
  followed by `| ∩ ∪ ' ^ ( [`;
- it touches a **slash** (`b/c`, `a/b`, `A/B testing`; `b/c` as the next token still counts as an after-cue);
- it is a **dotted abbreviation** (`E.g.`, `C.I.`, `A.M.`) or follows `°` (`20°C`);
- it is a **lowercase** verb-cue letter in an explanation that contains `=` ("y = a + bx, the slope is b": a variable).

**R2 (2026-10-26) — a bare-number option named by its value.** An option whose whole normalised text (a string;
a number value prints differently in the browser and in Python) is a bare number (optional sign, optional leading
`$`, digits with optional thousands commas, optional decimals, optional trailing `%`, nothing else; 36 of the 354
items have one) has a value: the number, divided by 100 when it ends in `%`. A number in the explanation is a
maximal run of those characters, trailing `.`/`,` trimmed, of the same shape, outside LaTeX `\( \)` / `\[ \]`, with
only a space or plain punctuation `( ) [ ] " ' : ; ! ?` on each side: never a letter or digit (`0l19`, `x2`), a slash
or brace (a fraction, `9/51`, `\frac{9}{51}`) or any other character (`~0.19`), so no Unicode table decides it. A
number whose value equals the value of exactly one numeric option is a reference to that option **when it has a
cue**, as a plain `A` needs one: it leads the explanation alone or before a reason (`because | since | bc | b/c | cuz
| cause | porque | pues`): "0.19 because" → B when B is `0.190`, "0.19", "19% because" too; never as the subject of a
step ("0.19 is P(at least 3) so I took the complement", "5 is the intercept", "0 books has 0.35 so multiply"), a pick
word sits right before it (a noun cue, or `its | it's | picked | chose | think | guess | put | meant | want | keep |
stick | actually | probably | maybe | …`, or `is | was` right after `it` or a noun cue: "the answer is 0.19"; never
`is` alone, "the probability is 0.19" is working), it is negated by Step 2, or it continues a bare list after
another number reference ("0.19 or 0.474" names both → unclear). Anywhere else a number is a step: "1 minus 0.19",
"the complement of 0.19", "the observed count is 58", "add 0.16, 0.34, 0.29 and 0.15" name nothing. A negation
carries along a bare list of numbers of any length ("not 0.19, 0.474, 0.526, 0.81" rejects all four), and a
negation after such a list reaches back along it ("I think 0.19 and 0.474 are wrong" rejects both). Never a value the
prompt prints (read the same way but taking every run, plus N/100 for "N percent" however it is spelled: `19
percent`, `19 %`, `19 per cent`, `19-percent`, LaTeX's `\%` and its spacing `\ `; a hyphen after a digit is a dash
there, so `10-20` prints 10 and 20; "percent" followed by an ASCII letter or digit is another word: "15 percent of
callers … so 0.15" and `\(19\ \%\)` … "0.19" name nothing). Options that share a value never match. An explanation
that shows arithmetic gives no number references: an operator (`= + * × ÷`), or two numbers joined as a fraction,
ratio or product (`/` or `:` with or without spaces or brackets, `)(`, `over | out of | of | of the | in | per | times
| divided by | multiplied by | x`, or a number before `half | third | fifth | …`), never a lone `/`, which `b/c`
uses: ".55+.40 = .95 then subtract", "9 of the 38 students", "(39)(87)/91", "its 1 / 30" name a step, not the answer.
No rounding tolerance and no fractions, on purpose: "about .2" or "19/100" is working, not a pick.

**Step 2 — negation.** A reference is *rejected* rather than *supported* when:

- one of the 3 tokens before it is `not | isn't | wasn't | aren't | can't | cannot | couldn't | wouldn't | shouldn't |
  doesn't | didn't | don't | never | no | eliminate(d) | eliminating | rule | ruled | out | instead | rather | than |
  except | unless | wrong | incorrect | nor | against | without | originally | initially | first | previously |
  before | earlier | from | tampoco | nunca | excepto | vez | antes | primero | incorrecta | incorrecto | mal`
  (apostrophe-less spellings accepted);
- a verb cue sits within the 4 tokens before it and one of those negation words sits 1–2 tokens before the cue
  ("I don't really think it is C"); the scan stops at a clause break `, ; . :` ("no es la C, es la D" rejects only C);
- the token right after it is `wrong | incorrect | not | isn't | can't | cannot | doesn't | didn't | false | impossible |
  unlikely | wouldn't | fails | ignores | only | never | too | out | no | incorrecta | incorrecto | mal | tampoco | nunca`
  **and the token after that is not itself a letter** ("C wrong" rejects C; "c not d" supports C and rejects D);
- a copula or modal (`is | was | are | be | would | could | can | will | might | may | does | do | did | seems | makes |
  looks | sounds | also | still | just | really | probably | definitely | es | era | está`), or two of them, sits
  between the letter and that negation word ("C is wrong", "C does not work", "D would be wrong", "C makes no
  sense") — **except on a negative question**, i.e. a prompt containing `not | false | incorrect | least | cannot |
  never | invalid | except`, where "D is not supported" names the answer and stays supported;
- a rejected letter passes its rejection along a bare list (`, and or`): "ruled out A, B, C, D" rejects all four.

**Step 3 — the retry's own history.** On a retry, drop `firstAnswerKey` from the supported letters **and** from the
Step 4 text hits: a retry explanation naturally names, or quotes, the answer it is leaving ("I thought D at first
but the median is resistant", "I thought 'neither changes' at first…"). This can never cause a prompt: if the
student re-picks their first letter the two already agree, and if they switched, the surviving reference is the new
letter.

**Step 4 — a pasted option.** Normalise (strip tags, collapse whitespace, lowercase, drop a trailing period) each
`choice.value` with ≥12 characters, ≥3 words and a letter (never a bare number like `25%`). It is a hit when the
normalised explanation **contains it and is essentially it**: the option covers ≥70% of the explanation's length,
or the explanation has at most 3 words beyond it ("the interquartile range is the same" → B; "the range is the same
since both go from about 2 to 6, the interquartile range looks different" → nothing). A hit the words around it
reject, read by the Step 2 rules as if the option were a letter, is no hit ("not the law of large numbers", "law of
large numbers is wrong", "the law of large numbers? no"). Exactly one hit and no letter survived → that option; a
hit that conflicts with a surviving letter → unclear.

**R1 (2026-10-26) — without its article.** Each option is also tried with one leading `the ` / `a ` / `an ` removed
(after normalising). The stripped form must itself pass the ≥12 characters, ≥3 words and a letter test, and "is
essentially it" is measured against the form that matched: "law of large numbers" → D ("The law of large
numbers"). The floor stays: "addition rule because!" (option C "The addition rule", two words once stripped) is
still unclear, because the floor is what keeps a short common phrase ("the mean", "standard deviation") from
ever matching. A capital `A` is not the article when the option names another letter A–E or a copula follows it
("A and B are independent" and "A is independent of itself" keep their `A`, so "C and B are independent" and "B is
independent of itself" name nothing; "A sample of thirty students" still loses its article).

**Decision.** Exactly one supported letter → that letter. Zero, or two or more → `null` (unclear). Unclear never
prompts: "I was between C and D", "Both C and E seem correct", "not C", "I misread it", "I put D but meant C" all
submit as today (the last is a miss, never a wrong card).

**What this buys, measured.** On the 105 real explanations: 3 cards, two of them the §0 grade fixes, the third a
pasted option; 0 cards on first answers. On the review's 86 adversarial explanations (teen register, Spanglish,
probability notation, eliminations, grades, abbreviations): 2 cards a human would not show ("D would be right if
there was no outlier but there is one" → D; "the letter E is the most common letter in english…" → E) — both
dismissed with one tap, no grade effect. On 40 explanations written against real bank items with lettered entities
(random variable B, Agency B, Simulation B, strain B, populations C and F): 0. The §7 tables pin all of it.
R1 and R2 (2026-10-26, with both reviews' cue, fraction, list and rejected-paste rules) change nothing on the 105
ledger and 87 peer-table explanations (the dry run reads line for line as before them) and nothing in the 255 older
corpus rows; the JS-vs-Python differential (84,953 cases per run, two 20,000-explanation fuzz seeds) agrees on
every one.

Not in this spec: a server-side AI read for explanations that argue the content without naming a letter. It adds
seconds, a server call and an offline path to the submit button; every real case so far named its letter, and Part
A removes the mechanism that produced them.

## 5. The confirm card (client, `index.html`)

- **Where the check runs.** In `window.submitAnswer`, for MCQs only, **after** the picked letter, the explanation
  and the retry's ≥3-word check are read and **before** the first state write. Nothing is written when the card
  shows. A third parameter `submitAnswer(questionId, questionType, { congruenceConfirmed: true })` skips the check;
  only the card's two letter buttons set it, and only while the marker's `attempt` still equals the attempt the
  submit would record (a ledger restore that moved the item in between drops the card and re-checks instead).
  `submitAnswer` returns `true` when the submit went out and `false` otherwise (today it returns `undefined`
  everywhere; the three inline `onclick` callers and the reconcile call ignore the value).
- **Marker.** `_quizCongruencePrompt[qid] = { picked, pointsTo, text, attempt }` while a card is up (page-lifetime,
  like `_quizRetryChoice`; never persisted). It is cleared by: a letter button; "Let me fix my explanation"; any
  `change` on the item's radios (Part A listener); any `input` on `reason-<id>` (`_onQuizReasonInput` clears it in
  **every** form mode, before its retry-only button logic); and the start of every `submitAnswer` for that item.
  `_applyQuizFormState` also **deletes** it (and removes the card) when the mode is not `first`/`retry`, or the
  textarea's trimmed text ≠ `marker.text`, or the checked radio ≠ `marker.picked`. Invariant: a card is only ever
  shown over the exact text and pick it was computed from, and while it is up the radio shows `marker.picked`
  (Part A rule 1).
- **The card.** `renderQuestion` emits the card's **content from the marker** (not an empty host filled later) as
  the last child of the MCQ `answer-section`; `_applyQuizFormState` repaints it idempotently (rewrite only when the
  generated HTML differs from the last painted HTML kept on a dataset attribute, the `displayAnswerKey` idiom), so
  repaints neither flash nor steal focus. Markup:

  ```html
  <div id="congruence-<id>" class="congruence-card" role="group" aria-labelledby="congruence-title-<id>">
    <p id="congruence-title-<id>" class="congruence-title" tabindex="-1">
      <strong>Your explanation points to C, but you picked D.</strong> Which one is your answer?
    </p>
    <button type="button">C <span class="muted">the median is resistant to outliers…</span></button>
    <button type="button">D <span class="muted">neither changes</span></button>
    <button type="button" class="link">Let me fix my explanation</button>
  </div>
  ```

  Letters in A–E order, each with the option's text (`_escHtml`'d) in a muted line; after painting, the shared
  painter runs `MathJax.typesetPromise([host])` when MathJax is present (a third of the bank's option texts are
  LaTeX), guarded by the same dataset check. No colour or icon that could read as right/wrong; the same neutral card
  in every case.
- **Focus.** The title gets `.focus()` **once**, at the two places a card first appears — the `submitAnswer` branch
  that shows it and the `_reconcileKeptFirstAnswer` branch below — never inside `_applyQuizFormState`. That also
  scrolls the card into view on a phone, where Submit is full-width and the keyboard has just closed. After a letter
  button sends, focus moves to `success-<id>`/`grade-lock-<id>`; "fix my explanation" focuses the textarea.
- **Buttons.** A letter button: checks that radio (and the `.choice.selected` class as `_applyQuizFormState` does),
  sets `_quizRetryChoice[qid]` to it in retry mode, clears the card and marker, then calls
  `submitAnswer(qid, 'multiple-choice', { congruenceConfirmed: true })`. "Let me fix my explanation": clears card
  and marker, focuses `reason-<id>`.
- **The reconcile path.** `_reconcileKeptFirstAnswer` auto-sends the retry with `window.submitAnswer(...)` when the
  explanation is ready. It branches on the result: `true` → today's "Your C was sent as your one retry" message;
  `false` with a marker set → "The gradebook already had your first answer on this question (D). Check the question
  below and submit your one retry." and focus the card title; `false` otherwise → today's "explain what changed your
  mind … and submit" message.
- **Repaint paths, named.** `_refreshAfterReveal` (reached from every `peer:answer`, the 30-second peer pull via
  `refreshQuestionIfVisible`, and the ledger restore) → `_applyQuizFormState`: the marker and Part A rule 1 carry
  the card and the pick through it. A full `renderQuestion` rebuild happens only on topic (re)load, which also
  empties the retry textarea: the card goes with the form, nothing was recorded, the student answers again.
- **Nothing else moves.** `attempt` numbering, `_quizRetryState`, the pending → accepted → closed model,
  first-writer-wins on the server, the offline queue (the check runs before anything is queued), "Talk it through",
  the teacher reset and `firstAnswerKept` handling are untouched. The share-reasoning form (`reasoning-text-<id>`,
  used after an item is settled) is out of scope: there is no pick left to change.

## 6. What students see

Nothing new until it applies. Then one card, two letters, their call. No new orientation copy in this PR — the card
explains itself. The quiz rules students read live in follow-alongs (the Desk's "How your grade works" dialog,
`start-here.html` §Quizzes), not in cr; if the teacher later wants a line there, it is a separate follow-alongs PR
(Desk edit → `scripts/bump-build.mjs` first): "If your explanation points to a different answer than the one you
picked, we'll ask which one you mean before it counts."

## 7. Tests (cr `tests/`, Vitest + jsdom, same harness as `quiz-settled-dom.test.js`)

**Contract.** `tests/fixtures/quiz-congruence-corpus.json` — 345 rows in 68 sets: the tables below (spec:*, the
2026-10-26 teacher test and its two reviews included), the
32 Spanish/notation review cases, the 86 red-team rows (adversarial-*), the 40 rows written against real bank items
plus the §0 cases on their real items (bank:*, prompt and choices inlined from `data/curriculum.js`; letters only,
never names or ids). Every row's `expect` was computed by the Python reference `scripts/quiz-congruence-dry-run.py`
(`points_to`; advisory, not run by CI; `python -I -X utf8 scripts/quiz-congruence-dry-run.py <ledger rows json>
<peer-data json> data/curriculum.js`), and the JS port must reproduce every row — the two known residual cards
included. `humanSays` is informational. Regenerate the fixture only together with the Python.

`quiz-retry-pick.test.js` — **Part A** (§1.4).

`quiz-retry-copy-dom.test.js` — **the line under Submit** (§0 addendum): first wrong → the red first-wrong line;
wrong retry → the blue "waiting" line, then the red "This retry is your grade" line over "Correct answer: X" once
accepted, also after a re-render when a queued retry replays, and for its own 3 s when the reply lands just before
the submit line fades; still pending or refused → no key, no verdict; correct → green; the generic blue "submitted
successfully" line never appears for an MCQ with a key; a PC makeup item (no key) never says "Not correct"; an FRQ
gets the generic line. The fresh-device reconcile: a wrong retry it sends ends on its own line followed by the red
verdict, a right one on its own line in green; a pending wrong retry the sign-in ledger restore finds accepted gets
the red verdict.

`quiz-congruence.test.js` — **detector unit tests**: every fixture row (one `it` per set, naming the failing rows);
the R1 / R2 rows on the real items, with the key deleted and with a wrong key (same letters); the review's cases
with hand-written outcomes (rejected pastes, cue-less numbers, fractions, long lists, LaTeX percents, number values,
a label `A`, neighbours outside the plain list) and of its second review (a leading number that describes a step,
fractions in words and with spaces, a negation after a number list, LaTeX with a space before `\)`, prompt percents
spelled every way, a label `A` before a copula); the correctness-blind
source pins (§3); the retry fallback (`firstAnswers[qid]` absent, classData first answer present → the card for
"I accidentally chose A." does not appear).

`quiz-congruence-dom.test.js` — **runtime** (real `renderQuestion` + real `submitAnswer`, `gradebookClient.record`
captured; `window.MathJax = { typesetPromise: spy }` stubbed):

1. first answer, explanation "C because…", pick D → card "points to C … picked D"; **no** `record`; no state write
   (`classData.users.Me.answers` empty, `quizRetryState_Me` absent); `document.activeElement` is the card title;
2. click **C** → one `record` with `response:'C', attempt:1, reasoning` as typed; radio C checked;
3. click **D** instead → one `record` with `response:'D', attempt:1`;
4. "fix my explanation" → no record, textarea focused, card gone; typing → still gone; Submit again → re-checks;
5. card up in **first** mode → `input` on `reason-<id>` → card gone, marker deleted, no record;
6. the **correct** letter picked with an explanation naming another letter → the **same card** (correctness-blind);
7. **retry**: wrong first D, retry picks D again with "C observing only" → card; click C → `record` with
   `response:'C', attempt:2`, retry state pending with `value:'C'`;
8. retry explanation naming the first letter only ("I thought D at first but the median is resistant"), pick C → no
   card, one record; same with `quizRetryState_Me` absent (fallback);
9. unclear ("between C and D") → no card, one record;
10. card up → `refreshQuestionIfVisible(qid)` and `_refreshAfterReveal(qid)` → card still up, `marker.picked` still
    checked, focus not moved; `typesetPromise` called once for the host, not again on the repaint; a card is removed
    once the item is pending or settled;
11. a LaTeX option → the card's muted line contains the option text and `typesetPromise` was called with the host;
12. `_reconcileKeptFirstAnswer` with a ready explanation that names another letter: no auto-send, card shown, the
    "check the question below" message, and after a repaint the form shows `chosen`, not `kept`;
13. a card's `attempt` no longer matching (ledger restore moved the item to retry mode under a first-answer card) →
    the letter button re-runs the check instead of bypassing it;
14. the existing suites `quiz-settled-dom`, `quiz-settled-gate`, `quiz-answer-restore`, `quiz-mcq-feedback-reload`
    stay green unchanged.

### Detector corpus

Choices unless noted: A "the mean increases", B "the median is resistant to outliers so it stays about the same",
C "both change equally", D "neither changes", E "cannot be determined". Prompt: "Compare Group A and Group B."

| Explanation | Pick | First | Expect |
|---|---|---|---|
| C because the outlier pulls everything | D | – | C |
| I think it's C | D | – | C |
| (c) obviously | D | – | C |
| option c | D | – | C |
| the answer should be C | D | – | C |
| my answer is c not d | D | – | C |
| - C ⏎ - because the median resists | D | – | C |
| C | D | – | C |
| c | D | – | null |
| D. | C | – | D |
| E because the data is not given | D | – | E |
| A sample of 30 is large enough so the mean changes | D | – | null |
| chose A. | D | – | A |
| Group B had the higher mean so the answer is D | D | – | D |
| 5 C 2 = 10 ways | D | – | null |
| got a B on the last test lol | C | – | null |
| vitamin C has nothing to do with it | D | – | null |
| Dr. B said so | C | – | null |
| Type I error is rejecting a true null | D | – | null |
| its b/c the median is resistant to outliers | D | – | null |
| thats the answer b/c the mean uses every value | A | – | null |
| not C, the outlier matters | D | – | null |
| C is wrong, the median doesnt move with one outlier | B | – | null |
| C does not work here since the outlier is only one value | B | – | null |
| C is impossible bc the median is resistant | B | – | null |
| C makes no sense they dont change the same amount | A | – | null |
| I don't really think it is C | B | – | null |
| D would be right if there was no outlier but there is one | A | – | D (known residual: one dismiss) |
| I ruled out A, B, C, D | E | – | null |
| I eliminated A, B, C and E so it has to be the other one | D | – | null |
| A-D are wrong | E | – | null |
| A through D are all wrong for the same reason, the median stays | E | – | null |
| A to D dont apply | E | – | null |
| compare A to B, the second has the bigger spread | C | – | null |
| going from A to B on the graph the mean goes up | D | – | null |
| I was between C and D but the outlier matters | D | – | null |
| its between B and C, going with C | C | – | C |
| I put D but meant C | D | – | null |
| the median is resistant to outliers so it stays about the same | D | – | B |
| I think the median is resistant to outliers so it stays about the same | D | – | B |
| the mean increases and the median also increases by the same amount | C | – | null |
| it cannot be determined whether the outlier is high or low, but either way the median holds | B | – | null |
| I thought D at first but the median is resistant so C | C | D | C |
| I thought D at first but the median is resistant | C | D | null |
| D is still right because the outlier only affects the mean | D | D | null |
| changed from D to C after rereading | C | D | C |
| I accidentally chose A. | C | A | null |
| I misread it | C | D | null |
| I thought 'neither changes' at first but the median is resistant | C | D | null |
| keeping D because C is wrong | D | D | null |
| es la C porque la mediana no cambia | D | – | C |
| opción c | D | – | C |
| yo elegí C | D | – | C |
| creo que es la c | D | – | C |
| no es la C, es la D | D | – | D |
| en vez de D ahora C | C | D | C |
| la media cambia con el valor atípico | D | – | null |
| A mi me parece que la mediana no cambia | D | – | null |

Prompt "Events \(A\) and \(B\) are independent with \(P(A) = 0.3\) and \(P(B) = 0.4\). What is \(P(A \cap B)\)?",
choices A 0.12, B 0.30, C 0.42, D 0.58, E 0.70:

| Explanation | Pick | First | Expect |
|---|---|---|---|
| P(A) = 0.3 so it's D | D | – | D |
| P(A) = 0.3 | D | – | null |
| A and B are independent so multiply: 0.3 * 0.4 = 0.12 | A | – | null |
| B is more likely than A | C | – | null |
| P(B\|A) = P(B) = 0.4 | C | – | null |
| A∩B = 0.12 | C | – | null |
| since A and B are independent the answer is C | D | – | C |
| I think its B | C | – | B |

Prompt "Let the random variable \(B\) represent the number of books a student buys. What is the expected value of
\(B\)?", choices A 0, B 1.00, C 1.79, D 3.50, E 28:

| Explanation | Pick | First | Expect |
|---|---|---|---|
| B is the number of books so you multiply each value by its probability and add | C | – | null |
| E(B) = sum of each value times its probability = 1.79 | C | – | null |
| the expected value of B is the mean of the distribution, 1.79 | C | – | null |
| B is binomial so np | A | – | null |
| I think its B | C | – | B |

Prompt "Which statistic is the same for both distributions?", choices A "The range", B "The interquartile range",
C "The median", D "The mean", E "The standard deviation":

| Explanation | Pick | First | Expect |
|---|---|---|---|
| the range is the same since both go from about 2 to 6, the interquartile range looks different | A | – | null |
| the interquartile range is the same | A | – | B |
| The interquartile range | A | – | B |

Prompt "The chart shows relative frequencies of rainy days in five regions over 30 days. Which statement is NOT
supported by the chart?", choices "Region A had rain on more than 25 days" … "Region E had no rain":

| Explanation | Pick | First | Expect |
|---|---|---|---|
| Actually, D is the statement that is NOT supported, because Region C is about 35% of 30 days | E | E | D |
| Region C is only about 35% of 30 days, so D is not supported | D | D | null |
| C is not supported, region C is under 25 days | D | – | null |
| A is false so A | A | – | null |

Prompt "The least-squares line is height = 50 + 2.5(age). Interpret the slope.", choices A "the predicted height
increases by 2.5 cm per year" …:

| Explanation | Pick | First | Expect |
|---|---|---|---|
| in y = a + bx the slope is b so 2.5 is per year | A | – | null |
| slope is b and the intercept is a, slope = 2.5 per year predicted | A | – | null |
| option b is the intercept, I want A | A | – | null |

Prompt "Agency A reports 0.55 and Agency B reports 0.40 of households own a dog. If 0.15 use both agencies, what
proportion use at least one?", choices A 0.15, B 0.40, C 0.55, D 0.80, E 0.95:

| Explanation | Pick | First | Expect |
|---|---|---|---|
| Agency B is only .40 so you cant just add, you need the overlap | C | – | null |
| agency B .40, agency A .55, .55+.40 = .95 then subtract | D | – | null |
| I think its B | C | – | B |

Teacher test 2026-10-26 (`spec:teacher-test-2026-10-26/*`; the first two rows of each item table are the real ones). U4-L2-Q01
(prompt prints "15 percent", "1,000", "8", "10", "2"), choices A `0.150`, B `0.190`, C `0.474`, D `0.526`, E `0.810`:

| Explanation | Pick | First | Expect |
|---|---|---|---|
| 0.19 because | A | – | B |
| 0l19 because I like | C | A | null |
| 0.19 because I like | C | A | B |
| 0.190 | A | – | B |
| 19% because | A | – | B |
| 15 percent of callers wait so 0.15 | B | – | null |
| 0.15 because | B | – | null |
| 0.19 or 0.474 | A | – | null |
| not 0.19, it is 0.474 | A | – | C |
| \(0.19\) because | A | – | null |
| x0.19 because | A | – | null |
| 0.19 because 0.15 + 0.04 = 0.19 | A | – | null |

U4-L2-Q02 (sentence options): "0 to 6 because!" (pick E) → null. U4-L2-Q03, choices A "The conditional probability
rule", B "The multiplication rule", C "The addition rule", D "The law of large numbers", E "The property of mutually
exclusive events":

| Explanation | Pick | First | Expect |
|---|---|---|---|
| addition rule because! | B | – | null (R1 floor: two words) |
| law of large numbers | B | B | D |
| the law of large numbers | B | B | D |
| law of large numbers | B | – | D |
| conditional probability rule | D | – | A |
| multiplication rule | D | – | null |

The spread item above ("The range" … "The standard deviation"), pick A: "mean", "the mean", "standard deviation",
"interquartile range" → null; "the standard deviation" → E. Percent options (U4-L2-Q01's prompt; A `15%`, B `19%`,
C `47.4%`, D `52.6%`, E `81%`), pick A unless noted: "0.19 because" → B, "19% because" → B, "19 because" → null,
"0.15 because" (pick B) → null, "0.474 or 52.6%" → null. Shared value (A `0.5`, B `50%`, C `0.25`, D `1`, E `2`):
"0.5 because half" and "50%" (pick C) → null; "0.25 because" (pick A) → C.

The review of R1 / R2 (`spec:fix-round-1/*`, 2026-10-26), every row null unless noted. U4-L2-Q03, pick B: "not law of
large numbers", "law of large numbers is wrong", "the law of large numbers? no", "not the law of large numbers";
"I think the law of large numbers" → D. U4-L2-Q01: pick E "1 minus 0.19", "the complement of 0.19", "at least 3
callers is 0.19, so at most 2 is the rest"; pick A "not 0.19, 0.474, 0.526, 0.81", "I ruled out 0.19, 0.474, 0.526
and 0.81", "0.19" followed by U+1C89; pick A "its 0.19" → B, "the answer is 0.19" → B, "I think it is 0.474" → C.
U8-L4-Q02: "9/51" (pick B), "9/38 because 9 out of 38" (pick A). U2-L8-Q02: "its 1/30" (pick E), "the slope is the
estimate next to diameter, the 5 is the intercept, 2.50 is its standard error" (pick A). U4-L10-Q03: "add 0.16,
0.34, 0.29 and 0.15" (pick E). U8-L4-Q01: "the observed count is 58 but expected uses the totals" (pick E). Options
0.1 … 0.5: "not 0.1, 0.2, 0.3, 0.4" (pick E), "0.3 or 0.4 or 0.5" (pick A). Prompt "The rate is \(19\%\). Find its
complement.", A `0.19`, B `0.81`, C `19`, D `75%`, E `0.5`: "0.19 is the given rate" (pick B), "19/100 because" (pick
A); "its 0.81" (pick A) → B. Number values (A 0.000001, B `0.5`, C `0.25`, D `19`, E 0.19 as numbers where not
quoted): "0.000001 because", "its 0.19" (pick B); "its 19" (pick B) → D. Events A, B and C (C "A and B are
independent"): "C and B are independent" (pick D), "and C are mutually exclusive" (pick B).

The second review of R1 / R2 (`spec:fix-round-2/*`, 2026-10-26), every row null unless noted. U4-L2-Q01: pick E
"0.19 is P(at least 3) so I took the complement", "0.19 and 0.474 are wrong", "I think 0.19 and 0.474 are wrong";
pick A "its \(0.19 \) because", "the answer is \(0.19 \)"; "0.19, because" (pick A) → B. A number that describes a
step, on its real item: U2-L8-Q02 "5 is the intercept and 30 the slope" (pick A), U4-L10-Q03 "0.15 is the last bar so
I added up to 3" (pick E), U1-L8-Q01 "50 is the max but Q3 is 35" (pick D), U4-L8-Q01 "0 books has 0.35 so multiply"
(pick C), U1-L10-Q07 "32% is outside so half" (pick C). Fractions: U8-L4-Q03 "(39)(87)/91", "(39)(87)/91 because row
times column" (pick B); U8-L4-Q02 "9 divided by 51" (pick B), "9 / 38", "9 of the 38 students", "(9)/(38)" (pick A),
"9 times 38 over 153" (pick E); options A `1`, B `0.5`, C `0.2`, pick B: "its 1 / 30", "its 1 in 5", "its 1:5", "its 1
fifth"; "its 1" → A. Options A `0.19`, B `0.81`, pick B: "0.19 because" with the prompt "The rate is 19 percent"
followed by U+1C89, "its 0.19" with `\(19\ \%\)`, "19-percent" and "19 per cent". Events A and B, C "A is
independent of itself": "B is independent of itself" (pick A).

Also pin, from the real bank: U4-L8-Q01 (random variable \(B\)), U4-L6-Q03 (Agency A/B), U5-L3-Q01 (Simulation
A/B), U3-L5-Q01 (strain A/B), U6-L11-Q09 (populations C and F): "B is the number of books…", "Agency B is only
.40…", "simulation B will be narrower", "strain B gets its own technician…", "C minus F was 0.62…" → null.

## 8. Lanes and order

1. **Part A** — Opus 5.5 implements (one small commit on cr master, `scripts/bump-build` as for every cr push);
   Codex gpt-6-astra reviews with "make the radio lose the student's pick"; Fable gates and pushes. Then the
   teacher does the two §0 resets.
2. **Part B** — Opus 5.5 implements (detector + card + tests, one PR); Codex gpt-6-astra reviews with the brief
   "make the card show after a wrong pick only, or leak the key, or lose a submit, or double-submit, or survive into
   a settled item, or show over a different text/pick than it was computed from" plus the corpus; Fable gates and
   pushes.

No server deploy in either part. Grade-affecting only in the sense that fewer wrong letters will be recorded.
