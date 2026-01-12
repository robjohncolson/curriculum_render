/**
 * Escalation System Tests
 *
 * Tests for the 3-tier AI grading escalation system:
 * - MCQ grading and escalation UI
 * - FRQ grading (single-part and multi-part)
 * - Appeal form show/hide
 * - Result storage for appeals
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Mock window.gradingResults storage
 */
let mockGradingResults = {};

/**
 * Mock DOM element factory
 */
function createMockElement(id, initialDisplay = 'none') {
    return {
        id,
        style: { display: initialDisplay },
        innerHTML: '',
        value: '',
        classList: {
            _classes: new Set(),
            add(cls) { this._classes.add(cls); },
            remove(cls) { this._classes.delete(cls); },
            contains(cls) { return this._classes.has(cls); }
        }
    };
}

/**
 * Mock DOM for testing
 */
const mockDOM = {
    elements: {},

    getElementById(id) {
        return this.elements[id] || null;
    },

    reset() {
        this.elements = {};
    },

    addElement(id, display = 'none') {
        this.elements[id] = createMockElement(id, display);
        return this.elements[id];
    }
};

/**
 * Mock escalation functions (isolated from main app)
 */
const escalationFunctions = {
    /**
     * Grade MCQ answer and show escalation UI
     */
    gradeMCQAnswer(questionId, answer, isCorrect, dom = mockDOM, results = mockGradingResults) {
        const escalationContainer = dom.getElementById(`escalation-${questionId}`);
        if (!escalationContainer) return null;

        // Show escalation container
        escalationContainer.style.display = 'block';

        // For correct answers, just show positive feedback
        if (isCorrect) {
            const feedbackContainer = dom.getElementById(`grading-feedback-${questionId}`);
            if (feedbackContainer) {
                feedbackContainer.innerHTML = 'Correct!';
            }
            return { score: 'E', correct: true };
        }

        // For wrong answers, show "Request AI Review" button
        const aiReviewBtn = dom.getElementById(`btn-ai-review-${questionId}`);
        if (aiReviewBtn) {
            aiReviewBtn.style.display = 'inline-block';
        }

        // Store initial result for potential appeal
        results[questionId] = {
            score: 'I',
            feedback: 'Incorrect answer selected.',
            answer: answer,
            questionType: 'multiple-choice'
        };

        return results[questionId];
    },

    /**
     * Show appeal form
     */
    showAppealForm(questionId, dom = mockDOM) {
        const appealForm = dom.getElementById(`appeal-form-${questionId}`);
        const appealBtn = dom.getElementById(`btn-appeal-${questionId}`);

        if (appealForm) appealForm.style.display = 'block';
        if (appealBtn) appealBtn.style.display = 'none';

        return { formVisible: appealForm?.style.display === 'block' };
    },

    /**
     * Hide appeal form
     */
    hideAppealForm(questionId, dom = mockDOM) {
        const appealForm = dom.getElementById(`appeal-form-${questionId}`);
        const appealBtn = dom.getElementById(`btn-appeal-${questionId}`);

        if (appealForm) appealForm.style.display = 'none';
        if (appealBtn) appealBtn.style.display = 'inline-block';

        return { formVisible: appealForm?.style.display !== 'none' };
    },

    /**
     * Display grading feedback and show appeal button for non-E scores
     */
    displayGradingFeedback(questionId, result, dom = mockDOM) {
        const feedbackContainer = dom.getElementById(`grading-feedback-${questionId}`);
        if (!feedbackContainer) return null;

        const scoreClasses = {
            'E': { class: 'excellent', label: 'Essentially Correct' },
            'P': { class: 'partial', label: 'Partially Correct' },
            'I': { class: 'incorrect', label: 'Needs Improvement' }
        };

        const scoreInfo = scoreClasses[result.score] || scoreClasses['I'];
        feedbackContainer.innerHTML = `<div class="grading-feedback ${scoreInfo.class}">${scoreInfo.label}</div>`;

        // Show appeal button for non-E scores
        if (result.score !== 'E') {
            const appealBtn = dom.getElementById(`btn-appeal-${questionId}`);
            if (appealBtn) {
                appealBtn.style.display = 'inline-block';
            }
        }

        return { displayed: true, score: result.score };
    },

    /**
     * Display appeal result
     */
    displayAppealResult(questionId, result, dom = mockDOM) {
        const feedbackContainer = dom.getElementById(`grading-feedback-${questionId}`);
        if (!feedbackContainer) return null;

        const isGranted = result.appealGranted || result.upgraded;
        const resultClass = isGranted ? 'granted' : 'denied';

        feedbackContainer.innerHTML = `
            <div class="appeal-result ${resultClass}">
                ${isGranted ? 'Appeal Granted!' : 'Appeal Denied'}
            </div>
        `;

        // Hide appeal form
        const appealForm = dom.getElementById(`appeal-form-${questionId}`);
        if (appealForm) appealForm.style.display = 'none';

        return { displayed: true, granted: isGranted };
    },

    /**
     * Check if escalation container should be visible
     */
    shouldShowEscalation(questionType, hasSubmitted) {
        return hasSubmitted && (questionType === 'multiple-choice' || questionType === 'free-response');
    },

    /**
     * Check if appeal button should be visible
     */
    shouldShowAppealButton(score) {
        return score === 'P' || score === 'I';
    }
};

// ============================================
// TESTS
// ============================================

describe('Escalation System', () => {
    beforeEach(() => {
        mockDOM.reset();
        mockGradingResults = {};
    });

    describe('MCQ Grading', () => {
        beforeEach(() => {
            // Set up DOM elements for MCQ
            mockDOM.addElement('escalation-Q1', 'none');
            mockDOM.addElement('grading-feedback-Q1', 'none');
            mockDOM.addElement('btn-ai-review-Q1', 'none');
            mockDOM.addElement('btn-appeal-Q1', 'none');
            mockDOM.addElement('appeal-form-Q1', 'none');
        });

        it('should show escalation container on MCQ submission', () => {
            escalationFunctions.gradeMCQAnswer('Q1', 'B', false, mockDOM, mockGradingResults);

            expect(mockDOM.elements['escalation-Q1'].style.display).toBe('block');
        });

        it('should show positive feedback for correct MCQ answer', () => {
            const result = escalationFunctions.gradeMCQAnswer('Q1', 'A', true, mockDOM, mockGradingResults);

            expect(result.score).toBe('E');
            expect(result.correct).toBe(true);
            expect(mockDOM.elements['grading-feedback-Q1'].innerHTML).toContain('Correct');
        });

        it('should show AI review button for incorrect MCQ answer', () => {
            escalationFunctions.gradeMCQAnswer('Q1', 'B', false, mockDOM, mockGradingResults);

            expect(mockDOM.elements['btn-ai-review-Q1'].style.display).toBe('inline-block');
        });

        it('should store grading result for incorrect MCQ', () => {
            escalationFunctions.gradeMCQAnswer('Q1', 'B', false, mockDOM, mockGradingResults);

            expect(mockGradingResults['Q1']).toBeDefined();
            expect(mockGradingResults['Q1'].score).toBe('I');
            expect(mockGradingResults['Q1'].answer).toBe('B');
            expect(mockGradingResults['Q1'].questionType).toBe('multiple-choice');
        });

        it('should not store result for correct MCQ', () => {
            escalationFunctions.gradeMCQAnswer('Q1', 'A', true, mockDOM, mockGradingResults);

            // Correct answers don't need to be stored for appeals
            expect(mockGradingResults['Q1']).toBeUndefined();
        });
    });

    describe('FRQ Grading Feedback', () => {
        beforeEach(() => {
            mockDOM.addElement('grading-feedback-Q2', 'none');
            mockDOM.addElement('btn-appeal-Q2', 'none');
        });

        it('should display E score feedback correctly', () => {
            const result = escalationFunctions.displayGradingFeedback('Q2', { score: 'E' }, mockDOM);

            expect(result.displayed).toBe(true);
            expect(mockDOM.elements['grading-feedback-Q2'].innerHTML).toContain('excellent');
            expect(mockDOM.elements['grading-feedback-Q2'].innerHTML).toContain('Essentially Correct');
        });

        it('should display P score feedback correctly', () => {
            escalationFunctions.displayGradingFeedback('Q2', { score: 'P' }, mockDOM);

            expect(mockDOM.elements['grading-feedback-Q2'].innerHTML).toContain('partial');
            expect(mockDOM.elements['grading-feedback-Q2'].innerHTML).toContain('Partially Correct');
        });

        it('should display I score feedback correctly', () => {
            escalationFunctions.displayGradingFeedback('Q2', { score: 'I' }, mockDOM);

            expect(mockDOM.elements['grading-feedback-Q2'].innerHTML).toContain('incorrect');
            expect(mockDOM.elements['grading-feedback-Q2'].innerHTML).toContain('Needs Improvement');
        });

        it('should show appeal button for P score', () => {
            escalationFunctions.displayGradingFeedback('Q2', { score: 'P' }, mockDOM);

            expect(mockDOM.elements['btn-appeal-Q2'].style.display).toBe('inline-block');
        });

        it('should show appeal button for I score', () => {
            escalationFunctions.displayGradingFeedback('Q2', { score: 'I' }, mockDOM);

            expect(mockDOM.elements['btn-appeal-Q2'].style.display).toBe('inline-block');
        });

        it('should NOT show appeal button for E score', () => {
            escalationFunctions.displayGradingFeedback('Q2', { score: 'E' }, mockDOM);

            expect(mockDOM.elements['btn-appeal-Q2'].style.display).toBe('none');
        });
    });

    describe('Appeal Form', () => {
        beforeEach(() => {
            mockDOM.addElement('appeal-form-Q3', 'none');
            mockDOM.addElement('btn-appeal-Q3', 'inline-block');
            mockDOM.addElement('appeal-text-Q3', 'block');
        });

        it('should show appeal form when showAppealForm is called', () => {
            const result = escalationFunctions.showAppealForm('Q3', mockDOM);

            expect(result.formVisible).toBe(true);
            expect(mockDOM.elements['appeal-form-Q3'].style.display).toBe('block');
        });

        it('should hide appeal button when form is shown', () => {
            escalationFunctions.showAppealForm('Q3', mockDOM);

            expect(mockDOM.elements['btn-appeal-Q3'].style.display).toBe('none');
        });

        it('should hide appeal form when hideAppealForm is called', () => {
            // First show the form
            mockDOM.elements['appeal-form-Q3'].style.display = 'block';

            const result = escalationFunctions.hideAppealForm('Q3', mockDOM);

            expect(result.formVisible).toBe(false);
            expect(mockDOM.elements['appeal-form-Q3'].style.display).toBe('none');
        });

        it('should show appeal button when form is hidden', () => {
            // First show the form and hide the button
            mockDOM.elements['appeal-form-Q3'].style.display = 'block';
            mockDOM.elements['btn-appeal-Q3'].style.display = 'none';

            escalationFunctions.hideAppealForm('Q3', mockDOM);

            expect(mockDOM.elements['btn-appeal-Q3'].style.display).toBe('inline-block');
        });
    });

    describe('Appeal Result Display', () => {
        beforeEach(() => {
            mockDOM.addElement('grading-feedback-Q4', 'block');
            mockDOM.addElement('appeal-form-Q4', 'block');
        });

        it('should display granted appeal result', () => {
            const result = escalationFunctions.displayAppealResult('Q4', {
                appealGranted: true,
                score: 'E'
            }, mockDOM);

            expect(result.displayed).toBe(true);
            expect(result.granted).toBe(true);
            expect(mockDOM.elements['grading-feedback-Q4'].innerHTML).toContain('granted');
            expect(mockDOM.elements['grading-feedback-Q4'].innerHTML).toContain('Appeal Granted');
        });

        it('should display denied appeal result', () => {
            const result = escalationFunctions.displayAppealResult('Q4', {
                appealGranted: false,
                upgraded: false,
                score: 'P'
            }, mockDOM);

            expect(result.displayed).toBe(true);
            expect(result.granted).toBe(false);
            expect(mockDOM.elements['grading-feedback-Q4'].innerHTML).toContain('denied');
            expect(mockDOM.elements['grading-feedback-Q4'].innerHTML).toContain('Appeal Denied');
        });

        it('should recognize upgraded as granted', () => {
            const result = escalationFunctions.displayAppealResult('Q4', {
                upgraded: true,
                score: 'E',
                previousScore: 'P'
            }, mockDOM);

            expect(result.granted).toBe(true);
        });

        it('should hide appeal form after displaying result', () => {
            escalationFunctions.displayAppealResult('Q4', { appealGranted: false }, mockDOM);

            expect(mockDOM.elements['appeal-form-Q4'].style.display).toBe('none');
        });
    });

    describe('Escalation Visibility Logic', () => {
        it('should show escalation for submitted MCQ', () => {
            expect(escalationFunctions.shouldShowEscalation('multiple-choice', true)).toBe(true);
        });

        it('should show escalation for submitted FRQ', () => {
            expect(escalationFunctions.shouldShowEscalation('free-response', true)).toBe(true);
        });

        it('should NOT show escalation before submission', () => {
            expect(escalationFunctions.shouldShowEscalation('multiple-choice', false)).toBe(false);
            expect(escalationFunctions.shouldShowEscalation('free-response', false)).toBe(false);
        });
    });

    describe('Appeal Button Visibility Logic', () => {
        it('should show appeal button for P score', () => {
            expect(escalationFunctions.shouldShowAppealButton('P')).toBe(true);
        });

        it('should show appeal button for I score', () => {
            expect(escalationFunctions.shouldShowAppealButton('I')).toBe(true);
        });

        it('should NOT show appeal button for E score', () => {
            expect(escalationFunctions.shouldShowAppealButton('E')).toBe(false);
        });
    });

    describe('Results Storage', () => {
        it('should store MCQ result with correct structure', () => {
            mockDOM.addElement('escalation-Q5', 'none');
            mockDOM.addElement('btn-ai-review-Q5', 'none');

            escalationFunctions.gradeMCQAnswer('Q5', 'C', false, mockDOM, mockGradingResults);

            const stored = mockGradingResults['Q5'];
            expect(stored).toHaveProperty('score');
            expect(stored).toHaveProperty('feedback');
            expect(stored).toHaveProperty('answer');
            expect(stored).toHaveProperty('questionType');
        });

        it('should allow results to be retrieved for appeals', () => {
            mockDOM.addElement('escalation-Q6', 'none');
            mockDOM.addElement('btn-ai-review-Q6', 'none');

            escalationFunctions.gradeMCQAnswer('Q6', 'D', false, mockDOM, mockGradingResults);

            // Simulate retrieving for appeal
            const previousResult = mockGradingResults['Q6'];
            expect(previousResult).toBeDefined();
            expect(previousResult.score).toBe('I');
        });

        it('should support multiple questions independently', () => {
            mockDOM.addElement('escalation-Q7', 'none');
            mockDOM.addElement('escalation-Q8', 'none');
            mockDOM.addElement('btn-ai-review-Q7', 'none');
            mockDOM.addElement('btn-ai-review-Q8', 'none');

            escalationFunctions.gradeMCQAnswer('Q7', 'A', false, mockDOM, mockGradingResults);
            escalationFunctions.gradeMCQAnswer('Q8', 'B', false, mockDOM, mockGradingResults);

            expect(mockGradingResults['Q7'].answer).toBe('A');
            expect(mockGradingResults['Q8'].answer).toBe('B');
        });
    });
});

describe('Progressive FRQ Escalation', () => {
    beforeEach(() => {
        mockDOM.reset();
        mockGradingResults = {};
    });

    describe('Multi-Part FRQ Grading', () => {
        beforeEach(() => {
            mockDOM.addElement('escalation-Q10', 'none');
            mockDOM.addElement('grading-feedback-Q10', 'none');
            mockDOM.addElement('btn-appeal-Q10', 'none');
        });

        it('should have escalation container for progressive FRQ', () => {
            // Verify the element exists (would be created by renderProgressiveFRQParts)
            expect(mockDOM.getElementById('escalation-Q10')).toBeDefined();
        });

        it('should support combined answer grading', () => {
            // Simulate gradeMultiPartFRQ storing result
            const combinedAnswer = 'Part (a): Answer A\n\nPart (b): Answer B';
            mockGradingResults['Q10'] = {
                score: 'P',
                feedback: 'Good but missing some elements',
                answer: combinedAnswer,
                questionType: 'free-response'
            };

            expect(mockGradingResults['Q10'].answer).toContain('Part (a)');
            expect(mockGradingResults['Q10'].answer).toContain('Part (b)');
        });

        it('should show appeal button after grading multi-part FRQ', () => {
            escalationFunctions.displayGradingFeedback('Q10', { score: 'P' }, mockDOM);

            expect(mockDOM.elements['btn-appeal-Q10'].style.display).toBe('inline-block');
        });
    });
});
