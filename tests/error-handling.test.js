/**
 * Error Handling Tests
 *
 * Tests for STATE_MACHINES.md Section 11:
 * - Storage error handling
 * - Network error handling
 * - Fallback chains
 * - Outbox retry logic
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Storage Error Types
 */
const StorageErrorType = {
    QUOTA_EXCEEDED: 'QuotaExceededError',
    IDB_NOT_AVAILABLE: 'IDBNotAvailable',
    TRANSACTION_FAILED: 'TransactionFailed',
    UNKNOWN: 'UnknownError'
};

/**
 * Network Error Types
 */
const NetworkErrorType = {
    TIMEOUT: 'TimeoutError',
    CONNECTION_REFUSED: 'ConnectionRefused',
    SERVER_ERROR: 'ServerError',
    UNKNOWN: 'UnknownError'
};

/**
 * Mock Storage Error
 */
class StorageError extends Error {
    constructor(type, message) {
        super(message);
        this.name = type;
        this.type = type;
    }
}

/**
 * Mock Network Error
 */
class NetworkError extends Error {
    constructor(type, message, statusCode = null) {
        super(message);
        this.name = type;
        this.type = type;
        this.statusCode = statusCode;
    }
}

/**
 * Outbox Item Structure
 */
function createOutboxItem(opType, data) {
    return {
        id: Date.now() + Math.random(),
        op: opType,
        data,
        tries: 0,
        status: 'pending',
        createdAt: Date.now(),
        lastAttempt: null
    };
}

/**
 * Mock Outbox Manager
 */
class MockOutboxManager {
    constructor() {
        this.items = [];
        this.maxTries = 3;
    }

    enqueue(opType, data) {
        const item = createOutboxItem(opType, data);
        this.items.push(item);
        return item;
    }

    dequeue(id) {
        const index = this.items.findIndex(item => item.id === id);
        if (index !== -1) {
            return this.items.splice(index, 1)[0];
        }
        return null;
    }

    markAttempt(id) {
        const item = this.items.find(item => item.id === id);
        if (item) {
            item.tries++;
            item.lastAttempt = Date.now();

            if (item.tries >= this.maxTries) {
                item.status = 'failed';
            }
        }
        return item;
    }

    markSuccess(id) {
        return this.dequeue(id);
    }

    getPending() {
        return this.items.filter(item => item.status === 'pending');
    }

    getFailed() {
        return this.items.filter(item => item.status === 'failed');
    }

    getAll() {
        return [...this.items];
    }

    clear() {
        this.items = [];
    }
}

/**
 * Mock Dual Storage with Error Handling
 */
class MockDualStorageWithErrors {
    constructor() {
        this.primary = { data: {}, available: true, quotaExceeded: false };
        this.secondary = { data: {}, available: true, quotaExceeded: false };
        this.memoryFallback = {};
    }

    async set(store, key, value) {
        const keyStr = Array.isArray(key) ? key.join(':') : key;
        let primarySuccess = false;
        let secondarySuccess = false;

        // Try primary (IDB)
        if (this.primary.available && !this.primary.quotaExceeded) {
            try {
                if (!this.primary.data[store]) this.primary.data[store] = {};
                this.primary.data[store][keyStr] = value;
                primarySuccess = true;
            } catch (e) {
                console.error('Primary write failed:', e);
            }
        }

        // Try secondary (localStorage)
        if (this.secondary.available && !this.secondary.quotaExceeded) {
            try {
                if (!this.secondary.data[store]) this.secondary.data[store] = {};
                this.secondary.data[store][keyStr] = value;
                secondarySuccess = true;
            } catch (e) {
                console.error('Secondary write failed:', e);
            }
        }

        // Memory fallback if both fail
        if (!primarySuccess && !secondarySuccess) {
            if (!this.memoryFallback[store]) this.memoryFallback[store] = {};
            this.memoryFallback[store][keyStr] = value;
            return { success: true, storage: 'memory', warning: 'Data may be lost on refresh' };
        }

        return {
            success: primarySuccess || secondarySuccess,
            primary: primarySuccess,
            secondary: secondarySuccess
        };
    }

    async get(store, key) {
        const keyStr = Array.isArray(key) ? key.join(':') : key;

        // Try primary first
        if (this.primary.available) {
            const value = this.primary.data[store]?.[keyStr];
            if (value !== undefined) return value;
        }

        // Fallback to secondary
        if (this.secondary.available) {
            const value = this.secondary.data[store]?.[keyStr];
            if (value !== undefined) return value;
        }

        // Check memory fallback
        return this.memoryFallback[store]?.[keyStr] ?? null;
    }

    simulatePrimaryFailure() {
        this.primary.available = false;
    }

    simulateSecondaryFailure() {
        this.secondary.available = false;
    }

    simulatePrimaryQuotaExceeded() {
        this.primary.quotaExceeded = true;
    }

    simulateSecondaryQuotaExceeded() {
        this.secondary.quotaExceeded = true;
    }

    reset() {
        this.primary = { data: {}, available: true, quotaExceeded: false };
        this.secondary = { data: {}, available: true, quotaExceeded: false };
        this.memoryFallback = {};
    }
}

/**
 * Mock Network Client with Fallback
 */
class MockNetworkClient {
    constructor() {
        this.railwayAvailable = true;
        this.supabaseAvailable = true;
        this.requestCount = 0;
    }

    async pushViaRailway(data) {
        this.requestCount++;

        if (!this.railwayAvailable) {
            throw new NetworkError(NetworkErrorType.CONNECTION_REFUSED, 'Railway server unavailable');
        }

        return { success: true, via: 'railway' };
    }

    async pushViaSupabase(data) {
        this.requestCount++;

        if (!this.supabaseAvailable) {
            throw new NetworkError(NetworkErrorType.SERVER_ERROR, 'Supabase error', 500);
        }

        return { success: true, via: 'supabase' };
    }

    async pushWithFallback(data) {
        // Try Railway first
        try {
            return await this.pushViaRailway(data);
        } catch (railwayError) {
            console.log('Railway failed, trying Supabase...');
        }

        // Fallback to Supabase
        try {
            return await this.pushViaSupabase(data);
        } catch (supabaseError) {
            console.log('Supabase also failed');
        }

        // Both failed - return failure for outbox queueing
        return { success: false, shouldQueue: true };
    }

    async pullWithFallback(lastTimestamp = 0) {
        // Try Railway first
        try {
            if (!this.railwayAvailable) throw new Error('Railway unavailable');
            return { data: [], via: 'railway', stale: false };
        } catch (e) {
            // Fall through
        }

        // Try Supabase
        try {
            if (!this.supabaseAvailable) throw new Error('Supabase unavailable');
            return { data: [], via: 'supabase', stale: false };
        } catch (e) {
            // Fall through
        }

        // Both failed - return stale cache indicator
        return { data: [], via: 'cache', stale: true };
    }

    simulateRailwayDown() {
        this.railwayAvailable = false;
    }

    simulateSupabaseDown() {
        this.supabaseAvailable = false;
    }

    simulateAllDown() {
        this.railwayAvailable = false;
        this.supabaseAvailable = false;
    }

    reset() {
        this.railwayAvailable = true;
        this.supabaseAvailable = true;
        this.requestCount = 0;
    }
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error) {
    // Network errors are usually retryable
    if (error instanceof NetworkError) {
        // 5xx errors are retryable
        if (error.statusCode >= 500) return true;
        // Connection errors are retryable
        if (error.type === NetworkErrorType.CONNECTION_REFUSED) return true;
        if (error.type === NetworkErrorType.TIMEOUT) return true;
    }

    return false;
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(attempt, baseDelay = 1000) {
    return Math.min(baseDelay * Math.pow(2, attempt), 30000);
}

// ============================================
// TESTS
// ============================================

describe('Error Handling', () => {
    describe('Storage Error Types', () => {
        it('should create quota exceeded error', () => {
            const error = new StorageError(StorageErrorType.QUOTA_EXCEEDED, 'Storage full');

            expect(error.type).toBe(StorageErrorType.QUOTA_EXCEEDED);
            expect(error.name).toBe(StorageErrorType.QUOTA_EXCEEDED);
            expect(error.message).toBe('Storage full');
        });

        it('should create IDB not available error', () => {
            const error = new StorageError(StorageErrorType.IDB_NOT_AVAILABLE, 'Safari private mode');

            expect(error.type).toBe(StorageErrorType.IDB_NOT_AVAILABLE);
        });
    });

    describe('Network Error Types', () => {
        it('should create timeout error', () => {
            const error = new NetworkError(NetworkErrorType.TIMEOUT, 'Request timed out');

            expect(error.type).toBe(NetworkErrorType.TIMEOUT);
        });

        it('should create server error with status code', () => {
            const error = new NetworkError(NetworkErrorType.SERVER_ERROR, 'Internal error', 500);

            expect(error.type).toBe(NetworkErrorType.SERVER_ERROR);
            expect(error.statusCode).toBe(500);
        });
    });

    describe('Dual Storage Error Handling', () => {
        let storage;

        beforeEach(() => {
            storage = new MockDualStorageWithErrors();
        });

        it('should write to both storages successfully', async () => {
            const result = await storage.set('answers', ['user', 'Q1'], { value: 'A' });

            expect(result.success).toBe(true);
            expect(result.primary).toBe(true);
            expect(result.secondary).toBe(true);
        });

        it('should continue with secondary when primary fails', async () => {
            storage.simulatePrimaryFailure();

            const result = await storage.set('answers', ['user', 'Q1'], { value: 'A' });

            expect(result.success).toBe(true);
            expect(result.primary).toBe(false);
            expect(result.secondary).toBe(true);
        });

        it('should continue with primary when secondary fails', async () => {
            storage.simulateSecondaryFailure();

            const result = await storage.set('answers', ['user', 'Q1'], { value: 'A' });

            expect(result.success).toBe(true);
            expect(result.primary).toBe(true);
            expect(result.secondary).toBe(false);
        });

        it('should use memory fallback when both fail', async () => {
            storage.simulatePrimaryFailure();
            storage.simulateSecondaryFailure();

            const result = await storage.set('answers', ['user', 'Q1'], { value: 'A' });

            expect(result.success).toBe(true);
            expect(result.storage).toBe('memory');
            expect(result.warning).toBeDefined();
        });

        it('should read from primary when available', async () => {
            await storage.set('answers', ['user', 'Q1'], { value: 'A' });
            storage.secondary.data = {}; // Clear secondary

            const value = await storage.get('answers', ['user', 'Q1']);

            expect(value).toEqual({ value: 'A' });
        });

        it('should fallback to secondary for reads', async () => {
            storage.secondary.data = { answers: { 'user:Q1': { value: 'B' } } };
            storage.simulatePrimaryFailure();

            const value = await storage.get('answers', ['user', 'Q1']);

            expect(value).toEqual({ value: 'B' });
        });

        it('should read from memory fallback', async () => {
            storage.simulatePrimaryFailure();
            storage.simulateSecondaryFailure();
            await storage.set('answers', ['user', 'Q1'], { value: 'C' });

            const value = await storage.get('answers', ['user', 'Q1']);

            expect(value).toEqual({ value: 'C' });
        });
    });

    describe('Outbox Manager', () => {
        let outbox;

        beforeEach(() => {
            outbox = new MockOutboxManager();
        });

        it('should enqueue item with correct structure', () => {
            const item = outbox.enqueue('answer_submit', { questionId: 'Q1' });

            expect(item.op).toBe('answer_submit');
            expect(item.data.questionId).toBe('Q1');
            expect(item.tries).toBe(0);
            expect(item.status).toBe('pending');
        });

        it('should increment tries on attempt', () => {
            const item = outbox.enqueue('answer_submit', {});
            outbox.markAttempt(item.id);

            expect(outbox.items[0].tries).toBe(1);
            expect(outbox.items[0].lastAttempt).not.toBeNull();
        });

        it('should mark as failed after max tries', () => {
            const item = outbox.enqueue('answer_submit', {});

            outbox.markAttempt(item.id);
            outbox.markAttempt(item.id);
            outbox.markAttempt(item.id);

            expect(outbox.items[0].status).toBe('failed');
        });

        it('should remove item on success', () => {
            const item = outbox.enqueue('answer_submit', {});
            expect(outbox.items.length).toBe(1);

            outbox.markSuccess(item.id);
            expect(outbox.items.length).toBe(0);
        });

        it('should get pending items only', () => {
            const item1 = outbox.enqueue('op1', {});
            const item2 = outbox.enqueue('op2', {});

            // Fail item1
            for (let i = 0; i < 3; i++) outbox.markAttempt(item1.id);

            const pending = outbox.getPending();

            expect(pending.length).toBe(1);
            expect(pending[0].op).toBe('op2');
        });

        it('should get failed items only', () => {
            const item1 = outbox.enqueue('op1', {});
            outbox.enqueue('op2', {});

            for (let i = 0; i < 3; i++) outbox.markAttempt(item1.id);

            const failed = outbox.getFailed();

            expect(failed.length).toBe(1);
            expect(failed[0].op).toBe('op1');
        });
    });

    describe('Network Fallback Chain', () => {
        let client;

        beforeEach(() => {
            client = new MockNetworkClient();
        });

        it('should use Railway when available', async () => {
            const result = await client.pushWithFallback({ test: 'data' });

            expect(result.success).toBe(true);
            expect(result.via).toBe('railway');
        });

        it('should fallback to Supabase when Railway down', async () => {
            client.simulateRailwayDown();

            const result = await client.pushWithFallback({ test: 'data' });

            expect(result.success).toBe(true);
            expect(result.via).toBe('supabase');
        });

        it('should return failure when both down', async () => {
            client.simulateAllDown();

            const result = await client.pushWithFallback({ test: 'data' });

            expect(result.success).toBe(false);
            expect(result.shouldQueue).toBe(true);
        });

        it('should indicate stale cache when pull fails', async () => {
            client.simulateAllDown();

            const result = await client.pullWithFallback();

            expect(result.stale).toBe(true);
            expect(result.via).toBe('cache');
        });
    });

    describe('Error Retryability', () => {
        it('should retry 5xx server errors', () => {
            const error = new NetworkError(NetworkErrorType.SERVER_ERROR, 'Internal error', 500);
            expect(isRetryableError(error)).toBe(true);
        });

        it('should retry 503 service unavailable', () => {
            const error = new NetworkError(NetworkErrorType.SERVER_ERROR, 'Service unavailable', 503);
            expect(isRetryableError(error)).toBe(true);
        });

        it('should retry connection refused', () => {
            const error = new NetworkError(NetworkErrorType.CONNECTION_REFUSED, 'Connection refused');
            expect(isRetryableError(error)).toBe(true);
        });

        it('should retry timeout', () => {
            const error = new NetworkError(NetworkErrorType.TIMEOUT, 'Timed out');
            expect(isRetryableError(error)).toBe(true);
        });

        it('should not retry non-network errors', () => {
            const error = new Error('Generic error');
            expect(isRetryableError(error)).toBe(false);
        });
    });

    describe('Retry Delay Calculation', () => {
        it('should increase delay exponentially', () => {
            const delay0 = calculateRetryDelay(0);
            const delay1 = calculateRetryDelay(1);
            const delay2 = calculateRetryDelay(2);

            expect(delay1).toBe(delay0 * 2);
            expect(delay2).toBe(delay1 * 2);
        });

        it('should cap at 30 seconds', () => {
            const delay = calculateRetryDelay(100);
            expect(delay).toBe(30000);
        });

        it('should use custom base delay', () => {
            const delay = calculateRetryDelay(0, 500);
            expect(delay).toBe(500);
        });
    });

    describe('Outbox Processing Flow', () => {
        let outbox;
        let client;

        beforeEach(() => {
            outbox = new MockOutboxManager();
            client = new MockNetworkClient();
        });

        it('should process and remove successful items', async () => {
            const item = outbox.enqueue('answer_submit', { value: 'A' });

            const result = await client.pushWithFallback(item.data);
            if (result.success) {
                outbox.markSuccess(item.id);
            }

            expect(outbox.items.length).toBe(0);
        });

        it('should keep and retry failed items', async () => {
            client.simulateAllDown();

            const item = outbox.enqueue('answer_submit', { value: 'A' });

            const result = await client.pushWithFallback(item.data);
            if (!result.success) {
                outbox.markAttempt(item.id);
            }

            expect(outbox.items.length).toBe(1);
            expect(outbox.items[0].tries).toBe(1);
        });

        it('should mark as failed after max retries', async () => {
            client.simulateAllDown();

            const item = outbox.enqueue('answer_submit', { value: 'A' });

            // Simulate 3 failed attempts
            for (let i = 0; i < 3; i++) {
                const result = await client.pushWithFallback(item.data);
                if (!result.success) {
                    outbox.markAttempt(item.id);
                }
            }

            expect(outbox.items[0].status).toBe('failed');
        });
    });

    describe('Complete Error Recovery Flow', () => {
        it('should recover from temporary network failure', async () => {
            const client = new MockNetworkClient();
            const outbox = new MockOutboxManager();

            // First attempt fails
            client.simulateAllDown();
            const item = outbox.enqueue('answer_submit', { value: 'A' });

            let result = await client.pushWithFallback(item.data);
            if (!result.success) outbox.markAttempt(item.id);

            expect(outbox.items[0].tries).toBe(1);

            // Network recovers
            client.reset();

            // Second attempt succeeds
            result = await client.pushWithFallback(item.data);
            if (result.success) outbox.markSuccess(item.id);

            expect(outbox.items.length).toBe(0);
        });

        it('should handle graceful degradation', async () => {
            const storage = new MockDualStorageWithErrors();
            const client = new MockNetworkClient();

            // Primary storage fails
            storage.simulatePrimaryFailure();

            // Can still write to secondary
            const writeResult = await storage.set('answers', ['user', 'Q1'], { value: 'A' });
            expect(writeResult.success).toBe(true);

            // Railway fails
            client.simulateRailwayDown();

            // Can still push to Supabase
            const pushResult = await client.pushWithFallback({ value: 'A' });
            expect(pushResult.success).toBe(true);
            expect(pushResult.via).toBe('supabase');
        });
    });
});
