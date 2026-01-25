# Phase 3D: Question Rendering Refactor Plan

> **Revision 5** - Phase 3D-1A + 3D-2A COMPLETE (Jan 2026)
> - ✅ Phase 3D-1A: 31 MVP tests implemented and passing
> - ✅ Phase 3D-2A: Feature flag + incremental renderer implemented
> - Next: Enable flag and test in browser, then Phase 3D-3 validation

## Goal
Refactor `renderQuiz()` and `renderQuestion()` to use incremental DOM updates instead of full innerHTML rebuilds, while ensuring zero user-visible regressions.

## Current State
- `renderQuiz()` clears `questionsContainer.innerHTML` and rebuilds all questions
- `renderQuestion()` returns HTML strings, inserted via `insertAdjacentHTML`
- This causes: listener loss, focus disruption, scroll reset if quiz re-renders during interaction

## Current Data Structures (Important)
```javascript
// MCQ questions use `choices` (NOT `options`):
question.choices = [
    { value: 'A', text: 'First option' },
    { value: 'B', text: 'Second option' },
    // ...
];

// Or via attachments:
question.attachments?.choices = [...];

// Question cards use data attributes (NOT element IDs):
<div class="question-card" data-question-id="U1-L3-Q01" data-question-number="1">
```

## Risk Mitigation Strategy
1. **Phase 3D-1**: Write tests capturing current behavior (BEFORE any changes)
2. **Phase 3D-2**: Implement feature-flagged incremental renderer
3. **Phase 3D-3**: Validate both renderers produce identical output
4. **Phase 3D-4**: Gradual rollout with easy rollback

---

## Phase 3D-1: Behavioral Test Suite

### 1.1 Test File Structure
```
tests/
  question-rendering.test.js    # New file
```

### 1.2 Minimum Viable Test Pack (Priority)

> **Codex Feedback**: Start with a focused subset to avoid delaying Phase 3D-2.
> Add Progressive FRQ and edge cases AFTER incremental renderer exists.

**Priority 1 - Must have before any code changes:**
```javascript
describe('MVP: MCQ Structure', () => {
    it('renders question prompt');
    it('renders all choices from question.choices array');
    it('renders choices from question.attachments.choices (alternate location)');
    it('each choice has data-value attribute matching choice.value');
    it('question card has data-question-id attribute');
});

describe('MVP: MCQ Interactions', () => {
    it('clicking choice selects it (adds selected class)');
    it('clicking submit button triggers answer save');
    it('shows peer reasoning section after answering');
});

describe('MVP: FRQ Structure', () => {
    it('renders textarea for answer input');
    it('renders submit button');
    it('shows grading feedback container');
});

describe('MVP: FRQ Interactions', () => {
    it('submit button captures textarea value');
    it('focus preserved in textarea during updates');
});
```

### 1.2.1 Observable Assertions per Interaction Test

> **Codex Feedback**: Each interaction test must have a clear, observable assertion.

| Test | Observable Assertion |
|------|---------------------|
| clicking choice selects it | `.answer-option` gains `.selected` class |
| clicking submit triggers save | `saveAnswer()` called (spy) OR `.submitted` class appears |
| shows peer reasoning after answering | `.peer-reasoning-section` becomes visible (`display !== 'none'`) |
| submit captures textarea value | `saveAnswer()` receives textarea's `.value` |
| focus preserved during updates | `document.activeElement` is still the textarea after render |

**Priority 2 - Add after incremental renderer works:**
- Progressive FRQ state tests
- Chart FRQ wizard button tests
- Edge cases (LaTeX, images, long text)
- Snapshot tests for full HTML comparison

### 1.3 Full Test Categories (Complete Coverage)

#### A. MCQ Rendering Tests
```javascript
describe('MCQ Question Rendering', () => {
    // Structure tests
    it('renders question prompt with MathJax support');
    it('renders all answer choices from question.choices array');
    it('each choice has clickable radio button');
    it('each choice has correct data-value attribute');
    it('question card has data-question-id attribute'); // NOT element id

    // State tests
    it('shows "not answered" state initially');
    it('highlights selected answer option');
    it('shows submit button');
    it('submit button disabled until answer selected');
    it('shows "Update Answer" after first submission');

    // Answered state tests
    it('displays user answer after submission');
    it('shows peer reasoning section after answering');
    it('shows reasoning textarea after answering');
    it('shows attempt count badge');

    // Peer data tests
    it('shows peer count in header');
    it('shows consensus percentages after peers answer');
    it('shows dot plot visualization');
});
```

#### B. FRQ Rendering Tests
```javascript
describe('FRQ Question Rendering', () => {
    // Structure tests
    it('renders question prompt');
    it('renders textarea for answer input');
    it('textarea has correct placeholder text');
    it('shows submit button');

    // Chart FRQ tests
    it('shows "Create Chart" button for chart questions');
    it('chart wizard button has correct question ID');

    // Grading section tests
    it('shows grading feedback container');
    it('shows escalation buttons container');
    it('shows appeal button (hidden initially)');
});
```

#### C. Progressive Multi-Part FRQ Tests
```javascript
describe('Progressive FRQ Rendering', () => {
    // Initial state
    it('renders all parts in accordion layout');
    it('first part is "current" (expanded, blue border)');
    it('subsequent parts are "locked" (collapsed, grayed)');
    it('locked parts show lock icon');

    // After part submission
    it('completed part shows green border');
    it('completed part is collapsed but expandable');
    it('next part becomes "current"');

    // Final state
    it('shows "Grade All Parts" button when all parts complete');
    it('all parts expandable after completion');
});
```

#### D. Question Navigation Tests
```javascript
describe('Question Navigation', () => {
    it('renders all questions in order');
    it('questions grouped by lesson');
    it('lesson headers show correct titles');
    it('scroll position preserved on re-render');
});
```

#### E. Interactive Behavior Tests
```javascript
describe('Question Interactions', () => {
    // MCQ interactions
    it('clicking option selects it');
    it('clicking submit saves answer');
    it('clicking option after submit changes selection');

    // FRQ interactions
    it('typing in textarea updates value');
    it('submit button captures textarea content');
    it('focus preserved in textarea during peer updates');

    // Reasoning interactions
    it('reasoning textarea accepts input');
    it('reasoning saved on blur');
});
```

#### F. Edge Case Tests
```javascript
describe('Question Rendering Edge Cases', () => {
    it('handles questions with HTML in prompt (escaped)');
    it('handles questions with LaTeX formulas');
    it('handles questions with images');
    it('handles empty peer data gracefully');
    it('handles missing answer options gracefully');
    it('handles very long question text');
    it('handles special characters in question IDs');
});
```

### 1.3 Test Implementation Strategy

1. Create mock question data covering all types:
   - Standard MCQ (4-5 options)
   - MCQ with images
   - MCQ with LaTeX
   - Single-part FRQ
   - Multi-part progressive FRQ
   - Chart-based FRQ

2. Use JSDOM to render questions and assert DOM structure

3. Use snapshot testing for complex HTML output:
   ```javascript
   it('MCQ renders correctly', () => {
       const html = renderQuestion(mockMCQ, 0);
       expect(html).toMatchSnapshot();
   });
   ```

4. Test interactions with simulated events:
   ```javascript
   it('selecting option updates state', async () => {
       renderQuiz();
       const option = document.querySelector('[data-value="B"]');
       option.click();
       expect(option.closest('.answer-option')).toHaveClass('selected');
   });
   ```

### 1.4 Acceptance Criteria (Split per Codex Feedback)

**Phase 3D-1A (MVP - Required before Phase 3D-2): ✅ COMPLETE**
- [x] MVP test pack from section 1.2 implemented (31 tests - exceeds 14 minimum)
- [x] Tests verify structure (DOM selectors) and interactions (observable assertions from 1.2.1)
- [x] All MVP tests pass against current implementation
- [x] Mock question data covers `question.choices` AND `question.attachments.choices`

**Phase 3D-2A (Feature Flag + Conservative Incremental Renderer): ✅ COMPLETE**
- [x] FeatureFlags object added with USE_INCREMENTAL_QUESTION_RENDER flag
- [x] Flag exposed via window.FeatureFlags in dev mode (localhost or ?debug=1)
- [x] renderQuiz() wrapper dispatches to legacy or incremental based on flag
- [x] renderQuizIncremental() uses DOMUtils.updateList for keyed diffing
- [x] Focus preservation implemented (stores/restores activeElement and selection)
- [x] Fallback to legacy insertion if DOMUtils unavailable
- [x] All 634 tests pass with flag OFF (legacy renderer - default)

**Phase 3D-1B (Extended - After incremental renderer passes):**
- [ ] Progressive FRQ state tests added
- [ ] Chart FRQ wizard button tests added
- [ ] Edge case tests (LaTeX, images, long text)
- [ ] Snapshot tests capture current HTML output
- [ ] Test coverage report shows renderQuestion/renderQuiz paths covered

---

## Phase 3D-2: Feature-Flagged Incremental Renderer

### 2.1 Feature Flag Setup

Add to `index.html` configuration section:
```javascript
// Feature flags for incremental rollout
const FeatureFlags = {
    // Phase 3D: Incremental question rendering
    // Set to true to use new renderer, false for legacy
    USE_INCREMENTAL_QUESTION_RENDER: false,

    // Debug mode: log rendering decisions
    DEBUG_RENDER: false
};

// Expose for runtime toggling (dev or staging with ?debug=1)
const isDevMode = window.location.hostname === 'localhost' ||
                  new URLSearchParams(window.location.search).has('debug');
if (isDevMode) {
    window.FeatureFlags = FeatureFlags;
}
```

### 2.2 Renderer Architecture

```javascript
// Preserve original function
const renderQuizLegacy = renderQuiz;

// New incremental version
function renderQuizIncremental() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;

    const questions = getQuestionsForCurrentView();

    // Use DOMUtils.updateList for keyed diffing
    DOMUtils.updateList(
        container,
        questions,
        q => q.id,                    // Key function
        updateQuestionCard,           // Update existing
        createQuestionCard            // Create new
    );
}

// Wrapper that checks feature flag
function renderQuiz() {
    if (FeatureFlags.USE_INCREMENTAL_QUESTION_RENDER) {
        if (FeatureFlags.DEBUG_RENDER) {
            console.log('[Render] Using incremental renderer');
        }
        renderQuizIncremental();
    } else {
        if (FeatureFlags.DEBUG_RENDER) {
            console.log('[Render] Using legacy renderer');
        }
        renderQuizLegacy();
    }
}
```

### 2.3 Incremental Update Functions

> **Note on class names (Phase 2B only)**: The skeleton below uses simplified class names.
> When implementing Phase 2B (full incremental), ensure class names match current
> `renderQuestion()` output (e.g., `.quiz-container.two-column-layout`) to avoid CSS regressions.
> Phase 2A (section 2.8) avoids this issue by reusing `renderQuestion()` for content.

```javascript
/**
 * Create a new question card element (called once per question)
 * NOTE: Uses data-question-id attribute, NOT element id
 */
function createQuestionCard(question) {
    const card = document.createElement('div');
    card.className = 'quiz-container two-column-layout'; // Match current CSS classes
    card.dataset.questionId = question.id;
    card.dataset.questionNumber = question.questionNumber || '';
    card.dataset.questionType = question.type;

    // Create stable skeleton (Phase 2B only - Phase 2A uses renderQuestion() output)
    card.innerHTML = `
        <div class="question-header"></div>
        <div class="question-prompt"></div>
        <div class="question-options"></div>
        <div class="question-input"></div>
        <div class="question-actions"></div>
        <div class="question-feedback"></div>
        <div class="question-peers"></div>
    `;

    return card;
}

/**
 * Update an existing question card (called on re-render)
 */
function updateQuestionCard(card, question) {
    const header = card.querySelector('.question-header');
    const prompt = card.querySelector('.question-prompt');
    const options = card.querySelector('.question-options');
    const input = card.querySelector('.question-input');
    const actions = card.querySelector('.question-actions');
    const feedback = card.querySelector('.question-feedback');
    const peers = card.querySelector('.question-peers');

    // Update each section incrementally
    updateQuestionHeader(header, question);
    updateQuestionPrompt(prompt, question);

    if (question.type === 'multiple-choice') {
        updateMCQOptions(options, question);
        input.style.display = 'none';
    } else {
        options.style.display = 'none';
        updateFRQInput(input, question);
    }

    updateQuestionActions(actions, question);
    updateQuestionFeedback(feedback, question);
    updateQuestionPeers(peers, question);
}

/**
 * Update MCQ options with minimal DOM changes
 * NOTE: Uses question.choices (NOT question.options)
 */
function updateMCQOptions(container, question) {
    const choices = question.choices || question.attachments?.choices || [];
    const userAnswer = getUserAnswer(question.id);

    DOMUtils.updateList(
        container,
        choices,
        choice => choice.value,
        (el, choice) => {
            // Update selection state
            const isSelected = userAnswer === choice.value;
            DOMUtils.toggleClass(el, 'selected', isSelected);

            // Update text if changed
            const label = el.querySelector('.option-label');
            if (label) DOMUtils.updateText(label, choice.text);
        },
        () => {
            const el = document.createElement('div');
            el.className = 'answer-option';
            el.innerHTML = `
                <input type="radio" name="q-${question.id}">
                <span class="option-label"></span>
            `;
            return el;
        }
    );
}
```

### 2.4 Handling Complex Subsections

For complex sections that are hard to diff (like progressive FRQ parts), use a hybrid approach:

```javascript
function updateProgressiveFRQParts(container, question) {
    // Check if structure changed (parts added/removed)
    const currentPartCount = container.querySelectorAll('.frq-part').length;
    const newPartCount = question.parts?.length || 0;

    if (currentPartCount !== newPartCount) {
        // Structure changed - full rebuild of this section only
        container.innerHTML = renderProgressiveFRQParts(question.id, question.parts);
        attachFRQPartHandlers(container);
    } else {
        // Same structure - update states only
        question.parts.forEach((part, idx) => {
            const partEl = container.querySelector(`[data-part-id="${part.partId}"]`);
            if (partEl) {
                updatePartState(partEl, part);
            }
        });
    }
}
```

### 2.5 Event Handler Strategy

Use event delegation on the stable container rather than per-element handlers:

```javascript
// Attach once when quiz container is created
questionsContainer.addEventListener('click', (e) => {
    // MCQ option click
    const option = e.target.closest('.answer-option');
    if (option) {
        handleOptionClick(option);
        return;
    }

    // Submit button click
    const submitBtn = e.target.closest('.submit-answer-btn');
    if (submitBtn) {
        handleSubmitClick(submitBtn);
        return;
    }

    // ... other delegated handlers
});
```

### 2.6 Acceptance Criteria for Phase 3D-2
- [ ] Feature flag controls which renderer is used
- [ ] Legacy renderer remains untouched
- [ ] Incremental renderer produces same DOM structure
- [ ] Event delegation handles all interactions
- [ ] All Phase 3D-1 tests pass with flag ON
- [ ] All Phase 3D-1 tests pass with flag OFF
- [ ] No console errors with either renderer

### 2.7 Data Normalization Layer (Codex Recommendation)

> **Why**: Question data comes from multiple sources with inconsistent shapes.
> Normalizing before render simplifies the incremental updater.

```javascript
/**
 * Normalize question data to consistent shape before rendering
 * Handles variations in how choices/options are stored
 */
function normalizeQuestion(question) {
    return {
        ...question,
        // Normalize choices: could be question.choices, question.attachments?.choices, or question.options
        choices: question.choices || question.attachments?.choices || question.options || [],
        // Ensure parts array exists for FRQs
        parts: question.parts || [],
        // Default type
        type: question.type || 'free-response'
    };
}

// Use in render pipeline:
function renderQuizIncremental() {
    const questions = getQuestionsForCurrentView().map(normalizeQuestion);
    // ... rest of render logic uses normalized data
}
```

### 2.8 Reuse `renderQuestion()` Initially (Codex Recommendation)

> **Why**: Start with minimal changes by reusing the existing HTML generator.
> This reduces initial risk while still gaining the benefits of keyed diffing.

#### `renderQuestion()` Output Shape (Important)

> **Confirmed from `index.html:5566`**: `renderQuestion()` returns a **full card wrapper**:
> ```html
> <div class="quiz-container two-column-layout" data-question-id="..." data-question-number="...">
>     <!-- full question content -->
> </div>
> ```
> This means we CANNOT wrap its output in another container (would cause nesting).
> Instead, we use a thin wrapper with `data-key` and replace its content.

**Phase 2A (Conservative):** Use existing `renderQuestion()` inside the new list differ:

> **Event Handler Strategy for Phase 2A**: Since `renderQuestion()` generates HTML with inline
> `onclick` handlers and the legacy flow attaches listeners after insertion, Phase 2A preserves
> this behavior. Event delegation (section 2.5) is introduced only in Phase 2B when we stop
> using `renderQuestion()` for content generation.

```javascript
function renderQuizIncremental() {
    const container = document.getElementById('questionsContainer');
    const questions = getQuestionsForCurrentView();

    DOMUtils.updateList(
        container,
        questions,
        q => q.id,
        (wrapper, question) => {
            // renderQuestion() returns full card HTML including .quiz-container wrapper
            // We replace the wrapper's innerHTML with the full card output
            const questionIndex = parseInt(wrapper.dataset.questionNumber) - 1;
            const newHtml = renderQuestion(question, questionIndex);
            if (wrapper.innerHTML !== newHtml) {
                wrapper.innerHTML = newHtml;
                // Re-attach any listeners that the legacy flow attaches after insertion
                const card = wrapper.firstElementChild;
                if (card) attachQuestionListeners(card, question);
            }
        },
        (question) => {
            // Thin wrapper div - the actual .quiz-container comes from renderQuestion()
            const wrapper = document.createElement('div');
            wrapper.className = 'question-wrapper'; // Neutral class, no styling conflict
            wrapper.dataset.key = question.id;
            wrapper.dataset.questionId = question.id;
            wrapper.dataset.questionNumber = question.questionNumber || '';
            return wrapper;
        }
    );
}
```

**Phase 2B (Full Incremental):** Replace `renderQuestion()` with granular update functions (sections 2.3-2.4 above). At this point, switch to event delegation (section 2.5) and remove inline handlers.

---

## Phase 3D-3: Validation

### 3.1 Automated Comparison

```javascript
// Test helper to compare renderers
function compareRenderers(questions) {
    // Render with legacy
    FeatureFlags.USE_INCREMENTAL_QUESTION_RENDER = false;
    renderQuiz();
    const legacyHTML = questionsContainer.innerHTML;

    // Clear and render with incremental
    questionsContainer.innerHTML = '';
    FeatureFlags.USE_INCREMENTAL_QUESTION_RENDER = true;
    renderQuiz();
    const incrementalHTML = questionsContainer.innerHTML;

    // Normalize and compare
    const normalize = html => html.replace(/\s+/g, ' ').trim();
    return normalize(legacyHTML) === normalize(incrementalHTML);
}
```

### 3.2 Visual Regression Testing (Manual)

Create a checklist for manual testing:

```markdown
## Visual Regression Checklist

### MCQ Questions
- [ ] Question prompt displays correctly
- [ ] All answer options visible
- [ ] Option hover states work
- [ ] Selected option highlighted
- [ ] Submit button styled correctly
- [ ] Peer consensus bar appears after answering

### FRQ Questions
- [ ] Textarea renders at correct size
- [ ] Placeholder text shows
- [ ] Chart wizard button appears for chart questions
- [ ] Grading feedback section styled correctly

### Progressive FRQ
- [ ] Parts show in accordion layout
- [ ] Locked parts grayed with lock icon
- [ ] Current part has blue border
- [ ] Completed parts have green border
- [ ] Transitions animate smoothly

### General
- [ ] MathJax formulas render
- [ ] Images load correctly
- [ ] Responsive on mobile viewport
- [ ] Dark mode styles apply (if applicable)
```

### 3.3 Performance Comparison

```javascript
// Measure render performance
function benchmarkRenderers(iterations = 100) {
    const questions = getQuestionsForCurrentView();

    // Benchmark legacy
    const legacyStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        FeatureFlags.USE_INCREMENTAL_QUESTION_RENDER = false;
        renderQuiz();
    }
    const legacyTime = performance.now() - legacyStart;

    // Benchmark incremental
    const incrStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        FeatureFlags.USE_INCREMENTAL_QUESTION_RENDER = true;
        renderQuiz();
    }
    const incrTime = performance.now() - incrStart;

    console.log(`Legacy: ${legacyTime}ms, Incremental: ${incrTime}ms`);
    console.log(`Speedup: ${(legacyTime / incrTime).toFixed(2)}x`);
}
```

---

## Phase 3D-4: Rollout Plan

### 4.1 Stages

1. **Development** (Flag OFF by default)
   - Implement incremental renderer
   - Run all tests with flag ON
   - Fix any failures

2. **Internal Testing** (Flag ON for localhost)
   - Developer manual testing
   - Run visual regression checklist
   - Performance benchmarking

3. **Canary Release** (Flag ON for specific users)
   - Enable for teacher account
   - Monitor for issues over 1 week
   - Gather feedback

4. **General Availability** (Flag ON by default)
   - Change default to true
   - Keep flag for emergency rollback
   - Monitor error logs

5. **Cleanup** (Remove flag)
   - After 2+ weeks stable
   - Remove legacy renderer
   - Remove feature flag

### 4.2 Rollback Procedure

If issues discovered:
1. Set `FeatureFlags.USE_INCREMENTAL_QUESTION_RENDER = false`
2. Refresh page
3. Verify legacy renderer works
4. File bug with reproduction steps
5. Fix and re-test before re-enabling

---

## Implementation Order

1. **Week 1**: Phase 3D-1 (Tests)
   - Write all test categories
   - Achieve passing baseline
   - Create snapshots

2. **Week 2**: Phase 3D-2 (Implementation)
   - Add feature flag infrastructure
   - Implement incremental renderer
   - Get tests passing with flag ON

3. **Week 3**: Phase 3D-3 (Validation)
   - Run automated comparison
   - Complete visual checklist
   - Performance benchmarking

4. **Week 4+**: Phase 3D-4 (Rollout)
   - Staged rollout
   - Monitor and fix issues
   - Eventually remove flag

---

## Success Metrics

- All 50+ rendering tests pass with both renderers
- Visual regression checklist 100% pass
- No user-reported rendering bugs
- Incremental renderer same speed or faster than legacy
- Zero rollbacks needed after GA

---

## Appendix: Files to Modify

| File | Changes |
|------|---------|
| `index.html` | Add FeatureFlags, wrapper functions, incremental renderer |
| `js/dom-utils.js` | May need additional helpers |
| `tests/question-rendering.test.js` | New test file |
| `docs/refactoring-plan.md` | Update with Phase 3D status |
