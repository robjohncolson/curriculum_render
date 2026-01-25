# Curriculum Render Test Suite

Automated tests for the AP Statistics Consensus Quiz application.

## Running Tests

### Browser (Recommended)
1. Open `test-runner.html` in a web browser
2. Tests run automatically on page load
3. Click "Run All Tests" to re-run

### Console Output
- Click "Toggle Console" to see detailed test output
- Failed tests show error messages inline

## Test Files

| File | Description |
|------|-------------|
| `test-utils.js` | Lightweight test framework (describe/it/assert) |
| `progressive-frq.browser.js` | Browser-based tests for multi-part FRQ accordion system |
| `progressive-frq.test.ts` | Vitest/TypeScript tests (run via `npm test`) |
| `grading-engine.test.js` | Vitest tests for AI grading escalation system |
| `question-rendering.test.js` | **Phase 3D-1A MVP** - Question rendering behavioral tests |
| `test-runner.html` | Browser-based test runner with UI |

## Test Coverage

### Progressive FRQ System (`progressive-frq.test.js`)

**frqPartState.normalizeAnswer**
- Handles null/undefined input
- Detects legacy string answers
- Passes through progressive format answers

**frqPartState.initialize**
- Initializes fresh state for new questions
- Restores state from progressive format
- Treats legacy answers as fully complete

**frqPartState.submitPart**
- Saves answer and advances to next part
- Marks allComplete when last part submitted
- Handles duplicate submissions
- Handles complex partIds (b-i, b-ii)

**frqPartState.updatePart**
- Updates existing part answers
- Returns null for non-existent questions

**isQuestionAnswered**
- Returns false for null/undefined
- Returns true for legacy string answers
- Returns false for empty strings
- Checks allComplete flag for progressive answers

**formatPartLabel**
- Formats simple part IDs: a → (a)
- Formats compound IDs: b-i → (b)(i)
- Handles edge cases

**Data Structure Integrity**
- Maintains data through full workflow
- Serializes to valid JSON

**Edge Cases**
- Single-part FRQs
- Empty parts array
- Out-of-order submission
- Very long answers
- Special characters

## Adding New Tests

```javascript
// In a new .test.js file or add to existing

describe('My New Feature', () => {
    it('should do something', () => {
        const result = myFunction();
        assert.equal(result, expected);
    });

    it('should handle edge case', () => {
        assert.throws(() => myFunction(null));
    });
});
```

### Available Assertions

```javascript
assert.equal(actual, expected)      // Strict equality
assert.deepEqual(actual, expected)  // JSON equality
assert.truthy(value)                // Truthy check
assert.falsy(value)                 // Falsy check
assert.throws(fn)                   // Expects throw
assert.includes(array, item)        // Array includes
assert.notIncludes(array, item)     // Array excludes
assert.isType(value, 'string')      // Type check
assert.isNull(value)                // Null check
assert.isNotNull(value)             // Non-null check
```

## Mock Helpers

```javascript
// Create mock data structures
MockHelpers.createMockClassData('username')
MockHelpers.createMockFRQ('Q1', ['a', 'b', 'c'])
MockHelpers.createLegacyAnswer('answer text')
MockHelpers.createProgressiveAnswer(parts, completed, current, allComplete)
```
