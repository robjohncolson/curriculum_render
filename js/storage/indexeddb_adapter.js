// indexeddb_adapter.js - IndexedDB implementation of StorageAdapter
// Part of AP Statistics Consensus Quiz
// Primary storage backend resistant to tracking prevention

/**
 * IndexedDB adapter implementing the StorageAdapter interface
 * Provides durable storage that survives browser tracking prevention
 */
class IndexedDBAdapter extends StorageAdapter {
    static DB_NAME = 'ConsensusQuizDB';
    static DB_VERSION = 3; // Bumped from 2 to add outbox status index for Phase 3

    // Object store definitions with key paths and indexes
    static STORES = {
        meta: {
            keyPath: 'key',
            indexes: []
        },
        answers: {
            keyPath: ['username', 'questionId'],
            indexes: [
                { name: 'username', keyPath: 'username', options: {} },
                { name: 'questionId', keyPath: 'questionId', options: {} },
                { name: 'timestamp', keyPath: 'timestamp', options: {} }
            ]
        },
        reasons: {
            keyPath: ['username', 'questionId'],
            indexes: [
                { name: 'username', keyPath: 'username', options: {} }
            ]
        },
        attempts: {
            keyPath: ['username', 'questionId'],
            indexes: [
                { name: 'username', keyPath: 'username', options: {} }
            ]
        },
        progress: {
            keyPath: ['username', 'lessonKey'],
            indexes: [
                { name: 'username', keyPath: 'username', options: {} }
            ]
        },
        badges: {
            keyPath: ['username', 'badgeId'],
            indexes: [
                { name: 'username', keyPath: 'username', options: {} }
            ]
        },
        charts: {
            keyPath: ['username', 'chartId'],
            indexes: [
                { name: 'username', keyPath: 'username', options: {} }
            ]
        },
        preferences: {
            keyPath: 'username',
            indexes: []
        },
        peerCache: {
            keyPath: ['peerUsername', 'questionId'],
            indexes: [
                { name: 'peerUsername', keyPath: 'peerUsername', options: {} },
                { name: 'seenAt', keyPath: 'seenAt', options: {} }
            ]
        },
        outbox: {
            keyPath: 'id',
            autoIncrement: true,
            indexes: [
                { name: 'createdAt', keyPath: 'createdAt', options: {} },
                { name: 'opType', keyPath: 'opType', options: {} },
                { name: 'status', keyPath: 'status', options: {} }
            ]
        },
        sprites: {
            keyPath: 'username',
            indexes: []
        },
        // Phase 1 Diagnostics: circular buffer for debugging "disappeared work"
        diagnostics: {
            keyPath: 'id',
            autoIncrement: true,
            indexes: [
                { name: 'timestamp', keyPath: 'timestamp', options: {} },
                { name: 'event_type', keyPath: 'event_type', options: {} },
                { name: 'session_id', keyPath: 'session_id', options: {} }
            ]
        }
    };

    constructor() {
        super();
        this._db = null;
        this._dbPromise = null;
        this._available = null;
    }

    /**
     * Open or create the database
     * @returns {Promise<IDBDatabase>}
     */
    async _openDB() {
        if (this._db) return this._db;
        if (this._dbPromise) return this._dbPromise;

        this._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(
                IndexedDBAdapter.DB_NAME,
                IndexedDBAdapter.DB_VERSION
            );

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                this._available = false;
                reject(request.error);
            };

            request.onsuccess = () => {
                this._db = request.result;
                this._available = true;

                // Handle connection close
                this._db.onclose = () => {
                    this._db = null;
                    this._dbPromise = null;
                };

                // Handle version change (another tab upgraded DB)
                this._db.onversionchange = (event) => {
                    // Close current connection to allow the upgrade
                    this._db.close();
                    this._db = null;
                    this._dbPromise = null;
                    // Only log if this isn't during initial setup
                    if (event.newVersion !== null) {
                        console.log('Database upgraded by another tab, will reconnect on next operation');
                    }
                };

                resolve(this._db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this._createStores(db);
            };
        });

        return this._dbPromise;
    }

    /**
     * Create object stores during database upgrade
     */
    _createStores(db) {
        for (const [storeName, config] of Object.entries(IndexedDBAdapter.STORES)) {
            if (db.objectStoreNames.contains(storeName)) {
                continue; // Store already exists
            }

            const storeOptions = { keyPath: config.keyPath };
            if (config.autoIncrement) {
                storeOptions.autoIncrement = true;
            }

            const store = db.createObjectStore(storeName, storeOptions);

            // Create indexes
            for (const index of config.indexes || []) {
                store.createIndex(index.name, index.keyPath, index.options);
            }

            console.log(`Created object store: ${storeName}`);
        }
    }

    /**
     * Check if IndexedDB is available
     */
    async isAvailable() {
        if (this._available !== null) return this._available;

        try {
            await this._openDB();
            return this._available;
        } catch (e) {
            this._available = false;
            return false;
        }
    }

    /**
     * Run a transaction on the database
     * @param {string|string[]} storeNames - Store(s) to access
     * @param {string} mode - 'readonly' or 'readwrite'
     * @param {Function} callback - Function receiving the transaction
     * @returns {Promise<any>}
     */
    async _transaction(storeNames, mode, callback) {
        const db = await this._openDB();
        const stores = Array.isArray(storeNames) ? storeNames : [storeNames];

        return new Promise((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            let result;

            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));

            try {
                result = callback(tx);
                // If callback returns a promise, wait for it
                if (result instanceof Promise) {
                    result.then(r => { result = r; }).catch(reject);
                }
            } catch (e) {
                tx.abort();
                reject(e);
            }
        });
    }

    /**
     * Convert key to the format expected by the store
     */
    _normalizeKey(store, key) {
        const config = IndexedDBAdapter.STORES[store];
        if (!config) return key;

        // If keyPath is an array, key should be an array
        if (Array.isArray(config.keyPath)) {
            return Array.isArray(key) ? key : [key];
        }
        // If keyPath is a string, key should be a string/primitive
        return Array.isArray(key) ? key[0] : key;
    }

    /**
     * Get a value by store and key
     */
    async get(store, key) {
        if (!await this.isAvailable()) return null;

        try {
            return await this._transaction(store, 'readonly', (tx) => {
                return new Promise((resolve, reject) => {
                    const objectStore = tx.objectStore(store);
                    const normalizedKey = this._normalizeKey(store, key);
                    const request = objectStore.get(normalizedKey);

                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => reject(request.error);
                });
            });
        } catch (e) {
            console.error(`IndexedDBAdapter.get(${store}, ${key}) error:`, e);
            return null;
        }
    }

    /**
     * Set a value by store and key
     */
    async set(store, key, value) {
        if (!await this.isAvailable()) {
            throw new Error('IndexedDB not available');
        }

        try {
            await this._transaction(store, 'readwrite', (tx) => {
                return new Promise((resolve, reject) => {
                    const objectStore = tx.objectStore(store);

                    // Ensure the value has the key fields set correctly
                    const config = IndexedDBAdapter.STORES[store];
                    const normalizedValue = { ...value };

                    if (Array.isArray(config.keyPath)) {
                        // Compound key - ensure key fields are set
                        const keyArray = Array.isArray(key) ? key : [key];
                        config.keyPath.forEach((field, i) => {
                            if (keyArray[i] !== undefined) {
                                normalizedValue[field] = keyArray[i];
                            }
                        });
                    } else if (config.keyPath && !config.autoIncrement) {
                        // Simple key
                        normalizedValue[config.keyPath] = Array.isArray(key) ? key[0] : key;
                    }

                    const request = objectStore.put(normalizedValue);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            });
        } catch (e) {
            console.error(`IndexedDBAdapter.set(${store}, ${key}) error:`, e);
            throw e;
        }
    }

    /**
     * Remove a value by store and key
     */
    async remove(store, key) {
        if (!await this.isAvailable()) return;

        try {
            await this._transaction(store, 'readwrite', (tx) => {
                return new Promise((resolve, reject) => {
                    const objectStore = tx.objectStore(store);
                    const normalizedKey = this._normalizeKey(store, key);
                    const request = objectStore.delete(normalizedKey);

                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            });
        } catch (e) {
            console.error(`IndexedDBAdapter.remove(${store}, ${key}) error:`, e);
        }
    }

    /**
     * Get all values from a store, optionally filtered by index
     */
    async getAll(store, indexName, indexValue) {
        if (!await this.isAvailable()) return [];

        try {
            return await this._transaction(store, 'readonly', (tx) => {
                return new Promise((resolve, reject) => {
                    const objectStore = tx.objectStore(store);
                    let request;

                    if (indexName && indexValue !== undefined) {
                        const index = objectStore.index(indexName);
                        request = index.getAll(indexValue);
                    } else {
                        request = objectStore.getAll();
                    }

                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
            });
        } catch (e) {
            console.error(`IndexedDBAdapter.getAll(${store}) error:`, e);
            return [];
        }
    }

    /**
     * Get all values for a specific user from a store
     */
    async getAllForUser(store, username) {
        return this.getAll(store, 'username', username);
    }

    /**
     * Clear all data from a store
     */
    async clear(store) {
        if (!await this.isAvailable()) return;

        try {
            await this._transaction(store, 'readwrite', (tx) => {
                return new Promise((resolve, reject) => {
                    const objectStore = tx.objectStore(store);
                    const request = objectStore.clear();

                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            });
        } catch (e) {
            console.error(`IndexedDBAdapter.clear(${store}) error:`, e);
        }
    }

    /**
     * Get all keys from a store
     */
    async keys(store) {
        if (!await this.isAvailable()) return [];

        try {
            return await this._transaction(store, 'readonly', (tx) => {
                return new Promise((resolve, reject) => {
                    const objectStore = tx.objectStore(store);
                    const request = objectStore.getAllKeys();

                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
            });
        } catch (e) {
            console.error(`IndexedDBAdapter.keys(${store}) error:`, e);
            return [];
        }
    }

    /**
     * Get storage usage estimate using Storage API
     */
    async getUsageInfo() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return null;
        }

        try {
            const estimate = await navigator.storage.estimate();
            return {
                used: estimate.usage || 0,
                quota: estimate.quota || 0,
                percentUsed: estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Request persistent storage (must be called after user gesture)
     * @returns {Promise<boolean>} Whether persistence was granted
     */
    async requestPersistence() {
        if (!navigator.storage || !navigator.storage.persist) {
            console.warn('Persistent storage API not available');
            return false;
        }

        try {
            const isPersisted = await navigator.storage.persist();
            if (isPersisted) {
                console.log('Storage persistence granted');
            } else {
                console.log('Storage persistence denied');
            }
            return isPersisted;
        } catch (e) {
            console.error('Error requesting persistence:', e);
            return false;
        }
    }

    /**
     * Check if storage is persisted
     */
    async isPersisted() {
        if (!navigator.storage || !navigator.storage.persisted) {
            return false;
        }

        try {
            return await navigator.storage.persisted();
        } catch (e) {
            return false;
        }
    }

    /**
     * Close the database connection
     */
    close() {
        if (this._db) {
            this._db.close();
            this._db = null;
            this._dbPromise = null;
        }
    }

    /**
     * Delete the entire database (use with caution!)
     */
    static async deleteDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(IndexedDBAdapter.DB_NAME);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
                console.warn('Database deletion blocked - close all tabs');
                reject(new Error('Database deletion blocked'));
            };
        });
    }

    // ========================================
    // OUTBOX-SPECIFIC METHODS (Phase 3: Sync Hardening)
    // ========================================

    /**
     * Backoff configuration
     */
    static OUTBOX_CONFIG = {
        MAX_ATTEMPTS: 10,
        MAX_BACKOFF_MS: 300000, // 5 minutes
        BASE_BACKOFF_MS: 5000,  // 5 seconds
        BACKOFF_MULTIPLIER: 3
    };

    /**
     * Add an operation to the outbox queue
     * @param {string} opType - Operation type (e.g., 'answer_submit')
     * @param {object} payload - Operation data
     * @returns {Promise<number>} The assigned outbox ID
     */
    async enqueueOutbox(opType, payload) {
        const record = {
            opType,
            payload,
            status: 'pending',
            createdAt: Date.now(),
            attempts: 0,
            lastAttemptAt: null,
            lastError: null
        };

        return await this._transaction('outbox', 'readwrite', (tx) => {
            return new Promise((resolve, reject) => {
                const store = tx.objectStore('outbox');
                const request = store.add(record);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        });
    }

    /**
     * Calculate backoff delay for an item based on attempts
     * @param {number} attempts - Number of previous attempts
     * @returns {number} Backoff delay in milliseconds
     */
    _calculateBackoff(attempts) {
        if (attempts <= 1) return 0; // First attempt is immediate
        const { MAX_BACKOFF_MS, BASE_BACKOFF_MS, BACKOFF_MULTIPLIER } = IndexedDBAdapter.OUTBOX_CONFIG;
        return Math.min(MAX_BACKOFF_MS, Math.pow(BACKOFF_MULTIPLIER, attempts - 1) * BASE_BACKOFF_MS);
    }

    /**
     * Check if an item is ready for retry based on backoff
     * @param {object} item - Outbox item
     * @returns {boolean}
     */
    _isReadyForRetry(item) {
        if (item.status === 'pending') return true;
        if (item.status === 'in_flight') return false;
        if (item.status !== 'failed') return false;

        // Check if max attempts exceeded
        if (item.attempts >= IndexedDBAdapter.OUTBOX_CONFIG.MAX_ATTEMPTS) {
            return false; // Permanently failed, needs manual intervention
        }

        // Check backoff elapsed
        const backoffMs = this._calculateBackoff(item.attempts);
        return Date.now() - item.lastAttemptAt >= backoffMs;
    }

    /**
     * Get all outbox items ready for processing
     * Returns items with status='pending' or status='failed' with backoff elapsed
     * @returns {Promise<Array>}
     */
    async getOutboxPending() {
        const allItems = await this.getAll('outbox');
        return allItems.filter(item => this._isReadyForRetry(item));
    }

    /**
     * Get all outbox items regardless of status (for diagnostics)
     * @returns {Promise<Array>}
     */
    async getOutboxAll() {
        return this.getAll('outbox');
    }

    /**
     * Get count of items permanently failed (exceeded max attempts)
     * @returns {Promise<number>}
     */
    async getOutboxFailedCount() {
        const allItems = await this.getAll('outbox');
        return allItems.filter(item =>
            item.status === 'failed' &&
            item.attempts >= IndexedDBAdapter.OUTBOX_CONFIG.MAX_ATTEMPTS
        ).length;
    }

    /**
     * Mark outbox items as in-flight before sending
     * @param {number[]} ids - Array of outbox item IDs
     */
    async markOutboxInFlight(ids) {
        for (const id of ids) {
            const item = await this.get('outbox', id);
            if (item) {
                item.status = 'in_flight';
                item.attempts++;
                item.lastAttemptAt = Date.now();
                await this.set('outbox', id, item);
            }
        }
    }

    /**
     * Mark outbox items as failed with error
     * @param {number[]} ids - Array of outbox item IDs
     * @param {string} error - Error message
     */
    async markOutboxFailed(ids, error) {
        for (const id of ids) {
            const item = await this.get('outbox', id);
            if (item) {
                item.status = 'failed';
                item.lastError = error;
                await this.set('outbox', id, item);
            }
        }
    }

    /**
     * Mark outbox items as synced and remove them
     * @param {number[]} ids - Array of outbox item IDs
     */
    async markOutboxSynced(ids) {
        for (const id of ids) {
            await this.remove('outbox', id);
        }
    }

    /**
     * Remove an outbox item (after successful sync)
     * @param {number} id - Outbox item ID
     */
    async removeOutboxItem(id) {
        await this.remove('outbox', id);
    }

    /**
     * Clear all outbox items
     */
    async clearOutbox() {
        await this.clear('outbox');
    }

    /**
     * Get outbox size
     * @returns {Promise<number>}
     */
    async getOutboxSize() {
        const items = await this.getAll('outbox');
        return items.length;
    }

    // Legacy method for backward compatibility
    async markOutboxAttempt(id) {
        const item = await this.get('outbox', id);
        if (item) {
            item.attempts = (item.attempts || 0) + 1;
            item.lastAttemptAt = Date.now();
            await this.set('outbox', id, item);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IndexedDBAdapter };
}
