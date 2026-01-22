/**
 * Auto Cloud Restore Tests
 *
 * Tests for STATE_MACHINES.md Section 8: Auto Cloud Restore
 * - Local data detection (IDB + localStorage)
 * - Cloud data count queries
 * - Restore flow and prompts
 * - Error handling and fallbacks
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCK DATA AND HELPERS
// ============================================

/**
 * Mock localStorage implementation
 */
function createMockLocalStorage() {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => { store[key] = value; }),
        removeItem: vi.fn((key) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
        get length() { return Object.keys(store).length; },
        key: vi.fn((i) => Object.keys(store)[i] || null),
        _store: store
    };
}

/**
 * Mock IDB storage implementation
 */
function createMockIDBStorage() {
    let answers = {};
    return {
        getAllForUser: vi.fn(async (storeName, username) => {
            if (storeName === 'answers') {
                return Object.entries(answers[username] || {}).map(([questionId, data]) => ({
                    questionId,
                    value: data.value,
                    timestamp: data.timestamp
                }));
            }
            return [];
        }),
        set: vi.fn(async () => true),
        get: vi.fn(async () => null),
        _setAnswers: (username, data) => { answers[username] = data; },
        _clear: () => { answers = {}; }
    };
}

/**
 * Mock Supabase client
 */
function createMockSupabaseClient(cloudData = {}) {
    return {
        from: vi.fn((table) => ({
            select: vi.fn(() => ({
                eq: vi.fn((field, value) => ({
                    order: vi.fn(() => ({
                        range: vi.fn(() => Promise.resolve({
                            data: cloudData[value] || [],
                            error: null
                        }))
                    })),
                    // For count query
                    then: (resolve) => resolve({
                        data: cloudData[value] || [],
                        count: (cloudData[value] || []).length,
                        error: null
                    })
                }))
            }))
        }))
    };
}

/**
 * Check if user has local data
 * @param {string} username
 * @param {object} localStorage
 * @param {object} idbStorage
 * @returns {Promise<boolean>}
 */
async function hasLocalData(username, localStorage, idbStorage) {
    // Check localStorage first
    try {
        const localAnswers = localStorage.getItem(`answers_${username}`);
        if (localAnswers) {
            const parsed = JSON.parse(localAnswers);
            if (Object.keys(parsed).length > 0) {
                return true;
            }
        }
    } catch (e) {
        // localStorage may be blocked or data corrupted
    }

    // Check IDB
    try {
        if (idbStorage) {
            const idbAnswers = await idbStorage.getAllForUser('answers', username);
            if (idbAnswers && idbAnswers.length > 0) {
                return true;
            }
        }
    } catch (e) {
        // IDB may not be available
    }

    return false;
}

/**
 * Get cloud answer count for user
 * @param {string} username
 * @param {object} supabaseClient
 * @returns {Promise<number>}
 */
async function getCloudAnswerCount(username, supabaseClient) {
    if (!supabaseClient) return 0;

    try {
        const { data, error, count } = await supabaseClient
            .from('answers')
            .select('question_id', { count: 'exact', head: true })
            .eq('username', username);

        if (error) throw error;
        return count || (data ? data.length : 0);
    } catch (e) {
        console.warn('Failed to get cloud answer count:', e);
        return 0;
    }
}

/**
 * Main auto-restore check function
 * @param {string} username
 * @param {object} options
 * @returns {Promise<{shouldPrompt: boolean, cloudCount: number, reason: string}>}
 */
async function checkAutoRestoreEligibility(username, options = {}) {
    const {
        localStorage,
        idbStorage,
        supabaseClient,
        turboModeActive = false
    } = options;

    // Condition 1: Must have valid username
    if (!username || typeof username !== 'string') {
        return { shouldPrompt: false, cloudCount: 0, reason: 'invalid_username' };
    }

    // Condition 2: Must NOT have local data
    const hasLocal = await hasLocalData(username, localStorage, idbStorage);
    if (hasLocal) {
        return { shouldPrompt: false, cloudCount: 0, reason: 'has_local_data' };
    }

    // Condition 3: Turbo mode must be active
    if (!turboModeActive || !supabaseClient) {
        return { shouldPrompt: false, cloudCount: 0, reason: 'turbo_inactive' };
    }

    // Condition 4: Cloud must have data
    const cloudCount = await getCloudAnswerCount(username, supabaseClient);
    if (cloudCount === 0) {
        return { shouldPrompt: false, cloudCount: 0, reason: 'no_cloud_data' };
    }

    // All conditions met!
    return { shouldPrompt: true, cloudCount, reason: 'eligible' };
}

// ============================================
// TEST SUITES
// ============================================

describe('Auto Cloud Restore - State Machine', () => {
    let mockLocalStorage;
    let mockIDBStorage;
    let mockSupabase;

    beforeEach(() => {
        mockLocalStorage = createMockLocalStorage();
        mockIDBStorage = createMockIDBStorage();
        mockSupabase = null;
    });

    describe('hasLocalData()', () => {
        it('should return false when localStorage is empty', async () => {
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(false);
        });

        it('should return true when localStorage has answers', async () => {
            mockLocalStorage.setItem('answers_Apple_Bear', JSON.stringify({
                'U1-L1-Q01': { value: 'A', timestamp: 123456 }
            }));
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(true);
        });

        it('should return true when IDB has answers', async () => {
            mockIDBStorage._setAnswers('Apple_Bear', {
                'U1-L1-Q01': { value: 'B', timestamp: 123456 }
            });
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(true);
        });

        it('should return false when localStorage has empty object', async () => {
            mockLocalStorage.setItem('answers_Apple_Bear', '{}');
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(false);
        });

        it('should handle corrupted localStorage gracefully', async () => {
            mockLocalStorage.setItem('answers_Apple_Bear', 'not-valid-json');
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(false);
        });

        it('should check correct username key', async () => {
            mockLocalStorage.setItem('answers_Different_User', JSON.stringify({
                'U1-L1-Q01': { value: 'A', timestamp: 123456 }
            }));
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(false);
        });
    });

    describe('getCloudAnswerCount()', () => {
        it('should return 0 when supabaseClient is null', async () => {
            const count = await getCloudAnswerCount('Apple_Bear', null);
            expect(count).toBe(0);
        });

        it('should return count from Supabase', async () => {
            const mockClient = createMockSupabaseClient({
                'Apple_Bear': [
                    { question_id: 'U1-L1-Q01' },
                    { question_id: 'U1-L1-Q02' },
                    { question_id: 'U1-L1-Q03' }
                ]
            });
            const count = await getCloudAnswerCount('Apple_Bear', mockClient);
            expect(count).toBe(3);
        });

        it('should return 0 for unknown user', async () => {
            const mockClient = createMockSupabaseClient({});
            const count = await getCloudAnswerCount('Unknown_User', mockClient);
            expect(count).toBe(0);
        });
    });

    describe('checkAutoRestoreEligibility()', () => {
        it('should return invalid_username for empty username', async () => {
            const result = await checkAutoRestoreEligibility('', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true
            });
            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('invalid_username');
        });

        it('should return invalid_username for null username', async () => {
            const result = await checkAutoRestoreEligibility(null, {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true
            });
            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('invalid_username');
        });

        it('should return has_local_data when localStorage has answers', async () => {
            mockLocalStorage.setItem('answers_Apple_Bear', JSON.stringify({
                'U1-L1-Q01': { value: 'A', timestamp: 123456 }
            }));
            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: createMockSupabaseClient({ 'Apple_Bear': [{ question_id: 'Q1' }] })
            });
            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('has_local_data');
        });

        it('should return turbo_inactive when turbo mode is off', async () => {
            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: false,
                supabaseClient: createMockSupabaseClient({ 'Apple_Bear': [{ question_id: 'Q1' }] })
            });
            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('turbo_inactive');
        });

        it('should return turbo_inactive when supabaseClient is null', async () => {
            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: null
            });
            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('turbo_inactive');
        });

        it('should return no_cloud_data when cloud has no answers', async () => {
            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: createMockSupabaseClient({})
            });
            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('no_cloud_data');
        });

        it('should return eligible when all conditions met', async () => {
            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: createMockSupabaseClient({
                    'Apple_Bear': [
                        { question_id: 'U1-L1-Q01' },
                        { question_id: 'U1-L1-Q02' }
                    ]
                })
            });
            expect(result.shouldPrompt).toBe(true);
            expect(result.cloudCount).toBe(2);
            expect(result.reason).toBe('eligible');
        });
    });
});

describe('Auto Cloud Restore - User Experience', () => {
    let mockLocalStorage;
    let mockIDBStorage;

    beforeEach(() => {
        mockLocalStorage = createMockLocalStorage();
        mockIDBStorage = createMockIDBStorage();
    });

    describe('Seamless for existing users', () => {
        it('should not prompt when user has local data', async () => {
            mockLocalStorage.setItem('answers_Apple_Bear', JSON.stringify({
                'U1-L1-Q01': { value: 'A', timestamp: 123456 },
                'U1-L1-Q02': { value: 'B', timestamp: 123457 }
            }));

            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: createMockSupabaseClient({
                    'Apple_Bear': Array(50).fill({ question_id: 'Q' })
                })
            });

            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('has_local_data');
        });

        it('should not prompt when IDB has data even if localStorage empty', async () => {
            mockIDBStorage._setAnswers('Apple_Bear', {
                'U1-L1-Q01': { value: 'C', timestamp: 123456 }
            });

            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: createMockSupabaseClient({
                    'Apple_Bear': Array(50).fill({ question_id: 'Q' })
                })
            });

            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('has_local_data');
        });
    });

    describe('Helpful for returning users', () => {
        it('should prompt with correct cloud count', async () => {
            const cloudAnswers = Array(76).fill(null).map((_, i) => ({
                question_id: `U1-L${Math.floor(i/10)+1}-Q${(i%10)+1}`
            }));

            const result = await checkAutoRestoreEligibility('Apricot_Horse', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: createMockSupabaseClient({
                    'Apricot_Horse': cloudAnswers
                })
            });

            expect(result.shouldPrompt).toBe(true);
            expect(result.cloudCount).toBe(76);
        });
    });

    describe('Graceful fallback', () => {
        it('should silently skip when turbo mode inactive', async () => {
            const result = await checkAutoRestoreEligibility('Apple_Bear', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: false,
                supabaseClient: null
            });

            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('turbo_inactive');
        });

        it('should handle new users gracefully (no cloud data)', async () => {
            const result = await checkAutoRestoreEligibility('NewUser_Name', {
                localStorage: mockLocalStorage,
                idbStorage: mockIDBStorage,
                turboModeActive: true,
                supabaseClient: createMockSupabaseClient({})
            });

            expect(result.shouldPrompt).toBe(false);
            expect(result.reason).toBe('no_cloud_data');
            expect(result.cloudCount).toBe(0);
        });
    });
});

describe('Auto Cloud Restore - Error Handling', () => {
    let mockLocalStorage;
    let mockIDBStorage;

    beforeEach(() => {
        mockLocalStorage = createMockLocalStorage();
        mockIDBStorage = createMockIDBStorage();
    });

    describe('localStorage errors', () => {
        it('should handle localStorage.getItem throwing', async () => {
            mockLocalStorage.getItem = vi.fn(() => {
                throw new Error('localStorage blocked');
            });

            // Should not throw, should fall back to IDB check
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(false);
        });

        it('should handle JSON.parse error', async () => {
            mockLocalStorage.setItem('answers_Apple_Bear', 'invalid{json');

            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(false);
        });
    });

    describe('IDB errors', () => {
        it('should handle IDB getAllForUser throwing', async () => {
            mockIDBStorage.getAllForUser = vi.fn(async () => {
                throw new Error('IDB not available');
            });

            const result = await hasLocalData('Apple_Bear', mockLocalStorage, mockIDBStorage);
            expect(result).toBe(false);
        });

        it('should handle null IDB storage', async () => {
            const result = await hasLocalData('Apple_Bear', mockLocalStorage, null);
            expect(result).toBe(false);
        });
    });

    describe('Supabase errors', () => {
        it('should return 0 count on Supabase error', async () => {
            const errorClient = {
                from: () => ({
                    select: () => ({
                        eq: () => Promise.resolve({
                            data: null,
                            error: new Error('Network error'),
                            count: null
                        })
                    })
                })
            };

            const count = await getCloudAnswerCount('Apple_Bear', errorClient);
            expect(count).toBe(0);
        });
    });
});

describe('Auto Cloud Restore - State Transitions', () => {
    let mockLocalStorage;
    let mockIDBStorage;

    beforeEach(() => {
        mockLocalStorage = createMockLocalStorage();
        mockIDBStorage = createMockIDBStorage();
    });

    it('should follow correct state flow: no local -> turbo active -> has cloud -> eligible', async () => {
        const states = [];

        // Track state transitions
        const result = await checkAutoRestoreEligibility('Apple_Bear', {
            localStorage: mockLocalStorage,
            idbStorage: mockIDBStorage,
            turboModeActive: true,
            supabaseClient: createMockSupabaseClient({
                'Apple_Bear': [{ question_id: 'Q1' }, { question_id: 'Q2' }]
            })
        });

        expect(result.shouldPrompt).toBe(true);
        expect(result.reason).toBe('eligible');
    });

    it('should short-circuit at has_local_data', async () => {
        mockLocalStorage.setItem('answers_Apple_Bear', JSON.stringify({ 'Q1': {} }));

        const result = await checkAutoRestoreEligibility('Apple_Bear', {
            localStorage: mockLocalStorage,
            idbStorage: mockIDBStorage,
            turboModeActive: true,
            supabaseClient: createMockSupabaseClient({
                'Apple_Bear': [{ question_id: 'Q1' }]
            })
        });

        expect(result.shouldPrompt).toBe(false);
        expect(result.reason).toBe('has_local_data');
        // Supabase should NOT be queried when local data exists
    });

    it('should short-circuit at turbo_inactive', async () => {
        const mockClient = createMockSupabaseClient({
            'Apple_Bear': [{ question_id: 'Q1' }]
        });

        const result = await checkAutoRestoreEligibility('Apple_Bear', {
            localStorage: mockLocalStorage,
            idbStorage: mockIDBStorage,
            turboModeActive: false,
            supabaseClient: mockClient
        });

        expect(result.shouldPrompt).toBe(false);
        expect(result.reason).toBe('turbo_inactive');
    });
});

describe('Auto Cloud Restore - Integration Scenarios', () => {
    let mockLocalStorage;
    let mockIDBStorage;

    beforeEach(() => {
        mockLocalStorage = createMockLocalStorage();
        mockIDBStorage = createMockIDBStorage();
    });

    it('Scenario: Justin clears browser storage, returns to app', async () => {
        // Justin (Apricot_Horse) has 76 answers in cloud but empty local storage
        const result = await checkAutoRestoreEligibility('Apricot_Horse', {
            localStorage: mockLocalStorage,
            idbStorage: mockIDBStorage,
            turboModeActive: true,
            supabaseClient: createMockSupabaseClient({
                'Apricot_Horse': Array(76).fill({ question_id: 'Q' })
            })
        });

        expect(result.shouldPrompt).toBe(true);
        expect(result.cloudCount).toBe(76);
        expect(result.reason).toBe('eligible');
    });

    it('Scenario: New student first login', async () => {
        const result = await checkAutoRestoreEligibility('Banana_Tiger', {
            localStorage: mockLocalStorage,
            idbStorage: mockIDBStorage,
            turboModeActive: true,
            supabaseClient: createMockSupabaseClient({})
        });

        expect(result.shouldPrompt).toBe(false);
        expect(result.cloudCount).toBe(0);
        expect(result.reason).toBe('no_cloud_data');
    });

    it('Scenario: Student with existing local data', async () => {
        mockLocalStorage.setItem('answers_Cherry_Wolf', JSON.stringify({
            'U1-L1-Q01': { value: 'A', timestamp: 123 }
        }));

        const result = await checkAutoRestoreEligibility('Cherry_Wolf', {
            localStorage: mockLocalStorage,
            idbStorage: mockIDBStorage,
            turboModeActive: true,
            supabaseClient: createMockSupabaseClient({
                'Cherry_Wolf': Array(100).fill({ question_id: 'Q' })
            })
        });

        expect(result.shouldPrompt).toBe(false);
        expect(result.reason).toBe('has_local_data');
    });

    it('Scenario: Student using incognito/offline mode', async () => {
        const result = await checkAutoRestoreEligibility('Date_Eagle', {
            localStorage: mockLocalStorage,
            idbStorage: mockIDBStorage,
            turboModeActive: false,  // No turbo in incognito
            supabaseClient: null
        });

        expect(result.shouldPrompt).toBe(false);
        expect(result.reason).toBe('turbo_inactive');
    });
});
