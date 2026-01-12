/**
 * Simple Test Utilities for Curriculum Render
 * A lightweight testing framework for browser-based tests
 */

const TestRunner = {
    results: [],
    currentSuite: null,

    // Start a new test suite
    describe(suiteName, fn) {
        this.currentSuite = {
            name: suiteName,
            tests: [],
            passed: 0,
            failed: 0
        };
        console.group(`📦 ${suiteName}`);
        try {
            fn();
        } catch (e) {
            console.error('Suite setup error:', e);
        }
        console.groupEnd();
        this.results.push(this.currentSuite);
        this.currentSuite = null;
    },

    // Run a single test
    it(testName, fn) {
        const test = { name: testName, passed: false, error: null };
        try {
            fn();
            test.passed = true;
            this.currentSuite.passed++;
            console.log(`  ✅ ${testName}`);
        } catch (e) {
            test.error = e;
            this.currentSuite.failed++;
            console.error(`  ❌ ${testName}`);
            console.error(`     ${e.message}`);
        }
        this.currentSuite.tests.push(test);
    },

    // Assertion helpers
    assert: {
        equal(actual, expected, message = '') {
            if (actual !== expected) {
                throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },

        deepEqual(actual, expected, message = '') {
            const actualStr = JSON.stringify(actual);
            const expectedStr = JSON.stringify(expected);
            if (actualStr !== expectedStr) {
                throw new Error(`${message} Expected ${expectedStr}, got ${actualStr}`);
            }
        },

        truthy(value, message = '') {
            if (!value) {
                throw new Error(`${message} Expected truthy value, got ${JSON.stringify(value)}`);
            }
        },

        falsy(value, message = '') {
            if (value) {
                throw new Error(`${message} Expected falsy value, got ${JSON.stringify(value)}`);
            }
        },

        throws(fn, message = '') {
            let threw = false;
            try {
                fn();
            } catch (e) {
                threw = true;
            }
            if (!threw) {
                throw new Error(`${message} Expected function to throw`);
            }
        },

        includes(array, item, message = '') {
            if (!array.includes(item)) {
                throw new Error(`${message} Expected array to include ${JSON.stringify(item)}`);
            }
        },

        notIncludes(array, item, message = '') {
            if (array.includes(item)) {
                throw new Error(`${message} Expected array to not include ${JSON.stringify(item)}`);
            }
        },

        isType(value, type, message = '') {
            const actualType = typeof value;
            if (actualType !== type) {
                throw new Error(`${message} Expected type ${type}, got ${actualType}`);
            }
        },

        isNull(value, message = '') {
            if (value !== null) {
                throw new Error(`${message} Expected null, got ${JSON.stringify(value)}`);
            }
        },

        isNotNull(value, message = '') {
            if (value === null) {
                throw new Error(`${message} Expected non-null value`);
            }
        }
    },

    // Get summary
    getSummary() {
        let totalPassed = 0;
        let totalFailed = 0;

        this.results.forEach(suite => {
            totalPassed += suite.passed;
            totalFailed += suite.failed;
        });

        return {
            suites: this.results.length,
            passed: totalPassed,
            failed: totalFailed,
            total: totalPassed + totalFailed
        };
    },

    // Print summary to console
    printSummary() {
        const summary = this.getSummary();
        console.log('\n' + '='.repeat(50));
        console.log('TEST SUMMARY');
        console.log('='.repeat(50));
        console.log(`Suites: ${summary.suites}`);
        console.log(`Tests:  ${summary.total}`);
        console.log(`Passed: ${summary.passed} ✅`);
        console.log(`Failed: ${summary.failed} ${summary.failed > 0 ? '❌' : ''}`);
        console.log('='.repeat(50));

        if (summary.failed > 0) {
            console.log('\nFailed Tests:');
            this.results.forEach(suite => {
                suite.tests.forEach(test => {
                    if (!test.passed) {
                        console.log(`  - ${suite.name} > ${test.name}`);
                        console.log(`    ${test.error.message}`);
                    }
                });
            });
        }

        return summary;
    },

    // Reset for new run
    reset() {
        this.results = [];
        this.currentSuite = null;
    }
};

// Mock helpers for testing without full app context
const MockHelpers = {
    // Create a mock classData structure
    createMockClassData(username = 'TestUser') {
        return {
            users: {
                [username]: {
                    answers: {},
                    reasons: {},
                    timestamps: {},
                    attempts: {},
                    charts: {}
                }
            }
        };
    },

    // Create a mock FRQ question with parts
    createMockFRQ(questionId, partIds = ['a', 'b', 'c']) {
        return {
            id: questionId,
            type: 'free-response',
            prompt: 'Test FRQ prompt for ' + questionId,
            solution: {
                parts: partIds.map(id => ({
                    partId: id,
                    description: `Description for part ${id}`,
                    response: `Response for part ${id}`
                })),
                scoring: {
                    totalPoints: partIds.length,
                    rubric: partIds.map(id => ({
                        part: id,
                        maxPoints: 1,
                        criteria: [`Criterion for part ${id}`]
                    }))
                }
            }
        };
    },

    // Create a mock legacy answer (single string)
    createLegacyAnswer(value) {
        return {
            value: value,
            timestamp: Date.now()
        };
    },

    // Create a mock progressive answer
    createProgressiveAnswer(parts, completedParts, currentPart, allComplete) {
        return {
            value: {
                parts: parts,
                completedParts: completedParts,
                currentPart: currentPart,
                allComplete: allComplete
            },
            timestamp: Date.now()
        };
    }
};

// Export for use in test files
if (typeof window !== 'undefined') {
    window.TestRunner = TestRunner;
    window.MockHelpers = MockHelpers;
}
if (typeof module !== 'undefined') {
    module.exports = { TestRunner, MockHelpers };
}
