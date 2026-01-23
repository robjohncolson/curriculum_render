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

The framework data covers all 9 AP Statistics units:

| Unit | Title | Lessons | Exam Weight |
|------|-------|---------|-------------|
| 1 | Exploring One-Variable Data | 10 | 15-23% |
| 2 | Exploring Two-Variable Data | 9 | 5-7% |
| 3 | Collecting Data | 7 | 12-15% |
| 4 | Probability, Random Variables, and Probability Distributions | 12 | 10-20% |
| 5 | Sampling Distributions | 8 | 7-12% |
| 6 | Inference for Categorical Data: Proportions | 11 | 12-15% |
| 7 | Inference for Quantitative Data: Means | 9 | 10-18% |
| 8 | Inference for Categorical Data: Chi-Square | 6 | 2-5% |
| 9 | Inference for Quantitative Data: Slopes | 5 | 2-5% |

```javascript
// data/frameworks.js (example: Unit 4, Lesson 2)
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
  // ... Units 1-9 all follow the same structure
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

## 8. Auto Cloud Restore State Machine

### Overview

Automatically detects when a user logs in with a known username but has no local data, and offers to restore their data from Supabase. This solves the "lost progress" problem when users clear browser storage, switch devices, or use incognito mode.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTO CLOUD RESTORE FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

                              User enters username
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │   Check Local Data     │
                         │  (IDB + localStorage)  │
                         └────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
         ┌──────────────────┐               ┌──────────────────┐
         │  Has Local Data  │               │  No Local Data   │
         │   (answers > 0)  │               │   (answers = 0)  │
         └──────────────────┘               └──────────────────┘
                    │                                   │
                    ▼                                   ▼
         ┌──────────────────┐               ┌──────────────────┐
         │  Skip - Normal   │               │  Check Turbo Mode│
         │     Login        │               │    Active?       │
         └──────────────────┘               └──────────────────┘
                                                       │
                                      ┌────────────────┴────────────────┐
                                      │                                 │
                                      ▼                                 ▼
                           ┌──────────────────┐              ┌──────────────────┐
                           │  Turbo Active    │              │  Turbo Inactive  │
                           │ (can query cloud)│              │  (skip restore)  │
                           └──────────────────┘              └──────────────────┘
                                      │                                 │
                                      ▼                                 ▼
                           ┌──────────────────┐              ┌──────────────────┐
                           │ Query Supabase   │              │  Normal Login    │
                           │ for user's data  │              │  (no restore)    │
                           └──────────────────┘              └──────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
         ┌──────────────────┐               ┌──────────────────┐
         │  Cloud Has Data  │               │  No Cloud Data   │
         │   (count > 0)    │               │   (new user)     │
         └──────────────────┘               └──────────────────┘
                    │                                   │
                    ▼                                   ▼
         ┌──────────────────┐               ┌──────────────────┐
         │  Show Restore    │               │  Normal Login    │
         │     Prompt       │               │  (fresh start)   │
         └──────────────────┘               └──────────────────┘
                    │
      ┌─────────────┴─────────────┐
      │                           │
      ▼                           ▼
┌────────────┐             ┌────────────┐
│  User Says │             │  User Says │
│    YES     │             │    NO      │
└────────────┘             └────────────┘
      │                           │
      ▼                           ▼
┌────────────────────┐    ┌────────────────────┐
│  Perform Restore   │    │  Skip - Continue   │
│  Show Progress UI  │    │  with empty state  │
└────────────────────┘    └────────────────────┘
      │
      ▼
┌────────────────────┐
│  Refresh UI with   │
│  restored data     │
└────────────────────┘
```

### States

| State | Description |
|-------|-------------|
| `checking_local` | Checking if user has local data |
| `has_local_data` | User has existing local answers - skip restore |
| `checking_cloud` | Querying Supabase for user's cloud data |
| `cloud_has_data` | Cloud data found - prompt user |
| `no_cloud_data` | No cloud data - new user, fresh start |
| `restoring` | Actively restoring data from cloud |
| `restored` | Restore complete, UI refreshed |
| `skipped` | User declined restore or turbo inactive |

### Trigger Conditions

Auto cloud restore is triggered when ALL of these are true:
1. User enters/confirms a username (Fruit_Animal format)
2. Local storage has NO answers for this username
3. Turbo mode is active (WebSocket connected, Supabase available)
4. Cloud has data for this username (answer count > 0)

### Key Functions

| Function | Purpose |
|----------|---------|
| `checkAndOfferCloudRestore(username)` | Main entry point - orchestrates the flow |
| `hasLocalData(username)` | Checks IDB + localStorage for existing answers |
| `getCloudAnswerCount(username)` | Queries Supabase for user's answer count |
| `performAutoRestore(username)` | Executes the restore with progress UI |

### Data Flow

```javascript
// 1. On username acceptance, check for auto-restore opportunity
async function checkAndOfferCloudRestore(username) {
    // Skip if user has local data
    if (await hasLocalData(username)) return false;

    // Skip if turbo mode not active
    if (!turboModeActive || !supabaseClient) return false;

    // Check cloud for this user's data
    const cloudCount = await getCloudAnswerCount(username);
    if (cloudCount === 0) return false;

    // Prompt user
    const shouldRestore = confirm(
        `Found ${cloudCount} saved answers in the cloud for ${username}.\n\n` +
        `Would you like to restore your progress?`
    );

    if (shouldRestore) {
        await performAutoRestore(username);
        return true;
    }
    return false;
}
```

### User Experience

1. **Seamless for existing users**: If local data exists, no interruption
2. **Helpful prompt for returning users**: Clear message explaining what was found
3. **Progress indicator**: Visual feedback during restore
4. **Graceful fallback**: If turbo mode inactive, silent skip (user can manually restore later)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Supabase query fails | Silent skip, log warning |
| Restore fails mid-way | Show error, partial data may exist |
| User cancels | Continue with empty local state |
| Network timeout | Silent skip with console warning |

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
| Auto Cloud Restore | `index.html` | `checkAndOfferCloudRestore()`, `hasLocalData()`, `getCloudAnswerCount()` |
| Identity Claim Resolution | `railway-server/server.js`, `index.html` | `createIdentityClaim()`, `respondToClaim()`, `resolveClaimsForOrphan()`, `mergeUserData()`, `checkPendingClaims()` |

---

## 9. Identity Claim Resolution State Machine

### Overview

Resolves orphaned usernames (usernames with answers but no registered user) by prompting likely candidates and handling merge logic. Teachers initiate claims, students respond, and the system auto-merges when unambiguous or notifies the teacher when there's a conflict.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IDENTITY CLAIM RESOLUTION FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

                    Teacher identifies orphaned username
                           (e.g., Cherry_Lemon)
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   Teacher selects candidates  │
                    │   (e.g., Mango_Panda,         │
                    │    Banana_Fox)                │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   Create identity_claims      │
                    │   records in Supabase         │
                    │   status = 'pending'          │
                    └───────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │  Candidate 1      │           │  Candidate 2      │
        │  logs in          │           │  logs in          │
        └─────────┬─────────┘           └─────────┬─────────┘
                  │                               │
                  ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │  See modal:       │           │  See modal:       │
        │  "Are you also    │           │  "Are you also    │
        │   Cherry_Lemon?"  │           │   Cherry_Lemon?"  │
        └─────────┬─────────┘           └─────────┬─────────┘
                  │                               │
           ┌──────┴──────┐                 ┌──────┴──────┐
           │             │                 │             │
           ▼             ▼                 ▼             ▼
      ┌────────┐   ┌────────┐         ┌────────┐   ┌────────┐
      │  YES   │   │   NO   │         │  YES   │   │   NO   │
      └────┬───┘   └────┬───┘         └────┬───┘   └────┬───┘
           │            │                  │            │
           └────────────┴──────────────────┴────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Resolution Logic         │
                    └───────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │                        │                        │
           ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  ONE YES, ONE NO    │  │    BOTH YES         │  │    BOTH NO          │
│                     │  │                     │  │                     │
│  Auto-merge data    │  │  Notify teacher     │  │  Mark as orphan     │
│  into YES user      │  │  for manual         │  │  (unknown student)  │
│                     │  │  resolution         │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
           │                        │                        │
           ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  UPDATE answers     │  │  Teacher sees       │  │  No action taken    │
│  SET username =     │  │  notification in    │  │  Orphan data        │
│  confirmed_user     │  │  admin panel        │  │  remains            │
│  WHERE username =   │  │                     │  │                     │
│  orphan_username    │  │  Teacher decides    │  │                     │
└─────────────────────┘  │  which user to      │  └─────────────────────┘
                         │  merge into         │
                         └─────────────────────┘
```

### Claim States

| State | Description |
|-------|-------------|
| `pending` | Claim created, awaiting candidate responses |
| `partial` | One candidate has responded, waiting for other |
| `resolved_auto` | System auto-merged (one yes, one no) |
| `resolved_manual` | Teacher resolved conflict (both said yes) |
| `resolved_orphan` | Both said no, username confirmed as orphan |
| `expired` | Timeout reached, not enough responses |

### Database Schema

```sql
-- Store identity claims
CREATE TABLE identity_claims (
    id SERIAL PRIMARY KEY,
    orphan_username TEXT NOT NULL,      -- 'Cherry_Lemon'
    candidate_username TEXT NOT NULL,   -- 'Mango_Panda'
    response TEXT,                      -- 'yes', 'no', or null
    created_by TEXT NOT NULL,           -- Teacher username
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(orphan_username, candidate_username)
);

-- Store teacher notifications
CREATE TABLE teacher_notifications (
    id SERIAL PRIMARY KEY,
    teacher_username TEXT NOT NULL,
    notification_type TEXT NOT NULL,    -- 'claim_conflict', 'claim_resolved'
    message TEXT NOT NULL,
    related_orphan TEXT,                -- Orphan username for context
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `createIdentityClaim(orphan, candidates, teacher)` | Railway server | Teacher initiates claim |
| `getPendingClaims(username)` | Railway server | Check for claims on login |
| `respondToClaim(claimId, response)` | Railway server | Student submits yes/no |
| `resolveClaimsForOrphan(orphan)` | Railway server | Run resolution logic |
| `mergeUserData(fromUser, toUser)` | Railway server | Execute Supabase merge |
| `getTeacherNotifications(username)` | Railway server | Fetch unread notifications |
| `showClaimModal(claim)` | Client | Display claim prompt |
| `checkPendingClaims()` | Client | Check on login |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/identity-claims` | POST | Create new claim (teacher only) |
| `/api/identity-claims/:username` | GET | Get pending claims for user |
| `/api/identity-claims/:id/respond` | POST | Submit yes/no response |
| `/api/identity-claims/orphans` | GET | List orphaned usernames |
| `/api/notifications/:username` | GET | Get teacher notifications |
| `/api/notifications/:id/read` | POST | Mark notification as read |

### Resolution Logic

```javascript
async function resolveClaimsForOrphan(orphanUsername) {
    const claims = await getClaims(orphanUsername);
    const responses = claims.filter(c => c.response !== null);

    // Not all candidates have responded yet
    if (responses.length < claims.length) {
        return { status: 'waiting', responded: responses.length, total: claims.length };
    }

    const yesClaims = claims.filter(c => c.response === 'yes');
    const noClaims = claims.filter(c => c.response === 'no');

    if (yesClaims.length === 0) {
        // Both said no - orphan confirmed
        return { status: 'orphan_confirmed' };
    }

    if (yesClaims.length === 1) {
        // Exactly one yes (regardless of no count) - auto merge
        const confirmedUser = yesClaims[0].candidate_username;
        await mergeUserData(orphanUsername, confirmedUser);
        return { status: 'auto_merged', mergedInto: confirmedUser };
    }

    if (yesClaims.length > 1) {
        // Multiple yes - notify teacher
        await createTeacherNotification(
            claims[0].created_by,
            'claim_conflict',
            `Multiple students claim "${orphanUsername}": ${yesClaims.map(c => c.candidate_username).join(', ')}`
        );
        return { status: 'conflict', claimants: yesClaims.map(c => c.candidate_username) };
    }
}
```

### Merge Operation

```javascript
async function mergeUserData(fromUsername, toUsername) {
    // Update all answers from orphan to confirmed user
    const { error } = await supabase
        .from('answers')
        .update({ username: toUsername })
        .eq('username', fromUsername);

    if (error) throw error;

    // Log the merge
    console.log(`Merged ${fromUsername} → ${toUsername}`);

    // Notify teacher of successful merge
    // The merged user will see data on next sync
}
```

### User Experience

**For Students:**
1. Login normally with their username
2. If pending claim exists, see modal: "Are you also [orphan]?"
3. Click Yes or No
4. If they were the only "Yes", their data is automatically merged
5. On next sync, they see the merged answers

**For Teachers:**
1. View list of orphaned usernames in admin panel
2. Select orphan and candidate students
3. Create claim with one click
4. Receive notification if conflict (multiple students claim same orphan)
5. Manually resolve by selecting correct student

### Modal UI

```
┌─────────────────────────────────────────────────────────────┐
│                    Identity Confirmation                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  We found answers submitted under the username:             │
│                                                              │
│              🔍  Cherry_Lemon                                │
│                                                              │
│  This username has 80 answers but isn't linked to a         │
│  registered student. Is this you?                           │
│                                                              │
│  If you used a different browser or device before           │
│  registering, this might be your old data.                  │
│                                                              │
│         ┌─────────────┐      ┌─────────────┐                │
│         │  Yes, that's│      │  No, that's │                │
│         │     me      │      │  not me     │                │
│         └─────────────┘      └─────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Username Normalization (Orphan Prevention)

To prevent case-sensitivity orphans (e.g., `apple_monkey` vs `Apple_Monkey`), usernames are automatically normalized to Title_Case on login.

```javascript
function normalizeUsername(username) {
    if (!username || typeof username !== 'string') return username;
    return username
        .split(/[_\s]+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('_');
}

// Examples:
// 'apple_monkey' → 'Apple_Monkey'
// 'BANANA_FOX'   → 'Banana_Fox'
// 'ApPlE_mOnKeY' → 'Apple_Monkey'
```

**When applied:**
- On `acceptUsername()` when a new username is accepted
- On startup when loading saved username from storage
- If normalization changes the username, storage is updated automatically

### Orphan Stats Display

The orphan list shows detailed statistics to help teachers identify which orphans are worth investigating:

```
┌─────────────────────────────────────────────────────────────────────┐
│ apple_rabbit                              [HAS CURRICULUM]          │
│ 📚 15 curriculum (U1)  |  📝 0 worksheet                            │
│                                                    [Create Claim]   │
├─────────────────────────────────────────────────────────────────────┤
│ banana_cat                                                          │
│ 📚 0 curriculum  |  📝 123 worksheet                                │
│                                                    [Create Claim]   │
└─────────────────────────────────────────────────────────────────────┘
```

**Stats returned by `/api/identity-claims/orphans`:**

| Field | Description |
|-------|-------------|
| `username` | The orphaned username |
| `answerCount` | Total number of answers |
| `curriculumCount` | Answers matching `U#-L#-Q##` pattern |
| `worksheetCount` | Answers matching `WS-*` pattern |
| `units` | Array of unique unit numbers (e.g., `['U1', 'U2']`) |

**Sorting:** Orphans are sorted by `curriculumCount` descending, so the most likely real students appear first.

**Visual cues:**
- Blue border/background for orphans with curriculum answers
- "HAS CURRICULUM" badge for easy identification
- Unit numbers displayed inline

### Student List Endpoint

The `/api/students` endpoint returns registered students with their real names for the claim candidate selection UI:

```javascript
// GET /api/students
{
    "students": [
        { "username": "Mango_Panda", "real_name": "Janelle", "user_type": "student" },
        { "username": "Banana_Fox", "real_name": "Julissa", "user_type": "student" }
    ]
}
```

**UI Display:** `Janelle (Mango_Panda)` instead of just `Mango_Panda`

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Supabase unavailable | Claim check skipped, no modal shown |
| Merge fails | Notify teacher, leave data unchanged |
| Student dismisses modal | Treated as "no response", claim remains pending |
| Timeout (7 days) | Claims expire, teacher notified |

### Security Considerations

1. **Teacher-only claim creation**: Only users with `role='teacher'` can create claims
2. **Self-claim prevention**: Candidates cannot be the orphan username
3. **Duplicate prevention**: UNIQUE constraint on (orphan, candidate)
4. **Audit trail**: All claims and responses timestamped

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
