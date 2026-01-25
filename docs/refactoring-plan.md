# Refactoring Plan: Keyboard Navigation, XSS Fixes, DOM Thrashing

## Scope Summary

| Category | Files Affected | Occurrences |
|----------|----------------|-------------|
| innerHTML usage | 16 files | 125 total (83 in index.html) |
| Modals needing keyboard nav | index.html | ~10 modals |
| XSS-vulnerable patterns | index.html, auth.js | ~8 locations |
| DOM queries | index.html | 277 getElementById/querySelector calls |

---

## Phase 1: Keyboard Navigation (Quick Win)

**Goal:** Add Escape key support and focus trapping to all modals.

### 1.1 Create Modal Utility Module

Create `js/modal-utils.js` with reusable keyboard handling:

```javascript
// js/modal-utils.js
const ModalUtils = {
    // Stack for nested modals
    modalStack: [],
    previousFocusStack: [],

    // Bound handler (created once for reliable add/remove)
    _boundHandleKeydown: null,

    // Expanded selector for all focusable elements
    FOCUSABLE_SELECTOR: [
        'button:not([disabled]):not([hidden])',
        'input:not([disabled]):not([hidden])',
        'select:not([disabled]):not([hidden])',
        'textarea:not([disabled]):not([hidden])',
        'a[href]:not([disabled]):not([hidden])',
        '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])',
        '[contenteditable="true"]:not([disabled]):not([hidden])'
    ].join(', '),

    init() {
        this._boundHandleKeydown = this._handleKeydown.bind(this);
    },

    // Open modal with keyboard support
    open(modalElement, options = {}) {
        // Push current focus to stack
        this.previousFocusStack.push(document.activeElement);
        this.modalStack.push(modalElement);

        // Show modal
        modalElement.style.display = 'block';
        modalElement.setAttribute('role', 'dialog');
        modalElement.setAttribute('aria-modal', 'true');

        // Lock background scroll
        document.body.style.overflow = 'hidden';

        // Mark main content as inert (if main element exists)
        const main = document.querySelector('main, #app, .app-container');
        if (main) main.setAttribute('aria-hidden', 'true');

        // Focus first focusable element (or specified element)
        const focusTarget = options.focusFirst
            ? modalElement.querySelector(options.focusFirst)
            : modalElement.querySelector(this.FOCUSABLE_SELECTOR);
        if (focusTarget) {
            // Delay focus slightly for animation
            requestAnimationFrame(() => focusTarget.focus());
        }

        // Add keyboard listener (only once for first modal)
        if (this.modalStack.length === 1) {
            document.addEventListener('keydown', this._boundHandleKeydown);
        }
    },

    // Close modal and restore focus
    close(modalElement) {
        const index = this.modalStack.indexOf(modalElement);
        if (index === -1) return; // Modal not in stack

        // Remove from stack
        this.modalStack.splice(index, 1);
        const previousFocus = this.previousFocusStack.splice(index, 1)[0];

        // Hide modal
        modalElement.style.display = 'none';
        modalElement.removeAttribute('aria-modal');

        // If no more modals, restore body scroll and main content
        if (this.modalStack.length === 0) {
            document.body.style.overflow = '';
            const main = document.querySelector('main, #app, .app-container');
            if (main) main.removeAttribute('aria-hidden');
            document.removeEventListener('keydown', this._boundHandleKeydown);
        }

        // Restore focus
        if (previousFocus && previousFocus.focus) {
            previousFocus.focus();
        }
    },

    // Get topmost modal
    getActiveModal() {
        return this.modalStack[this.modalStack.length - 1] || null;
    },

    _handleKeydown(e) {
        const activeModal = this.getActiveModal();
        if (!activeModal) return;

        // Escape closes topmost modal
        if (e.key === 'Escape') {
            e.preventDefault();
            this.close(activeModal);
            return;
        }

        // Focus trap: Tab cycles within modal
        if (e.key === 'Tab') {
            const focusables = Array.from(
                activeModal.querySelectorAll(this.FOCUSABLE_SELECTOR)
            ).filter(el => el.offsetParent !== null); // Visible only

            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }
};

// Initialize on load
ModalUtils.init();

// Expose to window for inline script usage
if (typeof window !== 'undefined') {
    window.ModalUtils = ModalUtils;
}
```

### 1.2 Modals to Update

| Modal ID | Function | Description |
|----------|----------|-------------|
| `syncModal` | inline toggle | Sync status modal |
| `shareModal` | inline toggle | Share question modal |
| `spriteConfigModal` | `openSpriteConfig()` | Sprite customization |
| Identity claim modal | `showIdentityClaimModal()` | Dynamic creation |
| Cloud restore modal | `showCloudRestoreModal()` | Dynamic creation |
| Orphan claim modal | `showOrphanClaimModal()` | Dynamic creation |
| Data wipe confirm | `showDataWipeConfirmation()` | Confirmation dialog |
| Import/Export modal | `showImportExportModal()` | Data management |
| Recovery pack modal | `showRecoveryPackModal()` | Recovery options |
| Teacher dashboard modal | `showTeacherDashboard()` | Teacher controls |

### 1.3 Implementation Steps

1. Create `js/modal-utils.js` with `ModalUtils` object
2. Add script tag to index.html (before inline script)
3. Replace each `modal.style.display = 'block'` with `ModalUtils.open(modal)`
4. Replace each `modal.style.display = 'none'` with `ModalUtils.close(modal)`
5. For overlay click-to-close, add: `overlay.addEventListener('click', (e) => { if (e.target === overlay) ModalUtils.close(overlay); })`
6. Test each modal for Escape key and Tab cycling

### 1.4 Acceptance Criteria

- [ ] Escape key closes any open modal
- [ ] Tab key cycles through focusable elements within modal
- [ ] Shift+Tab cycles backwards
- [ ] Focus returns to trigger element after modal closes
- [ ] No focus escapes to background content
- [ ] Background scroll is locked when modal is open
- [ ] Nested modals work correctly (open modal B from modal A, close B, A still works)
- [ ] Click on overlay (outside modal content) closes modal

---

## Phase 2: XSS Hardening

**Goal:** Sanitize all user-controlled data before DOM insertion.

### 2.1 Create Escape Utility

Create `js/dom-utils.js`:

```javascript
const DOMUtils = {
    // Escape HTML entities for safe innerHTML interpolation
    escapeHtml(str) {
        if (str == null) return '';
        if (typeof str !== 'string') return String(str);
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Escape for use in HTML attributes (stricter than HTML content)
    escapeAttr(str) {
        if (str == null) return '';
        if (typeof str !== 'string') return String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    // Tagged template for safe HTML with escaped interpolation
    // Usage: el.innerHTML = DOMUtils.safeHtml`<p>${userData}</p>`;
    safeHtml(strings, ...values) {
        let result = strings[0];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            // Escape strings, pass through numbers/booleans, stringify others
            const escaped = typeof value === 'string'
                ? this.escapeHtml(value)
                : (value == null ? '' : String(value));
            result += escaped + strings[i + 1];
        }
        return result;
    },

    // Preferred: Create element with safe text content
    createText(tag, text, attributes = {}) {
        const el = document.createElement(tag);
        el.textContent = text;
        Object.entries(attributes).forEach(([key, val]) => {
            el.setAttribute(key, val);
        });
        return el;
    }
};

// Expose to window
if (typeof window !== 'undefined') {
    window.DOMUtils = DOMUtils;
}
```

### 2.2 Vulnerable Locations

**Trust Policy:** Treat ALL external data as untrusted unless it's a static string literal in your own code.

| Location | Function | Risk | Data Source | Action |
|----------|----------|------|-------------|--------|
| Sync progress screen | `showSyncProgressScreen()` | MEDIUM | Title/subtitle params | Escape or use textContent |
| Message area | `showMessage()` | LOW | Internal messages | Review callers |
| Correct answer display | `displayGradingFeedback()` | MEDIUM | Curriculum JSON | Escape (JSON could be tampered) |
| Explanation display | `displayGradingFeedback()` | MEDIUM | Curriculum JSON | Escape |
| Username display | `showWelcomeScreen()` | MEDIUM | User-selected | Escape |
| Server notifications | `displayNotifications()` | HIGH | Server response | Escape |
| Peer usernames | `updatePeerDisplay()` | MEDIUM | Supabase data | Escape |

### 2.3 Implementation Steps

1. Create `js/dom-utils.js` with escape utilities
2. Add script tag to index.html (before inline script)
3. **Default to textContent** - only use innerHTML when structure is needed:
   ```javascript
   // PREFERRED: No escaping needed
   el.textContent = userData;

   // WHEN STRUCTURE NEEDED: Use tagged template
   el.innerHTML = DOMUtils.safeHtml`<strong>${label}:</strong> ${value}`;

   // FOR ATTRIBUTES: Use escapeAttr
   el.innerHTML = `<button data-user="${DOMUtils.escapeAttr(username)}">`;
   ```
4. Audit each location in table above
5. Add comment `// STATIC HTML: no user data` to truly static innerHTML uses
6. **Do NOT mark curriculum/server data as "trusted"** - always escape

### 2.4 Future Enhancement (Optional)

For complex HTML rendering with rich user content (markdown, etc.), consider DOMPurify:
```javascript
// npm install dompurify (or CDN)
el.innerHTML = DOMPurify.sanitize(userHtml);
```
Not needed for current use case but useful if requirements expand.

### 2.5 Acceptance Criteria

- [ ] No user-controlled strings inserted via innerHTML without escaping
- [ ] textContent used by default, innerHTML only when structure required
- [ ] Server responses and curriculum data treated as untrusted
- [ ] Test payloads render as text, not executed:
  - `<script>alert(1)</script>`
  - `<img onerror=alert(1) src=x>`
  - `"><script>alert(1)</script>`
  - `' onclick='alert(1)`

---

## Phase 3: DOM Thrashing Fixes (Incremental)

**Goal:** Replace destructive innerHTML patterns with incremental DOM updates.

### 3.1 Severity Tiers

#### Tier 1: High-Frequency Updates (Fix First)
These are called repeatedly during normal use:

| Function | Location | Frequency | Fix Priority |
|----------|----------|-----------|--------------|
| `updateSyncIndicator()` | index.html | Every sync cycle | HIGH |
| `renderQuestionCard()` | index.html | Every question view | HIGH |
| `updatePeerDisplay()` | index.html | Real-time updates | HIGH |
| `displayGradingFeedback()` | index.html | After each submission | HIGH |

#### Tier 2: User-Triggered Updates (Fix Second)
Called in response to user actions:

| Function | Location | Trigger |
|----------|----------|---------|
| `renderProgressiveFRQParts()` | index.html | FRQ accordion |
| `showTeacherDashboard()` | index.html | Teacher button |
| `showImportExportModal()` | index.html | Settings menu |
| `buildShareCard()` | index.html | Share button |

#### Tier 3: One-Time Renders (Low Priority)
Called once during initialization:

| Function | Location |
|----------|----------|
| `renderCurriculumNav()` | index.html |
| `buildWelcomeScreen()` | auth.js |
| Initial question list | index.html |

### 3.2 Fix Patterns

#### Pattern A: Text-Only Updates
```javascript
// BEFORE (destroys listeners)
el.innerHTML = `Score: ${score}`;

// AFTER (preserves structure)
el.textContent = `Score: ${score}`;
```

#### Pattern B: Attribute/Class Updates
```javascript
// BEFORE
el.innerHTML = `<button class="${isActive ? 'active' : ''}">Click</button>`;

// AFTER
button.classList.toggle('active', isActive);
```

#### Pattern C: List Updates (Keyed Diffing with Reordering)
```javascript
// BEFORE (destroys all items)
list.innerHTML = items.map(i => `<li>${i.name}</li>`).join('');

// AFTER (update in place with proper ordering)
function updateList(container, items, keyFn, renderFn, createFn) {
    const existing = new Map();
    container.querySelectorAll('[data-key]').forEach(el => {
        existing.set(el.dataset.key, el);
    });

    let previousEl = null;

    items.forEach((item, index) => {
        const key = keyFn(item);
        let el = existing.get(key);

        if (el) {
            // Update existing element
            renderFn(el, item);
            existing.delete(key);

            // Reorder if necessary
            const expectedNext = previousEl ? previousEl.nextElementSibling : container.firstElementChild;
            if (el !== expectedNext) {
                // Move element to correct position
                if (previousEl) {
                    previousEl.after(el);
                } else {
                    container.prepend(el);
                }
            }
        } else {
            // Create new element
            el = createFn(item);
            el.dataset.key = key;
            renderFn(el, item);

            // Insert at correct position
            if (previousEl) {
                previousEl.after(el);
            } else {
                container.prepend(el);
            }
        }

        previousEl = el;
    });

    // Remove stale elements
    existing.forEach(el => el.remove());
}
```

#### Pattern D: DocumentFragment for Bulk Insert
```javascript
// BEFORE
container.innerHTML = items.map(renderItem).join('');

// AFTER (for initial render only)
const frag = document.createDocumentFragment();
items.forEach(item => {
    const el = document.createElement('div');
    el.textContent = item.name;
    frag.appendChild(el);
});
container.appendChild(frag);
```

### 3.3 Additional DOM Utilities

Add these to `js/dom-utils.js`:

```javascript
// Add to DOMUtils object:

// Update text only if changed (prevents layout thrashing)
updateText(el, text) {
    const newText = text == null ? '' : String(text);
    if (el.textContent !== newText) {
        el.textContent = newText;
    }
},

// Batch multiple DOM updates in a single frame
batchUpdates(updateFn) {
    requestAnimationFrame(() => {
        updateFn();
    });
},

// Toggle class only if state changed
toggleClass(el, className, force) {
    const hasClass = el.classList.contains(className);
    if (force !== hasClass) {
        el.classList.toggle(className, force);
    }
},

// Update attribute only if changed
updateAttr(el, attr, value) {
    const current = el.getAttribute(attr);
    if (current !== value) {
        if (value == null) {
            el.removeAttribute(attr);
        } else {
            el.setAttribute(attr, value);
        }
    }
},

// Keyed list update with reordering support
updateList(container, items, keyFn, renderFn, createFn) {
    // Implementation from Pattern C above
}
```

### 3.4 Implementation Steps

**Phase 3A: Create DOM Utilities**
1. Add `DOMUtils.updateText()` - no-op if text unchanged
2. Add `DOMUtils.batchUpdates()` - wrap in requestAnimationFrame
3. Add `DOMUtils.toggleClass()` - no-op if class already matches
4. Add `DOMUtils.updateAttr()` - no-op if attribute unchanged
5. Add `DOMUtils.updateList()` - keyed diffing with reorder support

**Phase 3B: Fix Tier 1 (High-Frequency)**
1. `updateSyncIndicator()` - Convert to textContent updates
2. `renderQuestionCard()` - Create once, update attributes/text
3. `updatePeerDisplay()` - Use keyed diffing for peer list
4. `displayGradingFeedback()` - Update existing container, don't replace

**Phase 3C: Fix Tier 2 (User-Triggered)**
1. Modals: Create DOM structure once in HTML, toggle visibility
2. Progressive FRQ: Use data attributes, update classes/text only
3. Teacher dashboard: Keyed diffing for student list

**Phase 3D: Document Tier 3**
1. Add comments to one-time renders: `// ONE-TIME RENDER: innerHTML acceptable`
2. These are low priority since they only run once

### 3.4 Acceptance Criteria

- [ ] Event listeners survive content updates
- [ ] No visible flicker on sync indicator updates
- [ ] Focus state preserved when question card updates
- [ ] Peer list updates without scroll position reset
- [ ] Performance: < 16ms for high-frequency updates (60fps)

---

## Phase 4: Testing & Validation

### 4.1 Manual Test Checklist

**Keyboard Navigation:**
- [ ] Open each modal, press Escape - should close
- [ ] Tab through modal - focus stays inside
- [ ] Shift+Tab cycles backwards
- [ ] Close modal - focus returns to trigger
- [ ] Open modal A, open modal B from A, close B - A still works
- [ ] Click overlay outside modal content - should close

**XSS Hardening:**
- [ ] Create username with `<script>` - should display as text
- [ ] Import data with malicious HTML - should be escaped
- [ ] Peer usernames with HTML render as text

**DOM Stability:**
- [ ] Click button, see feedback appear - click again - should still work
- [ ] Answer question, see peer percentages update - no flicker
- [ ] Expand FRQ part, type - input doesn't lose focus
- [ ] Scroll through peer list, list updates - scroll position preserved

### 4.2 Automated Tests (Vitest)

This project uses **Vitest** for testing. Add new test files:

```javascript
// tests/modal-utils.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ModalUtils', () => {
    it('Escape key closes active modal', () => {
        // Create mock modal, open it, dispatch Escape keydown
        // Verify modal.style.display === 'none'
    });

    it('focus returns to trigger after close', () => {
        // Focus button, open modal, close modal
        // Verify document.activeElement === button
    });

    it('nested modals work correctly', () => {
        // Open modal A, open modal B, close B
        // Verify A is still active and functional
    });
});
```

```javascript
// tests/dom-utils.test.js
describe('DOMUtils', () => {
    it('escapeHtml prevents XSS', () => {
        const result = DOMUtils.escapeHtml('<script>alert(1)</script>');
        expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('updateText no-ops when text unchanged', () => {
        const el = document.createElement('div');
        el.textContent = 'test';
        const spy = vi.spyOn(el, 'textContent', 'set');
        DOMUtils.updateText(el, 'test');
        expect(spy).not.toHaveBeenCalled();
    });
});
```

```javascript
// tests/dom-stability.test.js
describe('DOM Stability', () => {
    it('event listeners survive content update', () => {
        // Setup click handler, trigger update, verify handler still works
    });

    it('focus preserved during sync indicator update', () => {
        // Focus input, trigger update, verify focus unchanged
    });
});
```

### 4.3 Browser-Based Testing (Optional)

Focus and keyboard tests can be flaky in jsdom. For critical focus behavior, consider:

1. **Playwright/Puppeteer E2E tests** - Real browser, reliable focus
2. **Manual test in DevTools** - `document.activeElement` inspection
3. **tests/test-runner.html** - Existing browser-based runner

### 4.4 Performance Validation

Add timing markers to verify <16ms updates:

```javascript
// In high-frequency functions:
function updateSyncIndicator() {
    const start = performance.now();
    // ... update logic ...
    const elapsed = performance.now() - start;
    if (elapsed > 16) {
        console.warn(`updateSyncIndicator took ${elapsed.toFixed(1)}ms (>16ms target)`);
    }
}
```

Or use browser DevTools Performance panel to profile during sync operations.

---

## Implementation Order

| Phase | Effort | Impact | Dependencies |
|-------|--------|--------|--------------|
| 1: Keyboard Nav | 2-3 hours | HIGH (accessibility) | None |
| 2: XSS Hardening | 1-2 hours | MEDIUM (security) | None |
| 3A: DOM Utilities | 1 hour | LOW (foundation) | None |
| 3B: Tier 1 Fixes | 3-4 hours | HIGH (UX) | 3A |
| 3C: Tier 2 Fixes | 2-3 hours | MEDIUM (UX) | 3A |
| 4: Testing | 1-2 hours | HIGH (confidence) | 1, 2, 3B |

**Total Estimated Effort:** 10-15 hours across multiple sessions

---

## Files to Create/Modify

### New Files
- `js/modal-utils.js` - Keyboard navigation, focus trapping, modal stack
- `js/dom-utils.js` - HTML escaping, safe templates, incremental update utilities
- `tests/modal-utils.test.js` - Modal keyboard/focus tests
- `tests/dom-utils.test.js` - Escape function and utility tests
- `tests/dom-stability.test.js` - Event listener and focus preservation tests

### Modified Files
- `index.html` - Modal open/close calls, innerHTML replacements, add script tags
- `js/auth.js` - Username display escaping with DOMUtils
- `css/styles.css` - Focus ring styles for modal elements (optional)

---

## Rollback Strategy

Each phase is independent and can be reverted:

1. **Phase 1:** Remove `modal-utils.js` script tag, revert open/close calls
2. **Phase 2:** Remove `escapeHtml()` calls (low risk, just removes protection)
3. **Phase 3:** More complex - test thoroughly before merging

Recommend: Feature branch per phase, merge after testing.

---

## Revision History

### v2 (Post-Review)
Addressed Codex review feedback:

**Phase 1:**
- Added bound handler (`_boundHandleKeydown`) for reliable add/remove
- Expanded focusable selector to include `a[href]`, `[contenteditable]`, exclude `[disabled]`/`[hidden]`
- Added modal stack for nested modal support
- Added background scroll lock (`body.style.overflow = 'hidden'`)
- Added `aria-hidden` on main content when modal open
- Added overlay click-to-close guidance
- Changed location references from line numbers to function names

**Phase 2:**
- Fixed `safeHtml` tagged template implementation (proper string interleaving)
- Added `escapeAttr()` for attribute escaping
- Changed trust policy: treat ALL external data as untrusted (including curriculum JSON)
- Mentioned DOMPurify as optional future enhancement
- Added more XSS test payloads

**Phase 3:**
- Fixed keyed diffing to handle element reordering (not just add/remove)
- Added `DOMUtils.updateText()` with no-op when unchanged
- Added `DOMUtils.batchUpdates()` using requestAnimationFrame
- Added `DOMUtils.toggleClass()` and `DOMUtils.updateAttr()` helpers

**Phase 4:**
- Noted Vitest as test framework
- Added example test code for modal and DOM utilities
- Added browser-based testing recommendation for focus tests
- Added performance validation guidance with `performance.now()` markers
