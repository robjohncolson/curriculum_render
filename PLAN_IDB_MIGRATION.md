# IndexedDB Migration Plan

## Overview

Migrate from localStorage to IndexedDB as the primary durable store to handle browser Tracking Prevention degrading localStorage reliability. This plan maintains the static site architecture (no build step) while adding robust offline-first persistence.

## Goals

1. Stop relying on localStorage for durable state
2. Keep the app as a static site (no build step)
3. Preserve offline-ish behavior and bidirectional sync with Supabase/Railway
4. Minimize CORS friction
5. Maintain Recovery Pack export/import functionality

---

## Phase 1: Storage Abstraction Layer

### 1.1 Create `js/storage/storage_adapter.js`

```javascript
// Abstract interface for storage operations
// Allows swapping between localStorage and IndexedDB implementations

class StorageAdapter {
  async get(key) { throw new Error('Not implemented'); }
  async set(key, value) { throw new Error('Not implemented'); }
  async remove(key) { throw new Error('Not implemented'); }
  async list(prefix) { throw new Error('Not implemented'); }
  async clear() { throw new Error('Not implemented'); }
  async keys() { throw new Error('Not implemented'); }
}
```

**Key design decisions:**
- All methods are `async` (IDB is async, localStorage can be wrapped)
- Returns parsed objects (no JSON.stringify/parse at call sites)
- `list(prefix)` returns all keys matching prefix (for `answers_*` pattern)

### 1.2 Create `js/storage/localstorage_adapter.js`

```javascript
// Wraps localStorage with async interface for dual-write period
// Used as fallback when IDB unavailable

class LocalStorageAdapter extends StorageAdapter {
  async get(key) {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    try { return JSON.parse(value); }
    catch { return value; }
  }

  async set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async remove(key) {
    localStorage.removeItem(key);
  }

  async list(prefix) {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(prefix));
  }
}
```

### 1.3 Create `js/storage/indexeddb_adapter.js`

```javascript
// Primary storage adapter using IndexedDB
// Handles schema versioning and migrations

class IndexedDBAdapter extends StorageAdapter {
  constructor(dbName = 'ConsensusQuizDB', version = 1) { ... }

  async open() {
    // Opens/creates database with object stores
    // Handles version upgrades
  }

  // Implements all StorageAdapter methods
}
```

---

## Phase 2: IndexedDB Schema

### 2.1 Database: `ConsensusQuizDB`

**Object Stores:**

| Store | Key Path | Indexes | Purpose |
|-------|----------|---------|---------|
| `meta` | `key` | - | Schema version, client ID, username, sync timestamps |
| `answers` | `[username, questionId]` | `username`, `questionId`, `timestamp` | User quiz answers |
| `reasons` | `[username, questionId]` | `username` | Answer explanations |
| `attempts` | `[username, questionId]` | `username` | Attempt counts |
| `progress` | `[username, lessonKey]` | `username` | Lesson/unit progress |
| `badges` | `[username, badgeId]` | `username` | Achievement badges |
| `charts` | `[username, chartId]` | `username` | Custom chart data |
| `preferences` | `username` | - | User preferences |
| `peerCache` | `[peerUsername, questionId]` | `peerUsername`, `seenAt` | Cached peer answers |
| `outbox` | autoIncrement | `createdAt` | Pending sync operations |
| `sprites` | `username` | - | Sprite color preferences |

### 2.2 Schema Version

```javascript
const SCHEMA_VERSION = 1;

// Stored in meta store
{
  key: 'schemaVersion',
  value: 1,
  migratedFromLocalStorageAt: null // ISO timestamp when migration occurred
}
```

### 2.3 Data Structures

**Answer Record:**
```javascript
{
  username: 'Apple_Zebra',
  questionId: 'U1-L3-Q01',
  value: 'B',
  timestamp: 1702847123456,
  updatedAt: 1702847123456,
  sourceClientId: 'client_abc123'
}
```

**Outbox Record:**
```javascript
{
  id: 1, // auto-increment
  opType: 'answer_submit',
  payload: { username, questionId, value, timestamp },
  createdAt: 1702847123456,
  tries: 0,
  lastTryAt: null
}
```

**Peer Cache Record:**
```javascript
{
  peerUsername: 'Banana_Lion',
  questionId: 'U1-L3-Q01',
  value: 'C',
  timestamp: 1702847100000,
  seenAt: 1702847123456
}
```

---

## Phase 3: Migration from localStorage

### 3.1 Migration Strategy

On app boot:
1. Check if IDB `meta.schemaVersion` exists
2. If not (fresh or migrating), check localStorage for legacy data
3. Migrate all user data to IDB
4. Mark migration complete with timestamp
5. During dual-write period, continue writing to both

### 3.2 Migration Function

```javascript
async function migrateFromLocalStorage(idb) {
  // Check if already migrated
  const meta = await idb.get('meta', 'schemaVersion');
  if (meta?.migratedFromLocalStorageAt) {
    console.log('Already migrated from localStorage');
    return false;
  }

  const username = localStorage.getItem('consensusUsername');
  if (!username) {
    // No data to migrate
    await idb.set('meta', { key: 'schemaVersion', value: SCHEMA_VERSION });
    return false;
  }

  // Migrate user-specific data
  const dataTypes = ['answers', 'reasons', 'progress', 'timestamps', 'attempts', 'badges', 'charts', 'preferences'];

  for (const type of dataTypes) {
    const key = `${type}_${username}`;
    const data = localStorage.getItem(key);
    if (data) {
      // Parse and store in appropriate IDB store
      await migrateDataType(idb, type, username, JSON.parse(data));
    }
  }

  // Migrate classData peer information
  const classData = localStorage.getItem('classData');
  if (classData) {
    await migratePeerCache(idb, JSON.parse(classData), username);
  }

  // Migrate sprite colors
  const spriteHue = localStorage.getItem('spriteColorHue');
  if (spriteHue) {
    await idb.set('sprites', { username, hue: parseInt(spriteHue, 10) });
  }

  // Mark migration complete
  await idb.set('meta', {
    key: 'schemaVersion',
    value: SCHEMA_VERSION,
    migratedFromLocalStorageAt: new Date().toISOString()
  });

  return true;
}
```

### 3.3 Keys to Migrate

| localStorage Key | IDB Store | Notes |
|------------------|-----------|-------|
| `consensusUsername` | `meta` | Store as `{ key: 'username', value: '...' }` |
| `recentUsernames` | `meta` | Store as `{ key: 'recentUsernames', value: [...] }` |
| `answers_${username}` | `answers` | Flatten into individual records |
| `reasons_${username}` | `reasons` | Flatten into individual records |
| `timestamps_${username}` | (merged into answers) | Timestamps now part of answer record |
| `attempts_${username}` | `attempts` | Flatten into individual records |
| `progress_${username}` | `progress` | Flatten into individual records |
| `badges_${username}` | `badges` | Flatten into individual records |
| `charts_${username}` | `charts` | Flatten into individual records |
| `preferences_${username}` | `preferences` | Single record per user |
| `classData.users[other]` | `peerCache` | Extract peer answers only |
| `spriteColorHue` | `sprites` | Store with username |
| `recoveryAutoExportEnabled` | `meta` | Feature flag |

---

## Phase 4: Sync Strategy

### 4.1 Write Path (Answer Submit)

```
User submits answer
       ↓
1. Write to IDB immediately (durable)
2. Enqueue outbox operation
3. If online, flush outbox
       ↓
   Railway/Supabase
```

**Outbox Processing:**
```javascript
async function flushOutbox() {
  const pending = await idb.getAll('outbox');
  if (pending.length === 0) return;

  // Batch submit to Railway (if enabled) or Supabase
  try {
    await batchSubmit(pending.map(p => p.payload));

    // Clear processed items
    for (const item of pending) {
      await idb.remove('outbox', item.id);
    }
  } catch (error) {
    // Increment tries, will retry next flush
    for (const item of pending) {
      item.tries++;
      item.lastTryAt = Date.now();
      await idb.set('outbox', item);
    }
  }
}
```

### 4.2 Read Path (Peer Updates)

```
Poll Railway/Supabase (or WebSocket event)
       ↓
1. Fetch peer data (with ?since= for incremental)
2. Upsert into peerCache in IDB
3. Rebuild in-memory classData view
       ↓
   UI updates from classData
```

### 4.3 Conflict Resolution

- **Per-question last-write-wins** using `timestamp` field
- Tie-breaker: `sourceClientId` lexical comparison
- Server `updated_at` takes precedence if available

---

## Phase 5: Files to Modify

### 5.1 New Files

| File | Purpose |
|------|---------|
| `js/storage/storage_adapter.js` | Abstract base class |
| `js/storage/localstorage_adapter.js` | localStorage wrapper |
| `js/storage/indexeddb_adapter.js` | IndexedDB implementation |
| `js/storage/migration.js` | localStorage → IDB migration |
| `js/storage/index.js` | Exports and initialization |

### 5.2 Modified Files

| File | Changes |
|------|---------|
| `index.html` | Import storage modules, initialize IDB, update inline code |
| `js/auth.js` | Use storage adapter for username/recentUsernames |
| `js/data_manager.js` | Use storage adapter, update classData to be in-memory view |
| `railway_client.js` | Use storage adapter for peer cache updates |
| `js/sprite_manager.js` | Use storage adapter for sprite colors |
| `js/entities/player_sprite.js` | Use storage adapter for sprite hue |

### 5.3 Detailed Changes per File

#### `index.html`
- Add script tags for new storage modules
- Initialize storage adapter on load
- Run migration if needed
- Update answer submission to use adapter
- Update peer data merge to use adapter

#### `js/auth.js`
- Replace `localStorage.getItem('consensusUsername')` with `await storage.get('meta', 'username')`
- Replace `localStorage.setItem('recentUsernames', ...)` with `await storage.set('meta', 'recentUsernames', ...)`
- Make `promptUsername()` async

#### `js/data_manager.js`
- Change `classData` to in-memory object rebuilt from:
  - Current user's answers (from IDB)
  - Peer cache (from IDB)
  - WebSocket/poll updates
- Update `saveClassData()` to write to IDB stores
- Update `buildRecoveryPack()` to read from IDB
- Update `importPersonalData()` / `importMasterData()` to write to IDB

---

## Phase 6: In-Memory classData View

### 6.1 Rebuild Strategy

Instead of persisting `classData` as a single blob, rebuild on demand:

```javascript
async function rebuildClassDataView() {
  const username = await storage.getMeta('username');

  // Get current user's data from IDB
  const userAnswers = await storage.getAllForUser('answers', username);
  const userReasons = await storage.getAllForUser('reasons', username);
  const userAttempts = await storage.getAllForUser('attempts', username);
  const userCharts = await storage.getAllForUser('charts', username);

  // Get peer data from cache
  const peerCache = await storage.getAll('peerCache');

  // Build classData structure
  const classData = { users: {} };

  // Add current user
  classData.users[username] = {
    answers: indexByQuestionId(userAnswers),
    reasons: indexByQuestionId(userReasons),
    attempts: indexByQuestionId(userAttempts),
    charts: indexByChartId(userCharts),
    currentActivity: { state: 'idle', questionId: null, lastUpdate: Date.now() }
  };

  // Add peers from cache
  for (const peer of groupBy(peerCache, 'peerUsername')) {
    classData.users[peer.username] = {
      answers: indexByQuestionId(peer.records)
    };
  }

  return classData;
}
```

### 6.2 Update Triggers

Rebuild `classData` view when:
- App initializes
- User submits an answer
- Peer data received from server/WebSocket
- Import completes

---

## Phase 7: Permissions & UX

### 7.1 IndexedDB (No Prompt Required)

IDB doesn't require user permission. Just use it.

### 7.2 Persistent Storage Request

After user gesture (e.g., username accepted):

```javascript
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    if (isPersisted) {
      console.log('Storage will not be cleared except by explicit user action');
    } else {
      console.log('Storage may be cleared by the UA under storage pressure');
      // Show subtle warning to user about enabling auto-backup
    }
  }
}
```

### 7.3 File System Access (Optional Auto-Backup)

Keep existing Recovery Pack system. Optionally enhance with File System Access API:

```javascript
async function setupAutoBackup() {
  if (!('showDirectoryPicker' in window)) {
    // Fall back to manual download
    return false;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    // Store handle for future writes (handle persists across sessions)
    await storage.setMeta('autoBackupHandle', dirHandle);
    return true;
  } catch (err) {
    // User cancelled or API unavailable
    return false;
  }
}
```

---

## Phase 8: Dual-Write Period

### 8.1 Strategy

During transition, write to both localStorage and IDB:

```javascript
class DualWriteAdapter extends StorageAdapter {
  constructor(primary, secondary) {
    this.primary = primary;   // IndexedDBAdapter
    this.secondary = secondary; // LocalStorageAdapter
  }

  async set(store, key, value) {
    // Write to IDB (primary)
    await this.primary.set(store, key, value);

    // Also write to localStorage (secondary) for backwards compatibility
    try {
      await this.secondary.set(legacyKey(store, key), value);
    } catch (e) {
      // localStorage might fail under tracking prevention
      console.warn('localStorage write failed:', e);
    }
  }

  async get(store, key) {
    // Always read from IDB
    return this.primary.get(store, key);
  }
}
```

### 8.2 Disable localStorage Writes

After sufficient testing period, disable localStorage writes:

```javascript
const DUAL_WRITE_ENABLED = false; // Toggle to disable
```

---

## Phase 9: Recovery Pack Updates

### 9.1 Export from IDB

```javascript
async function buildRecoveryPack(username) {
  const pack = {
    manifest: {
      version: 'student-recovery-pack',
      schemaVersion: '2.0.0', // New version for IDB-based packs
      username,
      timestampISO: new Date().toISOString(),
      storageBackend: 'indexeddb'
    },
    data: {
      answers: await storage.getAllForUser('answers', username),
      reasons: await storage.getAllForUser('reasons', username),
      progress: await storage.getAllForUser('progress', username),
      attempts: await storage.getAllForUser('attempts', username),
      badges: await storage.getAllForUser('badges', username),
      charts: await storage.getAllForUser('charts', username),
      preferences: await storage.get('preferences', username),
      sprites: await storage.get('sprites', username)
    },
    // Optional: include localStorage mirror during dual-write period
    localStorageMirror: DUAL_WRITE_ENABLED ? buildLegacyMirror(username) : null
  };

  return pack;
}
```

### 9.2 Import to IDB

```javascript
async function importRecoveryPack(pack) {
  const { username } = pack.manifest;

  // Handle both v1 (localStorage) and v2 (IDB) formats
  if (pack.manifest.schemaVersion?.startsWith('1.')) {
    // Legacy format - convert and import
    await importLegacyPack(pack);
  } else {
    // New format - direct import
    await importDirectPack(pack);
  }

  // Rebuild classData view
  classData = await rebuildClassDataView();

  // Trigger UI refresh
  updateUI();
}
```

---

## Phase 10: Testing Checklist

### 10.1 Core Functionality

- [ ] Fresh user can create account and answer questions
- [ ] Returning user sees their previous answers
- [ ] Answers persist after browser restart
- [ ] Answers persist after browser restart with Tracking Prevention "Strict"
- [ ] Peer data displays correctly
- [ ] Real-time updates via WebSocket work

### 10.2 Migration

- [ ] Existing localStorage data migrates to IDB on first load
- [ ] Migration doesn't duplicate data on subsequent loads
- [ ] Users with no localStorage data start fresh in IDB

### 10.3 Sync

- [ ] Offline answer submit → close tab → reopen → flush on reconnect
- [ ] WebSocket updates populate peer cache without localStorage
- [ ] Incremental sync (since timestamp) works correctly

### 10.4 Recovery Pack

- [ ] Export creates valid pack from IDB data
- [ ] Import of v1 (localStorage) packs works
- [ ] Import of v2 (IDB) packs works
- [ ] Auto-backup to file system works (Chromium)

### 10.5 Edge Cases

- [ ] Multiple tabs don't conflict
- [ ] Username change preserves/migrates data correctly
- [ ] IDB quota exceeded shows appropriate error
- [ ] IDB unavailable falls back gracefully

---

## Implementation Order

1. **Week 1: Foundation**
   - Create storage adapter interface
   - Implement LocalStorageAdapter
   - Implement IndexedDBAdapter
   - Create initialization and fallback logic

2. **Week 2: Migration**
   - Implement localStorage → IDB migration
   - Test migration with real data
   - Add dual-write capability

3. **Week 3: Integration**
   - Update `js/auth.js`
   - Update `js/data_manager.js`
   - Update `index.html` inline code
   - Update `railway_client.js`

4. **Week 4: Polish**
   - Update Recovery Pack export/import
   - Add persistent storage request
   - Update sprite storage
   - Comprehensive testing

5. **Week 5: Monitoring**
   - Deploy to staging
   - Test with Tracking Prevention browsers
   - Monitor for issues
   - Disable dual-write if stable

---

## Rollback Plan

If issues arise:
1. Set `USE_INDEXEDDB = false` flag
2. App falls back to LocalStorageAdapter
3. No data loss (dual-write period data in both)
4. Users can manually export Recovery Pack

---

## CORS Notes

No changes to CORS strategy needed:
- IDB is client-side only (no CORS)
- Railway server already handles CORS for sync
- Supabase origins configured in dashboard
- Keep Railway as single production endpoint
