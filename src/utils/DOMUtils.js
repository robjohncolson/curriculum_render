/**
 * DOM Utilities Module - Safe DOM manipulation helpers
 * @module DOMUtils
 */

/**
 * Safe getElementById wrapper with error handling
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null if not found
 */
export function safeGetElement(id) {
    try {
        return document.getElementById(id);
    } catch (error) {
        console.warn(`Element with id "${id}" not found`);
        return null;
    }
}

/**
 * Safe querySelector wrapper
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element (default: document)
 * @returns {Element|null} Element or null if not found
 */
export function safeQuery(selector, context = document) {
    try {
        return context.querySelector(selector);
    } catch (error) {
        console.warn(`No element matching selector "${selector}"`);
        return null;
    }
}

/**
 * Safe querySelectorAll wrapper
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element (default: document)
 * @returns {NodeList} NodeList (empty if no matches)
 */
export function safeQueryAll(selector, context = document) {
    try {
        return context.querySelectorAll(selector);
    } catch (error) {
        console.warn(`Error with selector "${selector}"`);
        return [];
    }
}

/**
 * Safe innerHTML setter with XSS prevention
 * @param {Element} element - Target element
 * @param {string} html - HTML content
 * @param {boolean} sanitize - Whether to sanitize (default: true)
 */
export function safeSetHTML(element, html, sanitize = true) {
    if (!element) return;

    if (sanitize) {
        // Basic XSS prevention - remove script tags
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    element.innerHTML = html;
}

/**
 * Create element with attributes and content
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes object
 * @param {string|Element} content - Content (text or element)
 * @returns {Element} Created element
 */
export function createElement(tag, attrs = {}, content = null) {
    const element = document.createElement(tag);

    // Set attributes
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'class' || key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('data-')) {
            element.setAttribute(key, value);
        } else {
            element[key] = value;
        }
    });

    // Set content
    if (content !== null) {
        if (typeof content === 'string') {
            element.textContent = content;
        } else if (content instanceof Element) {
            element.appendChild(content);
        }
    }

    return element;
}

/**
 * Toggle class on element
 * @param {Element} element - Target element
 * @param {string} className - Class name to toggle
 * @param {boolean} force - Force add (true) or remove (false)
 */
export function toggleClass(element, className, force = undefined) {
    if (!element) return;

    if (force !== undefined) {
        element.classList.toggle(className, force);
    } else {
        element.classList.toggle(className);
    }
}

/**
 * Show/hide element with display style
 * @param {Element} element - Target element
 * @param {boolean} show - Show (true) or hide (false)
 * @param {string} displayType - Display type when shown (default: 'block')
 */
export function toggleDisplay(element, show, displayType = 'block') {
    if (!element) return;
    element.style.display = show ? displayType : 'none';
}

/**
 * Batch DOM updates for better performance
 * @param {Array<Function>} updates - Array of DOM update functions
 */
export function batchDOMUpdates(updates) {
    requestAnimationFrame(() => {
        updates.forEach(update => update());
    });
}

/**
 * Add event listener with delegation
 * @param {Element} parent - Parent element
 * @param {string} eventType - Event type (click, change, etc)
 * @param {string} selector - Child selector to match
 * @param {Function} handler - Event handler
 */
export function delegateEvent(parent, eventType, selector, handler) {
    parent.addEventListener(eventType, function(event) {
        const target = event.target.closest(selector);
        if (target && parent.contains(target)) {
            handler.call(target, event);
        }
    });
}

/**
 * Remove all children from element
 * @param {Element} element - Target element
 */
export function clearElement(element) {
    if (!element) return;
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Insert HTML at position
 * @param {Element} element - Target element
 * @param {string} position - Position (beforebegin, afterbegin, beforeend, afterend)
 * @param {string} html - HTML to insert
 */
export function insertHTML(element, position, html) {
    if (!element) return;
    element.insertAdjacentHTML(position, html);
}

// Export all utilities as a single object too
export const DOMUtils = {
    safeGetElement,
    safeQuery,
    safeQueryAll,
    safeSetHTML,
    createElement,
    toggleClass,
    toggleDisplay,
    batchDOMUpdates,
    delegateEvent,
    clearElement,
    insertHTML
};

// For backwards compatibility with global namespace
if (typeof window !== 'undefined') {
    window.DOMUtils = DOMUtils;
}