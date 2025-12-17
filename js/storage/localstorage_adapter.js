// localstorage_adapter.js - localStorage implementation of StorageAdapter
// Part of AP Statistics Consensus Quiz
// Used as fallback when IndexedDB is unavailable and during dual-write period

/**
 * localStorage adapter that implements the StorageAdapter interface
 * Maps the store/key pattern to localStorage's flat key namespace
 *
 * Key mapping strategy:
 * - meta store: key directly (e.g., 'consensusUsername', 'recentUsernames')
 * - user data stores: `${store}_${username}` contains object with all entries
 * - This preserves backward compatibility with existing localStorage structure
 */
class LocalStorageAdapter extends StorageAdapter {
    constructor() {
        super();
        this._available = null;
    }

    /**
     * Check if localStorage is available (may be blocked by tracking prevention)
     */
    async isAvailable() {
        if (this._available !== null) return this._available;

        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this._available = true;
        } catch (e) {
            this._available = false;
        }
        return this._available;
    }

    /**
     * Get the localStorage key for a store/key combination
     * Maintains backward compatibility with existing key patterns
     */
    _getStorageKey(store, key) {
        // Meta store uses direct keys for backward compatibility
        if (store === 'meta') {
            // Map internal meta keys to legacy localStorage keys
            const metaKeyMap = {
                'username': 'consensusUsername',
                'recentUsernames': 'recentUsernames',
                'schemaVersion': '_idb_schemaVersion',
                'clientId': '_idb_clientId',
                'lastSyncAt': '_idb_lastSyncAt',
                'autoBackupEnabled': 'recoveryAutoExportEnabled',
                'autoBackupFolderName': 'recoveryAutoExportFolderName'
            };
            return metaKeyMap[key] || `_meta_${key}`;
        }

        // Sprites store
        if (store === 'sprites') {
            return 'spriteColorHue'; // Legacy single-user sprite color
        }

        // Outbox store (new, no legacy equivalent)
        if (store === 'outbox') {
            return '_outbox';
        }

        // peerCache store (new, maps to classData internally)
        if (store === 'peerCache') {
            return 'classData';
        }

        // User data stores: answers, reasons, progress, attempts, badges, charts, preferences
        // These use the pattern: ${store}_${username}
        // The key parameter for these is typically [username, questionId] or just username
        if (Array.isArray(key)) {
            return `${store}_${key[0]}`; // First element is username
        }
        return `${store}_${key}`;
    }

    /**
     * Parse a stored value, handling JSON and plain strings
     */
    _parseValue(value) {
        if (value === null) return null;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    /**
     * Get a value from localStorage
     */
    async get(store, key) {
        if (!await this.isAvailable()) return null;

        try {
            // Handle meta store
            if (store === 'meta') {
                const storageKey = this._getStorageKey(store, key);
                const value = localStorage.getItem(storageKey);
                if (value === null) return null;

                // Return in consistent format
                const parsed = this._parseValue(value);
                return { key, value: parsed, updatedAt: null };
            }

            // Handle sprites store
            if (store === 'sprites') {
                const username = Array.isArray(key) ? key[0] : key;
                const hue = localStorage.getItem('spriteColorHue');
                if (hue === null) return null;
                return { username, hue: parseInt(hue, 10) };
            }

            // Handle outbox (stored as array)
            if (store === 'outbox') {
                const outbox = this._parseValue(localStorage.getItem('_outbox')) || [];
                const id = Array.isArray(key) ? key[0] : key;
                return outbox.find(item => item.id === id) || null;
            }

            // Handle peerCache (extract from classData)
            if (store === 'peerCache') {
                const classData = this._parseValue(localStorage.getItem('classData'));
                if (!classData?.users) return null;

                const [peerUsername, questionId] = Array.isArray(key) ? key : [key, null];
                const peer = classData.users[peerUsername];
                if (!peer?.answers) return null;

                if (questionId) {
                    const answer = peer.answers[questionId];
                    if (!answer) return null;
                    return {
                        peerUsername,
                        questionId,
                        value: answer.value ?? answer,
                        timestamp: answer.timestamp || null,
                        seenAt: Date.now()
                    };
                }
                return peer;
            }

            // Handle user data stores (answers, reasons, etc.)
            const storageKey = this._getStorageKey(store, key);
            const data = this._parseValue(localStorage.getItem(storageKey));
            if (!data) return null;

            // If key is compound [username, itemId], extract the specific item
            if (Array.isArray(key) && key.length > 1) {
                const [username, itemId] = key;
                const item = data[itemId];
                if (item === undefined) return null;

                // Normalize to consistent format
                if (typeof item === 'object' && item !== null) {
                    return { username, [`${store.slice(0, -1)}Id`]: itemId, ...item };
                }
                return { username, [`${store.slice(0, -1)}Id`]: itemId, value: item };
            }

            return data;
        } catch (e) {
            console.error(`LocalStorageAdapter.get(${store}, ${key}) error:`, e);
            return null;
        }
    }

    /**
     * Set a value in localStorage
     */
    async set(store, key, value) {
        if (!await this.isAvailable()) {
            console.warn('localStorage not available, skipping write');
            return;
        }

        try {
            // Handle meta store
            if (store === 'meta') {
                const storageKey = this._getStorageKey(store, key);
                const toStore = value?.value !== undefined ? value.value : value;
                localStorage.setItem(storageKey, JSON.stringify(toStore));
                return;
            }

            // Handle sprites store
            if (store === 'sprites') {
                const hue = value?.hue ?? value;
                localStorage.setItem('spriteColorHue', String(hue));
                return;
            }

            // Handle outbox (append to array)
            if (store === 'outbox') {
                const outbox = this._parseValue(localStorage.getItem('_outbox')) || [];
                const existingIndex = outbox.findIndex(item => item.id === value.id);
                if (existingIndex >= 0) {
                    outbox[existingIndex] = value;
                } else {
                    // Auto-assign ID if not present
                    if (!value.id) {
                        value.id = Date.now() + Math.random();
                    }
                    outbox.push(value);
                }
                localStorage.setItem('_outbox', JSON.stringify(outbox));
                return;
            }

            // Handle peerCache (merge into classData)
            if (store === 'peerCache') {
                const classData = this._parseValue(localStorage.getItem('classData')) || { users: {} };
                const { peerUsername, questionId, value: answerValue, timestamp } = value;

                if (!classData.users[peerUsername]) {
                    classData.users[peerUsername] = { answers: {} };
                }
                classData.users[peerUsername].answers[questionId] = {
                    value: answerValue,
                    timestamp: timestamp || Date.now()
                };
                localStorage.setItem('classData', JSON.stringify(classData));
                return;
            }

            // Handle user data stores
            const storageKey = this._getStorageKey(store, key);

            // If compound key, merge into existing object
            if (Array.isArray(key) && key.length > 1) {
                const [username, itemId] = key;
                const existing = this._parseValue(localStorage.getItem(storageKey)) || {};

                // Extract the value to store (remove username and itemId fields)
                const { username: _, [`${store.slice(0, -1)}Id`]: __, ...toStore } = value;
                existing[itemId] = toStore;
                localStorage.setItem(storageKey, JSON.stringify(existing));
            } else {
                localStorage.setItem(storageKey, JSON.stringify(value));
            }
        } catch (e) {
            console.error(`LocalStorageAdapter.set(${store}, ${key}) error:`, e);
            if (e.name === 'QuotaExceededError') {
                throw new Error('Storage quota exceeded');
            }
            throw e;
        }
    }

    /**
     * Remove a value from localStorage
     */
    async remove(store, key) {
        if (!await this.isAvailable()) return;

        try {
            // Handle outbox (remove from array)
            if (store === 'outbox') {
                const outbox = this._parseValue(localStorage.getItem('_outbox')) || [];
                const id = Array.isArray(key) ? key[0] : key;
                const filtered = outbox.filter(item => item.id !== id);
                localStorage.setItem('_outbox', JSON.stringify(filtered));
                return;
            }

            // Handle compound keys (remove item from object)
            if (Array.isArray(key) && key.length > 1) {
                const storageKey = this._getStorageKey(store, key);
                const existing = this._parseValue(localStorage.getItem(storageKey));
                if (existing) {
                    delete existing[key[1]];
                    localStorage.setItem(storageKey, JSON.stringify(existing));
                }
                return;
            }

            const storageKey = this._getStorageKey(store, key);
            localStorage.removeItem(storageKey);
        } catch (e) {
            console.error(`LocalStorageAdapter.remove(${store}, ${key}) error:`, e);
        }
    }

    /**
     * Get all values from a store
     */
    async getAll(store, indexName, indexValue) {
        if (!await this.isAvailable()) return [];

        try {
            // Handle outbox
            if (store === 'outbox') {
                return this._parseValue(localStorage.getItem('_outbox')) || [];
            }

            // Handle peerCache (extract all peers from classData)
            if (store === 'peerCache') {
                const classData = this._parseValue(localStorage.getItem('classData'));
                if (!classData?.users) return [];

                const results = [];
                for (const [peerUsername, userData] of Object.entries(classData.users)) {
                    if (indexName === 'peerUsername' && indexValue && peerUsername !== indexValue) {
                        continue;
                    }
                    if (userData.answers) {
                        for (const [questionId, answer] of Object.entries(userData.answers)) {
                            results.push({
                                peerUsername,
                                questionId,
                                value: answer.value ?? answer,
                                timestamp: answer.timestamp || null,
                                seenAt: Date.now()
                            });
                        }
                    }
                }
                return results;
            }

            // For user data stores, we need to scan all matching keys
            const prefix = `${store}_`;
            const results = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(prefix)) {
                    const username = key.slice(prefix.length);
                    if (indexName === 'username' && indexValue && username !== indexValue) {
                        continue;
                    }

                    const data = this._parseValue(localStorage.getItem(key));
                    if (data && typeof data === 'object') {
                        for (const [itemId, itemValue] of Object.entries(data)) {
                            const normalized = typeof itemValue === 'object' && itemValue !== null
                                ? { username, [`${store.slice(0, -1)}Id`]: itemId, ...itemValue }
                                : { username, [`${store.slice(0, -1)}Id`]: itemId, value: itemValue };
                            results.push(normalized);
                        }
                    }
                }
            }

            return results;
        } catch (e) {
            console.error(`LocalStorageAdapter.getAll(${store}) error:`, e);
            return [];
        }
    }

    /**
     * Get all values for a specific user
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
            if (store === 'outbox') {
                localStorage.removeItem('_outbox');
                return;
            }

            // For user data stores, remove all matching keys
            const prefix = `${store}_`;
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (e) {
            console.error(`LocalStorageAdapter.clear(${store}) error:`, e);
        }
    }

    /**
     * Get all keys from a store
     */
    async keys(store) {
        if (!await this.isAvailable()) return [];

        try {
            if (store === 'outbox') {
                const outbox = this._parseValue(localStorage.getItem('_outbox')) || [];
                return outbox.map(item => item.id);
            }

            const prefix = `${store}_`;
            const result = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(prefix)) {
                    result.push(key.slice(prefix.length));
                }
            }

            return result;
        } catch (e) {
            console.error(`LocalStorageAdapter.keys(${store}) error:`, e);
            return [];
        }
    }

    /**
     * Get storage usage estimate
     */
    async getUsageInfo() {
        if (!await this.isAvailable()) return null;

        try {
            let used = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                used += (key.length + value.length) * 2; // UTF-16 = 2 bytes per char
            }

            // localStorage quota is typically 5-10MB
            return {
                used,
                quota: 5 * 1024 * 1024, // Assume 5MB quota
                percentUsed: (used / (5 * 1024 * 1024)) * 100
            };
        } catch (e) {
            return null;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalStorageAdapter };
}
