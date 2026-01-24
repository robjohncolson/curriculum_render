// diagnostics.js - Diagnostic logging system for debugging "disappeared work" issues
// Part of AP Statistics Consensus Quiz
// Phase 1: Local-first logging with optional Supabase upload

/**
 * Configuration for diagnostics system
 */
const DiagnosticsConfig = {
    // Enable/disable diagnostic logging
    ENABLED: true,

    // Log to console when debug mode is on
    DEBUG_CONSOLE: false,

    // Maximum events to store locally (circular buffer)
    MAX_EVENTS: 1000,

    // Prune check interval (every N inserts)
    PRUNE_INTERVAL: 50,

    // Enable Supabase upload (Phase 1: disabled by default)
    UPLOAD_ENABLED: false,

    // Memory fallback buffer size (when IDB unavailable)
    MEMORY_BUFFER_SIZE: 100
};

/**
 * Session ID - unique per page load for correlating events
 */
const DIAGNOSTICS_SESSION_ID = crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

/**
 * In-memory fallback buffer when IDB is unavailable
 */
let memoryBuffer = [];
let insertCount = 0;
let idbAvailable = null;
let idbAdapter = null; // Direct reference to IDB adapter (bypasses DualWriteAdapter)

/**
 * Safe error serialization - handles strings, Error objects, and other types
 */
function serializeError(err) {
    if (!err) return null;
    if (typeof err === 'string') return { message: err, stack: null };
    if (err instanceof Error) {
        return {
            message: err.message || String(err),
            stack: err.stack || null,
            name: err.name || 'Error'
        };
    }
    // Handle non-standard error objects
    try {
        return {
            message: String(err.message || err),
            stack: err.stack || null
        };
    } catch (e) {
        return { message: String(err), stack: null };
    }
}

/**
 * Build a diagnostic event with consistent schema
 * @param {string} eventType - Event type (e.g., 'answer_save_attempt')
 * @param {object} details - Event-specific details
 * @returns {object} Complete event object
 */
function buildDiagnosticEvent(eventType, details = {}) {
    const now = Date.now();

    return {
        event_type: eventType,
        timestamp: now,
        session_id: DIAGNOSTICS_SESSION_ID,
        username: typeof currentUsername !== 'undefined' ? currentUsername : null,
        storage_backend: getStorageBackendType(),
        turbo_mode_active: typeof turboModeActive !== 'undefined' ? turboModeActive : null,
        network_online: typeof navigator !== 'undefined' ? navigator.onLine : null,
        ...details
    };
}

/**
 * Get current storage backend type based on actual detection
 * Uses cached idbAdapter/idbAvailable from checkIDBAvailable() when available
 */
function getStorageBackendType() {
    // Use cached detection results if available (set by checkIDBAvailable)
    if (idbAvailable !== null) {
        if (idbAvailable && idbAdapter) {
            // Check if we're using DualWriteAdapter by looking at the global storage
            if (typeof getStorage === 'function') {
                try {
                    const s = getStorage();
                    if (s && s.primary) {
                        return 'dual-write';
                    }
                } catch (e) {
                    // Storage not ready yet
                }
            }
            return 'indexeddb';
        }
        return 'localstorage';
    }

    // Fallback: detection not yet run, use config-based guess
    // (will be corrected on subsequent events after checkIDBAvailable runs)
    if (typeof isStorageReady === 'function' && isStorageReady()) {
        if (typeof StorageConfig !== 'undefined' && StorageConfig.DUAL_WRITE_ENABLED) {
            return 'dual-write-pending'; // Indicates detection not yet confirmed
        }
        return 'indexeddb-pending';
    }
    return 'localstorage';
}

/**
 * Check if IDB diagnostics store is available and cache direct IDB adapter reference
 * This bypasses the DualWriteAdapter to prevent localStorage pollution
 */
async function checkIDBAvailable() {
    if (idbAvailable !== null) return idbAvailable;

    try {
        if (typeof waitForStorage !== 'function') {
            idbAvailable = false;
            return false;
        }

        const storage = await waitForStorage();

        // Detect actual IDB availability by checking for IDB-specific methods
        // that don't exist on LocalStorageAdapter:
        // - enqueueOutbox: only on IndexedDBAdapter
        // - requestPersistence: only on IndexedDBAdapter
        // - primary: indicates DualWriteAdapter wrapping IDB

        if (storage && storage.primary && typeof storage.primary.enqueueOutbox === 'function') {
            // DualWriteAdapter wrapping IDB - use the primary (IDB) adapter directly
            idbAdapter = storage.primary;
            idbAvailable = true;
        } else if (storage && typeof storage.enqueueOutbox === 'function') {
            // Direct IndexedDBAdapter
            idbAdapter = storage;
            idbAvailable = true;
        } else {
            // localStorage fallback or unknown - use memory buffer
            idbAvailable = false;
        }

        return idbAvailable;
    } catch (e) {
        idbAvailable = false;
        return false;
    }
}

/**
 * Log a diagnostic event - main entry point
 * Non-blocking, never throws
 * @param {string} eventType - Event type
 * @param {object} details - Event-specific details
 */
async function logDiagnosticEvent(eventType, details = {}) {
    if (!DiagnosticsConfig.ENABLED) return;

    try {
        const event = buildDiagnosticEvent(eventType, details);

        // Debug console logging
        if (DiagnosticsConfig.DEBUG_CONSOLE) {
            console.log(`[DIAG] ${eventType}`, event);
        }

        // Try IDB first
        const idbOk = await checkIDBAvailable();

        if (idbOk) {
            await writeDiagnosticToIDB(event);
        } else {
            // Fallback to memory buffer
            writeToMemoryBuffer(event);
        }

        // Periodic prune check
        insertCount++;
        if (insertCount % DiagnosticsConfig.PRUNE_INTERVAL === 0) {
            pruneDiagnosticsIfNeeded();
        }

    } catch (e) {
        // Logging must never fail the app - silently continue
        if (DiagnosticsConfig.DEBUG_CONSOLE) {
            console.warn('[DIAG] Failed to log event:', e);
        }
    }
}

/**
 * Write diagnostic event to IDB directly (bypasses DualWriteAdapter)
 */
async function writeDiagnosticToIDB(event) {
    try {
        if (!idbAdapter) {
            writeToMemoryBuffer(event);
            return;
        }

        // Write directly to IDB adapter, bypassing DualWriteAdapter
        // This prevents diagnostics from polluting localStorage
        // Key is auto-increment, so we pass null
        await idbAdapter.set('diagnostics', null, event);

    } catch (e) {
        // Fall back to memory if IDB write fails
        writeToMemoryBuffer(event);
    }
}

/**
 * Write to memory buffer as fallback
 */
function writeToMemoryBuffer(event) {
    memoryBuffer.push(event);

    // Enforce memory buffer size limit
    if (memoryBuffer.length > DiagnosticsConfig.MEMORY_BUFFER_SIZE) {
        memoryBuffer = memoryBuffer.slice(-DiagnosticsConfig.MEMORY_BUFFER_SIZE);
    }
}

/**
 * Prune old diagnostic events to maintain circular buffer
 */
async function pruneDiagnosticsIfNeeded() {
    try {
        const idbOk = await checkIDBAvailable();
        if (!idbOk || !idbAdapter) return;

        // Use idbAdapter directly to avoid dual-write issues
        const allEvents = await idbAdapter.getAll('diagnostics');

        if (allEvents.length > DiagnosticsConfig.MAX_EVENTS) {
            // Sort by timestamp (oldest first)
            allEvents.sort((a, b) => a.timestamp - b.timestamp);

            // Delete oldest events beyond the limit
            const toDelete = allEvents.slice(0, allEvents.length - DiagnosticsConfig.MAX_EVENTS);

            for (const event of toDelete) {
                if (event.id) {
                    await idbAdapter.remove('diagnostics', event.id);
                }
            }

            if (DiagnosticsConfig.DEBUG_CONSOLE) {
                console.log(`[DIAG] Pruned ${toDelete.length} old events`);
            }
        }
    } catch (e) {
        // Pruning failure is not critical
    }
}

/**
 * Get all diagnostic events (for debugging/export)
 * @param {object} options - { limit, since }
 * @returns {Promise<Array>} Array of diagnostic events
 */
async function getDiagnosticEvents(options = {}) {
    const { limit = 100, since = 0 } = options;

    let events = [];

    try {
        const idbOk = await checkIDBAvailable();

        if (idbOk && idbAdapter) {
            // Use idbAdapter directly
            events = await idbAdapter.getAll('diagnostics');
        }
    } catch (e) {
        // Fallback to memory buffer
    }

    // Merge with memory buffer
    events = [...events, ...memoryBuffer];

    // Filter by timestamp if specified
    if (since > 0) {
        events = events.filter(e => e.timestamp >= since);
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (limit > 0) {
        events = events.slice(0, limit);
    }

    return events;
}

/**
 * Clear all diagnostic events (for testing)
 */
async function clearDiagnostics() {
    memoryBuffer = [];

    try {
        const idbOk = await checkIDBAvailable();
        if (idbOk && idbAdapter) {
            // Use idbAdapter directly
            await idbAdapter.clear('diagnostics');
        }
    } catch (e) {
        // Ignore clear errors
    }
}

/**
 * Export diagnostics as JSON (for teacher/debugging)
 */
async function exportDiagnostics() {
    const events = await getDiagnosticEvents({ limit: 0 }); // Get all

    return {
        exportedAt: new Date().toISOString(),
        sessionId: DIAGNOSTICS_SESSION_ID,
        eventCount: events.length,
        events: events
    };
}

// ========================================
// INSTRUMENTATION HELPERS
// ========================================

/**
 * Log answer save attempt
 */
function logAnswerSaveAttempt(questionId, target = 'unknown') {
    logDiagnosticEvent('answer_save_attempt', {
        question_id: questionId,
        target: target,
        _startTime: performance.now()
    });
}

/**
 * Log answer save success
 */
function logAnswerSaveSuccess(questionId, target, startTime = null) {
    const details = {
        question_id: questionId,
        target: target,
        status: 'success'
    };

    if (startTime !== null) {
        details.elapsed_ms = Math.round(performance.now() - startTime);
    }

    logDiagnosticEvent('answer_save_success', details);
}

/**
 * Log answer save failure
 */
function logAnswerSaveFailure(questionId, target, error) {
    logDiagnosticEvent('answer_save_failure', {
        question_id: questionId,
        target: target,
        status: 'failure',
        error: serializeError(error)
    });
}

/**
 * Log answer load attempt
 */
function logAnswerLoadAttempt(username, source = 'unknown') {
    logDiagnosticEvent('answer_load_attempt', {
        load_username: username,
        source: source,
        _startTime: performance.now()
    });
}

/**
 * Log answer load result
 */
function logAnswerLoadResult(username, source, count, startTime = null) {
    const details = {
        load_username: username,
        source: source,
        answer_count: count,
        empty_load: count === 0
    };

    if (startTime !== null) {
        details.elapsed_ms = Math.round(performance.now() - startTime);
    }

    logDiagnosticEvent('answer_load_result', details);
}

/**
 * Log sync flush attempt
 */
function logSyncFlushAttempt(pendingCount) {
    logDiagnosticEvent('sync_flush_attempt', {
        pending_count: pendingCount,
        _startTime: performance.now()
    });
}

/**
 * Log sync flush result
 */
function logSyncFlushResult(success, syncedCount, error = null, startTime = null) {
    const details = {
        status: success ? 'success' : 'failure',
        synced_count: syncedCount
    };

    if (error) {
        details.error = serializeError(error);
    }

    if (startTime !== null) {
        details.elapsed_ms = Math.round(performance.now() - startTime);
    }

    logDiagnosticEvent('sync_flush_result', details);
}

/**
 * Log Supabase connection test
 */
function logConnectionTest(attempt, maxAttempts, success, error = null) {
    logDiagnosticEvent('supabase_connection_test', {
        attempt: attempt,
        max_attempts: maxAttempts,
        status: success ? 'success' : 'failure',
        error: error ? serializeError(error) : null
    });
}

// ========================================
// PHASE 3: OUTBOX & NETWORK EVENT HELPERS
// ========================================

/**
 * Log outbox enqueue
 */
function logOutboxEnqueue(questionId, outboxId, queueSize) {
    logDiagnosticEvent('outbox_enqueue', {
        question_id: questionId,
        outbox_id: outboxId,
        queue_size: queueSize
    });
}

/**
 * Log outbox flush start
 */
function logOutboxFlushStart(itemCount, itemIds) {
    logDiagnosticEvent('outbox_flush_start', {
        item_count: itemCount,
        item_ids: itemIds,
        _startTime: performance.now()
    });
}

/**
 * Log outbox item success
 */
function logOutboxItemSuccess(itemId, questionId) {
    logDiagnosticEvent('outbox_item_success', {
        item_id: itemId,
        question_id: questionId
    });
}

/**
 * Log outbox item failure
 */
function logOutboxItemFailure(itemId, questionId, error, attempt) {
    logDiagnosticEvent('outbox_item_failure', {
        item_id: itemId,
        question_id: questionId,
        error: serializeError(error),
        attempt: attempt
    });
}

/**
 * Log outbox recovery start (on page load)
 */
function logOutboxRecoveryStart(pendingCount) {
    logDiagnosticEvent('outbox_recovery_start', {
        pending_count: pendingCount,
        _startTime: performance.now()
    });
}

/**
 * Log outbox recovery complete
 */
function logOutboxRecoveryComplete(recoveredCount, failedCount, startTime = null) {
    const details = {
        recovered_count: recoveredCount,
        failed_count: failedCount
    };

    if (startTime !== null) {
        details.elapsed_ms = Math.round(performance.now() - startTime);
    }

    logDiagnosticEvent('outbox_recovery_complete', details);
}

/**
 * Log network online event
 */
function logNetworkOnline() {
    logDiagnosticEvent('network_online', {});
}

/**
 * Log network offline event
 */
function logNetworkOffline() {
    logDiagnosticEvent('network_offline', {});
}

/**
 * Log conflict resolution (server had newer data)
 */
function logSyncConflict(questionId, localTimestamp, serverTimestamp) {
    logDiagnosticEvent('sync_conflict', {
        question_id: questionId,
        local_timestamp: localTimestamp,
        server_timestamp: serverTimestamp,
        resolution: 'server_wins'
    });
}

// ========================================
// EXPOSE TO WINDOW
// ========================================

if (typeof window !== 'undefined') {
    window.DiagnosticsConfig = DiagnosticsConfig;
    window.logDiagnosticEvent = logDiagnosticEvent;
    window.getDiagnostics = getDiagnosticEvents;
    window.exportDiagnostics = exportDiagnostics;
    window.clearDiagnostics = clearDiagnostics;

    // Instrumentation helpers
    window.logAnswerSaveAttempt = logAnswerSaveAttempt;
    window.logAnswerSaveSuccess = logAnswerSaveSuccess;
    window.logAnswerSaveFailure = logAnswerSaveFailure;
    window.logAnswerLoadAttempt = logAnswerLoadAttempt;
    window.logAnswerLoadResult = logAnswerLoadResult;
    window.logSyncFlushAttempt = logSyncFlushAttempt;
    window.logSyncFlushResult = logSyncFlushResult;
    window.logConnectionTest = logConnectionTest;

    // Phase 3: Outbox and network event helpers
    window.logOutboxEnqueue = logOutboxEnqueue;
    window.logOutboxFlushStart = logOutboxFlushStart;
    window.logOutboxItemSuccess = logOutboxItemSuccess;
    window.logOutboxItemFailure = logOutboxItemFailure;
    window.logOutboxRecoveryStart = logOutboxRecoveryStart;
    window.logOutboxRecoveryComplete = logOutboxRecoveryComplete;
    window.logNetworkOnline = logNetworkOnline;
    window.logNetworkOffline = logNetworkOffline;
    window.logSyncConflict = logSyncConflict;

    // Session ID for debugging
    window.DIAGNOSTICS_SESSION_ID = DIAGNOSTICS_SESSION_ID;
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DiagnosticsConfig,
        logDiagnosticEvent,
        getDiagnosticEvents,
        exportDiagnostics,
        clearDiagnostics,
        logAnswerSaveAttempt,
        logAnswerSaveSuccess,
        logAnswerSaveFailure,
        logAnswerLoadAttempt,
        logAnswerLoadResult,
        logSyncFlushAttempt,
        logSyncFlushResult,
        logConnectionTest,
        // Phase 3
        logOutboxEnqueue,
        logOutboxFlushStart,
        logOutboxItemSuccess,
        logOutboxItemFailure,
        logOutboxRecoveryStart,
        logOutboxRecoveryComplete,
        logNetworkOnline,
        logNetworkOffline,
        logSyncConflict,
        DIAGNOSTICS_SESSION_ID
    };
}
