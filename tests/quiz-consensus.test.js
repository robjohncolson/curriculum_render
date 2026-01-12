/**
 * Quiz & Consensus Tests
 *
 * Tests for STATE_MACHINES.md Sections 6 & 7:
 * - Quiz answer flow
 * - Peer consensus aggregation
 * - Correctness checking
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Quiz State Machine
 */
const QuizState = {
    IDLE: 'idle',
    VIEWING: 'viewing',
    ANSWERING: 'answering',
    SUBMITTED: 'submitted',
    SHOWING_RESULT: 'showing_result'
};

/**
 * Check if answer is correct
 */
function checkAnswer(question, selectedValue) {
    if (!question || !question.correctAnswer) return false;
    return selectedValue === question.correctAnswer;
}

/**
 * Aggregate peer answers for consensus
 */
function aggregatePeerAnswers(peerAnswers, currentUsername) {
    const counts = {};
    let total = 0;

    for (const [username, answerData] of Object.entries(peerAnswers)) {
        // Filter out current user
        if (username === currentUsername) continue;

        // Skip if answerData is null/undefined
        if (answerData === null || answerData === undefined) continue;

        // Extract value - could be object {value: X} or legacy string format
        const value = typeof answerData === 'object' ? answerData.value : answerData;

        if (value !== null && value !== undefined) {
            counts[value] = (counts[value] || 0) + 1;
            total++;
        }
    }

    return { counts, total };
}

/**
 * Calculate percentages from counts
 */
function calculatePercentages(counts, total) {
    if (total === 0) return {};

    const percentages = {};
    for (const [option, count] of Object.entries(counts)) {
        percentages[option] = Math.round((count / total) * 100);
    }

    return percentages;
}

/**
 * Find most popular option(s)
 */
function findMostPopular(counts) {
    if (Object.keys(counts).length === 0) return [];

    const maxCount = Math.max(...Object.values(counts));
    return Object.entries(counts)
        .filter(([_, count]) => count === maxCount)
        .map(([option, _]) => option);
}

/**
 * Mock Quiz State Machine
 */
class MockQuizStateMachine {
    constructor() {
        this.state = QuizState.IDLE;
        this.currentQuestionId = null;
        this.selectedAnswer = null;
    }

    viewQuestion(questionId) {
        this.state = QuizState.VIEWING;
        this.currentQuestionId = questionId;
        this.selectedAnswer = null;
        return true;
    }

    selectAnswer(answer) {
        if (this.state !== QuizState.VIEWING && this.state !== QuizState.ANSWERING) {
            return false;
        }
        this.state = QuizState.ANSWERING;
        this.selectedAnswer = answer;
        return true;
    }

    submit() {
        if (this.state !== QuizState.ANSWERING || !this.selectedAnswer) {
            return false;
        }
        this.state = QuizState.SUBMITTED;
        return true;
    }

    showResult() {
        if (this.state !== QuizState.SUBMITTED) return false;
        this.state = QuizState.SHOWING_RESULT;
        return true;
    }

    reset() {
        this.state = QuizState.IDLE;
        this.currentQuestionId = null;
        this.selectedAnswer = null;
    }
}

// ============================================
// TESTS
// ============================================

describe('Quiz Answer Flow', () => {
    describe('Quiz State Machine', () => {
        let quiz;

        beforeEach(() => {
            quiz = new MockQuizStateMachine();
        });

        it('should start in IDLE state', () => {
            expect(quiz.state).toBe(QuizState.IDLE);
        });

        it('should transition IDLE -> VIEWING on viewQuestion', () => {
            quiz.viewQuestion('Q1');
            expect(quiz.state).toBe(QuizState.VIEWING);
            expect(quiz.currentQuestionId).toBe('Q1');
        });

        it('should transition VIEWING -> ANSWERING on selectAnswer', () => {
            quiz.viewQuestion('Q1');
            quiz.selectAnswer('A');
            expect(quiz.state).toBe(QuizState.ANSWERING);
            expect(quiz.selectedAnswer).toBe('A');
        });

        it('should allow changing answer in ANSWERING state', () => {
            quiz.viewQuestion('Q1');
            quiz.selectAnswer('A');
            quiz.selectAnswer('B');
            expect(quiz.selectedAnswer).toBe('B');
        });

        it('should transition ANSWERING -> SUBMITTED on submit', () => {
            quiz.viewQuestion('Q1');
            quiz.selectAnswer('A');
            const success = quiz.submit();
            expect(success).toBe(true);
            expect(quiz.state).toBe(QuizState.SUBMITTED);
        });

        it('should NOT allow submit without selection', () => {
            quiz.viewQuestion('Q1');
            const success = quiz.submit();
            expect(success).toBe(false);
            expect(quiz.state).toBe(QuizState.VIEWING);
        });

        it('should transition SUBMITTED -> SHOWING_RESULT', () => {
            quiz.viewQuestion('Q1');
            quiz.selectAnswer('A');
            quiz.submit();
            quiz.showResult();
            expect(quiz.state).toBe(QuizState.SHOWING_RESULT);
        });

        it('should reset to IDLE', () => {
            quiz.viewQuestion('Q1');
            quiz.selectAnswer('A');
            quiz.submit();
            quiz.reset();
            expect(quiz.state).toBe(QuizState.IDLE);
            expect(quiz.currentQuestionId).toBeNull();
            expect(quiz.selectedAnswer).toBeNull();
        });
    });

    describe('Answer Correctness Check', () => {
        it('should return true for correct answer', () => {
            const question = { id: 'Q1', correctAnswer: 'A' };
            expect(checkAnswer(question, 'A')).toBe(true);
        });

        it('should return false for incorrect answer', () => {
            const question = { id: 'Q1', correctAnswer: 'A' };
            expect(checkAnswer(question, 'B')).toBe(false);
        });

        it('should return false for null question', () => {
            expect(checkAnswer(null, 'A')).toBe(false);
        });

        it('should return false for missing correctAnswer', () => {
            const question = { id: 'Q1' };
            expect(checkAnswer(question, 'A')).toBe(false);
        });

        it('should handle numeric answers', () => {
            const question = { id: 'Q1', correctAnswer: 42 };
            expect(checkAnswer(question, 42)).toBe(true);
            expect(checkAnswer(question, 41)).toBe(false);
        });

        it('should be case-sensitive for string answers', () => {
            const question = { id: 'Q1', correctAnswer: 'A' };
            expect(checkAnswer(question, 'a')).toBe(false);
        });
    });
});

describe('Peer Consensus', () => {
    describe('Peer Answer Aggregation', () => {
        it('should aggregate peer answers', () => {
            const peerAnswers = {
                'user1': { value: 'A' },
                'user2': { value: 'A' },
                'user3': { value: 'B' },
                'user4': { value: 'A' }
            };

            const { counts, total } = aggregatePeerAnswers(peerAnswers, 'currentUser');

            expect(counts['A']).toBe(3);
            expect(counts['B']).toBe(1);
            expect(total).toBe(4);
        });

        it('should filter out current user', () => {
            const peerAnswers = {
                'user1': { value: 'A' },
                'currentUser': { value: 'B' },
                'user2': { value: 'A' }
            };

            const { counts, total } = aggregatePeerAnswers(peerAnswers, 'currentUser');

            expect(counts['A']).toBe(2);
            expect(counts['B']).toBeUndefined();
            expect(total).toBe(2);
        });

        it('should handle legacy string format', () => {
            const peerAnswers = {
                'user1': 'A',
                'user2': 'B'
            };

            const { counts, total } = aggregatePeerAnswers(peerAnswers, 'currentUser');

            expect(counts['A']).toBe(1);
            expect(counts['B']).toBe(1);
            expect(total).toBe(2);
        });

        it('should handle empty peer data', () => {
            const { counts, total } = aggregatePeerAnswers({}, 'currentUser');

            expect(counts).toEqual({});
            expect(total).toBe(0);
        });

        it('should handle null/undefined values', () => {
            const peerAnswers = {
                'user1': { value: 'A' },
                'user2': { value: null },
                'user3': null
            };

            const { counts, total } = aggregatePeerAnswers(peerAnswers, 'currentUser');

            expect(counts['A']).toBe(1);
            expect(total).toBe(1);
        });
    });

    describe('Percentage Calculation', () => {
        it('should calculate percentages correctly', () => {
            const counts = { 'A': 3, 'B': 1 };
            const percentages = calculatePercentages(counts, 4);

            expect(percentages['A']).toBe(75);
            expect(percentages['B']).toBe(25);
        });

        it('should round percentages', () => {
            const counts = { 'A': 1, 'B': 1, 'C': 1 };
            const percentages = calculatePercentages(counts, 3);

            expect(percentages['A']).toBe(33);
            expect(percentages['B']).toBe(33);
            expect(percentages['C']).toBe(33);
        });

        it('should handle 100% for single option', () => {
            const counts = { 'A': 5 };
            const percentages = calculatePercentages(counts, 5);

            expect(percentages['A']).toBe(100);
        });

        it('should return empty object for zero total', () => {
            const percentages = calculatePercentages({}, 0);
            expect(percentages).toEqual({});
        });
    });

    describe('Most Popular Detection', () => {
        it('should find single most popular option', () => {
            const counts = { 'A': 5, 'B': 3, 'C': 2 };
            const popular = findMostPopular(counts);

            expect(popular).toEqual(['A']);
        });

        it('should find multiple in case of tie', () => {
            const counts = { 'A': 4, 'B': 4, 'C': 2 };
            const popular = findMostPopular(counts);

            expect(popular).toContain('A');
            expect(popular).toContain('B');
            expect(popular.length).toBe(2);
        });

        it('should handle all tied', () => {
            const counts = { 'A': 3, 'B': 3, 'C': 3 };
            const popular = findMostPopular(counts);

            expect(popular.length).toBe(3);
        });

        it('should return empty array for empty counts', () => {
            const popular = findMostPopular({});
            expect(popular).toEqual([]);
        });
    });

    describe('Full Consensus Flow', () => {
        it('should generate complete consensus data', () => {
            const peerAnswers = {
                'user1': { value: 'A' },
                'user2': { value: 'A' },
                'user3': { value: 'B' },
                'user4': { value: 'C' },
                'user5': { value: 'A' }
            };

            const { counts, total } = aggregatePeerAnswers(peerAnswers, 'currentUser');
            const percentages = calculatePercentages(counts, total);
            const popular = findMostPopular(counts);

            expect(total).toBe(5);
            expect(percentages['A']).toBe(60);
            expect(percentages['B']).toBe(20);
            expect(percentages['C']).toBe(20);
            expect(popular).toEqual(['A']);
        });

        it('should handle real-world scenario with 28 students', () => {
            // Simulating: A: 12, B: 5, C: 8, D: 3
            const peerAnswers = {};
            for (let i = 0; i < 12; i++) peerAnswers[`user${i}`] = { value: 'A' };
            for (let i = 12; i < 17; i++) peerAnswers[`user${i}`] = { value: 'B' };
            for (let i = 17; i < 25; i++) peerAnswers[`user${i}`] = { value: 'C' };
            for (let i = 25; i < 28; i++) peerAnswers[`user${i}`] = { value: 'D' };

            const { counts, total } = aggregatePeerAnswers(peerAnswers, 'currentUser');
            const percentages = calculatePercentages(counts, total);
            const popular = findMostPopular(counts);

            expect(total).toBe(28);
            expect(counts['A']).toBe(12);
            expect(counts['B']).toBe(5);
            expect(counts['C']).toBe(8);
            expect(counts['D']).toBe(3);
            expect(percentages['A']).toBe(43);
            expect(popular).toEqual(['A']);
        });
    });
});
