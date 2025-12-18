# Sync UX Improvement Plan

## Overview
Make students feel confident their work is safe, especially during data recovery scenarios.

---

## Feature A: Sync Progress Screen (Blocking with Skip Option)

### Trigger Points
1. **Normal Login**: When returning student selects name from dropdown
2. **Recovery Mode**: When local is empty but Supabase has data for that user

### Detection Logic
```javascript
// After student selects username from dropdown:
async function checkAndInitiateSync(username) {
    const localAnswers = await getLocalAnswerCount(username);
    const cloudInfo = await getCloudAnswerInfo(username); // count, lastActivity, lessons

    if (localAnswers === 0 && cloudInfo.count > 0) {
        // RECOVERY MODE - show detailed recovery screen
        showRecoveryModeScreen(username, cloudInfo);
    } else if (cloudInfo.count > localAnswers) {
        // NORMAL SYNC - cloud has more, show sync progress
        showSyncProgressScreen(username, cloudInfo.count - localAnswers);
    } else {
        // UP TO DATE - proceed immediately
        acceptUsername(username);
    }
}
```

### UI: Recovery Mode Screen
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  🔄 Welcome back, Edgar!                        │
│                                                 │
│  Your local data was cleared, but don't worry! │
│  We found your work saved in the cloud.        │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 📊 Found in cloud:                      │   │
│  │    47 answers                           │   │
│  │    Last activity: Dec 15, 2024 2:34 PM  │   │
│  │                                         │   │
│  │ 📚 Lessons with progress:               │   │
│  │    • U1-L3 (3/3 complete)              │   │
│  │    • U1-L4 (4/6 complete)              │   │
│  │    • U2-L1 (2/3 complete)              │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ████████████████░░░░░░░░  67%                 │
│  Restoring... 32 of 47 answers                 │
│                                                 │
│  💡 Your work is safely stored online and      │
│     syncs automatically - it's never lost!     │
│                                                 │
│  ─────────────────────────────────────────────  │
│  <small>Have a backup file?</small>            │
│  <link>Load from file instead</link>           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### UI: Normal Sync Screen (simpler)
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  🔄 Syncing your progress...                   │
│                                                 │
│  ████████████░░░░░░░░░░░░  45%                 │
│  Downloaded 12 of 27 new answers               │
│                                                 │
│  ─────────────────────────────────────────────  │
│  <link>Skip and continue</link>                │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Timeout Behavior
- After 30 seconds: Show "Taking longer than expected. Skip and continue?"
- Skip button always visible (small, like "forgot password")
- If skipped, sync continues in background

### Implementation Location
- New function in `js/auth.js`: `showSyncProgressScreen()`
- New function in `js/auth.js`: `showRecoveryModeScreen()`
- Modify `acceptUsername()` flow to check sync status first
- New helper in `index.html`: `getCloudAnswerInfo(username)` - queries Supabase for count/info

---

## Feature B: Sync Status Indicator

### Replace Current Element
Current: `#peerDataTimestamp` showing "📊 Peer data current as of: X hours ago 🚀"

New: Persistent sync status badge

### States
| State | Icon | Text | Color |
|-------|------|------|-------|
| All Synced | ☁️✓ | All synced | Green |
| Syncing | ☁️🔄 | Syncing... | Yellow/Orange |
| Downloading | ☁️⬇️ | Restoring X/Y | Blue |
| Offline | ☁️✗ | Offline | Gray |
| Error | ☁️⚠️ | Sync failed | Red |

### Tooltip Content (on click)
```
┌──────────────────────────────┐
│ ☁️ Cloud Sync Status         │
│ ─────────────────────────    │
│ Your answers: 47 saved       │
│ Last sync: 2 min ago         │
│ Status: ✓ All caught up      │
│                              │
│ [Progress bar if syncing]    │
│ ████████████░░░░  75%        │
│ Downloading 15 of 20...      │
└──────────────────────────────┘
```

### Implementation
- Replace `updatePeerDataTimestamp()` with `updateSyncStatusIndicator()`
- Track sync state globally: `window.syncState = { status, progress, total, lastSync }`
- Update indicator whenever sync operations occur

---

## Feature C: Mid-Sync User Switch Protection

### Analysis
Based on code review, switching users mid-sync would:
1. Change `currentUsername` global
2. Downloaded answers would go to localStorage under new username (unlikely issue)
3. Main risk: Confusion, not data loss

### Decision
Since no real data loss occurs, this is LOW PRIORITY. Could add later if students report confusion.

### If Implemented (future)
```javascript
// Before allowing user switch:
if (window.syncState?.status === 'syncing') {
    const proceed = confirm(
        'Sync in progress!\n\n' +
        'Switching users now will:\n' +
        '• Stop the current sync\n' +
        '• Your data is still safe in the cloud\n\n' +
        'Continue anyway?'
    );
    if (!proceed) return;
}
```

---

## Feature D: Recovery Mode Detection

### When to Detect
In the new `checkAndInitiateSync()` function, BEFORE calling `acceptUsername()`.

### Cloud Info Query
```javascript
async function getCloudAnswerInfo(username) {
    if (!supabaseClient) return { count: 0, lastActivity: null, lessons: [] };

    const { data, error } = await supabaseClient
        .from('answers')
        .select('question_id, timestamp')
        .eq('username', username);

    if (error || !data) return { count: 0, lastActivity: null, lessons: [] };

    // Process data
    const count = data.length;
    const lastActivity = Math.max(...data.map(d => Number(d.timestamp)));

    // Group by lesson (U1-L3-Q01 -> U1-L3)
    const lessonProgress = {};
    data.forEach(row => {
        const lesson = row.question_id.replace(/-Q\d+$/, '');
        if (!lessonProgress[lesson]) lessonProgress[lesson] = { answered: 0, total: getTotalForLesson(lesson) };
        lessonProgress[lesson].answered++;
    });

    return { count, lastActivity, lessons: lessonProgress };
}
```

### Offline Fallback
If Supabase unreachable:
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ⚠️ Can't reach the cloud right now            │
│                                                 │
│  We couldn't verify your cloud backup.         │
│  This might be a network issue.                │
│                                                 │
│  Options:                                       │
│                                                 │
│  [🔄 Try Again]                                │
│                                                 │
│  [📁 Load from backup file]                    │
│                                                 │
│  [➡️ Continue anyway]                          │
│     (You can sync later when online)           │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Implementation Order

### Phase 1: Core Recovery Mode
1. Add `getCloudAnswerInfo(username)` helper
2. Add `checkAndInitiateSync(username)`
3. Add `showRecoveryModeScreen()` with full UI
4. Modify welcome screen to call `checkAndInitiateSync` instead of `acceptUsername` directly

### Phase 2: Sync Progress
1. Add `showSyncProgressScreen()` for normal sync cases
2. Track download progress during `restoreFromCloudByUsername()`
3. Add skip functionality that continues in background

### Phase 3: Status Indicator
1. Add `window.syncState` tracking
2. Replace `#peerDataTimestamp` with new indicator
3. Add tooltip on click
4. Update indicator during all sync operations

### Phase 4: Test & Polish
1. Test export/import functionality works correctly
2. Test offline fallback behavior
3. Add CSS for new screens
4. Test various scenarios (new user, returning user, recovery mode, offline)

---

## Files to Modify

| File | Changes |
|------|---------|
| `js/auth.js` | Add recovery/sync screens, modify acceptUsername flow |
| `index.html` | Add getCloudAnswerInfo, modify sync functions to track progress |
| `css/styles.css` | New styles for recovery screen, progress bar, status indicator |

---

## Questions Resolved

- ✅ Continue anyway = background sync continues
- ✅ Progress shows X of Y answers (need total from cloud query)
- ✅ Lessons show full detail: "U1-L3 (3/3 complete)"
- ✅ 30 second timeout with skip option
- ✅ Offline fallback offers: retry, load file, continue anyway
