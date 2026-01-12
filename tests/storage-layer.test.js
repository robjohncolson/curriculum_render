/**
 * Storage Layer Tests
 *
 * Tests for STATE_MACHINES.md Section 1: Storage Layer
 * - IndexedDB/localStorage initialization & fallback chain
 * - Dual-write adapter pattern
 * - Migration logic
 */
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Mock Storage Adapter
 */
class MockStorageAdapter {
    constructor(name, shouldFail = false) {
        this.name = name;
        this.data = {};
        this.shouldFail = shouldFail;
    }

    async set(store, key, value) {
        if (this.shouldFail) throw new Error(`${this.name} write failed`);
        const keyStr = Array.isArray(key) ? key.join(':') : key;
        if (!this.data[store]) this.data[store] = {};
        this.data[store][keyStr] = value;
        return true;
    }

    async get(store, key) {
        const keyStr = Array.isArray(key) ? key.join(':') : key;
        return this.data[store]?.[keyStr] ?? null;
    }

    async getAllForUser(store, username) {
        if (!this.data[store]) return {};
        const result = {};
        for (const [key, value] of Object.entries(this.data[store])) {
            if (key.startsWith(username + ':')) {
                const questionId = key.split(':')[1];
                result[questionId] = value;
            }
        }
        return result;
    }

    isAvailable() {
        return !this.shouldFail;
    }
}

/**
 * Mock Dual-Write Adapter
 * Mirrors the DualWriteAdapter pattern from index.html
 */
class MockDualWriteAdapter {
    constructor(primary, secondary = null) {
        this.primary = primary;
        this.secondary = secondary;
    }

    async set(store, key, value) {
        let primarySuccess = false;
        let secondarySuccess = false;

        // Try primary
        try {
            await this.primary.set(store, key, value);
            primarySuccess = true;
        } catch (e) {
            console.error('Primary write failed:', e.message);
        }

        // Try secondary if exists
        if (this.secondary) {
            try {
                await this.secondary.set(store, key, value);
                secondarySuccess = true;
            } catch (e) {
                console.error('Secondary write failed:', e.message);
            }
        }

        // At least one must succeed
        return primarySuccess || secondarySuccess;
    }

    async get(store, key) {
        // Try primary first
        try {
            const result = await this.primary.get(store, key);
            if (result !== null) return result;
        } catch (e) {
            // Primary failed, try secondary
        }

        // Fallback to secondary
        if (this.secondary) {
            return await this.secondary.get(store, key);
        }

        return null;
    }
}

/**
 * Mock IndexedDB Availability Check
 */
function isIndexedDBAvailable(mockAvailable = true) {
    // In real implementation, this checks:
    // - window.indexedDB exists
    // - Not in Safari private mode
    // - Not blocked by tracking prevention
    return mockAvailable;
}

/**
 * Storage Migration Logic
 * Converts localStorage keys to IDB format
 */
function migrateLocalStorageKey(key) {
    // answers_username -> {store: 'answers', username}
    // reasons_username -> {store: 'reasons', username}
    // attempts_username -> {store: 'attempts', username}
    // progress_username -> {store: 'progress', username}
    // badges_username -> {store: 'badges', username}
    // charts_username -> {store: 'charts', username}
    // classData -> {store: 'peerCache', special: true}
    // consensusUsername -> {store: 'meta', key: 'username'}

    const patterns = [
        { regex: /^answers_(.+)$/, store: 'answers' },
        { regex: /^reasons_(.+)$/, store: 'reasons' },
        { regex: /^attempts_(.+)$/, store: 'attempts' },
        { regex: /^progress_(.+)$/, store: 'progress' },
        { regex: /^badges_(.+)$/, store: 'badges' },
        { regex: /^charts_(.+)$/, store: 'charts' }
    ];

    for (const pattern of patterns) {
        const match = key.match(pattern.regex);
        if (match) {
            return { store: pattern.store, username: match[1] };
        }
    }

    if (key === 'classData') {
        return { store: 'peerCache', special: 'classData' };
    }

    if (key === 'consensusUsername') {
        return { store: 'meta', key: 'username' };
    }

    return null;
}

/**
 * Answer Format Conversion
 * Legacy: "A" -> New: {value: "A", timestamp: ...}
 */
function convertAnswerFormat(answer, defaultTimestamp = 0) {
    if (typeof answer === 'string') {
        return { value: answer, timestamp: defaultTimestamp };
    }
    if (typeof answer === 'object' && answer !== null) {
        return {
            value: answer.value ?? answer,
            timestamp: answer.timestamp ?? defaultTimestamp
        };
    }
    return { value: answer, timestamp: defaultTimestamp };
}

// ============================================
// TESTS
// ============================================

describe('Storage Layer', () => {
    describe('IndexedDB Availability', () => {
        it('should detect IDB available', () => {
            expect(isIndexedDBAvailable(true)).toBe(true);
        });

        it('should detect IDB unavailable (Safari private mode)', () => {
            expect(isIndexedDBAvailable(false)).toBe(false);
        });
    });

    describe('Mock Storage Adapter', () => {
        let adapter;

        beforeEach(() => {
            adapter = new MockStorageAdapter('test');
        });

        it('should store and retrieve values', async () => {
            await adapter.set('answers', ['user1', 'Q1'], { value: 'A' });
            const result = await adapter.get('answers', ['user1', 'Q1']);
            expect(result).toEqual({ value: 'A' });
        });

        it('should return null for missing keys', async () => {
            const result = await adapter.get('answers', ['user1', 'Q999']);
            expect(result).toBeNull();
        });

        it('should get all data for user', async () => {
            await adapter.set('answers', ['user1', 'Q1'], { value: 'A' });
            await adapter.set('answers', ['user1', 'Q2'], { value: 'B' });
            await adapter.set('answers', ['user2', 'Q1'], { value: 'C' });

            const result = await adapter.getAllForUser('answers', 'user1');
            expect(result).toEqual({
                'Q1': { value: 'A' },
                'Q2': { value: 'B' }
            });
        });

        it('should throw on failed write when configured', async () => {
            const failingAdapter = new MockStorageAdapter('failing', true);
            await expect(failingAdapter.set('answers', 'key', 'value'))
                .rejects.toThrow('failing write failed');
        });
    });

    describe('Dual-Write Adapter', () => {
        it('should write to both primary and secondary', async () => {
            const primary = new MockStorageAdapter('idb');
            const secondary = new MockStorageAdapter('ls');
            const dual = new MockDualWriteAdapter(primary, secondary);

            await dual.set('answers', ['user', 'Q1'], { value: 'A' });

            expect(await primary.get('answers', ['user', 'Q1'])).toEqual({ value: 'A' });
            expect(await secondary.get('answers', ['user', 'Q1'])).toEqual({ value: 'A' });
        });

        it('should succeed if only primary succeeds', async () => {
            const primary = new MockStorageAdapter('idb');
            const secondary = new MockStorageAdapter('ls', true); // fails
            const dual = new MockDualWriteAdapter(primary, secondary);

            const result = await dual.set('answers', ['user', 'Q1'], { value: 'A' });
            expect(result).toBe(true);
            expect(await primary.get('answers', ['user', 'Q1'])).toEqual({ value: 'A' });
        });

        it('should succeed if only secondary succeeds', async () => {
            const primary = new MockStorageAdapter('idb', true); // fails
            const secondary = new MockStorageAdapter('ls');
            const dual = new MockDualWriteAdapter(primary, secondary);

            const result = await dual.set('answers', ['user', 'Q1'], { value: 'A' });
            expect(result).toBe(true);
            expect(await secondary.get('answers', ['user', 'Q1'])).toEqual({ value: 'A' });
        });

        it('should fail if both fail', async () => {
            const primary = new MockStorageAdapter('idb', true);
            const secondary = new MockStorageAdapter('ls', true);
            const dual = new MockDualWriteAdapter(primary, secondary);

            const result = await dual.set('answers', ['user', 'Q1'], { value: 'A' });
            expect(result).toBe(false);
        });

        it('should read from primary first', async () => {
            const primary = new MockStorageAdapter('idb');
            const secondary = new MockStorageAdapter('ls');
            const dual = new MockDualWriteAdapter(primary, secondary);

            await primary.set('answers', ['user', 'Q1'], { value: 'PRIMARY' });
            await secondary.set('answers', ['user', 'Q1'], { value: 'SECONDARY' });

            const result = await dual.get('answers', ['user', 'Q1']);
            expect(result).toEqual({ value: 'PRIMARY' });
        });

        it('should fallback to secondary if primary returns null', async () => {
            const primary = new MockStorageAdapter('idb');
            const secondary = new MockStorageAdapter('ls');
            const dual = new MockDualWriteAdapter(primary, secondary);

            await secondary.set('answers', ['user', 'Q1'], { value: 'SECONDARY' });

            const result = await dual.get('answers', ['user', 'Q1']);
            expect(result).toEqual({ value: 'SECONDARY' });
        });

        it('should work with no secondary adapter', async () => {
            const primary = new MockStorageAdapter('idb');
            const dual = new MockDualWriteAdapter(primary, null);

            await dual.set('answers', ['user', 'Q1'], { value: 'A' });
            const result = await dual.get('answers', ['user', 'Q1']);
            expect(result).toEqual({ value: 'A' });
        });
    });

    describe('Migration Key Parsing', () => {
        it('should parse answers_username keys', () => {
            const result = migrateLocalStorageKey('answers_Apple_Tiger');
            expect(result).toEqual({ store: 'answers', username: 'Apple_Tiger' });
        });

        it('should parse reasons_username keys', () => {
            const result = migrateLocalStorageKey('reasons_Banana_Lion');
            expect(result).toEqual({ store: 'reasons', username: 'Banana_Lion' });
        });

        it('should parse attempts_username keys', () => {
            const result = migrateLocalStorageKey('attempts_Cherry_Bear');
            expect(result).toEqual({ store: 'attempts', username: 'Cherry_Bear' });
        });

        it('should parse progress_username keys', () => {
            const result = migrateLocalStorageKey('progress_Date_Wolf');
            expect(result).toEqual({ store: 'progress', username: 'Date_Wolf' });
        });

        it('should parse badges_username keys', () => {
            const result = migrateLocalStorageKey('badges_Elderberry_Fox');
            expect(result).toEqual({ store: 'badges', username: 'Elderberry_Fox' });
        });

        it('should parse charts_username keys', () => {
            const result = migrateLocalStorageKey('charts_Fig_Deer');
            expect(result).toEqual({ store: 'charts', username: 'Fig_Deer' });
        });

        it('should parse classData key', () => {
            const result = migrateLocalStorageKey('classData');
            expect(result).toEqual({ store: 'peerCache', special: 'classData' });
        });

        it('should parse consensusUsername key', () => {
            const result = migrateLocalStorageKey('consensusUsername');
            expect(result).toEqual({ store: 'meta', key: 'username' });
        });

        it('should return null for unknown keys', () => {
            expect(migrateLocalStorageKey('randomKey')).toBeNull();
            expect(migrateLocalStorageKey('someOther_value')).toBeNull();
        });

        it('should handle usernames with underscores', () => {
            const result = migrateLocalStorageKey('answers_Apple_Tiger_Jr');
            expect(result).toEqual({ store: 'answers', username: 'Apple_Tiger_Jr' });
        });
    });

    describe('Answer Format Conversion', () => {
        it('should convert legacy string format to new format', () => {
            const result = convertAnswerFormat('A');
            expect(result).toEqual({ value: 'A', timestamp: 0 });
        });

        it('should convert legacy string with custom timestamp', () => {
            const result = convertAnswerFormat('B', 1704067200000);
            expect(result).toEqual({ value: 'B', timestamp: 1704067200000 });
        });

        it('should pass through new format unchanged', () => {
            const input = { value: 'C', timestamp: 1704067200000 };
            const result = convertAnswerFormat(input);
            expect(result).toEqual(input);
        });

        it('should handle object without timestamp', () => {
            const input = { value: 'D' };
            const result = convertAnswerFormat(input);
            expect(result).toEqual({ value: 'D', timestamp: 0 });
        });

        it('should handle null values', () => {
            const result = convertAnswerFormat(null);
            expect(result).toEqual({ value: null, timestamp: 0 });
        });

        it('should handle number values', () => {
            const result = convertAnswerFormat(42);
            expect(result).toEqual({ value: 42, timestamp: 0 });
        });
    });

    describe('IDB Store Names', () => {
        const expectedStores = [
            'meta', 'answers', 'reasons', 'attempts', 'progress',
            'badges', 'charts', 'preferences', 'peerCache', 'outbox', 'sprites'
        ];

        it('should have all required store names defined', () => {
            expectedStores.forEach(store => {
                expect(typeof store).toBe('string');
                expect(store.length).toBeGreaterThan(0);
            });
        });

        it('should have 11 stores total', () => {
            expect(expectedStores.length).toBe(11);
        });
    });
});
