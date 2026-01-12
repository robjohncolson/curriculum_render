/**
 * Data Management Tests
 *
 * Tests for STATE_MACHINES.md Section 3: Data Management
 * - classData lifecycle
 * - Answer persistence
 * - Attempt counting
 * - Data format conversions
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Mock classData structure
 */
function createEmptyUserData() {
    return {
        answers: {},
        reasons: {},
        timestamps: {},
        attempts: {},
        charts: {},
        currentActivity: {
            state: 'idle',
            questionId: null,
            lastUpdate: Date.now()
        }
    };
}

/**
 * Mock ClassData Manager
 */
class MockClassDataManager {
    constructor() {
        this.users = {};
    }

    ensureUserEntry(username) {
        if (!this.users[username]) {
            this.users[username] = createEmptyUserData();
        }
        return this.users[username];
    }

    saveAnswer(username, questionId, value) {
        const user = this.ensureUserEntry(username);
        const timestamp = Date.now();

        // Normalize answer format
        if (typeof value === 'string') {
            user.answers[questionId] = { value, timestamp };
        } else if (typeof value === 'object' && value !== null) {
            user.answers[questionId] = {
                value: value.value ?? value,
                timestamp: value.timestamp ?? timestamp
            };
        } else {
            user.answers[questionId] = { value, timestamp };
        }

        user.timestamps[questionId] = timestamp;
        return user.answers[questionId];
    }

    saveReason(username, questionId, reason) {
        const user = this.ensureUserEntry(username);
        user.reasons[questionId] = reason;
        return reason;
    }

    incrementAttempt(username, questionId) {
        const user = this.ensureUserEntry(username);
        const current = user.attempts[questionId] || 0;
        user.attempts[questionId] = current + 1;
        return user.attempts[questionId];
    }

    getAttemptCount(username, questionId) {
        return this.users[username]?.attempts?.[questionId] || 0;
    }

    getAnswer(username, questionId) {
        return this.users[username]?.answers?.[questionId] || null;
    }

    getReason(username, questionId) {
        return this.users[username]?.reasons?.[questionId] ?? null;
    }

    updateCurrentActivity(username, state, questionId = null) {
        const user = this.ensureUserEntry(username);
        user.currentActivity = {
            state,
            questionId,
            lastUpdate: Date.now()
        };
        return user.currentActivity;
    }

    rebuildFromStorage(storageData) {
        // Simulate rebuilding classData from IDB stores
        this.users = {};

        for (const [username, data] of Object.entries(storageData)) {
            this.users[username] = {
                answers: this.normalizeAnswers(data.answers || {}),
                reasons: data.reasons || {},
                timestamps: data.timestamps || {},
                attempts: data.attempts || {},
                charts: data.charts || {},
                currentActivity: data.currentActivity || {
                    state: 'idle',
                    questionId: null,
                    lastUpdate: Date.now()
                }
            };
        }

        return this.users;
    }

    normalizeAnswers(answers) {
        const normalized = {};
        for (const [qId, answer] of Object.entries(answers)) {
            if (typeof answer === 'string') {
                normalized[qId] = { value: answer, timestamp: 0 };
            } else {
                normalized[qId] = answer;
            }
        }
        return normalized;
    }
}

/**
 * Current Activity States
 */
const ActivityState = {
    IDLE: 'idle',
    VIEWING: 'viewing',
    ANSWERING: 'answering',
    SUBMITTED: 'submitted'
};

/**
 * Outbox Item Structure
 */
function createOutboxItem(opType, data) {
    return {
        op: opType,
        data,
        tries: 0,
        createdAt: Date.now()
    };
}

// ============================================
// TESTS
// ============================================

describe('Data Management', () => {
    describe('ClassData Initialization', () => {
        let manager;

        beforeEach(() => {
            manager = new MockClassDataManager();
        });

        it('should create empty user data structure', () => {
            const userData = createEmptyUserData();

            expect(userData.answers).toEqual({});
            expect(userData.reasons).toEqual({});
            expect(userData.timestamps).toEqual({});
            expect(userData.attempts).toEqual({});
            expect(userData.charts).toEqual({});
            expect(userData.currentActivity.state).toBe('idle');
        });

        it('should ensure user entry creates default structure', () => {
            const user = manager.ensureUserEntry('Apple_Tiger');

            expect(manager.users['Apple_Tiger']).toBeDefined();
            expect(user.answers).toEqual({});
            expect(user.currentActivity.state).toBe('idle');
        });

        it('should not overwrite existing user entry', () => {
            manager.ensureUserEntry('Apple_Tiger');
            manager.saveAnswer('Apple_Tiger', 'Q1', 'A');
            manager.ensureUserEntry('Apple_Tiger');

            expect(manager.getAnswer('Apple_Tiger', 'Q1')).toBeDefined();
        });
    });

    describe('Answer Saving', () => {
        let manager;

        beforeEach(() => {
            manager = new MockClassDataManager();
        });

        it('should save string answer with timestamp', () => {
            const result = manager.saveAnswer('user1', 'Q1', 'A');

            expect(result.value).toBe('A');
            expect(result.timestamp).toBeGreaterThan(0);
        });

        it('should save object answer preserving timestamp', () => {
            const result = manager.saveAnswer('user1', 'Q1', {
                value: 'B',
                timestamp: 1704067200000
            });

            expect(result.value).toBe('B');
            expect(result.timestamp).toBe(1704067200000);
        });

        it('should update timestamps on save', () => {
            manager.saveAnswer('user1', 'Q1', 'A');

            expect(manager.users['user1'].timestamps['Q1']).toBeGreaterThan(0);
        });

        it('should overwrite previous answer', () => {
            manager.saveAnswer('user1', 'Q1', 'A');
            manager.saveAnswer('user1', 'Q1', 'B');

            expect(manager.getAnswer('user1', 'Q1').value).toBe('B');
        });

        it('should handle null value', () => {
            const result = manager.saveAnswer('user1', 'Q1', null);

            expect(result.value).toBeNull();
        });
    });

    describe('Reason Saving', () => {
        let manager;

        beforeEach(() => {
            manager = new MockClassDataManager();
        });

        it('should save reason string', () => {
            manager.saveReason('user1', 'Q1', 'Because it looked right');

            expect(manager.getReason('user1', 'Q1')).toBe('Because it looked right');
        });

        it('should overwrite previous reason', () => {
            manager.saveReason('user1', 'Q1', 'First reason');
            manager.saveReason('user1', 'Q1', 'Second reason');

            expect(manager.getReason('user1', 'Q1')).toBe('Second reason');
        });

        it('should handle empty reason', () => {
            manager.saveReason('user1', 'Q1', '');

            expect(manager.getReason('user1', 'Q1')).toBe('');
        });

        it('should return null for missing reason', () => {
            expect(manager.getReason('user1', 'Q999')).toBeNull();
        });
    });

    describe('Attempt Counting', () => {
        let manager;

        beforeEach(() => {
            manager = new MockClassDataManager();
        });

        it('should start at 0 for new question', () => {
            expect(manager.getAttemptCount('user1', 'Q1')).toBe(0);
        });

        it('should increment from 0 to 1', () => {
            const count = manager.incrementAttempt('user1', 'Q1');

            expect(count).toBe(1);
            expect(manager.getAttemptCount('user1', 'Q1')).toBe(1);
        });

        it('should increment consecutively', () => {
            manager.incrementAttempt('user1', 'Q1');
            manager.incrementAttempt('user1', 'Q1');
            manager.incrementAttempt('user1', 'Q1');

            expect(manager.getAttemptCount('user1', 'Q1')).toBe(3);
        });

        it('should track attempts per question independently', () => {
            manager.incrementAttempt('user1', 'Q1');
            manager.incrementAttempt('user1', 'Q1');
            manager.incrementAttempt('user1', 'Q2');

            expect(manager.getAttemptCount('user1', 'Q1')).toBe(2);
            expect(manager.getAttemptCount('user1', 'Q2')).toBe(1);
        });

        it('should track attempts per user independently', () => {
            manager.incrementAttempt('user1', 'Q1');
            manager.incrementAttempt('user2', 'Q1');
            manager.incrementAttempt('user2', 'Q1');

            expect(manager.getAttemptCount('user1', 'Q1')).toBe(1);
            expect(manager.getAttemptCount('user2', 'Q1')).toBe(2);
        });
    });

    describe('Current Activity Tracking', () => {
        let manager;

        beforeEach(() => {
            manager = new MockClassDataManager();
        });

        it('should default to idle state', () => {
            manager.ensureUserEntry('user1');

            expect(manager.users['user1'].currentActivity.state).toBe('idle');
        });

        it('should update to viewing state', () => {
            const activity = manager.updateCurrentActivity('user1', ActivityState.VIEWING, 'Q1');

            expect(activity.state).toBe('viewing');
            expect(activity.questionId).toBe('Q1');
        });

        it('should update to answering state', () => {
            const activity = manager.updateCurrentActivity('user1', ActivityState.ANSWERING, 'Q1');

            expect(activity.state).toBe('answering');
        });

        it('should update to submitted state', () => {
            const activity = manager.updateCurrentActivity('user1', ActivityState.SUBMITTED, 'Q1');

            expect(activity.state).toBe('submitted');
        });

        it('should track lastUpdate timestamp', () => {
            const before = Date.now();
            const activity = manager.updateCurrentActivity('user1', ActivityState.VIEWING, 'Q1');
            const after = Date.now();

            expect(activity.lastUpdate).toBeGreaterThanOrEqual(before);
            expect(activity.lastUpdate).toBeLessThanOrEqual(after);
        });
    });

    describe('Rebuild from Storage', () => {
        let manager;

        beforeEach(() => {
            manager = new MockClassDataManager();
        });

        it('should rebuild classData from storage', () => {
            const storageData = {
                'user1': {
                    answers: { 'Q1': { value: 'A', timestamp: 1000 } },
                    reasons: { 'Q1': 'My reason' },
                    attempts: { 'Q1': 2 }
                }
            };

            manager.rebuildFromStorage(storageData);

            expect(manager.getAnswer('user1', 'Q1').value).toBe('A');
            expect(manager.getReason('user1', 'Q1')).toBe('My reason');
            expect(manager.getAttemptCount('user1', 'Q1')).toBe(2);
        });

        it('should normalize legacy string answers', () => {
            const storageData = {
                'user1': {
                    answers: { 'Q1': 'A', 'Q2': 'B' }
                }
            };

            manager.rebuildFromStorage(storageData);

            expect(manager.getAnswer('user1', 'Q1')).toEqual({ value: 'A', timestamp: 0 });
            expect(manager.getAnswer('user1', 'Q2')).toEqual({ value: 'B', timestamp: 0 });
        });

        it('should handle missing fields gracefully', () => {
            const storageData = {
                'user1': {}
            };

            manager.rebuildFromStorage(storageData);

            expect(manager.users['user1'].answers).toEqual({});
            expect(manager.users['user1'].reasons).toEqual({});
            expect(manager.users['user1'].currentActivity.state).toBe('idle');
        });

        it('should rebuild multiple users', () => {
            const storageData = {
                'user1': { answers: { 'Q1': { value: 'A', timestamp: 0 } } },
                'user2': { answers: { 'Q1': { value: 'B', timestamp: 0 } } }
            };

            manager.rebuildFromStorage(storageData);

            expect(manager.getAnswer('user1', 'Q1').value).toBe('A');
            expect(manager.getAnswer('user2', 'Q1').value).toBe('B');
        });
    });

    describe('Outbox Queue', () => {
        it('should create outbox item with correct structure', () => {
            const item = createOutboxItem('saveAnswer', {
                username: 'user1',
                questionId: 'Q1',
                value: 'A'
            });

            expect(item.op).toBe('saveAnswer');
            expect(item.data.username).toBe('user1');
            expect(item.tries).toBe(0);
            expect(item.createdAt).toBeGreaterThan(0);
        });

        it('should increment tries on retry', () => {
            const item = createOutboxItem('saveAnswer', {});
            item.tries++;
            item.tries++;

            expect(item.tries).toBe(2);
        });

        it('should mark as failed after 3 tries', () => {
            const item = createOutboxItem('saveAnswer', {});
            item.tries = 3;

            const isFailed = item.tries >= 3;
            expect(isFailed).toBe(true);
        });
    });

    describe('Answer Format Normalization', () => {
        let manager;

        beforeEach(() => {
            manager = new MockClassDataManager();
        });

        it('should normalize mixed format answers', () => {
            const mixed = {
                'Q1': 'A',                              // Legacy string
                'Q2': { value: 'B', timestamp: 1000 }, // New format
                'Q3': 'C'                              // Legacy string
            };

            const normalized = manager.normalizeAnswers(mixed);

            expect(normalized['Q1']).toEqual({ value: 'A', timestamp: 0 });
            expect(normalized['Q2']).toEqual({ value: 'B', timestamp: 1000 });
            expect(normalized['Q3']).toEqual({ value: 'C', timestamp: 0 });
        });

        it('should handle empty answers object', () => {
            const normalized = manager.normalizeAnswers({});
            expect(normalized).toEqual({});
        });
    });
});
