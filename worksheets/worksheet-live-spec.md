# Live Worksheet Conversion Spec (HTML → Interactive + Peer Bars)

## Goal
Take a static follow-along worksheet HTML and make it live: submit answers to the existing Railway/Supabase `answers` table, show peer distributions in a slide-out drawer, and link it into the main app.

## Prereqs
- Keep blanks as `<input class="blank" data-answer="...">`.
- Chart.js available via CDN.
- Railway config present (`railway_config.js`, `railway_client.js`) and `USE_RAILWAY=true`.

## Steps (per worksheet)
1) **Set worksheet ID**  
   In script, set `const WORKSHEET_ID = 'WS-<Unit><Lesson>'` (e.g., `WS-U3L4`).

2) **User inputs**  
   Add name/username/class fields. Username is required for live submit.

3) **Scripts to include**  
   ```html
   <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
   <script src="../railway_config.js"></script>
   <script src="../railway_client.js"></script>
   ```

4) **Assign question IDs**  
   `assignQuestionIds()` iterates `.blank` and sets `data-question-id` to `${WORKSHEET_ID}-Q#`.

5) **Live submit**  
   - Debounce blur/Enter events (`handleLiveUpdate` → `sendAnswer` → `railwayClient.submitAnswer` or REST `/api/submit-answer`).
   - Normalize answers before send.
   - Show a small “✓ saved” indicator next to the blank; animate a small upward particle to confirm send.

6) **Peer fetch + drawer**  
   - Add a single slide-out drawer (fixed right).  
   - Add a “Class answers” button per question to open the drawer for that question.  
   - Fetch `/api/question-stats/:id`; render a bar chart in the drawer.  
   - Do **not** seed or highlight correct answers in the chart (peers only).  
   - On refresh, animate a small “snowflake” particle to show new peer data.

7) **Preserve grading**  
   Override `window.checkAnswers`/`window.showAnswers` to call the originals, then submit all answers and refresh the aggregate.

8) **Link into app**  
   In `data/units.js`, add a resource entry for the lesson:  
   `{ url: "worksheets/<file>.html", label: "Live Worksheet (HTML, interactive)" }`

## UX cues
- Submit: “✓ saved” next to the blank + upward particle.  
- Peer data: snowflake near the drawer when new data is fetched.  
- Drawer: only opens when the per-question button is clicked; keeps the worksheet flow clean.

## Checklist
- [ ] WORKSHEET_ID set and applied to blanks.  
- [ ] Username input present and remembered in localStorage.  
- [ ] Scripts (Chart.js + Railway) included.  
- [ ] Live submit on blur/Enter with debounce and indicator.  
- [ ] Drawer + per-question “Class answers” buttons working.  
- [ ] Aggregate bars show only submitted answers (no correct seeds).  
- [ ] checkAnswers/showAnswers still grade locally, then push/refresh.  
- [ ] Linked in `data/units.js` for the target lesson.

## Minimal prompt you can reuse
“Convert this static worksheet HTML to a live version using the existing Railway/Supabase answers pipeline. Assign stable question IDs as WS-<Unit><Lesson>-Q#, wire blur/Enter to submit via railway_client (or fallback REST), add a per-question ‘Class answers’ button that opens a right-side drawer with a Chart.js bar chart of peer answers (no correct-answer seeding). Keep checkAnswers/showAnswers intact, but after grading, push answers and refresh the drawer. Add username inputs, a brief ‘✓ saved’ indicator per blank, and small send/receive particles. Finally, add a link entry in data/units.js for the lesson labeled ‘Live Worksheet (HTML, interactive)’.” 
