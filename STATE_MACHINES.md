# AP Statistics Consensus Quiz - State Machine Diagrams

Complete state machine documentation for all components.

**Last Updated:** January 2026

---

## Table of Contents

| # | Section | Description |
|---|---------|-------------|
| 1 | Storage Layer | IndexedDB/localStorage initialization & fallback chain |
| 2 | User Authentication | Username generation, login flow, session management |
| 3 | Data Management | classData lifecycle, answer persistence, sync |
| 4 | Railway WebSocket | Connection states, reconnection, message handling |
| 5 | Turbo Mode | Real-time sync activation, fallback to Supabase |
| 6 | Quiz Answer Flow | Question viewing, answering, submission |
| 7 | Peer Consensus | Data aggregation, visualization updates |
| 8 | Sprite System | Player/peer sprite animation states |
| 9 | Chart System | Chart rendering, Chart Wizard states |
| 10 | Export/Import | Recovery packs, data merging logic |
| 11 | Error Handling | Fallback paths, retry mechanisms |
| 12 | Complete Flow Diagrams | End-to-end user journeys |
| 13 | AI Grading Escalation | 3-tier grading, appeals, score management |

---

## 1. STORAGE LAYER — Initialization & Fallback Chain

The storage system uses a three-tier architecture with automatic fallback.

```
                    ┌─────────────────────────────────────────────────────┐
                    │              STORAGE INITIALIZATION                  │
                    │              initializeStorage()                     │
                    └───────────────────────┬─────────────────────────────┘
                                            │
                                            ▼
                    ┌─────────────────────────────────────────────────────┐
                    │            CHECK INDEXEDDB AVAILABILITY             │
                    │        IndexedDBAdapter.isAvailable()               │
                    └───────────────────────┬─────────────────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────────┐
                    │                                                   │
                    ▼                                                   ▼
          ┌─────────────────┐                             ┌─────────────────┐
          │  IDB AVAILABLE  │                             │ IDB UNAVAILABLE │
          │                 │                             │ (Safari private,│
          │  Open database  │                             │  tracking prev) │
          │  ConsensusQuizDB│                             │                 │
          └────────┬────────┘                             └────────┬────────┘
                   │                                               │
                   ▼                                               ▼
          ┌─────────────────┐                             ┌─────────────────┐
          │  DB VERSION     │                             │  LOCALSTORAGE   │
          │  CHECK          │                             │  FALLBACK       │
          │                 │                             │                 │
          │ Current: v1     │                             │ Primary storage │
          │ Required: v1    │                             │ = localStorage  │
          └────────┬────────┘                             └────────┬────────┘
                   │                                               │
          ┌────────┴────────┐                                      │
          │                 │                                      │
          ▼                 ▼                                      │
┌─────────────────┐ ┌─────────────────┐                            │
│ VERSION MATCH   │ │ UPGRADE NEEDED  │                            │
│                 │ │                 │                            │
│ Use existing    │ │ onupgradeneeded │                            │
│ database        │ │ Create stores   │                            │
└────────┬────────┘ └────────┬────────┘                            │
         │                   │                                     │
         └─────────┬─────────┘                                     │
                   │                                               │
                   ▼                                               │
          ┌─────────────────────────────────────────────────────────────┐
          │                 DUAL WRITE ADAPTER                          │
          │                                                             │
          │  Primary:   IndexedDBAdapter  │  Primary:   LocalStorageAdapter
          │  Secondary: LocalStorageAdapter│  Secondary: null              │
          │                                                             │
          │  StorageConfig.DUAL_WRITE_ENABLED = true                    │
          │  Every write → IDB + localStorage (backward compat)         │
          └─────────────────────────────────┬───────────────────────────┘
                                            │
                                            ▼
                    ┌─────────────────────────────────────────────────────┐
                    │              RUN MIGRATION                           │
                    │     StorageMigration.migrate()                       │
                    │                                                      │
                    │  Copy from localStorage → IDB:                       │
                    │  • answers_${user}  → IDB answers store              │
                    │  • reasons_${user}  → IDB reasons store              │
                    │  • attempts_${user} → IDB attempts store             │
                    │  • progress_${user} → IDB progress store             │
                    │  • badges_${user}   → IDB badges store               │
                    │  • charts_${user}   → IDB charts store               │
                    │  • classData        → IDB peerCache                  │
                    │  • consensusUsername → IDB meta.username             │
                    └─────────────────────────────────┬───────────────────┘
                                                      │
                                                      ▼
                    ┌─────────────────────────────────────────────────────┐
                    │                   READY                              │
                    │                                                      │
                    │  window.storage = initialized adapter                │
                    │  getStorage() / waitForStorage() available           │
                    └─────────────────────────────────────────────────────┘
```

### IndexedDB Object Stores

| Store | Key Path | Indexes | Purpose |
|-------|----------|---------|---------|
| `meta` | `key` | - | Schema version, client ID, username |
| `answers` | `[username, questionId]` | `username`, `questionId`, `timestamp` | Quiz answers |
| `reasons` | `[username, questionId]` | `username` | Answer explanations |
| `attempts` | `[username, questionId]` | `username` | Attempt counts |
| `progress` | `[username, lessonKey]` | `username` | Lesson completion |
| `badges` | `[username, badgeId]` | `username` | Achievement badges |
| `charts` | `[username, chartId]` | `username` | User-created charts |
| `preferences` | `username` | - | User preferences |
| `peerCache` | `[peerUsername, questionId]` | `peerUsername`, `seenAt` | Cached peer data |
| `outbox` | `id` (auto-increment) | `createdAt`, `opType` | Pending sync operations |
| `sprites` | `username` | - | Sprite/avatar data |

### Storage Write Flow

```
              ┌─────────────────────────────────────────────────────┐
              │              WRITE OPERATION                         │
              │     storage.set(storeName, key, value)               │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │              DualWriteAdapter.set()                  │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │  PRIMARY WRITE  │                │ SECONDARY WRITE │
          │  (IndexedDB)    │                │ (localStorage)  │
          │                 │                │                 │
          │  transaction()  │                │ JSON.stringify()│
          │  put(value)     │                │ setItem(key)    │
          └────────┬────────┘                └────────┬────────┘
                   │                                  │
                   ▼                                  ▼
          ┌─────────────────┐                ┌─────────────────┐
          │    SUCCESS      │                │   SUCCESS       │
          │    → resolve    │                │   → log ok      │
          ├─────────────────┤                ├─────────────────┤
          │    FAILURE      │                │   FAILURE       │
          │    → reject     │                │   (quota error) │
          │    → rollback   │                │   → log warning │
          │                 │                │   → continue    │
          └─────────────────┘                └─────────────────┘
```

---

## 2. USER AUTHENTICATION — Username Generation & Login

### Welcome Screen Flow

```
              ┌─────────────────────────────────────────────────────┐
              │                  APP START                           │
              │              promptUsername()                        │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │          CHECK SAVED USERNAME                        │
              │                                                      │
              │  1. IDB meta.username                                │
              │  2. localStorage consensusUsername                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │  USERNAME FOUND │                │  NO USERNAME    │
          │                 │                │                 │
          │  initClassData()│                │  Show Welcome   │
          │  → LOGGED_IN    │                │  Screen         │
          └─────────────────┘                └────────┬────────┘
                                                      │
                                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │               WELCOME SCREEN                         │
              │                                                      │
              │  ┌─────────────────────────────────────────────┐    │
              │  │  AP Statistics Quiz                         │    │
              │  │                                             │    │
              │  │  [Dropdown: Select your name ▼]             │    │
              │  │  OR                                          │    │
              │  │  [New Student] [Returning Student]          │    │
              │  └─────────────────────────────────────────────┘    │
              └───────────────────────┬─────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│SELECT EXISTING│          │  NEW STUDENT  │          │   RETURNING   │
│               │          │               │          │   STUDENT     │
│ Pick from     │          │ Create new    │          │               │
│ dropdown      │          │ account       │          │ Find existing │
│               │          │               │          │ account       │
└───────┬───────┘          └───────┬───────┘          └───────┬───────┘
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│acceptUsername │          │showNewStudent │          │showReturning  │
│(selection)    │          │Flow()         │          │StudentScreen()│
└───────────────┘          └───────────────┘          └───────────────┘
```

### New Student Flow

```
              ┌─────────────────────────────────────────────────────┐
              │               NEW STUDENT FLOW                       │
              │          showNewStudentFlow()                        │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │          ENTER REAL NAME                             │
              │                                                      │
              │  "What's your first and last name?"                  │
              │  [____________________________]                      │
              │  [Continue]                                          │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │          CHECK FOR DUPLICATES                        │
              │                                                      │
              │  Query Supabase users table:                         │
              │  SELECT * FROM users                                 │
              │  WHERE LOWER(real_name) LIKE '%{name}%'              │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │  MATCH FOUND    │                │  NO MATCH       │
          │                 │                │                 │
          │  Show confirm   │                │  Generate new   │
          │  dialog         │                │  username       │
          └────────┬────────┘                └────────┬────────┘
                   │                                  │
          ┌────────┴────────┐                         │
          │                 │                         │
          ▼                 ▼                         │
┌─────────────────┐ ┌─────────────────┐               │
│ "Yes, that's me"│ │ "No, different" │               │
│                 │ │                 │               │
│ acceptUsername  │ │ Continue to     │               │
│ (matched.user)  │ │ username gen    │◀──────────────┘
└─────────────────┘ └────────┬────────┘
                             │
                             ▼
              ┌─────────────────────────────────────────────────────┐
              │          USERNAME GENERATION                         │
              │                                                      │
              │  generateRandomUsername()                            │
              │                                                      │
              │  Format: {Fruit}_{Animal}                            │
              │  Examples: Apple_Tiger, Mango_Elephant               │
              │                                                      │
              │  93 fruits × 145+ animals = 13,485+ combinations     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │          SHOW USERNAME                               │
              │                                                      │
              │  "Your username is: Strawberry_Penguin"              │
              │                                                      │
              │  [Let's Go!]  [Try Another]                          │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │   LET'S GO      │                │   TRY ANOTHER   │
          │                 │                │                 │
          │ createNewStudent│                │ Generate new    │
          │ Account()       │                │ username        │
          │                 │                │ → loop back     │
          └────────┬────────┘                └─────────────────┘
                   │
                   ▼
              ┌─────────────────────────────────────────────────────┐
              │          CREATE ACCOUNT                              │
              │                                                      │
              │  1. Insert to Supabase users table:                  │
              │     {username, real_name, user_type: 'student'}      │
              │                                                      │
              │  2. acceptUsername(username)                         │
              │     • Save to IDB meta + localStorage                │
              │     • Add to recentUsernames[]                       │
              │     • initClassData()                                │
              │     • initializeProgressTracking()                   │
              │     • showUsernameWelcome()                          │
              │     • smartSyncWithSupabase()                        │
              │                                                      │
              │  3. → LOGGED_IN                                      │
              └─────────────────────────────────────────────────────┘
```

### Session States

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SESSION STATES                                 │
└─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐          ┌─────────────────┐
    │   NO_SESSION    │─────────▶│    LOGGED_IN    │
    │                 │  accept  │                 │
    │  No username    │  Username│  currentUsername│
    │  saved          │          │  set            │
    └────────┬────────┘          └────────┬────────┘
             │                            │
             │ promptUsername()           │ User clicks
             │                            │ "Switch User"
             ▼                            ▼
    ┌─────────────────┐          ┌─────────────────┐
    │ WELCOME_SCREEN  │          │  USER_SELECT    │
    │                 │          │                 │
    │ Show login      │          │ Show account    │
    │ options         │          │ picker          │
    └─────────────────┘          └────────┬────────┘
                                          │
                                          │ Select different
                                          │ account
                                          ▼
                                 ┌─────────────────┐
                                 │  SWITCH_USER    │
                                 │                 │
                                 │ acceptUsername  │
                                 │ (newUsername)   │
                                 │                 │
                                 │ • Save new user │
                                 │ • Reload data   │
                                 │ → LOGGED_IN     │
                                 └─────────────────┘
```

---

## 3. DATA MANAGEMENT — classData Lifecycle

### ClassData Structure

```javascript
classData = {
  users: {
    [username]: {
      answers: {
        [questionId]: { value: any, timestamp: number }
      },
      reasons: {
        [questionId]: string
      },
      timestamps: {
        [questionId]: number  // Deprecated, use answers[].timestamp
      },
      attempts: {
        [questionId]: number
      },
      charts: {
        [chartId]: chartData
      },
      currentActivity: {
        state: 'idle' | 'viewing' | 'answering' | 'submitted',
        questionId: string | null,
        lastUpdate: number
      }
    }
  }
}
```

### ClassData Initialization

```
              ┌─────────────────────────────────────────────────────┐
              │              initClassData()                         │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       REBUILD FROM INDEXEDDB                         │
              │       rebuildClassDataView()                         │
              │                                                      │
              │  For current user, query IDB stores:                 │
              │  • answers store → classData.users[user].answers     │
              │  • reasons store → classData.users[user].reasons     │
              │  • attempts store → classData.users[user].attempts   │
              │  • charts store → classData.users[user].charts       │
              │                                                      │
              │  For peer cache:                                     │
              │  • peerCache store → classData.users[peer].answers   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │  IDB SUCCESS    │                │  IDB FAILED     │
          │                 │                │                 │
          │  classData      │                │  Try localStorage│
          │  rebuilt from   │                │  classData key  │
          │  IDB stores     │                │                 │
          └────────┬────────┘                └────────┬────────┘
                   │                                  │
                   └─────────────────┬────────────────┘
                                     │
                                     ▼
              ┌─────────────────────────────────────────────────────┐
              │       ENSURE USER ENTRY EXISTS                       │
              │                                                      │
              │  if (!classData.users[currentUsername]) {            │
              │    classData.users[currentUsername] = {              │
              │      answers: {},                                    │
              │      reasons: {},                                    │
              │      timestamps: {},                                 │
              │      attempts: {},                                   │
              │      charts: {},                                     │
              │      currentActivity: {                              │
              │        state: 'idle',                                │
              │        questionId: null,                             │
              │        lastUpdate: Date.now()                        │
              │      }                                               │
              │    }                                                 │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       MIGRATE OLD FORMAT                             │
              │                                                      │
              │  If answers are strings (legacy):                    │
              │    "A" → { value: "A", timestamp: Date.now() }       │
              │                                                      │
              │  If currentActivity missing:                         │
              │    Add default structure                             │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       SAVE TO STORAGE                                │
              │       saveClassData()                                │
              │                                                      │
              │  Dual-write to:                                      │
              │  • IDB (all individual stores)                       │
              │  • localStorage classData (JSON blob)                │
              └─────────────────────────────────────────────────────┘
```

### Answer Save Flow

```
              ┌─────────────────────────────────────────────────────┐
              │         USER SUBMITS ANSWER                          │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │      saveAnswer(username, questionId, value)         │
              │                                                      │
              │  record = {                                          │
              │    username,                                         │
              │    questionId,                                       │
              │    value,                                            │
              │    timestamp: Date.now(),                            │
              │    sourceClientId: getClientId()                     │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │      WRITE TO IDB                                    │
              │                                                      │
              │  storage.set('answers', [username, questionId], {    │
              │    value,                                            │
              │    timestamp                                         │
              │  })                                                  │
              │                                                      │
              │  Compound key: [username, questionId]                │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │      DUAL-WRITE TO LOCALSTORAGE                      │
              │                                                      │
              │  Key: answers_${username}                            │
              │  Value: { ...existing, [questionId]: {value, ts} }   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │      UPDATE IN-MEMORY CLASSDATA                      │
              │                                                      │
              │  classData.users[username].answers[questionId] =     │
              │    { value, timestamp }                              │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │      ENQUEUE FOR CLOUD SYNC                          │
              │                                                      │
              │  If outbox available:                                │
              │    enqueueOutbox('answer_submit', {                  │
              │      username, questionId, value, timestamp          │
              │    })                                                │
              └─────────────────────────────────────────────────────┘
```

---

## 4. RAILWAY WEBSOCKET — Connection States

### WebSocket Lifecycle

```
                              ┌─────────────────────────────────────────────────────┐
                              │              WEBSOCKET STATES                        │
                              └─────────────────────────────────────────────────────┘

                                            ┌───────────────┐
                                            │  DISCONNECTED │
                                            │               │
                                            │ wsConnected   │
                                            │ = false       │
                                            └───────┬───────┘
                                                    │
                                                    │ connectWebSocket()
                                                    ▼
                              ┌─────────────────────────────────────────────────────┐
                              │              CONNECTING                              │
                              │                                                      │
                              │  ws = new WebSocket(wss://...)                       │
                              │  Waiting for onopen...                               │
                              └───────────────────────┬─────────────────────────────┘
                                                      │
                                  ┌───────────────────┴───────────────────┐
                                  │                                       │
                                  ▼                                       ▼
                        ┌─────────────────┐                     ┌─────────────────┐
                        │   ws.onopen     │                     │   ws.onerror    │
                        │   CONNECTED     │                     │   FAILED        │
                        └────────┬────────┘                     └────────┬────────┘
                                 │                                       │
                                 │                                       │
                                 ▼                                       ▼
              ┌─────────────────────────────────────────┐    ┌─────────────────────┐
              │          CONNECTED STATE                │    │   RECONNECT         │
              │                                         │    │                     │
              │  wsConnected = true                     │    │   setTimeout(       │
              │  Dispatch 'turboModeChanged' {true}     │    │     connectWebSocket│
              │                                         │    │     , 5000          │
              │  Start ping interval (30s):             │    │   )                 │
              │  • Send: {type: 'ping'}                 │    │                     │
              │  • Send: {type: 'heartbeat', username}  │    │   → DISCONNECTED    │
              │                                         │    └─────────────────────┘
              │  Send: {type: 'identify', username}     │
              └───────────────────────┬─────────────────┘
                                      │
                                      │ Message received
                                      ▼
              ┌─────────────────────────────────────────────────────────────────────┐
              │                    MESSAGE HANDLING                                  │
              │                                                                      │
              │  switch (message.type) {                                            │
              │                                                                      │
              │    case 'presence_snapshot':                                        │
              │      onlineUsers = new Set(data.users)                              │
              │      Dispatch 'presenceChanged' event                               │
              │                                                                      │
              │    case 'user_online':                                              │
              │      onlineUsers.add(username)                                      │
              │      Dispatch 'presenceChanged' event                               │
              │                                                                      │
              │    case 'user_offline':                                             │
              │      onlineUsers.delete(username)                                   │
              │      Dispatch 'presenceChanged' event                               │
              │                                                                      │
              │    case 'answer_submitted':                                         │
              │      Cache to IDB peerCache                                         │
              │      Dispatch 'peer:answer' event                                   │
              │                                                                      │
              │    case 'batch_submitted':                                          │
              │      pullPeerDataFromRailway()                                      │
              │                                                                      │
              │    case 'pong':                                                     │
              │      // Keep-alive acknowledgment                                   │
              │  }                                                                   │
              └─────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ ws.onclose / ws.onerror
                                      ▼
              ┌─────────────────────────────────────────────────────────────────────┐
              │                    DISCONNECTED                                      │
              │                                                                      │
              │  wsConnected = false                                                │
              │  Dispatch 'turboModeChanged' {enabled: false}                       │
              │  clearInterval(wsPingInterval)                                      │
              │                                                                      │
              │  Schedule reconnect:                                                │
              │  wsReconnectTimer = setTimeout(connectWebSocket(), 5000)            │
              └─────────────────────────────────────────────────────────────────────┘
```

### Answer Submission via Railway

```
              ┌─────────────────────────────────────────────────────┐
              │    pushAnswerToSupabase(user, qId, value, ts)        │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │          CHECK USE_RAILWAY FLAG                      │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │ USE_RAILWAY=true│                │USE_RAILWAY=false│
          │                 │                │                 │
          │ submitAnswer    │                │ Direct Supabase │
          │ ViaRailway()    │                │ insert          │
          └────────┬────────┘                └─────────────────┘
                   │
                   ▼
          ┌─────────────────────────────────────────────────────────┐
          │          POST /api/submit-answer                         │
          │                                                          │
          │  Body: {                                                 │
          │    username,                                             │
          │    question_id: questionId,                              │
          │    answer_value: JSON.stringify(value),                  │
          │    timestamp                                             │
          │  }                                                       │
          └───────────────────────┬─────────────────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
                  ▼                               ▼
        ┌─────────────────┐             ┌─────────────────┐
        │    SUCCESS      │             │    FAILURE      │
        │                 │             │                 │
        │  return true    │             │  Fall back to   │
        │  (answer sync'd)│             │  direct Supabase│
        └─────────────────┘             └─────────────────┘
```

---

## 5. TURBO MODE — Real-Time Sync States

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TURBO MODE STATES                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────────────┐
                              │    TURBO_DISABLED     │
                              │                       │
                              │  TURBO_MODE = false   │
                              │  (supabase_config.js) │
                              │                       │
                              │  • No cloud sync      │
                              │  • Local storage only │
                              └───────────────────────┘

                              ┌───────────────────────┐
                              │    TURBO_ENABLED      │
                              │                       │
                              │  TURBO_MODE = true    │
                              │  USE_RAILWAY = false  │
                              │                       │
                              │  Direct Supabase:     │
                              │  • Real-time subs     │
                              │  • 360 queries/hr     │
                              │    (30 students)      │
                              └───────────────────────┘

                              ┌───────────────────────┐
                              │   TURBO_WITH_RAILWAY  │
                              │                       │
                              │  TURBO_MODE = true    │
                              │  USE_RAILWAY = true   │
                              │                       │
                              │  Railway proxy:       │
                              │  • WebSocket real-time│
                              │  • 12 queries/hr      │
                              │    (95% reduction)    │
                              │  • Server-side cache  │
                              └───────────────────────┘

STATE TRANSITIONS:
─────────────────────────────────────────────────────────────────────────────

              ┌─────────────────┐         ┌─────────────────┐
              │   APP LOADS     │         │ Railway health  │
              │                 │         │ check fails     │
              │ initializeRailway        │                 │
              │ Connection()    │         │                 │
              └────────┬────────┘         └────────┬────────┘
                       │                           │
                       ▼                           │
              ┌─────────────────┐                  │
              │  Health check   │                  │
              │  GET /health    │                  │
              └────────┬────────┘                  │
                       │                           │
          ┌────────────┴────────────┐              │
          │                         │              │
          ▼                         ▼              │
┌─────────────────┐       ┌─────────────────┐     │
│  200 OK         │       │   Error         │     │
│                 │       │                 │◀────┘
│ connectWebSocket│       │ Fall back to    │
│ ()              │       │ direct Supabase │
│                 │       │                 │
│ turboModeActive │       │ turboModeActive │
│ = true          │       │ = true (direct) │
└─────────────────┘       └─────────────────┘
```

---

## 6. QUIZ ANSWER FLOW

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           QUIZ ANSWER STATE MACHINE                              │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────────────┐
                              │        IDLE           │
                              │                       │
                              │  currentActivity:     │
                              │    state: 'idle'      │
                              │    questionId: null   │
                              └───────────┬───────────┘
                                          │
                                          │ renderQuestion(q)
                                          ▼
              ┌─────────────────────────────────────────────────────┐
              │                     VIEWING                          │
              │                                                      │
              │  currentActivity:                                    │
              │    state: 'viewing'                                  │
              │    questionId: 'U1-L3-Q01'                           │
              │                                                      │
              │  • Question displayed                                │
              │  • Answer options visible                            │
              │  • No selection yet                                  │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      │ User clicks option
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │                    ANSWERING                         │
              │                                                      │
              │  currentActivity:                                    │
              │    state: 'answering'                                │
              │    questionId: 'U1-L3-Q01'                           │
              │                                                      │
              │  • Option highlighted                                │
              │  • Reason textarea active                            │
              │  • Submit button enabled                             │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      │ User clicks Submit
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │                    SUBMITTED                         │
              │                                                      │
              │  currentActivity:                                    │
              │    state: 'submitted'                                │
              │    questionId: 'U1-L3-Q01'                           │
              │                                                      │
              │  Processing:                                         │
              │  1. saveAnswer(user, qId, value)                     │
              │  2. saveReason(user, qId, text)                      │
              │  3. incrementAttempt(user, qId)                      │
              │  4. saveClassData()                                  │
              │  5. pushAnswerToSupabase() [if Turbo]                │
              │  6. pullPeerDataFromSupabase()                       │
              │  7. renderConsensus()                                │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      │ Processing complete
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │                 SHOWING_RESULT                       │
              │                                                      │
              │  • Correct/incorrect feedback shown                  │
              │  • Peer consensus displayed                          │
              │  • Sprite animation triggered                        │
              │  • Next question button available                    │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      │ User clicks Next
                                      ▼
                              ┌───────────────────────┐
                              │        IDLE           │
                              │                       │
                              │  (back to start)      │
                              └───────────────────────┘
```

### Answer Processing Detail

```
              ┌─────────────────────────────────────────────────────┐
              │            processAnswer(questionId)                 │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       GET SELECTED ANSWER                            │
              │                                                      │
              │  const selected = document.querySelector             │
              │    ('.option.selected');                             │
              │  const value = selected.dataset.value;               │
              │  const reason = reasonTextarea.value;                │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       SAVE TO STORAGE                                │
              │                                                      │
              │  await saveAnswer(currentUsername, questionId, {     │
              │    value: value,                                     │
              │    timestamp: Date.now()                             │
              │  });                                                 │
              │                                                      │
              │  await storage.set('reasons',                        │
              │    [currentUsername, questionId], reason);           │
              │                                                      │
              │  const attempts = await storage.get('attempts',      │
              │    [currentUsername, questionId]) || 0;              │
              │  await storage.set('attempts',                       │
              │    [currentUsername, questionId], attempts + 1);     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       SYNC TO CLOUD (if enabled)                     │
              │                                                      │
              │  if (window.turboModeActive) {                       │
              │    const success = await pushAnswerToSupabase(       │
              │      currentUsername,                                │
              │      questionId,                                     │
              │      value,                                          │
              │      Date.now()                                      │
              │    );                                                │
              │                                                      │
              │    updateSyncStatus(success ? '✅' : '⚠️');          │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       FETCH PEER DATA                                │
              │                                                      │
              │  await pullPeerDataFromSupabase();                   │
              │  // Updates classData.users[peer].answers            │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       CHECK ANSWER                                   │
              │                                                      │
              │  const correct = checkAnswer(question, value);       │
              │                                                      │
              │  if (correct) {                                      │
              │    showCorrectFeedback();                            │
              │    playerSprite.jump();                              │
              │    playerSprite.goldTimer = 3;                       │
              │  } else {                                            │
              │    showIncorrectFeedback();                          │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       RENDER CONSENSUS                               │
              │                                                      │
              │  renderPeerConsensus(questionId, classData);         │
              │  // Shows bar chart of peer answers                  │
              │  // Highlights most popular choice                   │
              └─────────────────────────────────────────────────────┘
```

---

## 7. PEER CONSENSUS — Data Aggregation

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       PEER CONSENSUS RENDERING                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

              ┌─────────────────────────────────────────────────────┐
              │       renderPeerConsensus(questionId)                │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       GATHER PEER ANSWERS                            │
              │                                                      │
              │  const peers = Object.keys(classData.users)          │
              │    .filter(u => u !== currentUsername);              │
              │                                                      │
              │  const answers = [];                                 │
              │  for (const peer of peers) {                         │
              │    const peerAnswer = classData.users[peer]          │
              │      ?.answers[questionId];                          │
              │    if (peerAnswer) {                                 │
              │      answers.push({                                  │
              │        peer,                                         │
              │        value: peerAnswer.value,                      │
              │        timestamp: peerAnswer.timestamp               │
              │      });                                             │
              │    }                                                 │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       COUNT BY OPTION                                │
              │                                                      │
              │  const counts = {};                                  │
              │  for (const ans of answers) {                        │
              │    counts[ans.value] = (counts[ans.value] || 0) + 1; │
              │  }                                                   │
              │                                                      │
              │  // Example result:                                  │
              │  // { "A": 12, "B": 5, "C": 8, "D": 3 }              │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       RENDER VISUALIZATION                           │
              │                                                      │
              │  ┌──────────────────────────────────────────────┐   │
              │  │  Class Consensus (28 students)               │   │
              │  │                                              │   │
              │  │  A: ████████████████████████  43% (12)  ★   │   │
              │  │  B: ████████              18% (5)           │   │
              │  │  C: ██████████████        29% (8)           │   │
              │  │  D: ██████                11% (3)           │   │
              │  │                                              │   │
              │  │  ★ = Most popular answer                    │   │
              │  └──────────────────────────────────────────────┘   │
              └─────────────────────────────────────────────────────┘
```

### MCQ Retry Policy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCQ RETRY POLICY                                    │
│                                                                              │
│  MCQs: Unlimited attempts, but reasoning required after first attempt       │
│  FRQs: Unlimited attempts, no reasoning requirement                         │
└─────────────────────────────────────────────────────────────────────────────┘

                    canRetry(questionId) Logic
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
      ┌─────────────────┐           ┌─────────────────┐
      │   FRQ Question  │           │   MCQ Question  │
      │                 │           │                 │
      │  Always return  │           │  Check attempt  │
      │  true           │           │  count          │
      └────────┬────────┘           └────────┬────────┘
               │                              │
               ▼                    ┌─────────┴─────────┐
         ALLOW RETRY                │                   │
                                    ▼                   ▼
                            First attempt         Retry attempt
                            (attempts === 0)      (attempts > 0)
                                    │                   │
                                    ▼                   ▼
                              ALLOW RETRY       Check for reasoning
                                                        │
                                            ┌───────────┴───────────┐
                                            │                       │
                                            ▼                       ▼
                                    Has reasoning           No reasoning
                                    (non-empty)             (empty)
                                            │                       │
                                            ▼                       ▼
                                      ALLOW RETRY            BLOCK RETRY
                                                             "Add Reasoning
                                                              to Retry"

    REMOVED: Maximum 3-attempt limit (was punitive and limiting)
    KEPT: Reasoning requirement (encourages thoughtful engagement)
```

**Key Functions:**
- `canRetry(questionId)` - Returns true/false based on question type and reasoning
- `getAttemptCount(questionId)` - Gets current attempt count from storage

### Peer Data Sync Flow

```
              ┌─────────────────────────────────────────────────────┐
              │     pullPeerDataFromRailway(since)                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       GET /api/peer-data?since={timestamp}           │
              │                                                      │
              │  Response: {                                         │
              │    data: [                                           │
              │      {username, question_id, answer_value, timestamp}│
              │      ...                                             │
              │    ],                                                 │
              │    filtered: 42,                                     │
              │    cached: true,                                     │
              │    serverTime: 1704067200000                         │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       CONVERT TO LOCAL FORMAT                        │
              │                                                      │
              │  const peerData = {};                                │
              │  for (const row of data) {                           │
              │    if (row.username === currentUsername) continue;   │
              │                                                      │
              │    if (!peerData[row.username]) {                    │
              │      peerData[row.username] = { answers: {} };       │
              │    }                                                 │
              │                                                      │
              │    peerData[row.username].answers[row.question_id] = │
              │      {                                               │
              │        value: JSON.parse(row.answer_value),          │
              │        timestamp: row.timestamp                      │
              │      };                                              │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       CACHE TO STORAGE                               │
              │                                                      │
              │  // Update localStorage (backward compat)            │
              │  for (const [peer, data] of Object.entries(peerData))│
              │  {                                                   │
              │    const key = `answers_${peer}`;                    │
              │    const existing = JSON.parse(                      │
              │      localStorage.getItem(key) || '{}'               │
              │    );                                                │
              │    localStorage.setItem(key, JSON.stringify({        │
              │      ...existing,                                    │
              │      ...data.answers                                 │
              │    }));                                              │
              │  }                                                   │
              │                                                      │
              │  // Update IDB peerCache                             │
              │  for (const [peer, data] of Object.entries(peerData))│
              │  {                                                   │
              │    for (const [qId, ans] of                          │
              │         Object.entries(data.answers)) {              │
              │      await storage.set('peerCache',                  │
              │        [peer, qId], {                                │
              │          value: ans.value,                           │
              │          timestamp: ans.timestamp,                   │
              │          seenAt: Date.now()                          │
              │        });                                           │
              │    }                                                 │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       UPDATE IN-MEMORY CLASSDATA                     │
              │                                                      │
              │  for (const [peer, data] of Object.entries(peerData))│
              │  {                                                   │
              │    if (!classData.users[peer]) {                     │
              │      classData.users[peer] = { answers: {} };        │
              │    }                                                 │
              │    Object.assign(                                    │
              │      classData.users[peer].answers,                  │
              │      data.answers                                    │
              │    );                                                │
              │  }                                                   │
              └─────────────────────────────────────────────────────┘
```

---

## 8. SPRITE SYSTEM — Animation States

### Sprite Animation State Machine

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       SPRITE ANIMATION STATES                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────────────┐
                              │         IDLE          │
                              │                       │
                              │  state: 'idle'        │
                              │  y: groundY           │
                              │  jumpVelocity: 0      │
                              │                       │
                              │  Animation:           │
                              │  frames [0, 10]       │
                              │  speed: 3.0 (slow)    │
                              │  Occasional blink     │
                              └───────────┬───────────┘
                                          │
                                          │ jump() called
                                          │ (correct answer)
                                          ▼
              ┌─────────────────────────────────────────────────────┐
              │                     JUMPING                          │
              │                                                      │
              │  state: 'jumping'                                    │
              │  jumpVelocity: -400 (jumpPower, upward)              │
              │                                                      │
              │  Each frame:                                         │
              │    jumpVelocity += gravity * deltaTime               │
              │    y += jumpVelocity * deltaTime                     │
              │                                                      │
              │  Animation:                                          │
              │    frames [0]                                        │
              │    Rising upward                                     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      │ jumpVelocity crosses 0
                                      │ (apex reached)
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │                    SUSPENDED                         │
              │                                                      │
              │  state: 'suspended'                                  │
              │  suspensionTimer: 5 seconds                          │
              │  y: peak height (floating)                           │
              │                                                      │
              │  If isCorrect:                                       │
              │    goldTimer: 3 seconds                              │
              │    Draw with gold hue overlay                        │
              │                                                      │
              │  Animation:                                          │
              │    Gentle floating                                   │
              │    Gold sparkle effect (if correct)                  │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      │ suspensionTimer expires
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │                     FALLING                          │
              │                                                      │
              │  state: 'falling'                                    │
              │                                                      │
              │  Each frame:                                         │
              │    jumpVelocity += gravity * deltaTime               │
              │    y += jumpVelocity * deltaTime                     │
              │                                                      │
              │  Animation:                                          │
              │    Descending                                        │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      │ y >= groundY
                                      │ (landed)
                                      ▼
                              ┌───────────────────────┐
                              │         IDLE          │
                              │                       │
                              │  y: groundY (snapped) │
                              │  jumpVelocity: 0      │
                              │  goldTimer: 0         │
                              │                       │
                              │  Back to idle anim    │
                              └───────────────────────┘
```

### Sprite Manager Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       SPRITE MANAGER STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────────────┘

              ┌─────────────────────────────────────────────────────┐
              │              MANAGER INITIALIZATION                  │
              │              SpriteManager.init()                     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       LISTEN FOR EVENTS                              │
              │                                                      │
              │  window.addEventListener('turboModeChanged')         │
              │  window.addEventListener('presenceChanged')          │
              │  window.addEventListener('resize')                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│turboModeChanged │        │presenceChanged  │        │    resize       │
│                 │        │                 │        │                 │
│ enabled: true   │        │ users: Set      │        │ Recalculate     │
│ → preloadKnown  │        │                 │        │ sprite positions│
│   Peers()       │        │ updateOnline    │        │                 │
│                 │        │ Peers(users)    │        │ repositionPeers │
│ enabled: false  │        │                 │        │ ()              │
│ → clearAllPeer  │        │                 │        │                 │
│   Sprites()     │        │                 │        │                 │
└─────────────────┘        └────────┬────────┘        └─────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────────────────┐
              │       updateOnlinePeers(users)                       │
              │                                                      │
              │  desired = Set(users) - currentUsername              │
              │                                                      │
              │  // Add new peers                                    │
              │  for (const user of desired) {                       │
              │    if (!peerSprites.has(user)) {                     │
              │      ensurePeerSprite(user);                         │
              │    }                                                 │
              │  }                                                   │
              │                                                      │
              │  // Remove offline peers                             │
              │  for (const [user, sprite] of peerSprites) {         │
              │    if (!desired.has(user)) {                         │
              │      removePeerSprite(user);                         │
              │    }                                                 │
              │  }                                                   │
              │                                                      │
              │  repositionPeers();                                  │
              └─────────────────────────────────────────────────────┘
```

### Peer Sprite Creation

```
              ┌─────────────────────────────────────────────────────┐
              │       ensurePeerSprite(username)                     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       CHECK IF EXISTS                                │
              │                                                      │
              │  if (peerSprites.has(username)) {                    │
              │    return peerSprites.get(username);                 │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       RESOLVE HUE (COLOR)                            │
              │                                                      │
              │  1. Try: localStorage.pigColor_${username}           │
              │  2. Try: localStorage.spriteColorHue_${username}     │
              │  3. Fallback: hashStringToHue(username)              │
              │                                                      │
              │  hashStringToHue():                                  │
              │    hash = 0                                          │
              │    for (char of username) {                          │
              │      hash = ((hash << 5) - hash) + charCode          │
              │    }                                                 │
              │    return Math.abs(hash) % 360                       │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       CREATE PEER SPRITE                             │
              │                                                      │
              │  sprite = new PeerSprite(spriteSheet, username, {    │
              │    x: 0,                                             │
              │    y: groundY,                                       │
              │    scale: 0.25,  // Smaller than player              │
              │    hue: resolvedHue                                  │
              │  })                                                  │
              │                                                      │
              │  peerSprites.set(username, sprite)                   │
              │  positionedUsernames.push(username)                  │
              │  engine.addEntity(`peer_${username}`, sprite)        │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       POSITION SPRITES                               │
              │                                                      │
              │  repositionPeers()                                   │
              │                                                      │
              │  // Calculate evenly spaced positions                │
              │  const count = positionedUsernames.length            │
              │  const leftMargin = viewportWidth * 0.10             │
              │  const usable = viewportWidth - (leftMargin * 2)     │
              │  const gap = usable / (count - 1)                    │
              │                                                      │
              │  for (let i = 0; i < count; i++) {                   │
              │    sprite.x = leftMargin + (i * gap)                 │
              │    sprite.y = groundY - sprite.height                │
              │  }                                                   │
              └─────────────────────────────────────────────────────┘
```

---

## 9. CHART SYSTEM — Rendering States

### Chart Rendering Flow

```
              ┌─────────────────────────────────────────────────────┐
              │     CHART QUESTION RENDERING                         │
              │     (question.type === 'chart')                      │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       PHASE 1: GENERATE HTML                         │
              │       getChartHtml(chartData, canvasId)              │
              │                                                      │
              │  Returns HTML string with:                           │
              │  • Chart container div                               │
              │  • <canvas id="{canvasId}">                          │
              │  • Title/labels                                      │
              │                                                      │
              │  NO SIDE EFFECTS - pure function                     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       INSERT INTO DOM                                │
              │                                                      │
              │  questionsContainer.innerHTML += html                │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       PHASE 2: RENDER ON CANVAS                      │
              │       requestAnimationFrame(() => {                  │
              │         renderChartNow(chartData, canvasId)          │
              │       })                                             │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       renderChartNow(chartData, canvasId)            │
              │                                                      │
              │  1. Get canvas element by ID                         │
              │  2. Check for existing Chart.js instance             │
              │     → If exists: chart.destroy()                     │
              │  3. Get 2D context                                   │
              │  4. Create new Chart.js instance:                    │
              │     new Chart(ctx, {                                 │
              │       type: chartData.chartType,                     │
              │       data: {                                        │
              │         labels: chartData.xLabels,                   │
              │         datasets: chartData.series.map(...)          │
              │       },                                             │
              │       options: chartData.chartConfig                 │
              │     })                                               │
              │  5. Register in window.chartInstances[canvasId]      │
              └─────────────────────────────────────────────────────┘
```

### Chart Types Supported

| Type | Chart.js Type | Description |
|------|--------------|-------------|
| `histogram` | `bar` | Frequency distribution |
| `bar` | `bar` | Categorical comparison |
| `line` | `line` | Time series / trends |
| `scatter` | `scatter` | Correlation plots |
| `pie` | `pie` / `doughnut` | Part-to-whole |
| `boxplot` | Plugin | Distribution summary |
| `dotplot` | Custom | Individual values |
| `normal` | `line` | Normal distribution curve |

---

## 10. EXPORT/IMPORT — Recovery Packs

### Export Flow

```
              ┌─────────────────────────────────────────────────────┐
              │     buildRecoveryPack(username)                      │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       GATHER DATA FROM STORAGE                       │
              │                                                      │
              │  // Try IDB first, fallback to localStorage          │
              │  const answers = await storage.getAllForUser(        │
              │    'answers', username) || getFromLS('answers')      │
              │                                                      │
              │  const reasons = await storage.getAllForUser(        │
              │    'reasons', username) || getFromLS('reasons')      │
              │                                                      │
              │  const attempts = await storage.getAllForUser(       │
              │    'attempts', username) || getFromLS('attempts')    │
              │                                                      │
              │  const progress = await storage.getAllForUser(       │
              │    'progress', username) || getFromLS('progress')    │
              │                                                      │
              │  const badges = await storage.getAllForUser(         │
              │    'badges', username) || getFromLS('badges')        │
              │                                                      │
              │  const charts = await storage.getAllForUser(         │
              │    'charts', username) || getFromLS('charts')        │
              │                                                      │
              │  const preferences = await storage.get(              │
              │    'preferences', username)                          │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       BUILD MANIFEST                                 │
              │                                                      │
              │  manifest = {                                        │
              │    version: 'student-recovery-pack',                 │
              │    schemaVersion: '2.0.0',                           │
              │    username: username,                               │
              │    timestampISO: new Date().toISOString(),           │
              │    timestamp: Date.now(),                            │
              │    appBuild: APP_VERSION,                            │
              │    integrity: {                                      │
              │      checksumSha256: null  // filled later           │
              │    }                                                 │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       BUILD PACK                                     │
              │                                                      │
              │  pack = {                                            │
              │    manifest,                                         │
              │    data: {                                           │
              │      answers,                                        │
              │      reasons,                                        │
              │      attempts,                                       │
              │      progress,                                       │
              │      badges,                                         │
              │      charts,                                         │
              │      preferences                                     │
              │    }                                                 │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       COMPUTE CHECKSUM (if crypto available)         │
              │                                                      │
              │  const dataString = JSON.stringify(pack.data)        │
              │  const hash = await crypto.subtle.digest(            │
              │    'SHA-256',                                        │
              │    new TextEncoder().encode(dataString)              │
              │  )                                                   │
              │  pack.manifest.integrity.checksumSha256 =            │
              │    Array.from(new Uint8Array(hash))                  │
              │      .map(b => b.toString(16).padStart(2, '0'))      │
              │      .join('')                                       │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       DOWNLOAD FILE                                  │
              │                                                      │
              │  const blob = new Blob(                              │
              │    [JSON.stringify(pack, null, 2)],                  │
              │    {type: 'application/json'}                        │
              │  )                                                   │
              │                                                      │
              │  const filename = `${username}_backup_${date}.json`  │
              │  downloadBlob(blob, filename)                        │
              └─────────────────────────────────────────────────────┘
```

### Import & Merge Flow

```
              ┌─────────────────────────────────────────────────────┐
              │     importPersonalData(fileData)                     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       VALIDATE PACK                                  │
              │       validateRecoveryPack(fileData)                 │
              │                                                      │
              │  Checks:                                             │
              │  • manifest.version exists                           │
              │  • data payload exists                               │
              │  • Verify checksum (if present)                      │
              │                                                      │
              │  Returns: { ok: bool, warnings: [], checksum }       │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │  VALID PACK     │                │  INVALID PACK   │
          │                 │                │                 │
          │  Continue with  │                │  Show error     │
          │  merge          │                │  Abort import   │
          └────────┬────────┘                └─────────────────┘
                   │
                   ▼
              ┌─────────────────────────────────────────────────────┐
              │       STANDARDIZE ANSWER FORMAT                      │
              │                                                      │
              │  // Legacy: answers = { Q1: "A", Q2: "B" }           │
              │  // New:    answers = { Q1: {value, timestamp}, ... }│
              │                                                      │
              │  for (const [qId, ans] of Object.entries(answers)) { │
              │    if (typeof ans !== 'object') {                    │
              │      answers[qId] = {                                │
              │        value: ans,                                   │
              │        timestamp: Date.now()                         │
              │      }                                               │
              │    }                                                 │
              │  }                                                   │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       MERGE WITH EXISTING DATA                       │
              │                                                      │
              │  For each question in imported data:                 │
              │                                                      │
              │  ┌────────────────────────────────────────────────┐ │
              │  │ existingTs = existing[qId]?.timestamp || 0     │ │
              │  │ newTs = imported[qId]?.timestamp || 0          │ │
              │  │                                                 │ │
              │  │ if (newTs > existingTs) {                      │ │
              │  │   // New is newer: UPDATE                       │ │
              │  │   existing[qId] = imported[qId]                │ │
              │  │ } else if (newTs === existingTs && newTs > 0) {│ │
              │  │   // Same timestamp: PRESERVE existing         │ │
              │  │   // (no change)                               │ │
              │  │ } else {                                        │ │
              │  │   // New is older: KEEP existing               │ │
              │  │   // (no change)                               │ │
              │  │ }                                               │ │
              │  └────────────────────────────────────────────────┘ │
              │                                                      │
              │  Attempts: keep MAX(existing, new)                   │
              │  Progress: keep MAX(existing, new)                   │
              │  Badges:   keep earliest timestamp per badge         │
              │  Preferences: overwrite with new                     │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       SAVE MERGED DATA                               │
              │                                                      │
              │  // Save to IDB (primary)                            │
              │  for (const [qId, ans] of Object.entries(merged)) {  │
              │    await storage.set('answers',                      │
              │      [username, qId], ans)                           │
              │  }                                                   │
              │                                                      │
              │  // Dual-write to localStorage                       │
              │  // Reinitialize classData                           │
              │  await initClassData()                               │
              │                                                      │
              │  // Update UI                                        │
              │  renderUnitMenu()                                    │
              └─────────────────────────────────────────────────────┘
```

---

## 11. ERROR HANDLING — Fallback Paths

### Storage Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       STORAGE ERROR HANDLING                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

IDB Write Error:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  try {                                                                          │
│    await IndexedDBAdapter.set(store, key, value)                               │
│  } catch (error) {                                                              │
│    console.error('[IndexedDBAdapter] Error:', error)                           │
│                                                                                 │
│    if (DualWriteAdapter && secondary) {                                        │
│      // Continue with localStorage only                                        │
│      await LocalStorageAdapter.set(store, key, value)                          │
│    } else {                                                                     │
│      // In-memory only, data may be lost                                       │
│      classData[store][key] = value                                             │
│    }                                                                            │
│  }                                                                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

localStorage Quota Exceeded:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  try {                                                                          │
│    localStorage.setItem(key, JSON.stringify(value))                            │
│  } catch (error) {                                                              │
│    if (error.name === 'QuotaExceededError') {                                  │
│      console.warn('[Storage] localStorage quota exceeded')                     │
│                                                                                 │
│      if (primaryIsIDB) {                                                       │
│        // IDB succeeded, localStorage failed                                   │
│        // Continue - data is safe in IDB                                       │
│        return  // OK                                                           │
│      } else {                                                                   │
│        // No storage available                                                 │
│        throw new StorageError('No storage available')                          │
│      }                                                                          │
│    }                                                                            │
│  }                                                                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Network Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       NETWORK ERROR HANDLING                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

Answer Push Failure:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  pushAnswerToSupabase() fails                                                  │
│                                                                                 │
│  ┌─────────────────────┐                                                       │
│  │ 1. Log error        │                                                       │
│  │ 2. Enqueue to outbox│──▶ outbox.push({op, data, tries: 0, createdAt})      │
│  │ 3. Schedule retry   │                                                       │
│  │    (5 second delay) │                                                       │
│  └─────────────────────┘                                                       │
│                                                                                 │
│  Outbox Processing:                                                            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  for (const item of outbox) {                                           │   │
│  │    try {                                                                 │   │
│  │      await executeOutboxItem(item)                                      │   │
│  │      outbox.remove(item.id)  // Success                                 │   │
│  │    } catch {                                                             │   │
│  │      item.tries++                                                        │   │
│  │      if (item.tries >= 3) {                                             │   │
│  │        // Keep in queue, needs manual intervention                      │   │
│  │        item.status = 'failed'                                           │   │
│  │      } else {                                                            │   │
│  │        // Will retry on next sync cycle                                 │   │
│  │      }                                                                   │   │
│  │    }                                                                     │   │
│  │  }                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

Peer Pull Failure:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  pullPeerDataFromRailway() fails                                               │
│                                                                                 │
│  ┌─────────────────────┐                                                       │
│  │ 1. Log error        │                                                       │
│  │ 2. Try Supabase     │──▶ pullPeerDataFromSupabase()                         │
│  │    directly         │                                                       │
│  └─────────────────────┘                                                       │
│            │                                                                    │
│            ▼                                                                    │
│  ┌─────────────────────┐                                                       │
│  │ Supabase also fails │                                                       │
│  │                     │                                                       │
│  │ 1. Use stale cache  │──▶ Last known peer data from peerCache               │
│  │ 2. Show stale       │                                                       │
│  │    indicator        │                                                       │
│  │ 3. Retry in 5s      │                                                       │
│  └─────────────────────┘                                                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Supabase Fallback Chain

```
              ┌─────────────────────────────────────────────────────┐
              │     SUPABASE OPERATION FALLBACK CHAIN                │
              └───────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       TRY: Railway Server                            │
              │       (if USE_RAILWAY = true)                        │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │    SUCCESS      │                │    FAILURE      │
          │                 │                │                 │
          │  Return result  │                │  Try next       │
          └─────────────────┘                └────────┬────────┘
                                                      │
                                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       TRY: Direct Supabase                           │
              │       (TURBO_MODE = true)                            │
              └───────────────────────┬─────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │    SUCCESS      │                │    FAILURE      │
          │                 │                │                 │
          │  Return result  │                │  Try next       │
          └─────────────────┘                └────────┬────────┘
                                                      │
                                                      ▼
              ┌─────────────────────────────────────────────────────┐
              │       FALLBACK: Local Storage                        │
              │                                                      │
              │  • Read: Use cached peerCache from IDB/localStorage  │
              │  • Write: Queue in outbox for later sync             │
              │                                                      │
              │  App continues to function offline                   │
              └─────────────────────────────────────────────────────┘
```

---

## 12. COMPLETE FLOW DIAGRAMS

### First-Time User Journey

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      FIRST-TIME USER JOURNEY                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────────────┐
    │    1. PAGE LOAD       │
    │                       │
    │ • Load HTML/CSS/JS    │
    │ • DOMContentLoaded    │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 2. INITIALIZE STORAGE │
    │                       │
    │ • Check IDB available │
    │ • Set up adapters     │
    │ • Run migration       │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 3. CHECK USERNAME     │
    │                       │
    │ • No saved username   │
    │ → Show welcome screen │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 4. WELCOME SCREEN     │
    │                       │
    │ • Click "New Student" │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 5. ENTER NAME         │
    │                       │
    │ • Type: "John Smith"  │
    │ • Click Continue      │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 6. CHECK DUPLICATES   │
    │                       │
    │ • Query Supabase      │
    │ • No match found      │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 7. GENERATE USERNAME  │
    │                       │
    │ • "Mango_Elephant"    │
    │ • Click "Let's Go!"   │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 8. CREATE ACCOUNT     │
    │                       │
    │ • Insert to Supabase  │
    │ • Save to IDB + LS    │
    │ • initClassData()     │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 9. SHOW WELCOME       │
    │                       │
    │ • "Welcome, Mango!"   │
    │ • Initialize sprites  │
    │ • Connect Railway     │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 10. RENDER UNIT MENU  │
    │                       │
    │ • Show AP Stats units │
    │ • Ready to answer     │
    │ • LOGGED_IN           │
    └───────────────────────┘
```

### Answer Submission Journey

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      ANSWER SUBMISSION JOURNEY                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────────────┐
    │ 1. VIEW QUESTION      │
    │                       │
    │ state: 'viewing'      │
    │ Question rendered     │
    │ Options displayed     │
    └───────────┬───────────┘
                │
                │ Click option "B"
                ▼
    ┌───────────────────────┐
    │ 2. SELECT ANSWER      │
    │                       │
    │ state: 'answering'    │
    │ Option B highlighted  │
    │ Reason textarea shown │
    └───────────┬───────────┘
                │
                │ Type reason
                │ Click Submit
                ▼
    ┌───────────────────────┐
    │ 3. SUBMIT ANSWER      │
    │                       │
    │ state: 'submitted'    │
    └───────────┬───────────┘
                │
                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    PROCESSING (parallel)                         │
    ├───────────────────────┬───────────────────────┬─────────────────┤
    │   Save to IDB         │   Save to localStorage│  Save reason    │
    │   answers store       │   answers_user key    │  reasons store  │
    │   [user, qId]         │                       │                 │
    └───────────────────────┴───────────────────────┴─────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 4. SYNC TO CLOUD      │
    │                       │
    │ pushAnswerToSupabase()│
    │ via Railway or direct │
    └───────────┬───────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│   Success     │ │   Failure     │
│   ✅ Synced   │ │   ⚠️ Offline  │
│               │ │   → outbox    │
└───────┬───────┘ └───────┬───────┘
        │                 │
        └────────┬────────┘
                 │
                 ▼
    ┌───────────────────────┐
    │ 5. FETCH PEER DATA    │
    │                       │
    │ pullPeerData()        │
    │ Update classData      │
    │ Cache to peerCache    │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 6. CHECK ANSWER       │
    │                       │
    │ Correct? → Jump + Gold│
    │ Incorrect? → Feedback │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 7. SHOW CONSENSUS     │
    │                       │
    │ Render peer answers   │
    │ Show percentages      │
    │ Highlight popular     │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 8. IDLE               │
    │                       │
    │ state: 'idle'         │
    │ Ready for next        │
    └───────────────────────┘
```

### Data Recovery Journey

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      DATA RECOVERY JOURNEY                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────────────┐
    │ 1. USER LOST DATA     │
    │                       │
    │ • New device          │
    │ • Browser cleared     │
    │ • Safari private mode │
    └───────────┬───────────┘
                │
                │ Has backup file?
                ▼
    ┌───────────────────────┐
    │ 2. CLICK RESTORE      │
    │                       │
    │ Settings → Import     │
    │ → "Restore from file" │
    └───────────┬───────────┘
                │
                │ Select JSON file
                ▼
    ┌───────────────────────┐
    │ 3. VALIDATE FILE      │
    │                       │
    │ validateRecoveryPack()│
    │ Check manifest        │
    │ Verify checksum       │
    └───────────┬───────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│   Valid       │ │   Invalid     │
│   Continue    │ │   Show error  │
└───────┬───────┘ └───────────────┘
        │
        ▼
    ┌───────────────────────┐
    │ 4. MERGE DATA         │
    │                       │
    │ For each answer:      │
    │ • New > Old → Update  │
    │ • New = Old → Keep    │
    │ • New < Old → Keep    │
    │                       │
    │ Attempts: MAX()       │
    │ Progress: MAX()       │
    │ Badges: earliest      │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 5. SAVE TO STORAGE    │
    │                       │
    │ Write to IDB          │
    │ Write to localStorage │
    │ Rebuild classData     │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ 6. UPDATE UI          │
    │                       │
    │ "✅ Restored X answers"│
    │ Re-render unit menu   │
    │ Show progress         │
    └───────────────────────┘
```

---

## 13. AI GRADING ESCALATION SYSTEM

Three-tier escalation system for fair, AI-augmented grading with student appeals.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI GRADING ESCALATION SYSTEM                          │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   TIER 1    │───▶│   TIER 2    │───▶│   TIER 3    │───▶│   FINAL     │  │
│  │ Auto-Grade  │    │  AI Review  │    │  AI Appeal  │    │   SCORE     │  │
│  │             │    │             │    │             │    │             │  │
│  │ • MCQ check │    │ • Groq LLM  │    │ • Student   │    │ • Best of   │  │
│  │ • Regex/    │    │ • Context-  │    │   explains  │    │   all tiers │  │
│  │   Rubric    │    │   aware     │    │ • AI judges │    │ • Stored    │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                              │
│  CRITICAL RULE: AI can only UPGRADE scores, never downgrade                 │
│  This protects students from AI hallucinations                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MCQ Grading Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MCQ SUBMISSION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

      Student submits MCQ answer
                │
                ▼
    ┌───────────────────────┐
    │   gradeMCQAnswer()    │
    │                       │
    │ Compare to correct    │
    │ answer (exact match)  │
    └───────────┬───────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
    CORRECT         INCORRECT
        │               │
        ▼               ▼
┌─────────────┐  ┌─────────────────────┐
│ Show ✅     │  │ Show escalation UI  │
│ "Correct!"  │  │                     │
│             │  │ • Initial "❌" msg  │
│ Score: E    │  │ • Show AI Review btn│
│ Done        │  │ • Store result      │
└─────────────┘  └──────────┬──────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Student clicks         │
              │  "🤖 Request AI Review" │
              └───────────┬─────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │   requestAIReview()     │
              │                         │
              │ • Build prompt with     │
              │   question context      │
              │ • Include student's     │
              │   reasoning if any      │
              │ • Call Railway /grade   │
              └───────────┬─────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │   Railway Server        │
              │   /api/ai/grade         │
              │                         │
              │ • Groq llama-3.3-70b    │
              │ • Temperature: 0.1      │
              │ • Queue rate limiting   │
              └───────────┬─────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
                ▼                   ▼
          Score = E           Score = P or I
                │                   │
                ▼                   ▼
        ┌─────────────┐    ┌─────────────────────┐
        │ UPGRADED!   │    │ Show Appeal button  │
        │             │    │ "📝 Appeal AI       │
        │ Score: E    │    │     Decision"       │
        │ Show upgrade│    │                     │
        │ notice      │    │ → Appeal Flow       │
        └─────────────┘    └─────────────────────┘
```

### FRQ Grading Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRQ SUBMISSION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

            ┌─────────────────────────────────────────┐
            │         FRQ Types                       │
            │                                         │
            │  • Single-part FRQ: gradeFRQAnswer()    │
            │  • Multi-part FRQ: gradeMultiPartFRQ()  │
            └────────────────────┬────────────────────┘
                                 │
                                 ▼
                   ┌─────────────────────────┐
                   │  Show escalation        │
                   │  container              │
                   │                         │
                   │  escalation-{id}        │
                   │  display: block         │
                   └───────────┬─────────────┘
                               │
                               ▼
                   ┌─────────────────────────┐
                   │  Show loading state     │
                   │                         │
                   │  🤖 "Analyzing your     │
                   │      response..."       │
                   └───────────┬─────────────┘
                               │
                               ▼
                   ┌─────────────────────────┐
                   │  Get grading rule       │
                   │                         │
                   │  getGradingRule() or    │
                   │  FRQGradingRules.generic│
                   └───────────┬─────────────┘
                               │
                               ▼
                   ┌─────────────────────────┐
                   │  engine.gradeAnswer()   │
                   │                         │
                   │  • type: 'dual' →       │
                   │    regex + AI           │
                   │  • type: 'ai' →         │
                   │    AI only              │
                   │  • type: 'regex' →      │
                   │    patterns only        │
                   └───────────┬─────────────┘
                               │
                               ▼
                   ┌─────────────────────────┐
                   │  Store result           │
                   │                         │
                   │  window.gradingResults  │
                   │  [questionId] = {       │
                   │    score, feedback,     │
                   │    matched, missing,    │
                   │    answer, questionType │
                   │  }                      │
                   └───────────┬─────────────┘
                               │
                               ▼
                   ┌─────────────────────────┐
                   │  displayGradingFeedback │
                   │  (questionId, result)   │
                   │                         │
                   │  • E → ✅ Excellent     │
                   │  • P → 🔶 Partial       │
                   │  • I → ❌ Needs work    │
                   └───────────┬─────────────┘
                               │
                       ┌───────┴───────┐
                       │               │
                       ▼               ▼
                   Score = E      Score ≠ E
                       │               │
                       ▼               ▼
               ┌─────────────┐  ┌─────────────────┐
               │ Done        │  │ Show Appeal btn │
               │             │  │                 │
               │ No appeal   │  │ btn-appeal-{id} │
               │ needed      │  │ display: inline │
               └─────────────┘  └─────────────────┘
```

### Appeal Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPEAL FLOW                                        │
└─────────────────────────────────────────────────────────────────────────────┘

    Student clicks "📝 Appeal AI Decision/Grading"
                        │
                        ▼
          ┌─────────────────────────────┐
          │     showAppealForm()        │
          │                             │
          │ • Hide appeal button        │
          │ • Show appeal form          │
          │ • Textarea for reasoning    │
          └─────────────┬───────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │  Student enters reasoning   │
          │                             │
          │  "I believe my answer       │
          │   deserves reconsideration  │
          │   because..."               │
          └─────────────┬───────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │     submitAppeal()          │
          │                             │
          │ • Validate non-empty text   │
          │ • Get previous result from  │
          │   window.gradingResults     │
          │ • Call grading engine       │
          └─────────────┬───────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │ engine.submitAppeal(        │
          │   answer,                   │
          │   appealText,               │
          │   previousResult,           │
          │   context                   │
          │ )                           │
          └─────────────┬───────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │   Railway Server            │
          │   /api/ai/appeal            │
          │                             │
          │ • buildAppealPrompt()       │
          │ • Includes fairness         │
          │   directive                 │
          │ • Groq llama-3.3-70b        │
          └─────────────┬───────────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
       newScore > old       newScore ≤ old
              │                   │
              ▼                   ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ APPEAL GRANTED   │  │ APPEAL DENIED    │
    │                  │  │                  │
    │ • Green styling  │  │ • Yellow styling │
    │ • "Score         │  │ • Original score │
    │    upgraded!"    │  │   maintained     │
    │ • Show new score │  │ • AI explanation │
    └──────────────────┘  └──────────────────┘
```

### Dual Grading (AI Can Only Upgrade)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DUAL GRADING STRATEGY                                   │
│                   gradeDual() in GradingEngine                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    Input Answer
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
    ┌─────────────────┐      ┌─────────────────┐
    │  Regex Grading  │      │   AI Grading    │
    │  (instant)      │      │   (async)       │
    │                 │      │                 │
    │  Pattern match  │      │  Groq LLM call  │
    │  Returns E/P/I  │      │  Returns E/P/I  │
    └────────┬────────┘      └────────┬────────┘
             │                        │
             └───────────┬────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Compare Scores    │
              │                     │
              │   scoreOrder:       │
              │   E=3, P=2, I=1     │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    AI > Regex      AI = Regex      AI < Regex
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ USE AI      │  │ USE AI      │  │ USE REGEX   │
│ SCORE       │  │ FEEDBACK    │  │ (ignore AI) │
│             │  │             │  │             │
│ _upgraded:  │  │ Both agree  │  │ _aiIgnored: │
│   true      │  │ prefer AI   │  │   true      │
│ _bestOf:    │  │ feedback    │  │ _bestOf:    │
│   'ai'      │  │ detail      │  │   'regex'   │
└─────────────┘  └─────────────┘  └─────────────┘

    CRITICAL: AI can NEVER downgrade a regex score.
    This protects students from AI hallucinations.
```

### Data Storage

```javascript
// Grading results stored in window.gradingResults
window.gradingResults[questionId] = {
    score: 'E' | 'P' | 'I',
    feedback: "Explanation of score",
    matched: ["element1", "element2"],      // Correct elements found
    missing: ["element3"],                   // Missing elements
    answer: "Student's original answer",
    questionType: 'multiple-choice' | 'free-response',
    _aiGraded: true | false,
    _provider: 'groq',
    _model: 'llama-3.3-70b-versatile',
    _bestOf: 'regex' | 'ai' | 'both'
};
```

### Key Functions Reference

| Function | File | Purpose |
|----------|------|---------|
| `gradeMCQAnswer()` | index.html | Initial MCQ grading, show escalation UI |
| `gradeFRQAnswer()` | index.html | Single-part FRQ grading |
| `gradeMultiPartFRQ()` | index.html | Progressive FRQ grading |
| `requestAIReview()` | index.html | Request AI to re-evaluate MCQ |
| `showAppealForm()` | index.html | Display appeal textarea |
| `hideAppealForm()` | index.html | Hide appeal textarea |
| `submitAppeal()` | index.html | Submit appeal to Railway |
| `displayAppealResult()` | index.html | Show granted/denied result |
| `displayGradingFeedback()` | index.html | Render E/P/I feedback UI |
| `GradingEngine.gradeAnswer()` | grading-engine.js | Core grading dispatcher |
| `GradingEngine.gradeDual()` | grading-engine.js | Regex + AI with upgrade-only |
| `GradingEngine.submitAppeal()` | grading-engine.js | Call Railway appeal endpoint |
| `/api/ai/grade` | server.js | Railway AI grading endpoint |
| `/api/ai/appeal` | server.js | Railway appeal endpoint |

### Railway Server Endpoints

```
POST /api/ai/grade
  Body: { scenario, answers, prompt, aiPromptTemplate }
  Returns: { score, feedback, matched, missing, _provider, _model }

POST /api/ai/appeal
  Body: { scenario, answers, appealText, previousResults }
  Returns: { score, feedback, appealGranted, appealResponse, _provider }
```

### Rate Limiting

```
┌─────────────────────────────────────────┐
│         GradingQueue (Railway)          │
│                                         │
│  GROQ_RATE_LIMIT:                       │
│  • maxRequestsPerMinute: 25             │
│  • minDelayBetweenRequests: 2500ms      │
│                                         │
│  Queue processes requests sequentially  │
│  with enforced delays between calls     │
└─────────────────────────────────────────┘
```

### Conditional Solution Display

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               SOLUTION/RUBRIC VISIBILITY LOGIC                              │
│                                                                              │
│  Design Philosophy: When AI grading works, students should rely on AI       │
│  feedback rather than immediately seeing the answer key.                    │
│                                                                              │
│  The solution/rubric is shown ONLY as a fallback when AI fails.            │
└─────────────────────────────────────────────────────────────────────────────┘

                    Student submits FRQ answer
                              │
                              ▼
                ┌─────────────────────────────┐
                │    AI Grading Attempt       │
                │                             │
                │  gradeFRQAnswer() or        │
                │  gradeMultiPartFRQ()        │
                └───────────────┬─────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐
          │  AI SUCCESS     │     │  AI FAILURE     │
          │                 │     │                 │
          │  _aiGraded:true │     │  _error: true   │
          │  No _error      │     │  OR no _aiGraded│
          │                 │     │  OR exception   │
          └────────┬────────┘     └────────┬────────┘
                   │                       │
                   ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐
          │  HIDE SOLUTION  │     │  SHOW SOLUTION  │
          │                 │     │                 │
          │  frq-solution-  │     │  displayFRQ-    │
          │  {id} stays     │     │  Solution()     │
          │  display: none  │     │  called         │
          │                 │     │                 │
          │  Student relies │     │  Student can    │
          │  on AI feedback │     │  compare to     │
          │  for learning   │     │  official rubric│
          └─────────────────┘     └─────────────────┘

                    Page Load (Answered Questions)
                              │
                              ▼
                ┌─────────────────────────────┐
                │    NO Auto-Display          │
                │                             │
                │  Solutions never auto-shown │
                │  on page load.              │
                │                             │
                │  Student must click         │
                │  "View Grading Feedback"    │
                │  to trigger grading flow.   │
                └─────────────────────────────┘

                    MCQ Answer Key Logic
                              │
                              ▼
                ┌─────────────────────────────┐
                │   displayAnswerKey()        │
                │                             │
                │  Check: window.gradingResults│
                │  [questionId]?._aiGraded    │
                └───────────────┬─────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐
          │  AI worked      │     │  AI failed      │
          │                 │     │                 │
          │  Hide answer    │     │  Show answer    │
          │  key - student  │     │  key with timer │
          │  uses AI        │     │  logic          │
          │  feedback       │     │                 │
          └─────────────────┘     └─────────────────┘
```

**Decision Flow Helper:**
```javascript
function shouldShowSolution(gradingResult) {
    // Show solution if AI NOT successful
    if (!gradingResult?._aiGraded) return true;  // No AI grading
    if (gradingResult?._error) return true;       // AI had error
    return false;                                  // AI worked - hide solution
}
```

---

## State Summary Table

| Component | Initial State | Stable States | Error State |
|-----------|--------------|---------------|-------------|
| **Storage** | NOT_INITIALIZED | IDB_PRIMARY, LS_FALLBACK | NO_STORAGE |
| **Auth** | NO_USERNAME | LOGGED_IN | - |
| **WebSocket** | DISCONNECTED | CONNECTED | RECONNECTING |
| **Turbo Mode** | DISABLED | ENABLED, ENABLED_RAILWAY | FALLBACK |
| **Quiz** | IDLE | VIEWING, ANSWERING, SUBMITTED | - |
| **Sprite** | IDLE | JUMPING, SUSPENDED, FALLING | - |
| **Chart** | EMPTY | RENDERED | FAILED |
| **Sync** | OFFLINE | SYNCED | PENDING |
| **AI Grading** | IDLE | GRADING, APPEALING | ERROR |
| **Escalation** | HIDDEN | FEEDBACK_SHOWN, APPEAL_FORM | - |

---

## Key Functions Reference

| Component | File | Key Functions |
|-----------|------|---------------|
| **Storage** | `js/storage/index.js` | `initializeStorage()`, `getStorage()`, `waitForStorage()` |
| **Auth** | `js/auth.js` | `promptUsername()`, `acceptUsername()`, `generateRandomUsername()` |
| **Data** | `js/data_manager.js` | `initClassData()`, `saveClassData()`, `rebuildClassDataView()` |
| **Railway** | `railway_client.js` | `initializeRailwayConnection()`, `connectWebSocket()`, `pullPeerDataFromRailway()` |
| **Sync** | `index.html` | `pushAnswerToSupabase()`, `pullPeerDataFromSupabase()`, `smartSyncWithSupabase()` |
| **Sprites** | `js/sprite_manager.js` | `SpriteManager.init()`, `ensurePeerSprite()`, `repositionPeers()` |
| **Charts** | `js/charts.js` | `getChartHtml()`, `renderChartNow()` |
| **AI Grading** | `js/grading/grading-engine.js` | `GradingEngine.gradeAnswer()`, `gradeDual()`, `submitAppeal()` |
| **Escalation** | `index.html` | `gradeMCQAnswer()`, `gradeFRQAnswer()`, `gradeMultiPartFRQ()`, `submitAppeal()` |

---

*Last updated: January 2026*
