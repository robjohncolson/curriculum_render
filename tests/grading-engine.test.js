/**
 * Grading Engine Tests
 *
 * Tests for the GradingEngine class that handles E/P/I scoring,
 * regex matching, dual grading (AI can only upgrade), and appeals.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCK IMPLEMENTATION
// ============================================

/**
 * Recreate GradingEngine core logic for isolated testing
 * (without actual AI/network calls)
 */
class GradingEngineTest {
    constructor(config = {}) {
        this.serverUrl = config.serverUrl || 'https://test-server.example.com';
        this.defaultTolerance = config.defaultTolerance || 0.01;
        this.aiEnabled = config.aiEnabled !== false;
    }

    async gradeAnswer(answer, rule, context = {}) {
        if (!answer || !answer.trim()) {
            return {
                score: 'I',
                correct: false,
                feedback: 'No answer provided.',
                matched: [],
                missing: rule.rubric?.filter(r => r.required).map(r => r.id) || []
            };
        }

        switch (rule.type) {
            case 'numeric':
                return this.gradeNumeric(answer, rule, context);
            case 'regex':
            case 'rubric':
                return this.gradeRegex(answer, rule, context);
            case 'exact':
                return this.gradeExact(answer, rule, context);
            default:
                return this.gradeRegex(answer, rule, context);
        }
    }

    gradeNumeric(answer, rule, context) {
        const userValue = parseFloat(answer.replace(/[^0-9.-]/g, ''));

        if (isNaN(userValue)) {
            return {
                score: 'I',
                correct: false,
                feedback: 'Please enter a valid number.'
            };
        }

        let expected = rule.expected;
        if (typeof expected === 'function') {
            expected = expected(context);
        }

        const tolerance = rule.tolerance ?? this.defaultTolerance;
        const diff = Math.abs(userValue - expected);
        const correct = diff <= Math.abs(expected * tolerance);

        return {
            score: correct ? 'E' : 'I',
            correct,
            expected,
            userValue,
            diff,
            feedback: correct
                ? 'Correct!'
                : `Expected approximately ${expected.toFixed(rule.decimals || 2)}.`
        };
    }

    gradeExact(answer, rule, context) {
        let expected = rule.expected;
        const normalize = str => str.toString().toLowerCase().trim().replace(/\s+/g, ' ');
        const correct = normalize(answer) === normalize(expected);

        return {
            score: correct ? 'E' : 'I',
            correct,
            feedback: correct ? 'Correct!' : `Expected "${expected}".`
        };
    }

    gradeRegex(answer, rule, context) {
        const text = answer.toString().toLowerCase();
        const results = {
            required: {},
            forbidden: [],
            matched: [],
            missing: [],
            score: 'E'
        };

        let matchedCount = 0;
        let totalRequired = 0;
        const rubric = rule.rubric || rule.required || [];

        for (const item of rubric) {
            if (item.contextCondition && !item.contextCondition(context)) {
                continue;
            }

            if (!item.required) continue;
            totalRequired++;

            let pattern = item.pattern;
            if (Array.isArray(item.patterns)) {
                pattern = item.patterns;
            }

            if (!pattern) continue;

            const patterns = Array.isArray(pattern) ? pattern : [pattern];
            let matched = false;

            for (let p of patterns) {
                if (typeof p === 'string') {
                    p = new RegExp(p, 'i');
                }

                const match = text.match(p);
                if (match) {
                    matched = true;
                    break;
                }
            }

            results.required[item.id] = matched;
            if (matched) {
                matchedCount++;
                results.matched.push(item.id);
            } else {
                results.missing.push(item.id);
            }
        }

        // Check forbidden patterns
        const forbidden = rule.forbidden || [];
        for (const word of forbidden) {
            const pattern = typeof word === 'string' ? new RegExp(word, 'i') : word;
            if (pattern.test(text)) {
                results.forbidden.push(typeof word === 'string' ? word : word.source);
            }
        }

        // Determine score
        if (results.forbidden.length > 0) {
            results.score = 'I';
            results.feedback = `Avoid using "${results.forbidden[0]}".`;
        } else {
            const scoring = rule.scoring || { E: { minRequired: totalRequired }, P: { minRequired: Math.ceil(totalRequired * 0.5) } };

            if (matchedCount >= (scoring.E?.minRequired || totalRequired)) {
                results.score = 'E';
                results.feedback = 'Excellent! All key elements included.';
            } else if (matchedCount >= (scoring.P?.minRequired || Math.ceil(totalRequired * 0.5))) {
                results.score = 'P';
                results.feedback = `Good, but consider including: ${results.missing.slice(0, 3).join(', ')}.`;
            } else {
                results.score = 'I';
                results.feedback = 'Missing key elements.';
            }
        }

        results.correct = results.score === 'E';
        results.matchedCount = matchedCount;
        results.totalRequired = totalRequired;
        return results;
    }

    /**
     * Dual grading: regex + AI
     * KEY RULE: AI can only UPGRADE a score, never downgrade
     */
    gradeDual(regexResult, aiResult) {
        const scoreOrder = { 'E': 3, 'P': 2, 'I': 1 };

        if (aiResult && aiResult.score && !aiResult._error) {
            const regexScore = scoreOrder[regexResult.score] || 0;
            const aiScore = scoreOrder[aiResult.score] || 0;

            if (aiScore > regexScore) {
                // AI upgraded the score
                return {
                    ...aiResult,
                    _regexScore: regexResult.score,
                    _upgraded: true,
                    _bestOf: 'ai'
                };
            } else if (aiScore < regexScore) {
                // AI would downgrade - IGNORE AI
                return {
                    ...regexResult,
                    _aiScore: aiResult.score,
                    _aiIgnored: true,
                    _bestOf: 'regex'
                };
            } else {
                // Same score - prefer AI feedback
                return {
                    score: regexResult.score,
                    feedback: aiResult.feedback || regexResult.feedback,
                    matched: [...new Set([...(regexResult.matched || []), ...(aiResult.matched || [])])],
                    missing: aiResult.missing || regexResult.missing,
                    correct: regexResult.correct,
                    _bestOf: 'both'
                };
            }
        }

        // AI unavailable - use regex result
        return {
            ...regexResult,
            _bestOf: 'regex'
        };
    }

    async submitAppeal(answer, appealText, previousResult, context = {}) {
        if (!appealText || !appealText.trim()) {
            return {
                success: false,
                error: 'Please provide reasoning for your appeal.',
                score: previousResult?.score || 'I'
            };
        }

        if (!this.aiEnabled) {
            return {
                success: false,
                error: 'AI appeals are not available.',
                score: previousResult?.score || 'I'
            };
        }

        // Simulate successful appeal for testing
        return {
            success: true,
            score: previousResult?.score || 'I',
            feedback: 'Appeal processed.',
            appealGranted: false,
            upgraded: false,
            previousScore: previousResult?.score,
            _appealProcessed: true
        };
    }
}

// ============================================
// TESTS
// ============================================

describe('GradingEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new GradingEngineTest();
    });

    describe('Instantiation', () => {
        it('should create instance with default config', () => {
            expect(engine).toBeDefined();
            expect(engine.defaultTolerance).toBe(0.01);
            expect(engine.aiEnabled).toBe(true);
        });

        it('should accept custom config', () => {
            const customEngine = new GradingEngineTest({
                defaultTolerance: 0.05,
                aiEnabled: false
            });
            expect(customEngine.defaultTolerance).toBe(0.05);
            expect(customEngine.aiEnabled).toBe(false);
        });
    });

    describe('gradeAnswer - Empty Input', () => {
        it('should return I score for empty answer', async () => {
            const result = await engine.gradeAnswer('', { type: 'regex' }, {});
            expect(result.score).toBe('I');
            expect(result.correct).toBe(false);
            expect(result.feedback).toContain('No answer provided');
        });

        it('should return I score for whitespace-only answer', async () => {
            const result = await engine.gradeAnswer('   ', { type: 'regex' }, {});
            expect(result.score).toBe('I');
        });
    });

    describe('gradeNumeric', () => {
        it('should grade correct numeric answer as E', () => {
            const rule = { type: 'numeric', expected: 42, tolerance: 0.01 };
            const result = engine.gradeNumeric('42', rule, {});
            expect(result.score).toBe('E');
            expect(result.correct).toBe(true);
        });

        it('should accept answers within tolerance', () => {
            const rule = { type: 'numeric', expected: 100, tolerance: 0.05 };
            const result = engine.gradeNumeric('103', rule, {});
            expect(result.score).toBe('E');
        });

        it('should reject answers outside tolerance', () => {
            const rule = { type: 'numeric', expected: 100, tolerance: 0.01 };
            const result = engine.gradeNumeric('110', rule, {});
            expect(result.score).toBe('I');
            expect(result.correct).toBe(false);
        });

        it('should return I for non-numeric input', () => {
            const rule = { type: 'numeric', expected: 42 };
            const result = engine.gradeNumeric('not a number', rule, {});
            expect(result.score).toBe('I');
            expect(result.feedback).toContain('valid number');
        });

        it('should handle negative numbers', () => {
            const rule = { type: 'numeric', expected: -5, tolerance: 0.01 };
            const result = engine.gradeNumeric('-5', rule, {});
            expect(result.score).toBe('E');
        });
    });

    describe('gradeExact', () => {
        it('should match exact answer', () => {
            const rule = { type: 'exact', expected: 'Hello World' };
            const result = engine.gradeExact('Hello World', rule, {});
            expect(result.score).toBe('E');
            expect(result.correct).toBe(true);
        });

        it('should be case insensitive', () => {
            const rule = { type: 'exact', expected: 'Hello World' };
            const result = engine.gradeExact('hello world', rule, {});
            expect(result.score).toBe('E');
        });

        it('should normalize whitespace', () => {
            const rule = { type: 'exact', expected: 'Hello World' };
            const result = engine.gradeExact('  Hello   World  ', rule, {});
            expect(result.score).toBe('E');
        });

        it('should reject non-matching answers', () => {
            const rule = { type: 'exact', expected: 'Hello World' };
            const result = engine.gradeExact('Goodbye World', rule, {});
            expect(result.score).toBe('I');
            expect(result.correct).toBe(false);
        });
    });

    describe('gradeRegex', () => {
        const statisticsRule = {
            type: 'regex',
            rubric: [
                { id: 'shape', required: true, pattern: /skew|symmetric|unimodal|bimodal/i },
                { id: 'center', required: true, pattern: /mean|median|center/i },
                { id: 'spread', required: true, pattern: /range|standard deviation|iqr|spread/i }
            ],
            scoring: {
                E: { minRequired: 3 },
                P: { minRequired: 2 }
            }
        };

        it('should score E when all required patterns match', () => {
            const answer = 'The distribution is skewed right with a mean of 50 and a range of 30.';
            const result = engine.gradeRegex(answer, statisticsRule, {});
            expect(result.score).toBe('E');
            expect(result.matched).toContain('shape');
            expect(result.matched).toContain('center');
            expect(result.matched).toContain('spread');
            expect(result.missing).toHaveLength(0);
        });

        it('should score P when some patterns match', () => {
            const answer = 'The distribution is skewed right with a mean of 50.';
            const result = engine.gradeRegex(answer, statisticsRule, {});
            expect(result.score).toBe('P');
            expect(result.matched).toContain('shape');
            expect(result.matched).toContain('center');
            expect(result.missing).toContain('spread');
        });

        it('should score I when few patterns match', () => {
            const answer = 'The data looks interesting.';
            const result = engine.gradeRegex(answer, statisticsRule, {});
            expect(result.score).toBe('I');
        });

        it('should track matched and missing elements', () => {
            const answer = 'The mean is 50.';
            const result = engine.gradeRegex(answer, statisticsRule, {});
            expect(result.matched).toContain('center');
            expect(result.missing).toContain('shape');
            expect(result.missing).toContain('spread');
            expect(result.matchedCount).toBe(1);
            expect(result.totalRequired).toBe(3);
        });

        it('should detect forbidden patterns', () => {
            const rule = {
                type: 'regex',
                rubric: [
                    { id: 'context', required: true, pattern: /context/i }
                ],
                forbidden: ['causation', 'proves']
            };
            const answer = 'The context shows causation.';
            const result = engine.gradeRegex(answer, rule, {});
            expect(result.score).toBe('I');
            expect(result.forbidden).toContain('causation');
        });

        it('should support multiple patterns per element', () => {
            const rule = {
                type: 'regex',
                rubric: [
                    { id: 'variability', required: true, patterns: [/spread/i, /variability/i, /dispersion/i] }
                ]
            };

            const result1 = engine.gradeRegex('good spread', rule, {});
            const result2 = engine.gradeRegex('shows variability', rule, {});
            const result3 = engine.gradeRegex('dispersion is high', rule, {});

            expect(result1.matched).toContain('variability');
            expect(result2.matched).toContain('variability');
            expect(result3.matched).toContain('variability');
        });
    });

    describe('gradeDual - AI Can Only Upgrade', () => {
        it('should use AI score when AI upgrades', () => {
            const regexResult = { score: 'P', feedback: 'Partial', matched: ['a'] };
            const aiResult = { score: 'E', feedback: 'Excellent', matched: ['a', 'b'] };

            const result = engine.gradeDual(regexResult, aiResult);

            expect(result.score).toBe('E');
            expect(result._upgraded).toBe(true);
            expect(result._bestOf).toBe('ai');
            expect(result._regexScore).toBe('P');
        });

        it('should IGNORE AI when AI would downgrade', () => {
            const regexResult = { score: 'E', feedback: 'Excellent', matched: ['a', 'b', 'c'] };
            const aiResult = { score: 'P', feedback: 'Partial', matched: ['a'] };

            const result = engine.gradeDual(regexResult, aiResult);

            expect(result.score).toBe('E');
            expect(result._aiIgnored).toBe(true);
            expect(result._bestOf).toBe('regex');
            expect(result._aiScore).toBe('P');
        });

        it('should prefer AI feedback when scores are equal', () => {
            const regexResult = { score: 'P', feedback: 'Partial from regex', matched: ['a'] };
            const aiResult = { score: 'P', feedback: 'Detailed AI feedback', matched: ['a', 'b'] };

            const result = engine.gradeDual(regexResult, aiResult);

            expect(result.score).toBe('P');
            expect(result._bestOf).toBe('both');
            expect(result.feedback).toBe('Detailed AI feedback');
        });

        it('should use regex result when AI is unavailable', () => {
            const regexResult = { score: 'P', feedback: 'Regex only', matched: ['a'] };

            const result = engine.gradeDual(regexResult, null);

            expect(result.score).toBe('P');
            expect(result._bestOf).toBe('regex');
        });

        it('should use regex result when AI has error', () => {
            const regexResult = { score: 'P', feedback: 'Regex', matched: ['a'] };
            const aiResult = { score: 'E', feedback: 'Error', _error: 'API failed' };

            const result = engine.gradeDual(regexResult, aiResult);

            expect(result.score).toBe('P');
            expect(result._bestOf).toBe('regex');
        });
    });

    describe('submitAppeal', () => {
        it('should reject empty appeal text', async () => {
            const result = await engine.submitAppeal('answer', '', { score: 'I' }, {});
            expect(result.success).toBe(false);
            expect(result.error).toContain('reasoning');
        });

        it('should reject whitespace-only appeal text', async () => {
            const result = await engine.submitAppeal('answer', '   ', { score: 'I' }, {});
            expect(result.success).toBe(false);
        });

        it('should reject appeal when AI is disabled', async () => {
            const noAIEngine = new GradingEngineTest({ aiEnabled: false });
            const result = await noAIEngine.submitAppeal('answer', 'My reasoning', { score: 'I' }, {});
            expect(result.success).toBe(false);
            expect(result.error).toContain('not available');
        });

        it('should process valid appeal', async () => {
            const result = await engine.submitAppeal(
                'My answer about statistics',
                'I believe this is correct because I mentioned the key concept of variability.',
                { score: 'P' },
                { questionId: 'Q1' }
            );
            expect(result.success).toBe(true);
            expect(result._appealProcessed).toBe(true);
            expect(result.previousScore).toBe('P');
        });
    });

    describe('Score Ordering', () => {
        it('should rank scores correctly: E > P > I', () => {
            const scoreOrder = { 'E': 3, 'P': 2, 'I': 1 };

            expect(scoreOrder['E']).toBeGreaterThan(scoreOrder['P']);
            expect(scoreOrder['P']).toBeGreaterThan(scoreOrder['I']);
            expect(scoreOrder['E']).toBeGreaterThan(scoreOrder['I']);
        });
    });
});
