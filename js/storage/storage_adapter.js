// storage_adapter.js - Abstract storage interface
// Part of AP Statistics Consensus Quiz
// Provides a unified API for storage backends (localStorage, IndexedDB)

/**
 * Abstract base class for storage adapters
 * All methods are async to support both sync (localStorage) and async (IDB) backends
 */
class StorageAdapter {
    /**
     * Get a value by store and key
     * @param {string} store - The store/namespace name
     * @param {string|Array} key - The key or compound key
     * @returns {Promise<any>} The stored value or null
     */
    async get(store, key) {
        throw new Error('StorageAdapter.get() must be implemented by subclass');
    }

    /**
     * Set a value by store and key
     * @param {string} store - The store/namespace name
     * @param {string|Array} key - The key or compound key
     * @param {any} value - The value to store
     * @returns {Promise<void>}
     */
    async set(store, key, value) {
        throw new Error('StorageAdapter.set() must be implemented by subclass');
    }

    /**
     * Remove a value by store and key
     * @param {string} store - The store/namespace name
     * @param {string|Array} key - The key or compound key
     * @returns {Promise<void>}
     */
    async remove(store, key) {
        throw new Error('StorageAdapter.remove() must be implemented by subclass');
    }

    /**
     * Get all values from a store, optionally filtered by index
     * @param {string} store - The store name
     * @param {string} [indexName] - Optional index to query
     * @param {any} [indexValue] - Value to match on the index
     * @returns {Promise<Array>} Array of stored values
     */
    async getAll(store, indexName, indexValue) {
        throw new Error('StorageAdapter.getAll() must be implemented by subclass');
    }

    /**
     * Get all values for a specific user from a store
     * @param {string} store - The store name
     * @param {string} username - The username to filter by
     * @returns {Promise<Array>} Array of stored values for that user
     */
    async getAllForUser(store, username) {
        throw new Error('StorageAdapter.getAllForUser() must be implemented by subclass');
    }

    /**
     * Clear all data from a store
     * @param {string} store - The store name
     * @returns {Promise<void>}
     */
    async clear(store) {
        throw new Error('StorageAdapter.clear() must be implemented by subclass');
    }

    /**
     * Get all keys from a store
     * @param {string} store - The store name
     * @returns {Promise<Array>} Array of keys
     */
    async keys(store) {
        throw new Error('StorageAdapter.keys() must be implemented by subclass');
    }

    /**
     * Check if the storage backend is available
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        throw new Error('StorageAdapter.isAvailable() must be implemented by subclass');
    }

    /**
     * Get storage usage info (if available)
     * @returns {Promise<{used: number, quota: number}|null>}
     */
    async getUsageInfo() {
        return null; // Default: not available
    }
}

// Convenience methods for meta store (single-key lookups)
StorageAdapter.prototype.getMeta = async function(key) {
    const result = await this.get('meta', key);
    return result?.value ?? null;
};

StorageAdapter.prototype.setMeta = async function(key, value) {
    await this.set('meta', key, { key, value, updatedAt: Date.now() });
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageAdapter };
}
