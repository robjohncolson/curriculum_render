# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AP Statistics Consensus Quiz - a collaborative learning web app where students answer quiz questions and see peer responses in real-time.

## Development Commands

```bash
# Frontend - no build step, serve static files
python -m http.server 8000
# or: npx http-server

# Railway Server (Node 18+ required)
cd railway-server
npm install
npm start              # Production
npm run dev            # Dev with auto-reload

# Test server endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/peer-data
curl http://localhost:3000/api/question-stats/U1-L3-Q01

# Run tests (Vitest)
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:ui        # Browser UI

# Analyze FRQ chart requirements (Node.js script)
node scripts/analyze_frq_charts.js
# Outputs: docs/analysis/frq_chart_inventory.{json,csv}
```

## Architecture

**Three-tier storage with fallback chain:**
1. **IndexedDB** (primary) - structured data in `answers`, `reasons`, `attempts`, `charts`, `peerCache` stores
2. **localStorage** (fallback) - dual-write during transition for backward compatibility
3. **Supabase** (optional cloud sync) - real-time peer data via Railway server cache proxy

**Key architectural decisions:**
- Storage abstraction layer (`js/storage/`) with `DualWriteAdapter` pattern enables IDB+localStorage dual-write
- `classData` object is an in-memory view rebuilt from IDB stores via `rebuildClassDataView()`
- Railway server reduces Supabase queries by 95% (360/hr → 12/hr for 30-student class)
- All storage operations are async; use `await waitForStorage()` before data access

## Module Dependencies

Load order matters (see `index.html` script tags):
1. CDN libs (Chart.js, MathJax, Supabase client, QRCode)
2. Config files (`supabase_config.js`, `railway_config.js`)
3. Storage layer (`js/storage/*.js` → `index.js` initializes adapters)
4. **Diagnostics** (`js/diagnostics.js` - Phase 1 logging)
5. **Network Manager** (`js/network_manager.js` - tier detection, LAN discovery)
6. Core modules (`js/charts.js`, `railway_client.js`)
7. Sprite system (`js/sprite_sheet.js` → `canvas_engine.js` → entities → `sprite_manager.js`)
8. Data files (`data/curriculum.js`, `data/units.js`, `data/chart_questions.js`)
9. Inline script in `index.html` (app initialization)

## Diagnostics System (Phase 1)

Local-first diagnostic logging for debugging "disappeared work" issues.

**Purpose:** Capture structured events around save/load/sync operations to diagnose why students report lost work.

**Storage:** IDB `diagnostics` store with circular buffer (max 1000 events).

**Key Functions:**
- `logDiagnosticEvent(eventType, details)` - Main logging entry point
- `getDiagnostics({ limit, since })` - Retrieve events for debugging
- `exportDiagnostics()` - Export all events as JSON
- `clearDiagnostics()` - Clear all events (testing)

**Instrumented Events:**
| Event | Where | What it captures |
|-------|-------|------------------|
| `answer_save_attempt` | `saveAnswer()` | questionId, target backend |
| `answer_save_success` | `saveAnswer()` | questionId, elapsed_ms |
| `answer_save_failure` | `saveAnswer()` | questionId, error details |
| `answer_load_attempt` | `initClassData()` | username, source |
| `answer_load_result` | `initClassData()` | count, source, empty_load |
| `sync_flush_attempt` | `flushAnswerQueue()` | pending_count |
| `sync_flush_result` | `flushAnswerQueue()` | success, synced_count |
| `supabase_connection_test` | `testSupabaseConnection()` | attempt, success |

**Configuration:** `DiagnosticsConfig` in `js/diagnostics.js`:
```javascript
DiagnosticsConfig.ENABLED = true;       // Enable/disable logging
DiagnosticsConfig.DEBUG_CONSOLE = false; // Log to console
DiagnosticsConfig.MAX_EVENTS = 1000;     // Circular buffer size
```

**Debug Console Access:**
```javascript
// View recent diagnostics
await getDiagnostics({ limit: 50 });

// Export all diagnostics
const data = await exportDiagnostics();
console.log(JSON.stringify(data, null, 2));
```

## Verification UI (Phase 2)

Visual feedback system for save/load/sync operations to reduce student anxiety about "disappeared work."

**Components:**

| Component | Purpose | Location |
|-----------|---------|----------|
| Save Toast | Confirms saves (2s auto-hide) | Fixed bottom-right |
| Offline Banner | Alerts when working offline | Fixed top |
| Load Progress | Spinner/progress bar during load | Modal overlay |

**UI State Object:** `window.uiState`
```javascript
uiState.save.status    // 'idle' | 'saving' | 'saved_local' | 'saved_cloud' | 'save_failed'
uiState.save.lastPayload  // Full payload for retry support
uiState.load.status    // 'idle' | 'loading' | 'restoring' | 'complete' | 'failed'
uiState.sync.status    // 'idle' | 'syncing' | 'synced' | 'sync_failed' | 'offline' | 'recovering'
uiState.sync.lastAnswerSyncedAt  // Timestamp of last successful sync
```

**UI Events (CustomEvent):**
| Event | Dispatched From | Payload |
|-------|-----------------|---------|
| `ui:save:start` | `saveAnswer()` | `{ questionId, payload }` |
| `ui:save:success` | `saveAnswer()` | `{ questionId }` |
| `ui:save:failure` | `saveAnswer()` | `{ questionId, error }` |
| `ui:load:start` | `initClassData()` | `{ username }` |
| `ui:load:complete` | `initClassData()` | `{ username, count, source }` |
| `ui:sync:start` | `processSyncOutbox()` | `{ count }` |
| `ui:sync:success` | `processSyncOutbox()` | `{ count, timestamp }` |
| `ui:sync:failure` | `processSyncOutbox()` | `{ error }` |

**Retry Logic:**
- Retries failed operation twice (1 second delay)
- After 3 failures, triggers full sync (initClassData + cloud restore if available)
- Manual retry via toast button for persistent failures

**Key Functions:**
- `showSaveToast(status, message, showRetry)` - Display save confirmation
- `showLoadProgress(message, showProgressBar, current, total)` - Show load overlay
- `handleSaveRetry()` / `handleLoadRetry()` / `handleSyncRetry()` - Retry handlers

## Sync Hardening (Phase 3)

Persistent outbox-based sync system that survives page refreshes, network failures, and browser restarts.

**Key Changes from Phase 2:**
- In-memory `answerSyncQueue` replaced with IDB `outbox` store
- `saveAnswer()` enqueues to persistent outbox (already did this)
- `processSyncOutbox()` processes items with exponential backoff
- `recoverPendingSync()` recovers items on page load

**Outbox Record Schema:**
```javascript
{
    id: number,              // Auto-increment
    opType: 'answer_submit',
    payload: { username, questionId, value, timestamp },
    status: 'pending' | 'in_flight' | 'failed',
    attempts: number,
    lastAttemptAt: number,
    lastError: string | null
}
```

**Backoff Schedule:**
| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 5 seconds |
| 3 | 15 seconds |
| 4 | 60 seconds |
| 5+ | 5 minutes (cap) |

**Sync Triggers:**
- After answer save (debounced)
- On page load (recovery)
- On `online` network event
- On tab visibility change (focus)
- Timer every 60 seconds

**Configuration:** `SyncConfig` object in index.html
```javascript
SyncConfig.BATCH_SIZE         // 10 - max items per flush
SyncConfig.SYNC_INTERVAL_MS   // 60000 - background sync interval
SyncConfig.SYNC_ON_FOCUS      // true - sync when tab gains focus
SyncConfig.OUTBOX_WARN_SIZE   // 50 - warning threshold
SyncConfig.OUTBOX_MAX_SIZE    // 100 - hard cap
```

**New Diagnostic Events:**
| Event | Details |
|-------|---------|
| `outbox_enqueue` | `{ questionId, outboxId, queueSize }` |
| `outbox_flush_start` | `{ itemCount, itemIds }` |
| `outbox_item_success` | `{ itemId, questionId }` |
| `outbox_item_failure` | `{ itemId, questionId, error, attempt }` |
| `outbox_recovery_start` | `{ pendingCount }` |
| `outbox_recovery_complete` | `{ recoveredCount, failedCount }` |
| `network_online` / `network_offline` | `{}` |

**New UI Events:**
- `ui:sync:recovering` - Dispatched during startup recovery

**Key Functions:**
- `processSyncOutbox()` - Main sync processor with backoff
- `recoverPendingSync()` - Startup recovery
- `triggerSyncFromOutbox()` - Debounced sync trigger
- `checkOutboxAndSync()` - Size check and scheduling

**Storage Methods (IndexedDBAdapter):**
- `markOutboxInFlight(ids)` - Mark items as in-flight
- `markOutboxFailed(ids, error)` - Mark items as failed
- `markOutboxSynced(ids)` - Remove successfully synced items
- `getOutboxPending()` - Get items ready for retry (respects backoff)
- `getOutboxFailedCount()` - Count permanently failed items

## Key Global Variables

- `currentUsername`: Active user's Fruit_Animal identifier
- `classData`: In-memory cache of user data (rebuilt from IDB on load)
- `storage`: Initialized storage adapter (access via `getStorage()` or `waitForStorage()`)
- `TURBO_MODE`: Whether Supabase sync is enabled (from `supabase_config.js`)
- `USE_RAILWAY`: Whether to use Railway caching proxy (from `railway_config.js`)
- `frqPartState`: In-memory state manager for progressive multi-part FRQs
- `FeatureFlags`: Runtime feature toggles (see Feature Flags section)

## Feature Flags

**`FeatureFlags`** object in index.html controls runtime behavior:

```javascript
FeatureFlags = {
    USE_INCREMENTAL_QUESTION_RENDER: true  // Phase 3D: Keyed list diffing (5x faster)
}
```

**Incremental Question Rendering (Phase 3D):**
- Enabled by default since Phase 3D-4
- Uses `DOMUtils.updateList()` for keyed diffing instead of full innerHTML replacement
- Preserves focus and text selection during updates
- DOM structure: `.question-wrapper[data-key]` wraps each question card
- Validation: Add `?debug=1` to URL, then `validateRenderers()` in console
- Benchmark: `benchmarkRenderers(100)` compares legacy vs incremental performance

See `docs/state-machines.md` section 10 for full documentation.

## Data Structures

**Question IDs**: Format `U{unit}-L{lesson}-Q{number}` (e.g., `U1-L3-Q01`)

**User data in classData.users[username]:**
```javascript
{
  answers: { questionId: { value, timestamp } },
  reasons: { questionId: string },
  timestamps: { questionId: number },
  attempts: { questionId: number },
  charts: { chartId: data },
  currentActivity: { state, questionId, lastUpdate }
}
```

**Progressive FRQ Answer Format:**
```javascript
// Multi-part FRQs store structured answers
{
  value: {
    parts: { "a": "answer a", "b-i": "answer b-i", ... },
    currentPart: "c",              // Currently active part (null if done)
    completedParts: ["a", "b-i"],  // Submitted parts in order
    allComplete: false             // True when all parts submitted
  },
  timestamp: 1704067200000
}
```

## Progressive Multi-Part FRQ System

Multi-part FRQs use an accordion-based progressive disclosure pattern:

**State Machine:**
- `locked` → Part not yet accessible (grayed out, 🔒 icon)
- `current` → Active part for answering (blue border, expanded)
- `completed` → Part submitted (green border, collapsed, can expand to edit)
- `allComplete` → All parts done, grading available

**Key Functions (in index.html):**
- `frqPartState.initialize(questionId, parts)` - Set up or restore state
- `frqPartState.submitPart(questionId, partId, answer, allPartIds)` - Submit one part
- `renderProgressiveFRQParts(questionId, parts)` - Generate accordion HTML
- `transitionToNextPart()` - Animate from completed to next part
- `finalSubmitFRQ(questionId)` - Trigger grading when all parts done

**Backward Compatibility:**
Legacy single-string answers are detected (`typeof value === 'string'`) and treated as fully complete.

See `docs/state-machines.md` for full state diagram.

## MCQ Retry Policy

**Policy:** Unlimited attempts with reasoning requirement (no max attempt cap).

- **MCQs:** Unlimited attempts, but reasoning required after first attempt
- **FRQs:** Unlimited attempts, no reasoning requirement

**Key Function:** `canRetry(questionId)` in index.html
- Returns `true` for FRQs always
- Returns `true` for first MCQ attempt
- Returns `true` for MCQ retries only if reasoning was provided

**UI States:**
- First attempt: "Submit Answer"
- Retry allowed: "Update Answer"
- Retry blocked (no reasoning): "Add Reasoning to Retry" (disabled)

See `STATE_MACHINES.md` section 6 for flow diagram.

## AI Grading Escalation System

Three-tier escalation system for fair, AI-augmented grading with student appeals.

**Tiers:**
1. **Tier 1 (Auto-Grade)** - MCQ exact match, FRQ regex/rubric pattern matching (instant)
   - Correct MCQ: Shows yellow "partial" styling with "Reasoning pending" badge (not green "excellent")
   - Prompts student to click "Verify My Understanding" for AI evaluation of reasoning
2. **Tier 2 (AI Review)** - Groq llama-3.3-70b-versatile via Railway server (30s timeout)
   - `requestAIReview()` uses direct fetch to `/api/ai/grade` (bypasses GradingEngine for simplicity)
   - If reasoning already exists, skips reasoning form and sends directly to AI
3. **Tier 3 (Appeal)** - Student explains reasoning, AI re-evaluates

**Scoring:** E (Essentially Correct), P (Partially Correct), I (Incorrect)

**Critical Rule:** AI can only UPGRADE scores, never downgrade. This protects students from AI hallucinations.

**Plain Language Responses:** AI prompts explicitly instruct the model to avoid framework codes (like "UNC-2.A"), learning objective IDs, and curriculum jargon. Feedback uses student-friendly language focusing on statistical concepts.

**AI Review for Correct Answers:** Students can request AI review even when their answer is correct (button shows "Verify My Understanding"). This helps students who may have guessed correctly or used test-taking strategies verify they actually understand the concept. If reasoning was submitted with the answer, clicking the button sends it directly to AI without prompting for additional input.

**Conditional Solution Display:** When AI grading succeeds, the rubric/answer key is hidden to encourage students to rely on AI feedback. Solutions only appear as a fallback when AI fails. Check `result._aiGraded` and `result._error` to determine visibility.

**Key Functions:**
- `gradeMCQAnswer(questionId, answer, isCorrect)` - MCQ grading with escalation UI
- `gradeFRQAnswer(questionId, answer)` - Single-part FRQ grading
- `gradeMultiPartFRQ(questionId, partsAnswers)` - Progressive FRQ grading
- `showReasoningForm(questionId, questionType)` - Shows reasoning form OR calls requestAIReview directly if reasoning exists
- `requestAIReview(questionId, questionType)` - Direct fetch to `/api/ai/grade` for MCQ AI review
- `showAppealForm(questionId)` / `hideAppealForm(questionId)` - Toggle appeal form
- `submitAppeal(questionId, questionType)` - Submit appeal to Railway
- `displayGradingFeedback(questionId, result)` - Render E/P/I feedback (handles loading→result transition)

**Data Storage:**
```javascript
window.gradingResults[questionId] = {
    score: 'E' | 'P' | 'I',
    feedback: "...",
    matched: [...],
    missing: [...],
    answer: "...",
    questionType: 'multiple-choice' | 'free-response',
    _aiGraded: true | false,  // True if AI was used successfully
    _error: "..." | undefined, // Error message if AI failed
    _provider: 'groq',
    _model: 'llama-3.3-70b-versatile'
};
```

**Railway Endpoints:**
- `POST /api/ai/grade` - AI grading request
- `POST /api/ai/appeal` - Appeal processing (with framework context injection)
- `POST /api/ai/chat` - Redox Signaling AI tutor (for edgar-redox-signaling project)

See `STATE_MACHINES.md` section 13 for complete flow diagrams

## AP Framework Context System

The appeal system injects lesson-specific context from the AP Statistics Course and Exam Description to enable AI responses that reference specific learning objectives and essential knowledge.

**Framework Data:** `data/frameworks.js` contains all 9 AP Statistics units with complete lesson coverage:
- Unit 1: Exploring One-Variable Data (10 lessons)
- Unit 2: Exploring Two-Variable Data (9 lessons)
- Unit 3: Collecting Data (7 lessons)
- Unit 4: Probability, Random Variables, and Probability Distributions (12 lessons)
- Unit 5: Sampling Distributions (8 lessons)
- Unit 6: Inference for Categorical Data: Proportions (11 lessons)
- Unit 7: Inference for Quantitative Data: Means (9 lessons)
- Unit 8: Inference for Categorical Data: Chi-Square (6 lessons)
- Unit 9: Inference for Quantitative Data: Slopes (5 lessons)

**Key Functions:**
- `parseQuestionId(questionId)` - Parse `U4-L2-Q01` → `{unit: 4, lesson: 2, question: 1}`
- `getFrameworkForQuestion(questionId)` - Get lesson framework from question ID
- `buildFrameworkContext(framework)` - Generate context string for AI prompts

**Framework Data Structure:**
```javascript
UNIT_FRAMEWORKS[4].lessons[2] = {
  topic: "Estimating Probabilities Using Simulation",
  skills: ["3.A: Determine relative frequencies..."],
  learningObjectives: [{
    id: "UNC-2.A",
    text: "Estimate probabilities using simulation",
    essentialKnowledge: ["UNC-2.A.5: The relative frequency...", "UNC-2.A.6: Law of large numbers..."]
  }],
  keyConcepts: ["Relative frequency = count/total", ...],
  keyFormulas: [...],
  commonMisconceptions: [...]
}
```

**Appeal Response Enhancement:** With framework context, AI appeal responses naturally reference lesson concepts (e.g., "relative frequency," "law of large numbers") rather than giving generic feedback.

See `docs/state-machines.md` section 4 for framework context injection flow diagram.

## Configuration

**Enable Supabase sync:** Edit `supabase_config.js` with project URL and anon key. Schema reference in `docs/supabase_schema.sql` (context only, not executable).

**Enable Railway server:** Set `USE_RAILWAY = true` and `RAILWAY_SERVER_URL` in `railway_config.js`. Deploy `railway-server/` to Railway.app with `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars.

## Auto Cloud Restore

When a user logs in with a username that has no local data but exists in Supabase, the app automatically offers to restore their progress. This solves the "lost progress" problem when users clear browser storage or switch devices.

**Trigger conditions (all must be true):**
1. User enters a valid Fruit_Animal username
2. No local answers exist for this username (IDB + localStorage empty)
3. Turbo mode is active (WebSocket connected)
4. Cloud has data for this username (Supabase answer count > 0)

**Key functions:**
- `checkAndOfferCloudRestore(username)` - Main orchestrator, called after username acceptance
- `hasLocalData(username)` - Checks IDB + localStorage for existing answers
- `getCloudAnswerCount(username)` - Queries Supabase for user's answer count
- `performAutoRestore(username)` - Executes restore with progress UI

See `docs/state-machines.md` section 8 for the full state diagram.

## Identity Claim Resolution System

Resolves orphaned usernames (usernames with answers but no registered user) by prompting likely candidates and handling merge logic automatically.

**Use Case:** A student submits work under "Cherry_Lemon" before properly registering, then registers as "Mango_Panda". The teacher identifies Cherry_Lemon as orphaned and creates a claim targeting likely candidates (students with zero/few answers).

**Flow:**
1. Teacher creates identity claim for orphan username, selecting candidate students
2. Candidates see modal on next login: "Are you also [orphan]?"
3. Resolution based on responses:
   - One yes, one no → Auto-merge data into confirming user
   - Both yes → Notify teacher for manual resolution
   - Both no → Mark as confirmed orphan (unknown student)

**Username Normalization (Orphan Prevention):**
Usernames are auto-normalized to Title_Case on login to prevent case-sensitivity orphans:
- `apple_monkey` → `Apple_Monkey`
- `BANANA_FOX` → `Banana_Fox`

**Orphan Stats Display:**
The orphan list shows curriculum vs worksheet breakdown to help identify real students:
- `curriculumCount` - Answers matching `U#-L#-Q##` pattern
- `worksheetCount` - Answers matching `WS-*` pattern
- `units` - Unique unit numbers covered (e.g., `['U1', 'U2']`)
- Sorted by curriculum count (real students first)
- Blue highlight + "HAS CURRICULUM" badge for orphans with curriculum answers

**Database Tables:**
- `identity_claims` - Stores orphan/candidate pairs with responses
- `teacher_notifications` - Alerts for conflicts and resolutions

**API Endpoints (Railway server):**
- `POST /api/identity-claims` - Create claim (teacher only)
- `GET /api/identity-claims/:username` - Check for pending claims on login
- `POST /api/identity-claims/:id/respond` - Submit yes/no response
- `GET /api/identity-claims/orphans` - List orphaned usernames with stats
- `GET /api/students` - Get registered students with real names
- `GET /api/notifications/:username` - Get teacher notifications

**Key Functions:**
- `normalizeUsername(name)` - Convert to Title_Case (auth.js)
- `createIdentityClaim(orphan, candidates, teacher)` - Teacher initiates claim
- `checkPendingClaims(username)` - Client checks on login, shows modal if pending
- `respondToClaim(claimId, response)` - Student submits response
- `resolveClaimsForOrphan(orphan)` - Run resolution logic after all respond
- `mergeUserData(fromUser, toUser)` - Execute Supabase UPDATE for merge

**Security:**
- Only teachers can create claims
- Candidates cannot be the orphan username
- All claims timestamped for audit trail

See `docs/state-machines.md` section 9 for the full state diagram.

## Database Schema (Supabase)

Core tables: `users`, `answers` (PK: username+question_id), `badges`, `user_activity`, `votes`

## Testing

```bash
# Vitest (recommended)
npm test                    # Run all tests once
npm run test:watch          # Watch mode for development
npm run test:coverage       # Generate coverage report
```

**Test Suites (667 tests covering all STATE_MACHINES.md features):**

| Test File | Coverage |
|-----------|----------|
| `question-rendering.test.js` | **Phase 3D** MCQ/FRQ structure, Progressive FRQ accordion, Chart FRQ, edge cases |
| `grading-engine.test.js` | GradingEngine class, E/P/I scoring, appeals |
| `escalation.test.js` | Escalation UI, MCQ/FRQ grading, solution display |
| `progressive-frq.test.ts` | Multi-part FRQ state machine |
| `storage-layer.test.js` | IDB/localStorage init, dual-write, migration |
| `user-auth.test.js` | Username generation, validation, auth states |
| `data-management.test.js` | classData lifecycle, answers, reasons, attempts |
| `quiz-consensus.test.js` | Quiz flow, peer aggregation, percentages |
| `websocket-railway.test.js` | WebSocket connection, turbo mode, reconnection |
| `sprite-system.test.js` | Animation states, physics, peer sprites |
| `chart-system.test.js` | Chart types, config building, instances |
| `export-import.test.js` | Recovery packs, validation, merge logic |
| `error-handling.test.js` | Storage/network errors, fallback chains, outbox |
| `redox-chat.test.js` | Redox AI tutor system prompt, page structure, brevity |
| `curriculum-data.test.js` | Units/topics structure, blookets, pdfs, resource URLs |
| `framework-context.test.js` | AP framework data, question ID parsing, context generation |
| `auto-cloud-restore.test.js` | Auto-restore detection, cloud count check, restore flow |
| `identity-claim.test.js` | Orphan detection, claim creation, response handling, merge logic |

**Test Coverage Areas:**
- Question rendering: MCQ/FRQ structure, Progressive FRQ accordion, Chart FRQ deferred rendering, edge cases
- Storage layer: IDB availability, dual-write adapter, migration key parsing
- User authentication: Fruit_Animal usernames, session states, duplicate detection
- Data management: classData initialization, answer/reason persistence, attempt counting
- Quiz flow: State transitions, answer correctness, submission processing
- Peer consensus: Answer aggregation, percentage calculation, most popular detection
- WebSocket/Turbo: Connection states, message handling, exponential backoff
- Sprite system: IDLE/JUMPING/SUSPENDED/FALLING states, hue resolution, positioning
- Auto cloud restore: Local data detection, cloud count queries, restore prompts, error handling
- Chart system: Type mapping, config building, instance management
- Export/Import: Pack building, validation, timestamp-based merge conflict resolution
- Error handling: Fallback chains, outbox retry logic, graceful degradation
- Curriculum data: Unit/topic structure validation, blooket URLs, PDF/worksheet links, resource consistency
- Framework context: Question ID parsing, framework lookup, context string generation, appeal prompt integration
- Identity claims: Orphan detection, claim creation/response, auto-merge logic, teacher notifications

## Deployment

- **Frontend**: Any static host (GitHub Pages, Netlify)
- **Railway server**: Node.js 18+ host with `SUPABASE_URL`, `SUPABASE_ANON_KEY` env vars (ES modules)

## Directory Notes

- `data/`: Curriculum data files (`curriculum.js`, `units.js`, `frameworks.js` for AP framework context)
- `worksheets/`: Standalone HTML files for specific lesson activities (e.g., `u3l67.html` for Unit 3 Lessons 6-7)
- `scripts/`: Node.js utilities for analysis and data processing
- `docs/`: Integration guides, sync documentation, state machines, and SQL schema reference
- `tests/`: Vitest test suites and browser-based test runner
- `railway-server/`: Express.js caching proxy for Supabase

## Multi-Tier Network Architecture

The app supports three network tiers with automatic fallback:

```
TIER 1: TURBO MODE (Internet available)
  → Railway server → Groq API + Supabase
  → Full AI grading, cloud sync, real-time peers

TIER 2: LAN MODE (Internet down, LAN up)
  → Teacher's computer running local Qwen tutor
  → Students enter short code (e.g., "1-42")
  → Local AI tutoring/grading, no cloud dependency

TIER 3: OFFLINE MODE (No network)
  → IndexedDB only, pattern-based auto-grading
  → Sync when back online
```

**NetworkManager Module:** `js/network_manager.js`

| Property/Method | Description |
|-----------------|-------------|
| `currentTier` | Current tier: 'turbo', 'lan', or 'offline' |
| `lanIP` | Resolved LAN server IP (e.g., "192.168.1.42") |
| `lanCode` | Short code entered by student (e.g., "1-42") |
| `initialize()` | Load saved config, detect tier, start periodic check |
| `detectTier()` | Check Turbo → LAN → Offline in order |
| `getAIEndpoint()` | Returns `{url, type: 'groq'|'qwen'}` or null |
| `getTutorEndpoint()` | Returns LAN tutor URL or null |
| `testLANConnection(code)` | Test and save LAN code |
| `disconnectLAN()` | Clear LAN config and redetect tier |

**Short Code System:** The last two octets of teacher's IP are encoded as a short code:
- Teacher's IP: `192.168.1.42` → Code: `1-42`
- Student enters `1-42`, app tries `192.168.1.42`, `10.0.1.42`, `172.16.1.42`

**UI Components:**
- **LAN Setup Modal:** FAB menu → "LAN" button, or auto-prompted when internet fails
- **Tutor Chat Panel:** Fixed sidebar (collapsed by default), visible only in LAN mode
- **Sync Status Indicator:** Shows 🏠📡 LAN Tutor (orange) when in LAN mode

**Event:** `networkTierChanged` dispatched on tier transitions with `{newTier, oldTier}` detail.

**localStorage Keys:**
- `LAN_TUTOR_CODE` - Saved short code
- `LAN_TUTOR_IP` - Resolved IP (cached)

**See:** `docs/network-tiers-plan.md` for full implementation details.

## AP Statistics Tutor Integration

Local fine-tuned Qwen models for conversational tutoring support.

**Tutor Server:** `C:\Users\rober\Downloads\Projects\not-school\apstats-rag\server.py` (port 8765)

**Available Models:**
| Model | Speed | Use Case |
|-------|-------|----------|
| `qwen3-0.6b` | ~30s | Fast responses, good for most questions |
| `qwen3-1.7b` | ~140s | Higher quality for complex topics |
| `qwen2.5-1.5b` | ~130s | Alternative, stable performance |
| `qwen2.5-0.5b` | ~25s | Fastest, basic responses |

**LAN Access:** Server now binds to `0.0.0.0` and displays LAN IP on startup. Students can connect via the network IP when internet is unavailable.

**Integration Plan:** See `docs/tutor-integration-plan.md`

**Planned Endpoints:**

*Via Railway (Turbo Mode):*
- `POST /api/tutor/chat` - Proxied to local tutor
- `GET /api/tutor/status` - Check availability

*Direct LAN (LAN Mode):*
- `GET http://<teacher-ip>:8765/ask?q=...` - Direct query
- `GET http://<teacher-ip>:8765/status` - Model status
- `GET http://<teacher-ip>:8765/health` - Connection test

**Key Difference from Groq:**
- Groq (llama-3.3-70b): Used for grading and appeals - evaluates student work
- Local Qwen: Used for tutoring - teaches concepts conversationally

**Running the LAN Tutor (Classroom Workflow):**
```bash
# On teacher's computer
cd C:\Users\rober\Downloads\Projects\not-school\apstats-rag
python server.py

# Output shows:
#   Tutor UI:   http://192.168.1.42:8765
#   Quiz App:   http://192.168.1.42:8765/quiz
#
#   STUDENT INSTRUCTIONS:
#   Go to: http://192.168.1.42:8765/quiz
```

**Note:** The tutor server now serves the quiz app at `/quiz`. This is the recommended way to use LAN mode because:
- App loads over HTTP (no HTTPS mixed content issues)
- LAN mode auto-configures (no manual IP entry needed)
- Storage APIs (IndexedDB, localStorage) work properly

**HTTPS Limitation:** LAN mode cannot work from GitHub Pages (HTTPS) due to browser mixed content blocking. Always use the tutor server's `/quiz` endpoint for offline classroom use.

## Key Documentation

| Document | Purpose |
|----------|---------|
| `docs/state-machines.md` | All state machine diagrams and transitions |
| `docs/network-tiers-plan.md` | Multi-tier network fallback (Turbo/LAN/Offline) |
| `docs/tutor-integration-plan.md` | Fine-tuned Qwen tutor integration |
| `docs/sync_ux_plan.md` | Cloud sync UX improvement plan |
| `docs/chart-wizard-usage.md` | Chart creation wizard documentation |
| `tests/README.md` | Test suite documentation |
