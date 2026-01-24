// index.js - Storage system initialization and exports
// Part of AP Statistics Consensus Quiz
// Main entry point for the storage abstraction layer

/**
 * Configuration flags for storage behavior
 */
const StorageConfig = {
    // Use IndexedDB as primary storage (set to false to use localStorage only)
    USE_INDEXEDDB: true,

    // Write to both IDB and localStorage during transition period
    DUAL_WRITE_ENABLED: true,

    // Log storage operations for debugging
    DEBUG_LOGGING: false,

    // Maximum outbox items before forcing flush
    OUTBOX_MAX_SIZE: 50,

    // Outbox flush interval in milliseconds
    OUTBOX_FLUSH_INTERVAL: 60000 // 1 minute
};

/**
 * DualWriteAdapter - Writes to both IDB and localStorage during transition
 * Reads always come from the primary (IDB) adapter
 */
class DualWriteAdapter extends StorageAdapter {
    constructor(primary, secondary) {
        super();
        this.primary = primary;
        this.secondary = secondary;
    }

    async isAvailable() {
        return await this.primary.isAvailable();
    }

    async get(store, key) {
        return await this.primary.get(store, key);
    }

    async set(store, key, value) {
        // Write to primary (IDB)
        await this.primary.set(store, key, value);

        // Also write to secondary (localStorage) for backward compatibility
        if (StorageConfig.DUAL_WRITE_ENABLED) {
            try {
                await this.secondary.set(store, key, value);
            } catch (e) {
                // localStorage might fail under tracking prevention - that's OK
                if (StorageConfig.DEBUG_LOGGING) {
                    console.warn('Secondary storage write failed:', e.message);
                }
            }
        }
    }

    async remove(store, key) {
        await this.primary.remove(store, key);

        if (StorageConfig.DUAL_WRITE_ENABLED) {
            try {
                await this.secondary.remove(store, key);
            } catch (e) {
                // Ignore secondary failures
            }
        }
    }

    async getAll(store, indexName, indexValue) {
        return await this.primary.getAll(store, indexName, indexValue);
    }

    async getAllForUser(store, username) {
        return await this.primary.getAllForUser(store, username);
    }

    async clear(store) {
        await this.primary.clear(store);

        if (StorageConfig.DUAL_WRITE_ENABLED) {
            try {
                await this.secondary.clear(store);
            } catch (e) {
                // Ignore secondary failures
            }
        }
    }

    async keys(store) {
        return await this.primary.keys(store);
    }

    async getUsageInfo() {
        return await this.primary.getUsageInfo();
    }

    // Delegate IDB-specific methods
    async requestPersistence() {
        if (this.primary.requestPersistence) {
            return await this.primary.requestPersistence();
        }
        return false;
    }

    async isPersisted() {
        if (this.primary.isPersisted) {
            return await this.primary.isPersisted();
        }
        return false;
    }

    async enqueueOutbox(opType, payload) {
        if (this.primary.enqueueOutbox) {
            return await this.primary.enqueueOutbox(opType, payload);
        }
        throw new Error('Outbox not supported by primary adapter');
    }

    async getOutboxPending() {
        if (this.primary.getOutboxPending) {
            return await this.primary.getOutboxPending();
        }
        return [];
    }

    async removeOutboxItem(id) {
        if (this.primary.removeOutboxItem) {
            return await this.primary.removeOutboxItem(id);
        }
    }
}

/**
 * Global storage instance
 * This will be the main interface used throughout the app
 */
let storage = null;
let storageReady = false;
let storageReadyPromise = null;
let migrationResult = null;

/**
 * Initialize the storage system
 * Should be called once during app startup
 * @returns {Promise<StorageAdapter>} The initialized storage adapter
 */
async function initializeStorage() {
    if (storageReady && storage) {
        return storage;
    }

    if (storageReadyPromise) {
        return storageReadyPromise;
    }

    storageReadyPromise = _doInitializeStorage();
    return storageReadyPromise;
}

async function _doInitializeStorage() {
    console.log('Initializing storage system...');

    const idbAdapter = new IndexedDBAdapter();
    const lsAdapter = new LocalStorageAdapter();

    // Check if IndexedDB is available
    const idbAvailable = StorageConfig.USE_INDEXEDDB && await idbAdapter.isAvailable();

    if (idbAvailable) {
        console.log('IndexedDB available, using as primary storage');

        // Run migration from localStorage if needed
        const migration = new StorageMigration(idbAdapter);
        migrationResult = await migration.migrate();

        if (migrationResult.migrated) {
            console.log('Migration complete:', migrationResult);
        }

        // Use dual-write adapter during transition
        if (StorageConfig.DUAL_WRITE_ENABLED) {
            storage = new DualWriteAdapter(idbAdapter, lsAdapter);
            console.log('Dual-write mode enabled');
        } else {
            storage = idbAdapter;
        }
    } else {
        console.log('IndexedDB not available, falling back to localStorage');
        storage = lsAdapter;
    }

    storageReady = true;

    // Log storage status
    if (StorageConfig.DEBUG_LOGGING) {
        const usage = await storage.getUsageInfo();
        console.log('Storage initialized:', {
            backend: idbAvailable ? 'IndexedDB' : 'localStorage',
            dualWrite: StorageConfig.DUAL_WRITE_ENABLED,
            usage
        });
    }

    return storage;
}

/**
 * Get the current storage adapter
 * Throws if storage not initialized
 */
function getStorage() {
    if (!storageReady || !storage) {
        throw new Error('Storage not initialized. Call initializeStorage() first.');
    }
    return storage;
}

/**
 * Check if storage is ready
 */
function isStorageReady() {
    return storageReady;
}

/**
 * Wait for storage to be ready
 */
async function waitForStorage() {
    if (storageReady) return storage;
    return initializeStorage();
}

/**
 * Get migration result (if migration occurred)
 */
function getMigrationResult() {
    return migrationResult;
}

/**
 * Convenience function to rebuild classData view from IDB stores
 * This replaces the old monolithic classData object
 * @param {string} currentUsername - The current user's username
 * @returns {Promise<object>} The reconstructed classData object
 */
async function rebuildClassDataView(currentUsername) {
    const s = await waitForStorage();

    const classData = { users: {} };

    // Get current user's data
    if (currentUsername) {
        const answers = await s.getAllForUser('answers', currentUsername);
        const reasons = await s.getAllForUser('reasons', currentUsername);
        const attempts = await s.getAllForUser('attempts', currentUsername);
        const charts = await s.getAllForUser('charts', currentUsername);

        classData.users[currentUsername] = {
            answers: _indexByField(answers, 'questionId', a => ({
                value: a.value,
                timestamp: a.timestamp
            })),
            reasons: _indexByField(reasons, 'questionId', r => r.value),
            timestamps: _indexByField(answers, 'questionId', a => a.timestamp),
            attempts: _indexByField(attempts, 'questionId', a => a.count),
            charts: _indexByField(charts, 'chartId', c => c.data),
            currentActivity: {
                state: 'idle',
                questionId: null,
                lastUpdate: Date.now()
            }
        };
    }

    // Get peer data from cache
    const peerCache = await s.getAll('peerCache');
    const peersByUsername = _groupBy(peerCache, 'peerUsername');

    for (const [peerUsername, records] of Object.entries(peersByUsername)) {
        if (peerUsername === currentUsername) continue; // Skip self

        classData.users[peerUsername] = {
            answers: _indexByField(records, 'questionId', r => ({
                value: r.value,
                timestamp: r.timestamp
            }))
        };
    }

    return classData;
}

/**
 * Helper to index array by a field
 */
function _indexByField(arr, field, valueMapper) {
    const result = {};
    for (const item of arr) {
        if (item[field] !== undefined) {
            result[item[field]] = valueMapper(item);
        }
    }
    return result;
}

/**
 * Helper to group array by a field
 */
function _groupBy(arr, field) {
    const result = {};
    for (const item of arr) {
        const key = item[field];
        if (!result[key]) result[key] = [];
        result[key].push(item);
    }
    return result;
}

/**
 * Save an answer using the storage adapter
 * This is a convenience function that handles the common answer save pattern
 */
async function saveAnswer(username, questionId, value, timestamp = Date.now()) {
    // Diagnostic: log save attempt (target determined after storage resolves)
    const saveStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Phase 2 UI: Dispatch save start event with full payload for retry support
    const payload = { username, questionId, value, timestamp };
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('ui:save:start', {
            detail: { questionId, payload }
        }));
    }

    try {
        const s = await waitForStorage();

        // Determine actual storage target for diagnostic logging
        // Check for IDB-specific method to distinguish from localStorage
        let storageTarget = 'localstorage';
        if (s.primary && typeof s.primary.enqueueOutbox === 'function') {
            storageTarget = 'dual-write'; // DualWriteAdapter with IDB primary
        } else if (typeof s.enqueueOutbox === 'function') {
            storageTarget = 'idb'; // Direct IndexedDBAdapter
        }

        // Diagnostic: log save attempt with actual target
        if (typeof logAnswerSaveAttempt === 'function') {
            logAnswerSaveAttempt(questionId, storageTarget);
        }

        const record = {
            username,
            questionId,
            value,
            timestamp,
            updatedAt: Date.now(),
            sourceClientId: await s.getMeta('clientId')
        };

        await s.set('answers', [username, questionId], record);

        // Diagnostic: log save success
        if (typeof logAnswerSaveSuccess === 'function') {
            logAnswerSaveSuccess(questionId, storageTarget, saveStartTime);
        }

        // Phase 2 UI: Dispatch save success event
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('ui:save:success', {
                detail: { questionId }
            }));
        }

        // Also enqueue for sync if outbox is available
        if (s.enqueueOutbox) {
            await s.enqueueOutbox('answer_submit', {
                username,
                questionId,
                value,
                timestamp
            });
        }

        return record;
    } catch (error) {
        // Diagnostic: log save failure
        if (typeof logAnswerSaveFailure === 'function') {
            logAnswerSaveFailure(questionId, 'unknown', error);
        }

        // Phase 2 UI: Dispatch save failure event
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('ui:save:failure', {
                detail: { questionId, error: error.message || String(error) }
            }));
        }

        throw error;
    }
}

/**
 * Get an answer for a specific question
 */
async function getAnswer(username, questionId) {
    const s = await waitForStorage();
    return await s.get('answers', [username, questionId]);
}

/**
 * Get all answers for a user
 */
async function getAllAnswers(username) {
    const s = await waitForStorage();
    const answers = await s.getAllForUser('answers', username);
    return _indexByField(answers, 'questionId', a => ({
        value: a.value,
        timestamp: a.timestamp
    }));
}

/**
 * Save a reason/explanation for an answer
 */
async function saveReason(username, questionId, reason) {
    const s = await waitForStorage();
    await s.set('reasons', [username, questionId], {
        username,
        questionId,
        value: reason,
        updatedAt: Date.now()
    });
}

/**
 * Update peer cache with data from server
 */
async function updatePeerCache(peerData) {
    const s = await waitForStorage();

    for (const [peerUsername, userData] of Object.entries(peerData)) {
        if (userData.answers) {
            for (const [questionId, answer] of Object.entries(userData.answers)) {
                await s.set('peerCache', [peerUsername, questionId], {
                    peerUsername,
                    questionId,
                    value: answer.value ?? answer,
                    timestamp: answer.timestamp || null,
                    seenAt: Date.now()
                });
            }
        }
    }
}

// Export everything for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        StorageConfig,
        StorageAdapter,
        LocalStorageAdapter,
        IndexedDBAdapter,
        DualWriteAdapter,
        StorageMigration,
        initializeStorage,
        getStorage,
        isStorageReady,
        waitForStorage,
        getMigrationResult,
        rebuildClassDataView,
        saveAnswer,
        getAnswer,
        getAllAnswers,
        saveReason,
        updatePeerCache
    };
}

// Also expose on window for browser use
if (typeof window !== 'undefined') {
    window.StorageConfig = StorageConfig;
    window.initializeStorage = initializeStorage;
    window.getStorage = getStorage;
    window.isStorageReady = isStorageReady;
    window.waitForStorage = waitForStorage;
    window.getMigrationResult = getMigrationResult;
    window.rebuildClassDataView = rebuildClassDataView;
    window.saveAnswer = saveAnswer;
    window.getAnswer = getAnswer;
    window.getAllAnswers = getAllAnswers;
    window.saveReason = saveReason;
    window.updatePeerCache = updatePeerCache;
}
