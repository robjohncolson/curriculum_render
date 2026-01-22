# State Machines Documentation

This document describes all state machines and state management patterns in the AP Statistics Consensus Quiz application.

---

## 1. Progressive Multi-Part FRQ State Machine

### Overview
Manages the sequential answering of multi-part Free Response Questions. Students must complete each part before the next unlocks. Grading only occurs after all parts are submitted.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROGRESSIVE FRQ STATE MACHINE                        │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   START     │
                              └──────┬──────┘
                                     │
                      ┌──────────────┴──────────────┐
                      │   frqPartState.initialize() │
                      │   Check for saved answer    │
                      └──────────────┬──────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
     ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
     │  NO SAVED      │    │  PROGRESSIVE   │    │    LEGACY      │
     │  ANSWER        │    │    FORMAT      │    │    FORMAT      │
     │                │    │                │    │                │
     │ currentPart=   │    │ Restore from   │    │ allComplete=   │
     │ parts[0].id    │    │ saved state    │    │ true           │
     │ completedParts │    │                │    │ All parts      │
     │ = []           │    │                │    │ marked done    │
     └───────┬────────┘    └───────┬────────┘    └───────┬────────┘
             │                     │                     │
             └──────────┬──────────┘                     │
                        ▼                                │
              ┌─────────────────┐                        │
              │   PART ACTIVE   │◀───────────────────────┘
              │   (current)     │         (if legacy, show as complete)
              └────────┬────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌─────────────────┐        ┌─────────────────┐
│ submitPartAnswer│        │ updatePartAnswer│
│ (new submission)│        │ (edit completed)│
└────────┬────────┘        └────────┬────────┘
         │                          │
         ▼                          │
┌─────────────────┐                 │
│ Save to storage │◀────────────────┘
│ - classData     │
│ - localStorage  │
│ - IndexedDB     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update state:   │
│ - parts[id]=ans │
│ - completedParts│
│   .push(id)     │
│ - Find next     │
│   incomplete    │
└────────┬────────┘
         │
         ├───────────────────┐
         │                   │
         ▼                   ▼
┌─────────────────┐  ┌─────────────────┐
│ MORE PARTS LEFT │  │  ALL COMPLETE   │
│                 │  │                 │
│ currentPart =   │  │ currentPart =   │
│ next incomplete │  │ null            │
│ allComplete =   │  │ allComplete =   │
│ false           │  │ true            │
└────────┬────────┘  └────────┬────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│ transitionTo    │  │ Show final      │
│ NextPart()      │  │ submit button   │
│                 │  │                 │
│ - Collapse done │  │ [View Grading   │
│ - Expand next   │  │  Feedback]      │
│ - Animate       │  │                 │
│ - Scroll        │  └────────┬────────┘
└────────┬────────┘           │
         │                    ▼
         │           ┌─────────────────┐
         │           │ finalSubmitFRQ()│
         │           │                 │
         │           │ - displayFRQ    │
         │           │   Solution()    │
         │           │ - gradeMulti    │
         │           │   PartFRQ()     │
         │           └────────┬────────┘
         │                    │
         └─────────┬──────────┘
                   │
                   ▼
              ┌─────────┐
              │   END   │
              └─────────┘
```

### States

| State | Description | UI Representation |
|-------|-------------|-------------------|
| `locked` | Part not yet accessible | Gray border, 🔒 icon, disabled textarea |
| `current` | Active part for answering | Blue border, ● icon, expanded, enabled |
| `completed` | Part submitted | Green border, ✓ icon, collapsed, editable |
| `allComplete` | All parts done | Final submit button visible |

### Data Structure

```javascript
// In-memory state (frqPartState.questions[questionId])
{
    parts: {
        "a": "Answer for part a",
        "b-i": "Answer for part b-i",
        // ...
    },
    currentPart: "b-ii",           // null if allComplete
    completedParts: ["a", "b-i"],  // Ordered by submission
    allComplete: false,            // True when all parts done
    legacyAnswer: null             // Set if migrated from old format
}

// Storage format (classData.users[username].answers[questionId])
{
    value: {
        parts: { ... },
        currentPart: "b-ii",
        completedParts: ["a", "b-i"],
        allComplete: false
    },
    timestamp: 1704067200000
}
```

### Transitions

| From | Event | To | Actions |
|------|-------|-----|---------|
| `locked` | Previous part submitted | `current` | Remove lock, enable input, animate slide-in |
| `current` | `submitPartAnswer()` | `completed` | Save answer, collapse, add to completedParts |
| `completed` | Click header | `expanded` | Toggle content visibility |
| `completed` | `updatePartAnswer()` | `completed` | Update saved answer |
| Any | All parts done | `allComplete` | Show "View Grading Feedback" button |

### Backward Compatibility

Legacy answers (single string) are detected by:
```javascript
if (typeof savedAnswer.value === 'string') {
    // Treat as allComplete with legacyAnswer set
}
```

---

## 2. Question Answer State Machine

### Overview
Manages the lifecycle of answering individual questions (MCQ or single-part FRQ).

### State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUESTION ANSWER STATE MACHINE                 │
└─────────────────────────────────────────────────────────────────┘

                         ┌─────────────┐
                         │ UNANSWERED  │
                         └──────┬──────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
             ┌────────────┐          ┌────────────┐
             │    MCQ     │          │    FRQ     │
             └─────┬──────┘          └─────┬──────┘
                   │                       │
                   ▼                       ▼
          ┌────────────────┐      ┌────────────────┐
          │ Select choice  │      │ Enter text     │
          │ + reasoning    │      │ (no reasoning) │
          └───────┬────────┘      └───────┬────────┘
                  │                       │
                  ▼                       ▼
          ┌────────────────┐      ┌────────────────┐
          │ submitAnswer() │      │ submitAnswer() │
          └───────┬────────┘      └───────┬────────┘
                  │                       │
       ┌──────────┼──────────┐            │
       │          │          │            │
       ▼          ▼          ▼            ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ CORRECT │ │ WRONG   │ │ WRONG   │ │ANSWERED │
  │         │ │ w/      │ │ w/o     │ │(FRQ)    │
  │         │ │ reason  │ │ reason  │ │         │
  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
       │          │          │            │
       │          │          │            │
       │    ┌─────┴─────┐    │            │
       │    │CAN RETRY  │    │            │
       │    │(attempts  │    │            │
       │    │ < 3)      │    │            │
       │    └─────┬─────┘    │            │
       │          │          │            │
       ▼          ▼          ▼            ▼
  ┌─────────────────────────────────────────────┐
  │               ANSWERED                       │
  │  (stored in classData.users[].answers[])    │
  └─────────────────────────────────────────────┘
```

### States

| State | Description | attempts | reasoning |
|-------|-------------|----------|-----------|
| Unanswered | No answer submitted | 0 | N/A |
| Correct | MCQ correct | 1+ | Optional |
| Wrong+Reason | MCQ wrong with reasoning | 1-2 | Required for retry |
| Wrong-NoReason | MCQ wrong, no reasoning | 1-2 | Must add to retry |
| MaxAttempts | MCQ, 3 attempts reached | 3 | N/A |
| Answered (FRQ) | FRQ submitted | N/A | N/A (unlimited edits) |

---

## 3. Sync Status State Machine

### Overview
Tracks the synchronization state between local storage and Supabase cloud.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      SYNC STATUS STATE MACHINE                   │
└─────────────────────────────────────────────────────────────────┘

         ┌──────────────┐
         │   OFFLINE    │◀─────────────────┐
         │   ☁️✗        │                  │
         └──────┬───────┘                  │
                │                          │
                │ Network available        │ Network lost
                ▼                          │
         ┌──────────────┐                  │
         │   IDLE       │──────────────────┤
         │   ☁️✓        │                  │
         └──────┬───────┘                  │
                │                          │
                │ New answer/data          │
                ▼                          │
         ┌──────────────┐                  │
         │   SYNCING    │──────────────────┤
         │   ☁️🔄       │                  │
         └──────┬───────┘                  │
                │                          │
       ┌────────┼────────┐                 │
       │        │        │                 │
       ▼        ▼        ▼                 │
  ┌────────┐ ┌────────┐ ┌────────┐         │
  │SUCCESS │ │ ERROR  │ │TIMEOUT │         │
  │        │ │  ☁️⚠️  │ │        │         │
  └───┬────┘ └───┬────┘ └───┬────┘         │
      │          │          │              │
      │          │    ┌─────┘              │
      │          ▼    ▼                    │
      │     ┌──────────────┐               │
      │     │    RETRY     │───────────────┘
      │     │   (backoff)  │
      │     └──────────────┘
      │
      ▼
┌──────────────┐
│  ALL SYNCED  │
│    ☁️✓       │
└──────────────┘
```

### States

| State | Icon | Description |
|-------|------|-------------|
| `offline` | ☁️✗ | No network connection |
| `idle` | ☁️✓ | Connected, no pending sync |
| `syncing` | ☁️🔄 | Upload/download in progress |
| `downloading` | ☁️⬇️ | Restoring from cloud |
| `error` | ☁️⚠️ | Sync failed |
| `all_synced` | ☁️✓ | Everything synchronized |

---

## 4. AI Grading Escalation State Machine

### Overview
Manages the 3-tier grading system with appeal capability.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  AI GRADING ESCALATION STATE MACHINE             │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   SUBMIT    │
                    │   ANSWER    │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  TIER 1:    │
                    │  Regex/     │
                    │  Rubric     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         ┌────────┐   ┌────────┐   ┌────────┐
         │   E    │   │   P    │   │   I    │
         │(done)  │   │escalate│   │escalate│
         └────────┘   └───┬────┘   └───┬────┘
                          │            │
                          └─────┬──────┘
                                ▼
                    ┌─────────────────┐
                    │    TIER 2:      │
                    │    AI Grading   │
                    │    (Groq LLM)   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         ┌────────┐    ┌────────┐     ┌────────┐
         │   E    │    │   P    │     │   I    │
         │(done)  │    │(appeal)│     │(appeal)│
         └────────┘    └───┬────┘     └───┬────┘
                           │              │
                           └──────┬───────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │       TIER 3:             │
                    │    Student Appeal         │
                    │   (AI reconsideration)    │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
               ┌────────┐   ┌────────┐    ┌────────┐
               │UPGRADE │   │ HOLD   │    │CONFIRM │
               │ P → E  │   │   P    │    │   I    │
               └────────┘   └────────┘    └────────┘
```

### Scoring Values

| Score | Label | Points | Can Appeal |
|-------|-------|--------|------------|
| E | Essentially Correct | 3 | No |
| P | Partially Correct | 2 | Yes |
| I | Incorrect | 1 | Yes |

### Framework Context Injection

When students appeal, the AI receives lesson-specific context from the AP Statistics Course and Exam Description framework. This enables more precise, educational feedback that connects student reasoning to specific learning objectives.

```
┌─────────────────────────────────────────────────────────────────┐
│              FRAMEWORK CONTEXT INJECTION (APPEALS)               │
└─────────────────────────────────────────────────────────────────┘

     ┌─────────────────┐
     │  Student        │
     │  submits appeal │
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  Parse question │
     │  ID: U4-L2-Q01  │
     │  → unit=4       │
     │  → lesson=2     │
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐      ┌─────────────────────────────────┐
     │  getFramework   │─────▶│  data/frameworks.js             │
     │  ForQuestion()  │      │  - Topic 4.2: Simulation        │
     └────────┬────────┘      │  - Skills: 3.A                  │
              │               │  - LO: UNC-2.A                  │
              │               │  - EK: Law of Large Numbers...  │
              │               │  - Key Concepts                 │
              │               │  - Common Misconceptions        │
              │               └─────────────────────────────────┘
              ▼
     ┌─────────────────┐
     │ buildFramework  │
     │ Context()       │
     │                 │
     │ Generates:      │
     │ - Unit/Topic    │
     │ - Skills        │
     │ - Learning Obj  │
     │ - Essential     │
     │   Knowledge     │
     │ - Key Concepts  │
     │ - Formulas      │
     │ - Misconceptions│
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │ buildAppeal     │
     │ Prompt()        │
     │                 │
     │ Injects context │
     │ into AI prompt  │
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │ AI generates    │
     │ response that   │
     │ references:     │
     │ - Lesson        │
     │   concepts      │
     │ - Essential     │
     │   knowledge     │
     │ - Specific      │
     │   terminology   │
     └─────────────────┘
```

### Question ID Format

| Pattern | Example | Parsed Result |
|---------|---------|---------------|
| `U{unit}-L{lesson}-Q{number}` | `U4-L2-Q01` | unit=4, lesson=2, question=1 |

### Framework Data Structure

```javascript
// data/frameworks.js
UNIT_FRAMEWORKS = {
  4: {
    title: "Probability, Random Variables, and Probability Distributions",
    examWeight: "10-20%",
    lessons: {
      2: {
        topic: "Estimating Probabilities Using Simulation",
        skills: ["3.A: Determine relative frequencies..."],
        learningObjectives: [{
          id: "UNC-2.A",
          text: "Estimate probabilities using simulation",
          essentialKnowledge: [
            "UNC-2.A.5: The relative frequency of an outcome...",
            "UNC-2.A.6: The law of large numbers states..."
          ]
        }],
        keyConcepts: ["Relative frequency = count/total", ...],
        keyFormulas: [...],
        commonMisconceptions: [...]
      }
    }
  }
}
```

### AI Response Enhancement

With framework context, AI appeal responses:
- Reference specific concepts (e.g., "relative frequency," "law of large numbers")
- Connect student reasoning to learning objectives
- Identify which essential knowledge the student demonstrates or misses
- Use lesson-appropriate terminology naturally

---

## 5. User Authentication State Machine

### Overview
Manages user identification via Fruit_Animal username pattern.

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER AUTH STATE MACHINE                       │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │  NO USER    │
                    │(prompt mode)│
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
     ┌────────────────┐       ┌────────────────┐
     │ Select from    │       │ Create new     │
     │ dropdown       │       │ username       │
     └───────┬────────┘       └───────┬────────┘
             │                        │
             ▼                        ▼
     ┌────────────────┐       ┌────────────────┐
     │ Check cloud    │       │ Generate       │
     │ for recovery   │       │ Fruit_Animal   │
     └───────┬────────┘       └───────┬────────┘
             │                        │
             └────────────┬───────────┘
                          ▼
                 ┌────────────────┐
                 │  LOGGED IN     │
                 │ currentUsername│
                 │ = "Fruit_Animal"│
                 └────────────────┘
```

---

## 6. Redox Chat AI Tutor State Machine

### Overview
Manages the AI chat panel for Edgar's Redox Signaling presentation. The AI tutor answers questions about redox biology while referencing specific sections, diagrams, and videos in the presentation.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                 REDOX CHAT AI TUTOR STATE MACHINE                │
└─────────────────────────────────────────────────────────────────┘

                      ┌─────────────┐
                      │   CLOSED    │
                      │  (hidden)   │
                      └──────┬──────┘
                             │
              ┌──────────────┴──────────────┐
              │ Click "Ask AI Tutor" button │
              │         OR                  │
              │    openChat()               │
              └──────────────┬──────────────┘
                             ▼
                      ┌─────────────┐
                      │    OPEN     │
                      │   (IDLE)    │◀──────────────────┐
                      └──────┬──────┘                   │
                             │                          │
           ┌─────────────────┼─────────────────┐        │
           │                 │                 │        │
           ▼                 ▼                 ▼        │
    ┌────────────┐   ┌────────────┐   ┌────────────┐   │
    │   Type     │   │   Click    │   │  Press     │   │
    │  message   │   │ suggestion │   │  Escape    │   │
    └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   │
          │                │                │          │
          └────────┬───────┘                ▼          │
                   │                 ┌────────────┐    │
                   ▼                 │   CLOSED   │    │
            ┌────────────┐           └────────────┘    │
            │ sendMessage│                             │
            └─────┬──────┘                             │
                  │                                    │
                  ▼                                    │
           ┌────────────┐                              │
           │  LOADING   │                              │
           │ (typing    │                              │
           │ indicator) │                              │
           └─────┬──────┘                              │
                 │                                     │
       ┌─────────┼─────────┐                           │
       │         │         │                           │
       ▼         ▼         ▼                           │
  ┌────────┐ ┌────────┐ ┌────────┐                     │
  │SUCCESS │ │ ERROR  │ │TIMEOUT │                     │
  │response│ │ shown  │ │        │                     │
  └───┬────┘ └───┬────┘ └───┬────┘                     │
      │          │          │                          │
      └──────────┴──────────┴──────────────────────────┘
```

### States

| State | UI Indicator | Send Button | Description |
|-------|--------------|-------------|-------------|
| CLOSED | Modal hidden | N/A | Chat not visible |
| OPEN/IDLE | Input enabled | Enabled | Waiting for user input |
| LOADING | Typing indicator | Disabled | Waiting for AI response |
| ERROR | Error message | Enabled | Request failed, user can retry |

### System Prompt Features

The AI tutor is configured with:

1. **Brevity requirement**: Maximum 6 sentences per response
2. **Page structure knowledge**: All 8 sections, 6 diagrams, 10 videos
3. **Specific references**: Can direct students to exact content locations
4. **Edgar's voice**: Emulates the author's philosophical-scientific style
5. **Biology concepts**: Full knowledge of ROS, PTEN, signaling pathways

### Content References Available

| Content Type | Examples |
|--------------|----------|
| Sections | "See Section 2: The Nature of ROS" |
| Diagrams | "The ETC diagram in Section 2 shows..." |
| Videos | "Watch the Ninja Nerd video in Section 2" |
| Concepts | Concentration-dependent effects, PTEN-Akt mechanism |

### Configuration

```javascript
// Max tokens reduced for brevity
max_tokens: 400

// History limited to prevent context overflow
history.slice(-10)
```

---

## 7. Curriculum Data Structure

### Overview
The curriculum is organized hierarchically: Units → Topics → Resources. Each topic can have videos, blookets (game-based learning), and PDFs/worksheets.

### Data Structure

```javascript
// ALL_UNITS_DATA in data/units.js
[
    {
        unitId: 'unit4',
        displayName: "Unit 4: Probability, Random Variables...",
        examWeight: "10-20%",
        topics: [
            {
                id: "4-1",
                name: "Topic 4.1",
                description: "Introducing Statistics: Random and Non-Random Patterns?",
                videos: [
                    {
                        url: "https://apclassroom.collegeboard.org/d/...",
                        altUrl: "https://drive.google.com/..."
                    }
                ],
                blookets: [
                    {
                        url: "https://dashboard.blooket.com/set/...",
                        title: "u4l1-2blooket"
                    }
                ],
                pdfs: [
                    { url: "https://...", label: "Follow-Along Worksheet (HTML, interactive)" }
                ]
            },
            // ... more topics
            {
                id: "4-capstone",
                name: "Unit 4 Progress Check",
                description: "Capstone Assessment",
                videos: [],
                isCapstone: true
            }
        ]
    }
]
```

### Topic ID Format

| Pattern | Example | Description |
|---------|---------|-------------|
| `N-M` | `4-1` | Unit N, Topic M |
| `N-capstone` | `4-capstone` | Unit N Progress Check |

### Resource Types

| Resource | Structure | Required Fields |
|----------|-----------|-----------------|
| Videos | Array of objects | `url` (required), `altUrl` (optional) |
| Blookets | Array of objects | `url`, `title` |
| PDFs | Array of objects or strings | `url`, `label` (if object) |

### Shared Resources

Some resources are shared across multiple topics (e.g., Unit 4 Lessons 1-2 share the same Blooket and worksheet):

```javascript
// Both 4-1 and 4-2 have:
blookets: [{ url: "https://dashboard.blooket.com/set/696edcfa2761a89ccdaf2fdc", title: "u4l1-2blooket" }]
pdfs: [{ url: "https://robjohncolson.github.io/apstats-live-worksheet/u4_lesson1-2_live.html", label: "..." }]
```

---

## Implementation Reference

| State Machine | Primary File | Key Functions |
|---------------|--------------|---------------|
| Progressive FRQ | `index.html` | `frqPartState.*`, `renderProgressiveFRQParts()` |
| Question Answer | `index.html` | `submitAnswer()`, `isQuestionAnswered()` |
| Sync Status | `index.html` | `updateSyncStatusIndicator()` |
| AI Grading | `index.html` | `gradeFRQAnswer()`, `gradeMultiPartFRQ()` |
| Framework Context | `data/frameworks.js`, `railway-server/server.js` | `getFrameworkForQuestion()`, `buildFrameworkContext()`, `buildAppealPrompt()` |
| User Auth | `index.html` | `acceptUsername()`, `loadUsernameFromStorage()` |
| Redox Chat | `railway-server/server.js` | `REDOX_SYSTEM_PROMPT`, `/api/ai/chat` |
| Curriculum Data | `data/units.js` | `ALL_UNITS_DATA`, `getTotalItemCounts()` |

---

## Testing

Run state machine tests:
```bash
# Browser-based
open tests/test-runner.html

# Node.js with Vitest
npm test
```

See `tests/progressive-frq.test.js` for comprehensive state transition tests.
