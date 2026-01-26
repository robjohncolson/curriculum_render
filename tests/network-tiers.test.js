/**
 * Network Tiers & LAN Grading System Tests
 *
 * Regression tests for:
 * - NetworkManager tier detection and transitions
 * - LAN code parsing and IP resolution
 * - AI endpoint resolution by tier
 * - Tutor server detection
 * - Queue-based grading flow
 * - MCQ enforcement (wrong answer = max P)
 * - Time estimates for queue
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Mock NetworkManager for testing tier logic
 */
function createMockNetworkManager() {
    return {
        currentTier: 'offline',
        lanIP: null,
        lanCode: null,
        _initialized: false,

        TURBO_TIMEOUT: 3000,
        LAN_TIMEOUT: 2000,
        LAN_PORT: 8765,
        SUBNET_PREFIXES: ['192.168.', '10.0.', '172.16.'],

        STORAGE_KEYS: {
            LAN_CODE: 'LAN_TUTOR_CODE',
            LAN_IP: 'LAN_TUTOR_IP'
        },

        /**
         * Parse LAN short code (e.g., "1-42" -> {third: "1", fourth: "42"})
         */
        parseLANCode(code) {
            if (!code) return null;
            const match = code.match(/^(\d{1,3})-(\d{1,3})$/);
            if (!match) return null;
            const [_, third, fourth] = match;
            if (parseInt(third) > 255 || parseInt(fourth) > 255) return null;
            return { third, fourth };
        },

        /**
         * Check if LAN mode is possible (not on HTTPS)
         */
        canUseLAN(protocol = 'http:') {
            return protocol !== 'https:';
        },

        /**
         * Check if served from tutor server
         */
        isServedFromTutorServer(pathname = '/') {
            return pathname.startsWith('/quiz');
        },

        /**
         * Get AI endpoint based on tier
         */
        getAIEndpoint(railwayUrl = 'https://example.railway.app') {
            if (this.currentTier === 'turbo') {
                return {
                    url: `${railwayUrl}/api/ai/grade`,
                    type: 'groq'
                };
            }
            if (this.currentTier === 'lan' && this.lanIP) {
                return {
                    url: `http://${this.lanIP}:${this.LAN_PORT}`,
                    type: 'qwen'
                };
            }
            return null; // Offline - no AI
        },

        /**
         * Get tutor endpoint (LAN only)
         */
        getTutorEndpoint() {
            if (this.currentTier === 'lan' && this.lanIP) {
                return `http://${this.lanIP}:${this.LAN_PORT}`;
            }
            return null;
        },

        /**
         * Set tier (simplified for testing)
         */
        setTier(tier) {
            const oldTier = this.currentTier;
            this.currentTier = tier;
            return { oldTier, newTier: tier };
        }
    };
}

/**
 * Mock GradingQueue for testing queue operations
 */
function createMockGradingQueue() {
    return {
        _queue: [],
        _results: {},
        _processing: false,
        _currentRequestId: null,
        _processingStartTime: null,
        _completionTimes: [],
        _maxCompletionSamples: 10,

        submit(prompt, questionId, username, questionText = '', questionType = 'multiple-choice', isCorrect = null) {
            const requestId = Math.random().toString(36).substring(2, 10);
            const request = {
                requestId,
                prompt,
                questionId,
                username,
                questionText,
                questionType,
                isCorrect,
                submittedAt: Date.now(),
                status: 'queued',
                result: null,
                error: null
            };
            this._results[requestId] = request;
            this._queue.push(request);
            return [requestId, this._queue.length];
        },

        getStatus(requestId) {
            const request = this._results[requestId];
            if (!request) return null;

            let position;
            if (request.status === 'queued') {
                position = this._queue.findIndex(r => r.requestId === requestId) + 1;
                if (this._processing) position += 1;
            } else if (request.status === 'processing') {
                position = 0;
            } else {
                position = -1;
            }

            const avgTime = this._completionTimes.length > 0
                ? this._completionTimes.reduce((a, b) => a + b, 0) / this._completionTimes.length
                : 30;

            let estimatedSeconds;
            if (request.status === 'processing') {
                const elapsed = this._processingStartTime ? (Date.now() - this._processingStartTime) / 1000 : 0;
                estimatedSeconds = Math.max(0, Math.round(avgTime - elapsed));
            } else if (request.status === 'queued') {
                estimatedSeconds = Math.round(position * avgTime);
            } else {
                estimatedSeconds = 0;
            }

            return {
                requestId,
                status: request.status,
                position,
                queueSize: this._queue.length + (this._processing ? 1 : 0),
                result: request.result,
                error: request.error,
                estimatedSeconds,
                avgProcessingTime: Math.round(avgTime)
            };
        },

        getNext() {
            if (this._queue.length === 0) return null;
            const request = this._queue.shift();
            this._processing = true;
            this._currentRequestId = request.requestId;
            this._processingStartTime = Date.now();
            request.status = 'processing';
            return request;
        },

        complete(requestId, result) {
            if (this._results[requestId]) {
                this._results[requestId].status = 'completed';
                this._results[requestId].result = result;
            }
            if (this._processingStartTime) {
                const duration = (Date.now() - this._processingStartTime) / 1000;
                this._completionTimes.push(duration);
                if (this._completionTimes.length > this._maxCompletionSamples) {
                    this._completionTimes.shift();
                }
            }
            this._processing = false;
            this._currentRequestId = null;
            this._processingStartTime = null;
        },

        fail(requestId, error) {
            if (this._results[requestId]) {
                this._results[requestId].status = 'error';
                this._results[requestId].error = error;
            }
            this._processing = false;
            this._currentRequestId = null;
            this._processingStartTime = null;
        }
    };
}

/**
 * MCQ Enforcement logic (mirrors server-side)
 */
function enforceMCQScoreCap(response, questionType, isCorrect) {
    if (questionType !== 'multiple-choice' || isCorrect !== false) {
        return { response, capped: false };
    }

    const ePatterns = [
        /\bScore:\s*E\b/i,
        /"score":\s*"E"/i,
        /\bscore\s*=\s*E\b/i,
        /^\s*E\s*$/m,
        /\bE\s*\(Essentially/i,
        /\bEssentially\s+[Cc]orrect\b/
    ];

    let foundE = ePatterns.some(pattern => pattern.test(response));

    if (foundE) {
        let newResponse = response;
        newResponse = newResponse.replace(/\bScore:\s*E\b/gi, 'Score: P');
        newResponse = newResponse.replace(/"score":\s*"E"/gi, '"score": "P"');
        newResponse = newResponse.replace(/\bE\s*\(Essentially/gi, 'P (Partially');
        newResponse = newResponse.replace(/\bEssentially\s+[Cc]orrect\b/g, 'Partially correct');
        newResponse += '\n\n[Note: Score capped at P because the selected answer was incorrect.]';
        return { response: newResponse, capped: true };
    }

    return { response, capped: false };
}

/**
 * RAG Context question ID parser
 */
function parseQuestionId(questionId) {
    const match = questionId.match(/^U(\d+)-L(\d+)-Q(\d+)$/i);
    if (match) {
        return {
            unit: parseInt(match[1]),
            lesson: parseInt(match[2]),
            question: parseInt(match[3])
        };
    }
    return { unit: 0, lesson: 0, question: 0 };
}

// ============================================
// NETWORK MANAGER TESTS
// ============================================

describe('NetworkManager', () => {
    let nm;

    beforeEach(() => {
        nm = createMockNetworkManager();
    });

    describe('LAN Code Parsing', () => {
        it('parses valid short codes', () => {
            expect(nm.parseLANCode('1-42')).toEqual({ third: '1', fourth: '42' });
            expect(nm.parseLANCode('0-1')).toEqual({ third: '0', fourth: '1' });
            expect(nm.parseLANCode('255-255')).toEqual({ third: '255', fourth: '255' });
            expect(nm.parseLANCode('10-105')).toEqual({ third: '10', fourth: '105' });
        });

        it('rejects invalid short codes', () => {
            expect(nm.parseLANCode(null)).toBeNull();
            expect(nm.parseLANCode('')).toBeNull();
            expect(nm.parseLANCode('192.168.1.42')).toBeNull(); // Full IP, not short code
            expect(nm.parseLANCode('1-256')).toBeNull(); // Out of range
            expect(nm.parseLANCode('256-1')).toBeNull(); // Out of range
            expect(nm.parseLANCode('1.42')).toBeNull(); // Wrong format
            expect(nm.parseLANCode('1-42-3')).toBeNull(); // Too many parts
        });
    });

    describe('LAN Mode Availability', () => {
        it('allows LAN on HTTP', () => {
            expect(nm.canUseLAN('http:')).toBe(true);
        });

        it('blocks LAN on HTTPS (mixed content)', () => {
            expect(nm.canUseLAN('https:')).toBe(false);
        });
    });

    describe('Tutor Server Detection', () => {
        it('detects tutor server hosting at /quiz', () => {
            expect(nm.isServedFromTutorServer('/quiz')).toBe(true);
            expect(nm.isServedFromTutorServer('/quiz/')).toBe(true);
            expect(nm.isServedFromTutorServer('/quiz/index.html')).toBe(true);
        });

        it('detects non-tutor server paths', () => {
            expect(nm.isServedFromTutorServer('/')).toBe(false);
            expect(nm.isServedFromTutorServer('/index.html')).toBe(false);
            expect(nm.isServedFromTutorServer('/other/quiz')).toBe(false);
        });
    });

    describe('AI Endpoint Resolution', () => {
        it('returns Groq endpoint in turbo mode', () => {
            nm.currentTier = 'turbo';
            const endpoint = nm.getAIEndpoint('https://my-railway.app');
            expect(endpoint).toEqual({
                url: 'https://my-railway.app/api/ai/grade',
                type: 'groq'
            });
        });

        it('returns Qwen endpoint in LAN mode', () => {
            nm.currentTier = 'lan';
            nm.lanIP = '192.168.1.42';
            const endpoint = nm.getAIEndpoint();
            expect(endpoint).toEqual({
                url: 'http://192.168.1.42:8765',
                type: 'qwen'
            });
        });

        it('returns null in offline mode', () => {
            nm.currentTier = 'offline';
            expect(nm.getAIEndpoint()).toBeNull();
        });

        it('returns null in LAN mode without IP', () => {
            nm.currentTier = 'lan';
            nm.lanIP = null;
            expect(nm.getAIEndpoint()).toBeNull();
        });
    });

    describe('Tier Transitions', () => {
        it('tracks tier changes', () => {
            expect(nm.currentTier).toBe('offline');

            const change1 = nm.setTier('turbo');
            expect(change1).toEqual({ oldTier: 'offline', newTier: 'turbo' });
            expect(nm.currentTier).toBe('turbo');

            const change2 = nm.setTier('lan');
            expect(change2).toEqual({ oldTier: 'turbo', newTier: 'lan' });
            expect(nm.currentTier).toBe('lan');
        });
    });
});

// ============================================
// GRADING QUEUE TESTS
// ============================================

describe('GradingQueue', () => {
    let queue;

    beforeEach(() => {
        queue = createMockGradingQueue();
    });

    describe('Request Submission', () => {
        it('assigns unique request IDs', () => {
            const [id1] = queue.submit('prompt1', 'Q1', 'user1');
            const [id2] = queue.submit('prompt2', 'Q2', 'user2');
            expect(id1).not.toBe(id2);
            expect(id1.length).toBeGreaterThan(0);
        });

        it('returns correct queue position', () => {
            const [, pos1] = queue.submit('prompt1', 'Q1', 'user1');
            const [, pos2] = queue.submit('prompt2', 'Q2', 'user2');
            const [, pos3] = queue.submit('prompt3', 'Q3', 'user3');
            expect(pos1).toBe(1);
            expect(pos2).toBe(2);
            expect(pos3).toBe(3);
        });

        it('stores question type and correctness', () => {
            const [id] = queue.submit('prompt', 'Q1', 'user', '', 'multiple-choice', false);
            const status = queue.getStatus(id);
            expect(status).not.toBeNull();
        });
    });

    describe('Status Tracking', () => {
        it('returns queued status for new requests', () => {
            const [id] = queue.submit('prompt', 'Q1', 'user');
            const status = queue.getStatus(id);
            expect(status.status).toBe('queued');
            expect(status.position).toBe(1);
        });

        it('returns processing status when being processed', () => {
            const [id] = queue.submit('prompt', 'Q1', 'user');
            queue.getNext();
            const status = queue.getStatus(id);
            expect(status.status).toBe('processing');
            expect(status.position).toBe(0);
        });

        it('returns completed status with result', () => {
            const [id] = queue.submit('prompt', 'Q1', 'user');
            queue.getNext();
            queue.complete(id, { response: 'Score: P', graded: true });
            const status = queue.getStatus(id);
            expect(status.status).toBe('completed');
            expect(status.position).toBe(-1);
            expect(status.result).toEqual({ response: 'Score: P', graded: true });
        });

        it('returns error status on failure', () => {
            const [id] = queue.submit('prompt', 'Q1', 'user');
            queue.getNext();
            queue.fail(id, 'Model timeout');
            const status = queue.getStatus(id);
            expect(status.status).toBe('error');
            expect(status.error).toBe('Model timeout');
        });

        it('returns null for unknown request ID', () => {
            expect(queue.getStatus('nonexistent')).toBeNull();
        });
    });

    describe('Time Estimates', () => {
        it('returns default estimate (30s) with no history', () => {
            const [id] = queue.submit('prompt', 'Q1', 'user');
            const status = queue.getStatus(id);
            expect(status.avgProcessingTime).toBe(30);
        });

        it('calculates average from completion history', () => {
            // Simulate some completions
            queue._completionTimes = [20, 25, 30, 25];
            const [id] = queue.submit('prompt', 'Q1', 'user');
            const status = queue.getStatus(id);
            expect(status.avgProcessingTime).toBe(25); // Average of [20,25,30,25]
        });

        it('estimates wait time based on position', () => {
            queue._completionTimes = [30]; // 30s average
            queue.submit('prompt1', 'Q1', 'user1');
            queue.submit('prompt2', 'Q2', 'user2');
            const [id3] = queue.submit('prompt3', 'Q3', 'user3');
            const status = queue.getStatus(id3);
            expect(status.position).toBe(3);
            expect(status.estimatedSeconds).toBe(90); // 3 * 30s
        });
    });

    describe('Queue Processing', () => {
        it('processes requests in FIFO order', () => {
            queue.submit('prompt1', 'Q1', 'user1');
            queue.submit('prompt2', 'Q2', 'user2');
            queue.submit('prompt3', 'Q3', 'user3');

            const first = queue.getNext();
            expect(first.questionId).toBe('Q1');

            queue.complete(first.requestId, {});
            const second = queue.getNext();
            expect(second.questionId).toBe('Q2');
        });

        it('returns null when queue is empty', () => {
            expect(queue.getNext()).toBeNull();
        });
    });
});

// ============================================
// MCQ ENFORCEMENT TESTS
// ============================================

describe('MCQ Score Enforcement', () => {
    describe('Caps E to P for wrong answers', () => {
        it('caps "Score: E" format', () => {
            const result = enforceMCQScoreCap('Score: E\nFeedback: Good reasoning', 'multiple-choice', false);
            expect(result.capped).toBe(true);
            expect(result.response).toContain('Score: P');
            expect(result.response).not.toMatch(/Score:\s*E/i);
        });

        it('caps JSON format', () => {
            const result = enforceMCQScoreCap('{"score": "E", "feedback": "test"}', 'multiple-choice', false);
            expect(result.capped).toBe(true);
            expect(result.response).toContain('"score": "P"');
        });

        it('caps "Essentially Correct" text', () => {
            const result = enforceMCQScoreCap('The answer is Essentially Correct because...', 'multiple-choice', false);
            expect(result.capped).toBe(true);
            expect(result.response).toContain('Partially correct');
        });

        it('caps "E (Essentially" format', () => {
            const result = enforceMCQScoreCap('E (Essentially correct) - good work', 'multiple-choice', false);
            expect(result.capped).toBe(true);
            expect(result.response).toContain('P (Partially');
        });

        it('adds note about capping', () => {
            const result = enforceMCQScoreCap('Score: E', 'multiple-choice', false);
            expect(result.response).toContain('[Note: Score capped at P');
        });
    });

    describe('Does not cap when appropriate', () => {
        it('does not cap correct MCQ answers', () => {
            const result = enforceMCQScoreCap('Score: E', 'multiple-choice', true);
            expect(result.capped).toBe(false);
            expect(result.response).toBe('Score: E');
        });

        it('does not cap FRQ answers', () => {
            const result = enforceMCQScoreCap('Score: E', 'free-response', false);
            expect(result.capped).toBe(false);
            expect(result.response).toBe('Score: E');
        });

        it('does not cap P or I scores', () => {
            const resultP = enforceMCQScoreCap('Score: P', 'multiple-choice', false);
            expect(resultP.capped).toBe(false);

            const resultI = enforceMCQScoreCap('Score: I', 'multiple-choice', false);
            expect(resultI.capped).toBe(false);
        });

        it('handles null isCorrect (unknown)', () => {
            const result = enforceMCQScoreCap('Score: E', 'multiple-choice', null);
            expect(result.capped).toBe(false);
        });
    });
});

// ============================================
// RAG CONTEXT TESTS
// ============================================

describe('RAG Context', () => {
    describe('Question ID Parsing', () => {
        it('parses standard question IDs', () => {
            expect(parseQuestionId('U1-L2-Q03')).toEqual({ unit: 1, lesson: 2, question: 3 });
            expect(parseQuestionId('U4-L12-Q01')).toEqual({ unit: 4, lesson: 12, question: 1 });
            expect(parseQuestionId('U9-L5-Q15')).toEqual({ unit: 9, lesson: 5, question: 15 });
        });

        it('handles case insensitivity', () => {
            expect(parseQuestionId('u1-l2-q03')).toEqual({ unit: 1, lesson: 2, question: 3 });
            expect(parseQuestionId('U1-l2-Q03')).toEqual({ unit: 1, lesson: 2, question: 3 });
        });

        it('returns zeros for invalid IDs', () => {
            expect(parseQuestionId('')).toEqual({ unit: 0, lesson: 0, question: 0 });
            expect(parseQuestionId('invalid')).toEqual({ unit: 0, lesson: 0, question: 0 });
            expect(parseQuestionId('Q1')).toEqual({ unit: 0, lesson: 0, question: 0 });
            expect(parseQuestionId('U1-Q03')).toEqual({ unit: 0, lesson: 0, question: 0 });
        });
    });
});

// ============================================
// GRADING PROMPT TESTS
// ============================================

describe('Grading Prompt Construction', () => {
    /**
     * Simplified version of buildMCQGradingPrompt for testing
     */
    function buildMCQGradingPrompt(question, answer, reason, correctAnswer) {
        const isCorrect = answer?.toString().toLowerCase().trim() === correctAnswer?.toString().toLowerCase().trim();

        let prompt = `## Question\n${question}\n\n`;
        prompt += `## Correct Answer\n${correctAnswer}\n\n`;
        prompt += `## Student's Answer\n${answer} (${isCorrect ? 'CORRECT' : 'INCORRECT'})\n\n`;
        prompt += `## Student's Reasoning\n${reason || 'No reasoning provided'}\n\n`;

        if (!isCorrect) {
            prompt += `### The student selected the WRONG answer.\n`;
            prompt += `CRITICAL RULE: A wrong answer CANNOT receive E (Essentially correct). The maximum possible score is P.\n`;
        }

        return prompt;
    }

    it('marks correct answers as CORRECT', () => {
        const prompt = buildMCQGradingPrompt('What is 2+2?', 'C', 'Because...', 'C');
        expect(prompt).toContain('(CORRECT)');
        expect(prompt).not.toContain('WRONG answer');
    });

    it('marks incorrect answers as INCORRECT with enforcement warning', () => {
        const prompt = buildMCQGradingPrompt('What is 2+2?', 'A', 'Because...', 'C');
        expect(prompt).toContain('(INCORRECT)');
        expect(prompt).toContain('WRONG answer');
        expect(prompt).toContain('maximum possible score is P');
    });

    it('includes student reasoning', () => {
        const prompt = buildMCQGradingPrompt('Question?', 'A', 'My detailed reasoning here', 'B');
        expect(prompt).toContain('My detailed reasoning here');
    });

    it('handles missing reasoning', () => {
        const prompt = buildMCQGradingPrompt('Question?', 'A', '', 'B');
        expect(prompt).toContain('No reasoning provided');
    });

    it('handles case-insensitive answer comparison', () => {
        const prompt1 = buildMCQGradingPrompt('Q?', 'a', '', 'A');
        expect(prompt1).toContain('(CORRECT)');

        const prompt2 = buildMCQGradingPrompt('Q?', 'B', '', 'b');
        expect(prompt2).toContain('(CORRECT)');
    });
});

// ============================================
// FOCUSED GRADING PROMPT TESTS (Server-side)
// ============================================

describe('Focused Grading Prompt (Server)', () => {
    /**
     * Server-side focused prompt builder (mirrors server.py logic)
     * This tests the new structured comparison format
     */
    function buildFocusedGradingPrompt(request, ragContext = '') {
        // If no structured data, fall back to legacy
        if (!request.correct_answer) {
            if (ragContext) {
                return `LESSON CONTEXT:\n${ragContext}\n\n---\n\nGRADING TASK:\n${request.prompt}`;
            }
            return request.prompt;
        }

        const parts = [];

        // SECTION 1: THE CRITICAL COMPARISON
        parts.push('═══════════════════════════════════════════════════════════════');
        parts.push('                    ANSWER COMPARISON');
        parts.push('═══════════════════════════════════════════════════════════════');
        parts.push(`CORRECT ANSWER: ${request.correct_answer}`);
        parts.push(`STUDENT ANSWERED: ${request.student_answer}`);

        if (request.is_correct === true) {
            parts.push('STATUS: ✓ CORRECT ANSWER SELECTED');
        } else if (request.is_correct === false) {
            parts.push('STATUS: ✗ WRONG ANSWER SELECTED - Maximum score is P (Partially Correct)');
        }
        parts.push('═══════════════════════════════════════════════════════════════');

        // Question
        parts.push('\nQUESTION:');
        parts.push(request.question_text || '(Question text not provided)');

        // Choices
        if (request.choices) {
            parts.push('\nANSWER CHOICES:');
            parts.push(request.choices);
        }

        // Reasoning
        if (request.student_reasoning) {
            parts.push(`\nSTUDENT'S REASONING:\n${request.student_reasoning}`);
        } else {
            parts.push("\nSTUDENT'S REASONING: (None provided)");
        }

        // RAG context
        if (ragContext) {
            parts.push(`\nLESSON CONTEXT (for grading alignment):\n${ragContext.slice(0, 1000)}`);
        }

        return parts.join('\n');
    }

    it('puts correct answer prominently at top', () => {
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'C',
            student_answer: 'A',
            question_text: 'What is statistics?',
            is_correct: false
        });

        // Correct answer should appear before student answer
        const correctIdx = prompt.indexOf('CORRECT ANSWER: C');
        const studentIdx = prompt.indexOf('STUDENT ANSWERED: A');
        expect(correctIdx).toBeLessThan(studentIdx);
        expect(correctIdx).toBeGreaterThan(-1);
    });

    it('includes clear status for wrong answers', () => {
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'B',
            student_answer: 'D',
            question_text: 'Test question',
            is_correct: false
        });

        expect(prompt).toContain('WRONG ANSWER SELECTED');
        expect(prompt).toContain('Maximum score is P');
    });

    it('includes clear status for correct answers', () => {
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'A',
            student_answer: 'A',
            question_text: 'Test question',
            is_correct: true
        });

        expect(prompt).toContain('CORRECT ANSWER SELECTED');
        expect(prompt).not.toContain('Maximum score is P');
    });

    it('includes student reasoning when provided', () => {
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'B',
            student_answer: 'B',
            question_text: 'Test?',
            student_reasoning: 'I chose B because of the sampling distribution.',
            is_correct: true
        });

        expect(prompt).toContain('sampling distribution');
    });

    it('handles missing reasoning', () => {
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'A',
            student_answer: 'C',
            question_text: 'Test?',
            is_correct: false
        });

        expect(prompt).toContain('None provided');
    });

    it('includes RAG context when available', () => {
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'C',
            student_answer: 'C',
            question_text: 'Test?',
            is_correct: true
        }, 'This lesson covers hypothesis testing and p-values.');

        expect(prompt).toContain('hypothesis testing');
        expect(prompt).toContain('LESSON CONTEXT');
    });

    it('truncates very long RAG context', () => {
        const longContext = 'X'.repeat(2000);
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'A',
            student_answer: 'A',
            question_text: 'Test?',
            is_correct: true
        }, longContext);

        // Should truncate to 1000 chars
        expect(prompt.indexOf(longContext)).toBe(-1);
        expect(prompt).toContain('X'.repeat(100)); // Should have some X's
    });

    it('falls back to legacy prompt without structured data', () => {
        const prompt = buildFocusedGradingPrompt({
            prompt: 'Grade this answer: ...',
            correct_answer: '' // No structured data
        });

        expect(prompt).toBe('Grade this answer: ...');
    });

    it('includes choices when provided', () => {
        const prompt = buildFocusedGradingPrompt({
            correct_answer: 'B',
            student_answer: 'A',
            question_text: 'What is the mean?',
            choices: 'A: 5\nB: 10\nC: 15\nD: 20',
            is_correct: false
        });

        expect(prompt).toContain('ANSWER CHOICES:');
        expect(prompt).toContain('A: 5');
        expect(prompt).toContain('B: 10');
    });
});

// ============================================
// SCORE PARSING TESTS
// ============================================

describe('Score Parsing', () => {
    /**
     * Parse score from Qwen response (mirrors client-side logic)
     */
    function parseScore(responseText) {
        // Try JSON format first
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*"score"[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.score) return parsed.score.toUpperCase();
            }
        } catch (e) {}

        // Try "Score: X" format
        const scoreMatch = responseText.match(/Score:\s*([EPI])\b/i);
        if (scoreMatch) return scoreMatch[1].toUpperCase();

        // Try standalone letter at start of line
        const lineMatch = responseText.match(/^\s*([EPI])\s*$/m);
        if (lineMatch) return lineMatch[1].toUpperCase();

        return null;
    }

    it('parses "Score: E" format', () => {
        expect(parseScore('Score: E\nFeedback: Good')).toBe('E');
        expect(parseScore('Score: P\nFeedback: Partial')).toBe('P');
        expect(parseScore('Score: I\nFeedback: Wrong')).toBe('I');
    });

    it('parses JSON format', () => {
        expect(parseScore('{"score": "E", "feedback": "good"}')).toBe('E');
        expect(parseScore('Here is the result: {"score": "P"}')).toBe('P');
    });

    it('parses standalone letter', () => {
        expect(parseScore('E\nThis is good')).toBe('E');
        expect(parseScore('Thinking...\nP\nBecause...')).toBe('P');
    });

    it('is case insensitive', () => {
        expect(parseScore('Score: e')).toBe('E');
        expect(parseScore('{"score": "p"}')).toBe('P');
    });

    it('returns null for unparseable responses', () => {
        expect(parseScore('No score here')).toBeNull();
        expect(parseScore('')).toBeNull();
        expect(parseScore('Score: X')).toBeNull(); // Invalid score
    });
});

// ============================================
// INTEGRATION SCENARIOS
// ============================================

describe('Integration Scenarios', () => {
    describe('Full Grading Flow', () => {
        it('handles correct MCQ answer through queue', () => {
            const queue = createMockGradingQueue();
            const [requestId, position] = queue.submit(
                'Grade this answer',
                'U1-L2-Q01',
                'student1',
                'What is the mean?',
                'multiple-choice',
                true // correct answer
            );

            expect(position).toBe(1);

            // Process
            const request = queue.getNext();
            expect(request.questionId).toBe('U1-L2-Q01');
            expect(request.isCorrect).toBe(true);

            // Complete with E score (allowed for correct)
            const response = 'Score: E\nFeedback: Excellent understanding';
            const enforced = enforceMCQScoreCap(response, request.questionType, request.isCorrect);
            expect(enforced.capped).toBe(false);

            queue.complete(requestId, { response: enforced.response });

            const status = queue.getStatus(requestId);
            expect(status.status).toBe('completed');
            expect(status.result.response).toContain('Score: E');
        });

        it('handles wrong MCQ answer with enforcement', () => {
            const queue = createMockGradingQueue();
            const [requestId] = queue.submit(
                'Grade this answer',
                'U1-L2-Q01',
                'student1',
                'What is the mean?',
                'multiple-choice',
                false // wrong answer
            );

            const request = queue.getNext();
            expect(request.isCorrect).toBe(false);

            // Model incorrectly gives E
            const response = 'Score: E\nFeedback: Your reasoning was good';
            const enforced = enforceMCQScoreCap(response, request.questionType, request.isCorrect);

            // Should be capped to P
            expect(enforced.capped).toBe(true);
            expect(enforced.response).toContain('Score: P');
            expect(enforced.response).toContain('[Note: Score capped at P');

            queue.complete(requestId, { response: enforced.response, scoreCapped: enforced.capped });

            const status = queue.getStatus(requestId);
            expect(status.result.scoreCapped).toBe(true);
        });

        it('handles FRQ without enforcement', () => {
            const queue = createMockGradingQueue();
            const [requestId] = queue.submit(
                'Grade this FRQ',
                'U1-L2-Q05',
                'student1',
                'Explain the concept',
                'free-response',
                null // FRQs don't have correct/incorrect
            );

            const request = queue.getNext();

            // E score is allowed for FRQ
            const response = 'Score: E\nFeedback: Complete answer';
            const enforced = enforceMCQScoreCap(response, request.questionType, request.isCorrect);
            expect(enforced.capped).toBe(false);
        });
    });

    describe('Network Tier Transitions', () => {
        it('handles turbo -> lan -> offline transitions', () => {
            const nm = createMockNetworkManager();
            nm.lanIP = '192.168.1.42';

            // Start in turbo
            nm.setTier('turbo');
            let endpoint = nm.getAIEndpoint();
            expect(endpoint.type).toBe('groq');

            // Lose internet, fall to LAN
            nm.setTier('lan');
            endpoint = nm.getAIEndpoint();
            expect(endpoint.type).toBe('qwen');
            expect(endpoint.url).toContain('192.168.1.42');

            // Lose LAN too
            nm.setTier('offline');
            endpoint = nm.getAIEndpoint();
            expect(endpoint).toBeNull();
        });
    });
});

// ============================================
// GROQ RE-EVALUATION TESTS
// ============================================

describe('Groq Re-evaluation (LAN → Turbo Upgrade)', () => {
    /**
     * Mock question lookup function matching actual implementation
     */
    function findQuestion(questionId, currentQuestions) {
        return currentQuestions.find(q => q.id === questionId);
    }

    /**
     * Mock turbo upgrade sequence
     */
    function performTurboUpgrade(context) {
        const { networkManager, turboModeActive, events, callbacks } = context;

        // 1. Set network tier
        networkManager.setTier('turbo');

        // 2. Set turboModeActive flag
        context.turboModeActive = true;

        // 3. Dispatch event
        events.push({ type: 'turboModeChanged', detail: { enabled: true } });

        // 4. Update sync status indicator
        if (callbacks.updateSyncStatusIndicator) {
            callbacks.updateSyncStatusIndicator();
        }

        // 5. Initialize Railway connection
        if (callbacks.initializeRailwayConnection) {
            callbacks.initializeRailwayConnection();
        }

        // 6. Trigger outbox sync
        if (callbacks.processSyncOutbox) {
            callbacks.processSyncOutbox();
        }

        return context;
    }

    describe('Question Lookup', () => {
        const mockQuestions = [
            { id: 'U1-L2-Q01', type: 'multiple-choice', prompt: 'Question 1' },
            { id: 'U1-L2-Q02', type: 'free-response', prompt: 'Question 2' },
            { id: 'U4-L3-Q05', type: 'multiple-choice', prompt: 'Question 3' }
        ];

        it('finds question by ID using currentQuestions.find()', () => {
            const question = findQuestion('U1-L2-Q01', mockQuestions);
            expect(question).toBeDefined();
            expect(question.id).toBe('U1-L2-Q01');
            expect(question.type).toBe('multiple-choice');
        });

        it('returns undefined for non-existent question ID', () => {
            const question = findQuestion('U99-L99-Q99', mockQuestions);
            expect(question).toBeUndefined();
        });

        it('handles empty question array', () => {
            const question = findQuestion('U1-L2-Q01', []);
            expect(question).toBeUndefined();
        });

        it('finds questions with various ID formats', () => {
            expect(findQuestion('U1-L2-Q02', mockQuestions)?.type).toBe('free-response');
            expect(findQuestion('U4-L3-Q05', mockQuestions)?.prompt).toBe('Question 3');
        });
    });

    describe('Turbo Upgrade Sequence', () => {
        let context;

        beforeEach(() => {
            context = {
                networkManager: createMockNetworkManager(),
                turboModeActive: false,
                events: [],
                callbacks: {
                    updateSyncStatusIndicator: vi.fn(),
                    initializeRailwayConnection: vi.fn(),
                    processSyncOutbox: vi.fn()
                }
            };
            context.networkManager.setTier('lan'); // Start in LAN mode
        });

        it('upgrades network tier from lan to turbo', () => {
            expect(context.networkManager.currentTier).toBe('lan');

            performTurboUpgrade(context);

            expect(context.networkManager.currentTier).toBe('turbo');
        });

        it('sets turboModeActive to true', () => {
            expect(context.turboModeActive).toBe(false);

            performTurboUpgrade(context);

            expect(context.turboModeActive).toBe(true);
        });

        it('dispatches turboModeChanged event with enabled: true', () => {
            performTurboUpgrade(context);

            const event = context.events.find(e => e.type === 'turboModeChanged');
            expect(event).toBeDefined();
            expect(event.detail.enabled).toBe(true);
        });

        it('calls updateSyncStatusIndicator', () => {
            performTurboUpgrade(context);

            expect(context.callbacks.updateSyncStatusIndicator).toHaveBeenCalled();
        });

        it('initializes Railway connection', () => {
            performTurboUpgrade(context);

            expect(context.callbacks.initializeRailwayConnection).toHaveBeenCalled();
        });

        it('triggers outbox sync', () => {
            performTurboUpgrade(context);

            expect(context.callbacks.processSyncOutbox).toHaveBeenCalled();
        });

        it('handles missing callbacks gracefully', () => {
            context.callbacks = {}; // No callbacks defined

            expect(() => performTurboUpgrade(context)).not.toThrow();
            expect(context.networkManager.currentTier).toBe('turbo');
        });
    });

    describe('Full Re-evaluation Flow', () => {
        /**
         * Simulates the full requestGroqReeval flow
         */
        async function simulateReeval(questionId, context, groqResponse) {
            const { currentQuestions, networkManager, gradingResults } = context;

            // 1. Find question (uses correct pattern now)
            const question = currentQuestions.find(q => q.id === questionId);
            if (!question) {
                return { success: false, error: 'Question not found' };
            }

            // 2. Check network tier
            if (networkManager.currentTier !== 'turbo') {
                // Try to detect turbo
                // In tests, we'll simulate that turbo becomes available
            }

            // 3. Simulate Groq API call
            let result;
            try {
                result = await groqResponse;
                result._aiGraded = true;
                result._provider = 'groq';
                result._model = 'llama-3.3-70b (Groq)';

                // Store result
                gradingResults[questionId] = result;

                // 4. Trigger turbo upgrade if not already turbo
                if (networkManager.currentTier !== 'turbo') {
                    performTurboUpgrade(context);
                }

                return { success: true, result };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        it('completes full re-evaluation and upgrades to turbo', async () => {
            const context = {
                currentQuestions: [
                    { id: 'U1-L2-Q01', type: 'multiple-choice', prompt: 'What is P(A)?' }
                ],
                networkManager: createMockNetworkManager(),
                gradingResults: {},
                turboModeActive: false,
                events: [],
                callbacks: {
                    updateSyncStatusIndicator: vi.fn(),
                    initializeRailwayConnection: vi.fn(),
                    processSyncOutbox: vi.fn()
                }
            };
            context.networkManager.setTier('lan');

            const groqResponse = Promise.resolve({
                score: 'E',
                feedback: 'Excellent understanding of probability concepts.'
            });

            const result = await simulateReeval('U1-L2-Q01', context, groqResponse);

            expect(result.success).toBe(true);
            expect(result.result._aiGraded).toBe(true);
            expect(result.result._provider).toBe('groq');
            expect(context.networkManager.currentTier).toBe('turbo');
            expect(context.turboModeActive).toBe(true);
            expect(context.gradingResults['U1-L2-Q01']).toBeDefined();
        });

        it('returns error for non-existent question', async () => {
            const context = {
                currentQuestions: [],
                networkManager: createMockNetworkManager(),
                gradingResults: {},
                turboModeActive: false,
                events: [],
                callbacks: {}
            };

            const result = await simulateReeval('U99-L99-Q99', context, Promise.resolve({}));

            expect(result.success).toBe(false);
            expect(result.error).toBe('Question not found');
        });

        it('handles Groq API failure', async () => {
            const context = {
                currentQuestions: [
                    { id: 'U1-L2-Q01', type: 'multiple-choice', prompt: 'Test' }
                ],
                networkManager: createMockNetworkManager(),
                gradingResults: {},
                turboModeActive: false,
                events: [],
                callbacks: {}
            };
            context.networkManager.setTier('lan');

            const groqResponse = Promise.reject(new Error('Network timeout'));

            const result = await simulateReeval('U1-L2-Q01', context, groqResponse);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network timeout');
            // Should not upgrade to turbo on failure
            expect(context.networkManager.currentTier).toBe('lan');
        });
    });

    describe('Sync Status Indicator Update', () => {
        /**
         * Mock sync indicator state calculation
         */
        function calculateSyncIndicatorState(networkTier, turboModeActive, lastSync) {
            if (networkTier === 'lan') {
                return { icon: '🏠📡', text: 'LAN Tutor', color: '#f39c12' };
            }

            if (networkTier === 'turbo' || turboModeActive) {
                if (lastSync) {
                    return { icon: '☁️✓', text: 'Backed up to cloud', color: '#27ae60' };
                }
                return { icon: '☁️✓', text: 'Connected', color: '#27ae60' };
            }

            return { icon: '☁️✗', text: 'Local only', color: '#95a5a6' };
        }

        it('shows LAN indicator in LAN mode', () => {
            const state = calculateSyncIndicatorState('lan', false, null);

            expect(state.icon).toBe('🏠📡');
            expect(state.text).toBe('LAN Tutor');
            expect(state.color).toBe('#f39c12');
        });

        it('shows Connected in turbo mode without lastSync', () => {
            const state = calculateSyncIndicatorState('turbo', true, null);

            expect(state.icon).toBe('☁️✓');
            expect(state.text).toBe('Connected');
            expect(state.color).toBe('#27ae60');
        });

        it('shows Backed up with lastSync', () => {
            const state = calculateSyncIndicatorState('turbo', true, Date.now());

            expect(state.text).toBe('Backed up to cloud');
        });

        it('shows Local only in offline mode', () => {
            const state = calculateSyncIndicatorState('offline', false, null);

            expect(state.icon).toBe('☁️✗');
            expect(state.text).toBe('Local only');
            expect(state.color).toBe('#95a5a6');
        });

        it('turboModeActive alone triggers connected state', () => {
            // Even if NetworkManager says offline, turboModeActive=true shows connected
            const state = calculateSyncIndicatorState('offline', true, null);

            expect(state.text).toBe('Connected');
            expect(state.color).toBe('#27ae60');
        });
    });
});
