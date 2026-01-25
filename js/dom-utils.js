// dom-utils.js - DOM manipulation utilities
// Part of AP Statistics Consensus Quiz
// Phase 2: XSS Hardening + Phase 3: DOM Thrashing Prevention

/**
 * DOMUtils - Safe DOM manipulation utilities
 *
 * Features:
 * - HTML escaping for XSS prevention
 * - Attribute escaping
 * - Tagged template for safe HTML interpolation
 * - Incremental DOM update helpers (no-op when unchanged)
 * - Keyed list diffing with reorder support
 */
const DOMUtils = {
    /**
     * Escape HTML entities for safe innerHTML interpolation
     * @param {*} str - Value to escape
     * @returns {string} Escaped HTML string
     */
    escapeHtml(str) {
        if (str == null) return '';
        if (typeof str !== 'string') return String(str);
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Escape for use in HTML attributes (stricter than HTML content)
     * Handles quotes and other attribute-breaking characters
     * @param {*} str - Value to escape
     * @returns {string} Escaped attribute string
     */
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

    /**
     * Tagged template for safe HTML with escaped interpolation
     * Usage: el.innerHTML = DOMUtils.safeHtml`<p>${userData}</p>`;
     * @param {TemplateStringsArray} strings - Template literal strings
     * @param {...*} values - Interpolated values (will be escaped)
     * @returns {string} Safe HTML string
     */
    safeHtml(strings, ...values) {
        let result = strings[0];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            // Escape strings, pass through numbers/booleans, stringify others
            let escaped;
            if (typeof value === 'string') {
                escaped = this.escapeHtml(value);
            } else if (value == null) {
                escaped = '';
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                escaped = String(value);
            } else {
                // Objects, arrays, etc. - stringify and escape
                escaped = this.escapeHtml(String(value));
            }
            result += escaped + strings[i + 1];
        }
        return result;
    },

    /**
     * Create an element with safe text content
     * @param {string} tag - HTML tag name
     * @param {string} text - Text content (auto-escaped)
     * @param {Object} attributes - Optional attributes to set
     * @returns {HTMLElement} Created element
     */
    createText(tag, text, attributes = {}) {
        const el = document.createElement(tag);
        el.textContent = text;
        Object.entries(attributes).forEach(([key, val]) => {
            if (val != null) {
                el.setAttribute(key, val);
            }
        });
        return el;
    },

    // ========================================
    // INCREMENTAL UPDATE HELPERS
    // These no-op when value unchanged to prevent layout thrashing
    // ========================================

    /**
     * Update text content only if changed
     * @param {HTMLElement} el - Target element
     * @param {*} text - New text content
     * @returns {boolean} True if text was changed
     */
    updateText(el, text) {
        if (!el) return false;
        const newText = text == null ? '' : String(text);
        if (el.textContent !== newText) {
            el.textContent = newText;
            return true;
        }
        return false;
    },

    /**
     * Toggle class only if state changed
     * @param {HTMLElement} el - Target element
     * @param {string} className - Class to toggle
     * @param {boolean} force - Whether class should be present
     * @returns {boolean} True if class was changed
     */
    toggleClass(el, className, force) {
        if (!el) return false;
        const hasClass = el.classList.contains(className);
        if (force !== hasClass) {
            el.classList.toggle(className, force);
            return true;
        }
        return false;
    },

    /**
     * Update attribute only if changed
     * @param {HTMLElement} el - Target element
     * @param {string} attr - Attribute name
     * @param {*} value - New value (null/undefined removes attribute)
     * @returns {boolean} True if attribute was changed
     */
    updateAttr(el, attr, value) {
        if (!el) return false;
        const current = el.getAttribute(attr);
        const newValue = value == null ? null : String(value);

        if (current !== newValue) {
            if (newValue == null) {
                el.removeAttribute(attr);
            } else {
                el.setAttribute(attr, newValue);
            }
            return true;
        }
        return false;
    },

    /**
     * Update style property only if changed
     * @param {HTMLElement} el - Target element
     * @param {string} prop - Style property name
     * @param {string} value - New value
     * @returns {boolean} True if style was changed
     */
    updateStyle(el, prop, value) {
        if (!el) return false;
        const current = el.style[prop];
        if (current !== value) {
            el.style[prop] = value;
            return true;
        }
        return false;
    },

    /**
     * Batch multiple DOM updates in a single animation frame
     * @param {Function} updateFn - Function containing DOM updates
     */
    batchUpdates(updateFn) {
        requestAnimationFrame(() => {
            updateFn();
        });
    },

    // ========================================
    // KEYED LIST DIFFING
    // Update lists in-place with reorder support
    // ========================================

    /**
     * Update a list of elements with keyed diffing
     * Supports add, remove, update, and reorder operations
     *
     * @param {HTMLElement} container - Parent container element
     * @param {Array} items - Array of data items
     * @param {Function} keyFn - Function to extract unique key from item: (item) => string
     * @param {Function} renderFn - Function to update element content: (el, item) => void
     * @param {Function} createFn - Function to create new element: (item) => HTMLElement
     */
    updateList(container, items, keyFn, renderFn, createFn) {
        if (!container || !Array.isArray(items)) return;

        // Build map of existing elements by key
        const existing = new Map();
        container.querySelectorAll('[data-key]').forEach(el => {
            existing.set(el.dataset.key, el);
        });

        let previousEl = null;

        items.forEach((item) => {
            const key = String(keyFn(item));
            let el = existing.get(key);

            if (el) {
                // Update existing element
                renderFn(el, item);
                existing.delete(key);

                // Reorder if necessary
                const expectedNext = previousEl
                    ? previousEl.nextElementSibling
                    : container.firstElementChild;

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

        // Remove stale elements (no longer in items)
        existing.forEach(el => el.remove());
    },

    /**
     * Create elements using DocumentFragment for efficient bulk insert
     * Use for initial render only (not updates)
     *
     * @param {Array} items - Array of data items
     * @param {Function} createFn - Function to create element: (item) => HTMLElement
     * @returns {DocumentFragment} Fragment ready to append
     */
    createFragment(items, createFn) {
        const frag = document.createDocumentFragment();
        items.forEach(item => {
            const el = createFn(item);
            frag.appendChild(el);
        });
        return frag;
    }
};

// Expose to window for inline script usage
if (typeof window !== 'undefined') {
    window.DOMUtils = DOMUtils;
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOMUtils };
}
