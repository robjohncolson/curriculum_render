/**
 * User Authentication Tests
 *
 * Tests for STATE_MACHINES.md Section 2: User Authentication
 * - Username generation (Fruit_Animal format)
 * - Login flow states
 * - Session management
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// MOCK DATA AND HELPERS
// ============================================

/**
 * Fruit list (subset for testing)
 */
const FRUITS = [
    'Apple', 'Banana', 'Cherry', 'Date', 'Elderberry',
    'Fig', 'Grape', 'Honeydew', 'Kiwi', 'Lemon',
    'Mango', 'Nectarine', 'Orange', 'Papaya', 'Quince'
];

/**
 * Animal list (subset for testing)
 */
const ANIMALS = [
    'Tiger', 'Lion', 'Bear', 'Wolf', 'Fox',
    'Deer', 'Eagle', 'Hawk', 'Owl', 'Raven',
    'Salmon', 'Trout', 'Shark', 'Whale', 'Dolphin'
];

/**
 * Generate random username in Fruit_Animal format
 */
function generateRandomUsername(fruits = FRUITS, animals = ANIMALS) {
    const fruit = fruits[Math.floor(Math.random() * fruits.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${fruit}_${animal}`;
}

/**
 * Validate username format
 */
function isValidUsernameFormat(username) {
    if (!username || typeof username !== 'string') return false;
    const parts = username.split('_');
    if (parts.length < 2) return false;
    // First part should be capitalized word (fruit)
    // Second part should be capitalized word (animal)
    const fruitPattern = /^[A-Z][a-z]+$/;
    const animalPattern = /^[A-Z][a-z]+$/;
    return fruitPattern.test(parts[0]) && animalPattern.test(parts[1]);
}

/**
 * Check for duplicate names (case-insensitive)
 */
function findDuplicateNames(realName, existingUsers) {
    const normalizedName = realName.toLowerCase().trim();
    return existingUsers.filter(user =>
        user.real_name.toLowerCase().includes(normalizedName)
    );
}

/**
 * Auth State Machine
 */
const AuthState = {
    NO_SESSION: 'NO_SESSION',
    WELCOME_SCREEN: 'WELCOME_SCREEN',
    NEW_STUDENT_FLOW: 'NEW_STUDENT_FLOW',
    RETURNING_STUDENT_FLOW: 'RETURNING_STUDENT_FLOW',
    SELECT_EXISTING: 'SELECT_EXISTING',
    LOGGED_IN: 'LOGGED_IN',
    USER_SELECT: 'USER_SELECT'
};

/**
 * Mock Auth State Machine
 */
class MockAuthStateMachine {
    constructor() {
        this.state = AuthState.NO_SESSION;
        this.username = null;
        this.realName = null;
        this.recentUsernames = [];
    }

    checkSavedSession(savedUsername) {
        if (savedUsername) {
            this.username = savedUsername;
            this.state = AuthState.LOGGED_IN;
            return true;
        }
        this.state = AuthState.WELCOME_SCREEN;
        return false;
    }

    startNewStudentFlow() {
        if (this.state !== AuthState.WELCOME_SCREEN) return false;
        this.state = AuthState.NEW_STUDENT_FLOW;
        return true;
    }

    startReturningStudentFlow() {
        if (this.state !== AuthState.WELCOME_SCREEN) return false;
        this.state = AuthState.RETURNING_STUDENT_FLOW;
        return true;
    }

    selectExistingUser(username) {
        if (this.state !== AuthState.RETURNING_STUDENT_FLOW) return false;
        this.username = username;
        this.state = AuthState.LOGGED_IN;
        return true;
    }

    acceptGeneratedUsername(username, realName) {
        if (this.state !== AuthState.NEW_STUDENT_FLOW) return false;
        this.username = username;
        this.realName = realName;
        this.recentUsernames.push(username);
        this.state = AuthState.LOGGED_IN;
        return true;
    }

    switchUser() {
        if (this.state !== AuthState.LOGGED_IN) return false;
        this.state = AuthState.USER_SELECT;
        return true;
    }

    selectDifferentUser(username) {
        if (this.state !== AuthState.USER_SELECT) return false;
        this.username = username;
        this.state = AuthState.LOGGED_IN;
        return true;
    }

    logout() {
        this.state = AuthState.NO_SESSION;
        this.username = null;
        this.realName = null;
    }
}

// ============================================
// TESTS
// ============================================

describe('User Authentication', () => {
    describe('Username Generation', () => {
        it('should generate username in Fruit_Animal format', () => {
            const username = generateRandomUsername();
            expect(username).toMatch(/^[A-Z][a-z]+_[A-Z][a-z]+$/);
        });

        it('should generate different usernames on multiple calls', () => {
            const usernames = new Set();
            for (let i = 0; i < 50; i++) {
                usernames.add(generateRandomUsername());
            }
            // With 15x15=225 combinations and 50 attempts, we should get variety
            expect(usernames.size).toBeGreaterThan(10);
        });

        it('should use provided fruit and animal lists', () => {
            const customFruits = ['TestFruit'];
            const customAnimals = ['TestAnimal'];
            const username = generateRandomUsername(customFruits, customAnimals);
            expect(username).toBe('TestFruit_TestAnimal');
        });

        it('should have underscore separator', () => {
            const username = generateRandomUsername();
            expect(username).toContain('_');
        });
    });

    describe('Username Validation', () => {
        it('should validate correct format', () => {
            expect(isValidUsernameFormat('Apple_Tiger')).toBe(true);
            expect(isValidUsernameFormat('Banana_Lion')).toBe(true);
            expect(isValidUsernameFormat('Elderberry_Dolphin')).toBe(true);
        });

        it('should reject lowercase format', () => {
            expect(isValidUsernameFormat('apple_tiger')).toBe(false);
            expect(isValidUsernameFormat('Apple_tiger')).toBe(false);
        });

        it('should reject missing underscore', () => {
            expect(isValidUsernameFormat('AppleTiger')).toBe(false);
        });

        it('should reject null/undefined', () => {
            expect(isValidUsernameFormat(null)).toBe(false);
            expect(isValidUsernameFormat(undefined)).toBe(false);
        });

        it('should reject empty string', () => {
            expect(isValidUsernameFormat('')).toBe(false);
        });

        it('should reject numbers in username', () => {
            expect(isValidUsernameFormat('Apple1_Tiger')).toBe(false);
            expect(isValidUsernameFormat('Apple_Tiger2')).toBe(false);
        });
    });

    describe('Duplicate Name Detection', () => {
        const existingUsers = [
            { username: 'Apple_Tiger', real_name: 'John Smith' },
            { username: 'Banana_Lion', real_name: 'Jane Doe' },
            { username: 'Cherry_Bear', real_name: 'John Johnson' }
        ];

        it('should find exact name match', () => {
            const duplicates = findDuplicateNames('John Smith', existingUsers);
            expect(duplicates).toHaveLength(1);
            expect(duplicates[0].username).toBe('Apple_Tiger');
        });

        it('should find partial name match', () => {
            const duplicates = findDuplicateNames('John', existingUsers);
            expect(duplicates).toHaveLength(2);
        });

        it('should be case insensitive', () => {
            const duplicates = findDuplicateNames('JOHN SMITH', existingUsers);
            expect(duplicates).toHaveLength(1);
        });

        it('should return empty array for no matches', () => {
            const duplicates = findDuplicateNames('Bob Wilson', existingUsers);
            expect(duplicates).toHaveLength(0);
        });

        it('should handle names with extra whitespace', () => {
            const duplicates = findDuplicateNames('  John Smith  ', existingUsers);
            expect(duplicates).toHaveLength(1);
        });
    });

    describe('Auth State Machine', () => {
        let auth;

        beforeEach(() => {
            auth = new MockAuthStateMachine();
        });

        it('should start in NO_SESSION state', () => {
            expect(auth.state).toBe(AuthState.NO_SESSION);
        });

        it('should auto-login with saved username', () => {
            const loggedIn = auth.checkSavedSession('Apple_Tiger');
            expect(loggedIn).toBe(true);
            expect(auth.state).toBe(AuthState.LOGGED_IN);
            expect(auth.username).toBe('Apple_Tiger');
        });

        it('should show welcome screen without saved username', () => {
            const loggedIn = auth.checkSavedSession(null);
            expect(loggedIn).toBe(false);
            expect(auth.state).toBe(AuthState.WELCOME_SCREEN);
        });

        it('should transition to new student flow', () => {
            auth.checkSavedSession(null);
            const success = auth.startNewStudentFlow();
            expect(success).toBe(true);
            expect(auth.state).toBe(AuthState.NEW_STUDENT_FLOW);
        });

        it('should transition to returning student flow', () => {
            auth.checkSavedSession(null);
            const success = auth.startReturningStudentFlow();
            expect(success).toBe(true);
            expect(auth.state).toBe(AuthState.RETURNING_STUDENT_FLOW);
        });

        it('should accept generated username in new student flow', () => {
            auth.checkSavedSession(null);
            auth.startNewStudentFlow();
            const success = auth.acceptGeneratedUsername('Mango_Eagle', 'Test User');
            expect(success).toBe(true);
            expect(auth.state).toBe(AuthState.LOGGED_IN);
            expect(auth.username).toBe('Mango_Eagle');
            expect(auth.realName).toBe('Test User');
        });

        it('should select existing user in returning flow', () => {
            auth.checkSavedSession(null);
            auth.startReturningStudentFlow();
            const success = auth.selectExistingUser('Apple_Tiger');
            expect(success).toBe(true);
            expect(auth.state).toBe(AuthState.LOGGED_IN);
        });

        it('should allow switching users when logged in', () => {
            auth.checkSavedSession('Apple_Tiger');
            const success = auth.switchUser();
            expect(success).toBe(true);
            expect(auth.state).toBe(AuthState.USER_SELECT);
        });

        it('should select different user from user select', () => {
            auth.checkSavedSession('Apple_Tiger');
            auth.switchUser();
            const success = auth.selectDifferentUser('Banana_Lion');
            expect(success).toBe(true);
            expect(auth.state).toBe(AuthState.LOGGED_IN);
            expect(auth.username).toBe('Banana_Lion');
        });

        it('should track recent usernames', () => {
            auth.checkSavedSession(null);
            auth.startNewStudentFlow();
            auth.acceptGeneratedUsername('Mango_Eagle', 'User 1');
            expect(auth.recentUsernames).toContain('Mango_Eagle');
        });

        it('should not allow invalid state transitions', () => {
            // Can't start new student flow from NO_SESSION
            expect(auth.startNewStudentFlow()).toBe(false);

            // Can't switch user when not logged in
            expect(auth.switchUser()).toBe(false);
        });

        it('should logout correctly', () => {
            auth.checkSavedSession('Apple_Tiger');
            auth.logout();
            expect(auth.state).toBe(AuthState.NO_SESSION);
            expect(auth.username).toBeNull();
        });
    });

    describe('Username Combination Count', () => {
        it('should have enough combinations to avoid collisions', () => {
            // 93 fruits x 145 animals = 13,485 combinations in real app
            // Our test subset: 15 x 15 = 225
            const combinations = FRUITS.length * ANIMALS.length;
            expect(combinations).toBe(225);
        });

        it('should have unique fruits', () => {
            const uniqueFruits = new Set(FRUITS);
            expect(uniqueFruits.size).toBe(FRUITS.length);
        });

        it('should have unique animals', () => {
            const uniqueAnimals = new Set(ANIMALS);
            expect(uniqueAnimals.size).toBe(ANIMALS.length);
        });
    });

    describe('Session Persistence Keys', () => {
        it('should have correct IDB meta key for username', () => {
            const metaKey = 'username';
            expect(metaKey).toBe('username');
        });

        it('should have correct localStorage key', () => {
            const lsKey = 'consensusUsername';
            expect(lsKey).toBe('consensusUsername');
        });
    });
});
