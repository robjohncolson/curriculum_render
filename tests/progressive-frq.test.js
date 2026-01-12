/**
 * Progressive Multi-Part FRQ System Tests
 *
 * Tests for the accordion-based FRQ system that allows students
 * to answer parts sequentially with visual feedback.
 */

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

// Recreate the core functions for testing (isolated from the main app)
const frqPartStateTest = {
    questions: {},

    initialize(questionId, parts) {
        const savedAnswer = this._getSavedAnswer ? this._getSavedAnswer(questionId) : null;
        const normalized = this.normalizeAnswer(savedAnswer);

        if (normalized?.legacyAnswer) {
            this.questions[questionId] = {
                parts: {},
                legacyAnswer: normalized.legacyAnswer,
                currentPart: null,
                completedParts: parts.map(p => p.partId),
                allComplete: true
            };
        } else if (normalized?.parts) {
            this.questions[questionId] = normalized;
        } else {
            this.questions[questionId] = {
                parts: {},
                currentPart: parts[0]?.partId || null,
                completedParts: [],
                allComplete: false
            };
        }
        return this.questions[questionId];
    },

    normalizeAnswer(savedAnswer) {
        if (!savedAnswer?.value) return null;

        if (typeof savedAnswer.value === 'string') {
            return {
                legacyAnswer: savedAnswer.value,
                parts: {},
                completedParts: [],
                allComplete: true
            };
        }

        return savedAnswer.value;
    },

    getState(questionId) {
        return this.questions[questionId];
    },

    submitPart(questionId, partId, answer, allPartIds) {
        const state = this.questions[questionId];
        if (!state) return null;

        state.parts[partId] = answer;

        if (!state.completedParts.includes(partId)) {
            state.completedParts.push(partId);
        }

        const nextPart = allPartIds.find(id => !state.completedParts.includes(id));
        state.currentPart = nextPart || null;
        state.allComplete = state.completedParts.length === allPartIds.length;

        return state;
    },

    updatePart(questionId, partId, answer) {
        const state = this.questions[questionId];
        if (!state) return null;
        state.parts[partId] = answer;
        return state;
    },

    reset() {
        this.questions = {};
        this._getSavedAnswer = null;
    },

    // Test helper to inject saved answers
    setSavedAnswerProvider(fn) {
        this._getSavedAnswer = fn;
    }
};

// Recreate isQuestionAnswered for testing
function isQuestionAnsweredTest(answer) {
    if (!answer) return false;

    if (typeof answer.value === 'object' && answer.value !== null) {
        if (answer.value.allComplete !== undefined) {
            return answer.value.allComplete === true;
        }
    }

    return answer.value !== undefined && answer.value !== null && answer.value !== '';
}

// Recreate formatPartLabel for testing
function formatPartLabelTest(partId) {
    if (!partId) return '';
    if (partId.includes('-')) {
        return partId.split('-').map(s => `(${s})`).join('');
    }
    return `(${partId})`;
}

// Recreate truncateText for testing
function truncateTextTest(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength - 3) + '...';
}

// ============================================
// TEST SUITES
// ============================================

function runTests() {
    const { describe, it, assert } = TestRunner;

    // ----------------------------------------
    // frqPartState.normalizeAnswer Tests
    // ----------------------------------------
    describe('frqPartState.normalizeAnswer', () => {
        it('should return null for null/undefined input', () => {
            assert.isNull(frqPartStateTest.normalizeAnswer(null));
            assert.isNull(frqPartStateTest.normalizeAnswer(undefined));
            assert.isNull(frqPartStateTest.normalizeAnswer({}));
        });

        it('should detect legacy string answers', () => {
            const legacyAnswer = { value: 'This is a legacy answer', timestamp: 123 };
            const result = frqPartStateTest.normalizeAnswer(legacyAnswer);

            assert.equal(result.legacyAnswer, 'This is a legacy answer');
            assert.equal(result.allComplete, true);
            assert.deepEqual(result.parts, {});
        });

        it('should pass through progressive format answers', () => {
            const progressiveAnswer = {
                value: {
                    parts: { 'a': 'answer a', 'b': 'answer b' },
                    completedParts: ['a', 'b'],
                    currentPart: 'c',
                    allComplete: false
                },
                timestamp: 123
            };
            const result = frqPartStateTest.normalizeAnswer(progressiveAnswer);

            assert.deepEqual(result.parts, { 'a': 'answer a', 'b': 'answer b' });
            assert.deepEqual(result.completedParts, ['a', 'b']);
            assert.equal(result.currentPart, 'c');
            assert.equal(result.allComplete, false);
        });
    });

    // ----------------------------------------
    // frqPartState.initialize Tests
    // ----------------------------------------
    describe('frqPartState.initialize', () => {
        it('should initialize fresh state for new questions', () => {
            frqPartStateTest.reset();
            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b', description: 'Part B' },
                { partId: 'c', description: 'Part C' }
            ];

            const state = frqPartStateTest.initialize('Q1', parts);

            assert.equal(state.currentPart, 'a');
            assert.deepEqual(state.completedParts, []);
            assert.deepEqual(state.parts, {});
            assert.equal(state.allComplete, false);
        });

        it('should restore state from progressive format', () => {
            frqPartStateTest.reset();
            frqPartStateTest.setSavedAnswerProvider((qId) => ({
                value: {
                    parts: { 'a': 'saved answer a' },
                    completedParts: ['a'],
                    currentPart: 'b',
                    allComplete: false
                },
                timestamp: 123
            }));

            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b', description: 'Part B' }
            ];

            const state = frqPartStateTest.initialize('Q1', parts);

            assert.equal(state.currentPart, 'b');
            assert.deepEqual(state.completedParts, ['a']);
            assert.equal(state.parts['a'], 'saved answer a');
        });

        it('should treat legacy answers as fully complete', () => {
            frqPartStateTest.reset();
            frqPartStateTest.setSavedAnswerProvider((qId) => ({
                value: 'This is a legacy single-string answer',
                timestamp: 123
            }));

            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b', description: 'Part B' },
                { partId: 'c', description: 'Part C' }
            ];

            const state = frqPartStateTest.initialize('Q1', parts);

            assert.isNull(state.currentPart);
            assert.deepEqual(state.completedParts, ['a', 'b', 'c']);
            assert.equal(state.allComplete, true);
            assert.equal(state.legacyAnswer, 'This is a legacy single-string answer');
        });
    });

    // ----------------------------------------
    // frqPartState.submitPart Tests
    // ----------------------------------------
    describe('frqPartState.submitPart', () => {
        it('should save answer and advance to next part', () => {
            frqPartStateTest.reset();
            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b', description: 'Part B' },
                { partId: 'c', description: 'Part C' }
            ];
            frqPartStateTest.initialize('Q1', parts);

            const state = frqPartStateTest.submitPart('Q1', 'a', 'Answer for A', ['a', 'b', 'c']);

            assert.equal(state.parts['a'], 'Answer for A');
            assert.includes(state.completedParts, 'a');
            assert.equal(state.currentPart, 'b');
            assert.equal(state.allComplete, false);
        });

        it('should mark allComplete when last part submitted', () => {
            frqPartStateTest.reset();
            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b', description: 'Part B' }
            ];
            frqPartStateTest.initialize('Q1', parts);

            frqPartStateTest.submitPart('Q1', 'a', 'Answer A', ['a', 'b']);
            const state = frqPartStateTest.submitPart('Q1', 'b', 'Answer B', ['a', 'b']);

            assert.equal(state.allComplete, true);
            assert.isNull(state.currentPart);
            assert.deepEqual(state.completedParts, ['a', 'b']);
        });

        it('should not duplicate part in completedParts if resubmitted', () => {
            frqPartStateTest.reset();
            const parts = [{ partId: 'a', description: 'Part A' }];
            frqPartStateTest.initialize('Q1', parts);

            frqPartStateTest.submitPart('Q1', 'a', 'Answer 1', ['a']);
            const state = frqPartStateTest.submitPart('Q1', 'a', 'Answer 2', ['a']);

            assert.equal(state.completedParts.length, 1);
            assert.equal(state.parts['a'], 'Answer 2');
        });

        it('should handle complex partIds like b-i, b-ii', () => {
            frqPartStateTest.reset();
            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b-i', description: 'Part B-i' },
                { partId: 'b-ii', description: 'Part B-ii' },
                { partId: 'c', description: 'Part C' }
            ];
            frqPartStateTest.initialize('Q1', parts);

            frqPartStateTest.submitPart('Q1', 'a', 'A', ['a', 'b-i', 'b-ii', 'c']);
            const state = frqPartStateTest.submitPart('Q1', 'b-i', 'B-i', ['a', 'b-i', 'b-ii', 'c']);

            assert.equal(state.currentPart, 'b-ii');
            assert.deepEqual(state.completedParts, ['a', 'b-i']);
        });
    });

    // ----------------------------------------
    // frqPartState.updatePart Tests
    // ----------------------------------------
    describe('frqPartState.updatePart', () => {
        it('should update existing part answer', () => {
            frqPartStateTest.reset();
            const parts = [{ partId: 'a', description: 'Part A' }];
            frqPartStateTest.initialize('Q1', parts);
            frqPartStateTest.submitPart('Q1', 'a', 'Original', ['a']);

            const state = frqPartStateTest.updatePart('Q1', 'a', 'Updated');

            assert.equal(state.parts['a'], 'Updated');
        });

        it('should return null for non-existent question', () => {
            frqPartStateTest.reset();
            const state = frqPartStateTest.updatePart('NonExistent', 'a', 'Answer');
            assert.isNull(state);
        });
    });

    // ----------------------------------------
    // isQuestionAnswered Tests
    // ----------------------------------------
    describe('isQuestionAnswered', () => {
        it('should return false for null/undefined answers', () => {
            assert.equal(isQuestionAnsweredTest(null), false);
            assert.equal(isQuestionAnsweredTest(undefined), false);
        });

        it('should return true for legacy string answers', () => {
            assert.equal(isQuestionAnsweredTest({ value: 'Some answer' }), true);
            assert.equal(isQuestionAnsweredTest({ value: 'A' }), true);
        });

        it('should return false for empty string answers', () => {
            assert.equal(isQuestionAnsweredTest({ value: '' }), false);
        });

        it('should return true for progressive answers with allComplete=true', () => {
            const answer = {
                value: {
                    parts: { 'a': 'A', 'b': 'B' },
                    completedParts: ['a', 'b'],
                    currentPart: null,
                    allComplete: true
                }
            };
            assert.equal(isQuestionAnsweredTest(answer), true);
        });

        it('should return false for progressive answers with allComplete=false', () => {
            const answer = {
                value: {
                    parts: { 'a': 'A' },
                    completedParts: ['a'],
                    currentPart: 'b',
                    allComplete: false
                }
            };
            assert.equal(isQuestionAnsweredTest(answer), false);
        });

        it('should return false for in-progress progressive answers', () => {
            const answer = {
                value: {
                    parts: {},
                    completedParts: [],
                    currentPart: 'a',
                    allComplete: false
                }
            };
            assert.equal(isQuestionAnsweredTest(answer), false);
        });
    });

    // ----------------------------------------
    // formatPartLabel Tests
    // ----------------------------------------
    describe('formatPartLabel', () => {
        it('should format simple part IDs', () => {
            assert.equal(formatPartLabelTest('a'), '(a)');
            assert.equal(formatPartLabelTest('b'), '(b)');
            assert.equal(formatPartLabelTest('c'), '(c)');
        });

        it('should format compound part IDs with dashes', () => {
            assert.equal(formatPartLabelTest('b-i'), '(b)(i)');
            assert.equal(formatPartLabelTest('b-ii'), '(b)(ii)');
            assert.equal(formatPartLabelTest('a-i'), '(a)(i)');
        });

        it('should handle triple-compound IDs', () => {
            assert.equal(formatPartLabelTest('a-i-1'), '(a)(i)(1)');
        });

        it('should return empty string for null/undefined', () => {
            assert.equal(formatPartLabelTest(null), '');
            assert.equal(formatPartLabelTest(undefined), '');
            assert.equal(formatPartLabelTest(''), '');
        });
    });

    // ----------------------------------------
    // truncateText Tests
    // ----------------------------------------
    describe('truncateText', () => {
        it('should not truncate short text', () => {
            assert.equal(truncateTextTest('Hello', 10), 'Hello');
            assert.equal(truncateTextTest('Test', 10), 'Test');
        });

        it('should truncate long text with ellipsis', () => {
            assert.equal(truncateTextTest('This is a long text', 10), 'This is...');
        });

        it('should handle null/undefined', () => {
            assert.equal(truncateTextTest(null, 10), '');
            assert.equal(truncateTextTest(undefined, 10), '');
        });

        it('should handle exact length text', () => {
            assert.equal(truncateTextTest('1234567890', 10), '1234567890');
        });
    });

    // ----------------------------------------
    // Data Structure Integrity Tests
    // ----------------------------------------
    describe('Data Structure Integrity', () => {
        it('should maintain answer data through full workflow', () => {
            frqPartStateTest.reset();
            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b', description: 'Part B' },
                { partId: 'c', description: 'Part C' }
            ];

            frqPartStateTest.initialize('Q1', parts);
            frqPartStateTest.submitPart('Q1', 'a', 'Answer A', ['a', 'b', 'c']);
            frqPartStateTest.submitPart('Q1', 'b', 'Answer B', ['a', 'b', 'c']);
            frqPartStateTest.updatePart('Q1', 'a', 'Updated Answer A');
            const finalState = frqPartStateTest.submitPart('Q1', 'c', 'Answer C', ['a', 'b', 'c']);

            // Verify all data is preserved
            assert.equal(finalState.parts['a'], 'Updated Answer A');
            assert.equal(finalState.parts['b'], 'Answer B');
            assert.equal(finalState.parts['c'], 'Answer C');
            assert.equal(finalState.allComplete, true);
            assert.deepEqual(finalState.completedParts, ['a', 'b', 'c']);
        });

        it('should serialize to valid JSON', () => {
            frqPartStateTest.reset();
            const parts = [{ partId: 'a', description: 'Part A' }];
            frqPartStateTest.initialize('Q1', parts);
            frqPartStateTest.submitPart('Q1', 'a', 'Test answer with "quotes" and special chars: <>&', ['a']);

            const state = frqPartStateTest.getState('Q1');
            const json = JSON.stringify(state);
            const parsed = JSON.parse(json);

            assert.equal(parsed.parts['a'], 'Test answer with "quotes" and special chars: <>&');
        });
    });

    // ----------------------------------------
    // Edge Cases
    // ----------------------------------------
    describe('Edge Cases', () => {
        it('should handle single-part FRQs', () => {
            frqPartStateTest.reset();
            const parts = [{ partId: 'a', description: 'Only part' }];

            frqPartStateTest.initialize('Q1', parts);
            const state = frqPartStateTest.submitPart('Q1', 'a', 'Answer', ['a']);

            assert.equal(state.allComplete, true);
            assert.isNull(state.currentPart);
        });

        it('should handle empty parts array', () => {
            frqPartStateTest.reset();
            const state = frqPartStateTest.initialize('Q1', []);

            assert.isNull(state.currentPart);
            assert.deepEqual(state.completedParts, []);
        });

        it('should handle out-of-order part submission', () => {
            frqPartStateTest.reset();
            const parts = [
                { partId: 'a', description: 'Part A' },
                { partId: 'b', description: 'Part B' },
                { partId: 'c', description: 'Part C' }
            ];
            frqPartStateTest.initialize('Q1', parts);

            // Submit parts out of order (simulating UI manipulation)
            frqPartStateTest.submitPart('Q1', 'b', 'B', ['a', 'b', 'c']);
            frqPartStateTest.submitPart('Q1', 'a', 'A', ['a', 'b', 'c']);
            const state = frqPartStateTest.submitPart('Q1', 'c', 'C', ['a', 'b', 'c']);

            assert.equal(state.allComplete, true);
            assert.includes(state.completedParts, 'a');
            assert.includes(state.completedParts, 'b');
            assert.includes(state.completedParts, 'c');
        });

        it('should handle very long answers', () => {
            frqPartStateTest.reset();
            const parts = [{ partId: 'a', description: 'Part A' }];
            frqPartStateTest.initialize('Q1', parts);

            const longAnswer = 'A'.repeat(10000);
            const state = frqPartStateTest.submitPart('Q1', 'a', longAnswer, ['a']);

            assert.equal(state.parts['a'].length, 10000);
        });

        it('should handle special characters in answers', () => {
            frqPartStateTest.reset();
            const parts = [{ partId: 'a', description: 'Part A' }];
            frqPartStateTest.initialize('Q1', parts);

            const specialAnswer = '∑∏∫ √π ≤≥ αβγ "quotes" <html> &amp;';
            const state = frqPartStateTest.submitPart('Q1', 'a', specialAnswer, ['a']);

            assert.equal(state.parts['a'], specialAnswer);
        });
    });

    // Print results
    TestRunner.printSummary();
}

// Run tests when loaded
if (typeof window !== 'undefined') {
    window.runProgressiveFRQTests = runTests;
} else {
    runTests();
}
